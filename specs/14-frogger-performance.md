# SPEC 14 — Performance de Frogger y de los efectos CSS de la pantalla de juego

> **Status:** Implemented
> **Depends on:** `specs/game-jam/frogger/01-frogger.md`, SPEC 11
> **Date:** 2026-10-01
> **Objective:** Llevar Frogger (`ranaria`) a ≥55 FPS sostenidos en escritorio y en celular, con cualquier skin, cacheando su fondo estático y sus entidades con glow en canvas offscreen, y desactivando en `/juegos/[id]/jugar` los efectos CSS globales que fuerzan a recomponer la página en cada frame, con un contador FPS de debug para medir el antes y el después.

## Por qué existe este spec

Frogger se traba tanto en escritorio como en celular, y no solo con el skin `neon`. Al revisar el código aparecen dos tipos de costo:

1. **Costo propio del canvas de Frogger** (`components/games/frogger/FroggerGame.tsx`):
   - `draw()` vuelve a pintar en cada frame todo el fondo estático: las 6 zonas, las 5 bocas con su borde y las líneas discontinuas con `setLineDash`. Ese fondo solo cambia cuando cambia el skin.
   - Con `neon` (`glow: 10`), `setGlow()` activa `shadowBlur` sobre cada auto, camión, tronco, tortuga, borde de boca y sobre la rana. Son unas 50 pasadas de blur por frame, que es de lo más caro que se puede hacer en un canvas 2D.
2. **Costo compartido por todos los juegos.** La página de juego hereda del layout y de `app/globals.css`:
   - `.av-bg::before`: una grilla 3D en perspectiva animada infinitamente (`gridscroll`).
   - `.av-bg::after`: scanlines de pantalla completa con `mix-blend-mode: overlay`.
   - `.av-noise`: ruido SVG con `feTurbulence`.
   - `.crt-screen::after`: scanlines con `mix-blend-mode: multiply` encima del canvas.

   Los modos de mezcla sobre un canvas que cambia en cada frame obligan al navegador a recomponer esas capas también en cada frame.

Hoy no hay forma de medir nada de esto, así que este spec agrega primero un contador FPS de debug y una tabla de mediciones. Así el antes y el después quedan documentados.

## Scope

**In:**

- Contador FPS de debug **dentro de `FroggerGame.tsx`**:
  - Se activa solo si la URL trae `?debug=fps`. Se lee una vez al montar.
  - Muestra FPS, ms promedio de `update()` y ms promedio de `draw()`, promediados cada 500 ms.
  - Es un `<div>` absoluto en la esquina superior izquierda del contenedor del juego. Se actualiza escribiendo `textContent` vía `ref`, sin `setState`, para no provocar renders de React.
  - Sin `?debug=fps` no se monta el `<div>` y el loop no mide nada.
- Caché del fondo estático de Frogger:
  - Un canvas offscreen de 640×560 por skin, con zonas, bocas (incluido el borde con glow) y líneas de carretera.
  - Se construye la primera vez que se usa ese skin.
  - `drawBackground()` pasa a ser un único `drawImage`.
- Caché de sprites de entidades de Frogger:
  - Cada tipo de entidad se pre-renderiza una vez por skin en un canvas offscreen, con el glow ya "horneado" y un margen de `glow * 2` px alrededor.
  - Tipos: auto por color, camión por ancho y dirección, tronco por ancho, celda de tortuga visible y celda de tortuga sumergida.
  - `drawLanes()` pasa a usar solo `drawImage`.
  - El aspecto final debe ser visualmente indistinguible del actual en los 3 skins.
- La rana y las siluetas de bocas ocupadas se siguen dibujando como hoy. La rana es el único `shadowBlur` que queda por frame (1 sola pasada).
- Efectos CSS globales, desactivados **solo mientras se está en la pantalla de juego**. Se aplican en `app/globals.css` con selectores `body:has(.av-player)` / `.av-player`:
  - `.av-bg::before`: `animation: none` (la grilla queda quieta).
  - `.av-noise`: `display: none`.
  - `.av-bg::after`: `mix-blend-mode: normal`, con una opacidad que se vea equivalente.
  - `.crt-screen::after` dentro de `.av-player`: `mix-blend-mode: normal` con el mismo `rgba(0,0,0,0.18)`, que sobre negro da un resultado equivalente a `multiply`.
  - El resto del sitio (home, catálogo, salón, etc.) no cambia.
- Nuevo registro `references/performance.md`, con una fila por id de juego (mismo estilo que `references/mobile-support.md`):
  - Para Frogger: mediciones antes y después del cambio, en los 3 skins.
  - Para `asteroides`, `caida`, `bloque-buster` y `serpentina`: solo la línea base. Se mide después del cambio de CSS con el panel Rendering → "Frame rendering stats" de Chrome DevTools, porque no tienen contador propio.

**Out of scope (para specs futuros):**

- Optimizar los motores de Asteroids, Tetris, Arkanoid o Snake, incluido el `ctx.filter` con `drop-shadow` del skin `neon` de Arkanoid. Este spec solo los mide.
- Un contador FPS compartido en `GamePlayer.tsx` o en un componente común.
- Cambios a `GamePlayer.tsx`, `GameEngineProps` o `lib/game-engines.ts`.
- Cambiar el aspecto de los efectos CSS en el resto del sitio fuera de `/juegos/[id]/jugar`.
- Saltear el `draw()` mientras el juego está en pausa.
- Micro-optimizaciones de asignaciones (los objetos de `frogPosition()`, los `forEach` con closures, etc.), salvo que el perfil posterior muestre que siguen siendo el cuello de botella.
- Escalar el canvas por `devicePixelRatio` o cambiar la resolución interna de 640×560.
- Cambios de gameplay, de reglas, de skins (paletas) o de controles táctiles de Frogger.

## Data model

```ts
// components/games/frogger/FroggerGame.tsx

// Contador de debug: se lee una sola vez al montar
const DEBUG_FPS_PARAM = "fps"; // ?debug=fps

type FpsStats = {
  frames: number; // frames acumulados en la ventana actual
  windowStart: number; // timestamp (ms) de inicio de la ventana de 500 ms
  updateMsSum: number; // suma de ms de update() en la ventana
  drawMsSum: number; // suma de ms de draw() en la ventana
};
const FPS_WINDOW_MS = 500;

// Caché de fondo estático: un canvas 640×560 por skin, creado bajo demanda
type BackgroundCache = Partial<Record<SkinId, HTMLCanvasElement>>;

// Caché de sprites de entidades por skin. La clave identifica la variante:
//   "car:<colorIndex>"         auto de 1 celda, color p.cars[colorIndex]
//   "truck:<width>:<dir>"      camión de 2 o 3 celdas, cabina según dir (1 | -1)
//   "log:<width>"              tronco de 2, 3 o 4 celdas
//   "turtle"                   celda de tortuga visible (con escamas)
//   "turtle-sub"               celda de tortuga sumergida (solo contorno, sin glow)
type SpriteKey = string;
type Sprite = { canvas: HTMLCanvasElement; pad: number }; // pad = glow * 2 (px)
type SpriteCache = Partial<Record<SkinId, Map<SpriteKey, Sprite>>>;
```

- Las cachés viven como variables locales del `useEffect` del loop, igual que `lanes` o `frog`, no como estado React. Se destruyen junto con el loop al desmontar o al reiniciar (`resetKey`).
- Cada sprite se dibuja con `drawImage(sprite.canvas, px - sprite.pad, py - sprite.pad)`, en las mismas coordenadas en celdas×`CELL` que se usan hoy.
- No hay cambios en `SKIN_PALETTES`, en Supabase ni en `localStorage`. No se agregan claves nuevas.

```md
<!-- references/performance.md — una fila por id de juego -->

| id (`games.id`) | Componente | Skin | FPS escritorio | FPS escritorio CPU 4× | FPS celular | Medido con | Fecha | Notas |
```

## Implementation plan

**Prerrequisito:** Frogger (`specs/game-jam/frogger/01-frogger.md`) tiene que estar commiteado y mergeado en `main` antes de correr `/spec-impl 14-frogger-performance`. Hoy vive sin commitear en la rama `spec-01-frogger`.

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 14-frogger-performance`) se crea y activa la rama `spec-14-frogger-performance` (`AutoCreateBranch: true`). Cada paso completado se commitea por separado, sin agrupar varios pasos en un mismo commit.

1. Agregar el contador FPS de debug a `FroggerGame.tsx`:
   - Leer `?debug=fps` con `URLSearchParams` en un `useEffect` de montaje y guardarlo en un estado `debugFps`.
   - En el loop, si está activo, medir `update()` y `draw()` con `performance.now()` y acumular en un `FpsStats`.
   - Cada `FPS_WINDOW_MS`, escribir en el `<div>` (vía `ref`) el texto `FPS 58 · upd 0.2ms · draw 3.1ms` y reiniciar la ventana.
   - Sin el parámetro, no cambia nada visible.
2. Medir la línea base y crear `references/performance.md`:
   - Frogger con `?debug=fps` en los 3 skins.
   - En escritorio sin throttling y con CPU 4× en el panel Performance de Chrome DevTools.
   - Y en el celular del usuario si está disponible. Si no, la columna queda `pendiente`.
   - Cada medición se toma tras 30 s de juego activo.
   - Las mediciones quedan anotadas como "antes".
3. Cachear el fondo estático:
   - Mover el cuerpo actual de `drawBackground(p)` a una función `buildBackground(p): HTMLCanvasElement`, que dibuja sobre un canvas offscreen de `W`×`H`.
   - `drawBackground()` busca o crea el canvas del skin activo en `BackgroundCache` y hace un único `ctx.drawImage`.
   - Verificar que el cambio de skin en plena partida sigue siendo instantáneo.
4. Cachear los sprites de autos y camiones:
   - Funciones `buildCarSprite`/`buildTruckSprite` que reutilizan el código actual de `drawCar`/`drawTruck` sobre un canvas offscreen de `(w + 2·pad) × (CELL + 2·pad)`, con el glow aplicado ahí.
   - `drawLanes()` usa `drawImage` para `car` y `truck`.
   - Troncos y tortugas siguen dibujándose como hoy.
5. Cachear los sprites de troncos y tortugas (visible y sumergida) con el mismo mecanismo:
   - `drawLanes()` queda sin ninguna llamada a `setGlow`/`shadowBlur`.
   - Una entidad de tortugas de N celdas se dibuja como N `drawImage` de la celda cacheada.
6. Desactivar los efectos CSS en la pantalla de juego, en `app/globals.css`:
   - `body:has(.av-player) .av-bg::before { animation: none; }`.
   - `body:has(.av-player) .av-noise { display: none; }`.
   - `body:has(.av-player) .av-bg::after { mix-blend-mode: normal; }`, con la opacidad ajustada para que se vea equivalente.
   - `.av-player .crt-screen::after { mix-blend-mode: normal; }`.
   - Verificar que home, `/games`, `/salon` y `/juegos/[id]` se ven igual que antes.
7. Medir el resultado y actualizar `references/performance.md`:
   - Frogger "después": las mismas condiciones que en el paso 2.
   - Línea base de `asteroides`, `caida`, `bloque-buster` y `serpentina` con "Frame rendering stats" de DevTools, en el skin por defecto y en `neon`.
   - En _Notas_, cualquier juego que quede por debajo de 55 FPS se marca como candidato a su propio spec.

## Acceptance criteria

- [ ] Abrir `/juegos/ranaria/jugar?debug=fps` muestra un contador con FPS, ms de `update` y ms de `draw`, que se actualiza cada ~500 ms.
- [ ] Abrir `/juegos/ranaria/jugar` sin el parámetro no muestra el contador.
- [ ] El contador no provoca renders de React: con React DevTools "Highlight updates", el componente no se re-renderiza cada 500 ms.
- [ ] Con el skin `neon`, en escritorio y con CPU throttling 4× en Chrome DevTools, Frogger se mantiene en ≥55 FPS durante 30 s de juego activo, según el contador.
- [ ] Con `clasico` y `retro`, en las mismas condiciones, Frogger se mantiene en ≥55 FPS.
- [ ] En el celular del usuario, con `?debug=fps` y skin `neon`, Frogger se mantiene en ≥55 FPS durante 30 s de juego. Si el usuario no puede probarlo, queda registrado como `pendiente` en `references/performance.md`.
- [ ] `drawLanes()` y `drawBackground()` no llaman a `setGlow` ni asignan `ctx.shadowBlur`. El único `shadowBlur` por frame que queda es el de la rana.
- [ ] En los 3 skins, capturas del canvas antes y después (misma escena, en pausa) no muestran diferencias perceptibles en autos, camiones, troncos, tortugas visibles, tortugas sumergidas, bocas ni fondo.
- [ ] Cambiar de skin en medio de una partida recolorea fondo y entidades en el mismo frame, sin un frame con el skin anterior.
- [ ] En `/juegos/[id]/jugar` (cualquier juego), la grilla de fondo no se anima, `.av-noise` no se renderiza y ni `.av-bg::after` ni `.crt-screen::after` usan `mix-blend-mode` distinto de `normal`. Se verifica en el panel "Computed" de DevTools.
- [ ] En `/`, `/games`, `/salon`, `/juegos/[id]` y `/about`, la grilla de fondo sigue animada y el ruido y las scanlines se ven igual que antes.
- [ ] Existe `references/performance.md` con:
  - Las filas "antes" y "después" de `ranaria` en los 3 skins.
  - Una fila de línea base para `asteroides`, `caida`, `bloque-buster` y `serpentina`.
- [ ] Gameplay, colisiones, puntaje, vidas, niveles, bocas, controles táctiles, ocultar/mostrar controles y persistencia de skin de Frogger funcionan igual que antes.
- [ ] `GamePlayer.tsx`, `GameEngineProps`, `lib/game-engines.ts` y los componentes de Asteroids, Tetris, Arkanoid y Snake no cambian.
- [ ] `npm run build` compila sin errores de TypeScript y `npm run lint` no reporta errores.

## Decisions

- **Sí:** el alcance es Frogger más los efectos CSS globales de la pantalla de juego. Los otros 4 motores solo se miden. Razón: decisión explícita del usuario. Los efectos CSS afectan a todos los juegos por igual y se arreglan en un solo lugar. Optimizar cada motor es trabajo distinto por juego y va en su propio spec.
- **Sí:** el glow de `neon` se conserva pre-renderizando sprites en canvas offscreen, en vez de quitar `shadowBlur` en táctil o eliminarlo del todo. Razón: decisión explícita del usuario. Mantiene el look validado por `skin-designer` y elimina casi todo el costo del blur por frame.
- **Sí:** el fondo estático también se cachea, uno por skin. Razón: el problema se nota en escritorio con todos los skins, no solo con `neon`, así que el glow no es el único costo. El fondo es la parte más grande del canvas y nunca cambia durante una partida.
- **Sí:** la rana se sigue dibujando en vivo, con su único `shadowBlur`. Razón: cambia de pose (salto) y de rotación (4 direcciones). Cachearla exigiría 8 variantes y solo ahorraría 1 pasada de blur por frame.
- **Sí:** contador FPS de debug solo dentro de `FroggerGame.tsx`, activado por `?debug=fps`. Razón: decisión explícita del usuario. No exige tocar `GamePlayer.tsx`, que las specs 11–13 mantienen intacto. La línea base de los otros juegos se mide con las herramientas de Chrome DevTools.
- **Sí:** el contador escribe en el DOM vía `ref` y no con `setState`. Razón: un `setState` cada 500 ms re-renderizaría el componente que se está midiendo y contaminaría la medición.
- **Sí:** los efectos CSS se desactivan solo en la pantalla de juego, con `body:has(.av-player)`, sin tocar `app/layout.tsx` ni `GamePlayer.tsx`. Razón: decisión explícita del usuario de "pausar en /jugar". `:has()` permite que todo el cambio viva en `app/globals.css`.
- **Sí:** también se neutraliza el `mix-blend-mode: overlay` de `.av-bg::after`, además del de `.crt-screen::after`. Razón: es la misma clase de costo (una capa de mezcla fija a pantalla completa) que la que el usuario aprobó cambiar en las scanlines CRT.
- **Sí:** las mediciones se registran en `references/performance.md`, una fila por id. Razón: decisión explícita del usuario. Sigue la convención de `references/mobile-support.md` y `references/game-themes.md`, y sirve de base para los specs de performance de los otros juegos.
- **Sí:** el criterio es ≥55 FPS sostenidos durante 30 s con CPU throttling 4× en escritorio. Razón: decisión explícita del usuario. Es un número verificable, y el throttling 4× aproxima un celular de gama media.
- **Sí:** este spec se implementa después de que Frogger esté mergeado en `main`. Razón: decisión explícita del usuario. Evita que la rama `spec-14-frogger-performance` arrastre el trabajo sin commitear de `spec-01-frogger`.
- **No:** contador FPS compartido en `GamePlayer.tsx`. Razón: descartado por el usuario a favor de mantener el contador dentro de Frogger.
- **No:** eliminar `shadowBlur` o desactivarlo en dispositivos táctiles. Razón: cambiaría el aspecto de `neon` respecto a lo diseñado en la spec de skins.
- **No:** optimizar ahora el `ctx.filter` con `drop-shadow` de Arkanoid. Razón: fuera del alcance acordado. Queda medido en `references/performance.md` como candidato a un spec propio.

## Risks

| Riesgo                                                                                                                                         | Mitigación                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los sprites cacheados se ven distintos de lo actual (glow recortado en el borde, o coordenadas corridas).                                      | Cada sprite reserva un margen `pad = glow * 2` y se dibuja en `px - pad, py - pad`. El criterio de capturas antes/después en los 3 skins lo detecta.                                                            |
| Al cambiar de skin, un frame se pinta con sprites del skin anterior.                                                                           | Las cachés se indexan por `SkinId` y se consultan con `skinRef.current` leído al inicio de cada `draw()`, igual que la paleta hoy.                                                                              |
| La primera vez que se usa un skin, construir todas sus cachés produce un tirón puntual.                                                        | Son ~12 canvas pequeños más un fondo de 640×560, construidos una sola vez por skin. Si el tirón se nota en el contador, se precalcula el skin activo al montar.                                                 |
| `:has()` no está soportado en navegadores viejos (Firefox < 121, Safari < 15.4).                                                               | En esos navegadores las reglas se ignoran y la página se ve y se comporta como hoy. Solo se pierde la mejora, no la funcionalidad.                                                                              |
| Quitar `mix-blend-mode` cambia levemente el aspecto de las scanlines.                                                                          | Sobre fondo negro, `rgba(0,0,0,0.18)` en modo `normal` da un resultado prácticamente idéntico a `multiply`. Para `.av-bg::after` se ajusta la opacidad en el paso 6, comparando visualmente.                    |
| Las mediciones varían entre corridas y entre máquinas.                                                                                         | Siempre en las mismas condiciones (30 s de juego activo, misma pestaña sin extensiones, throttling 4×), anotando la máquina y el navegador en _Notas_.                                                          |
| En la máquina del usuario, el cuello de botella podría estar en otro lado (por ejemplo, la composición de la página) y no alcanzar los 55 FPS. | El contador separa ms de `update` y de `draw` del FPS total. Si `draw` es bajo y el FPS sigue bajo, el resto del costo es de composición, y se documenta en `references/performance.md` para un spec siguiente. |

## What is **not** in this spec

- Optimizar Asteroids, Tetris, Arkanoid o Snake (solo se miden).
- Contador FPS compartido o cambios a `GamePlayer.tsx`, `GameEngineProps` o `lib/game-engines.ts`.
- Cambiar los efectos CSS fuera de `/juegos/[id]/jugar`.
- Saltear el render en pausa, micro-optimizaciones de asignaciones o escalado por `devicePixelRatio`.
- Cambios de gameplay, paletas o controles táctiles de Frogger.

Cada uno de estos, si se implementa, va en su propio spec.
