# SPEC 11 — Tres skins seleccionables para Asteroids

> **Status:** Implemented
> **Depends on:** SPEC 05
> **Date:** 2026-09-08
> **Objective:** Agregar un selector de skin dentro de `AsteroidsGame.tsx` con tres paletas de color (`neon`, `retro`, `clasico` como default) que se aplican al instante, incluso en medio de una partida, y se recuerdan entre sesiones vía `localStorage`.

## Por qué existe este spec

El diagnóstico previo del agente `skin-designer` (registrado en `references/game-themes.md`) confirmó que `AsteroidsGame.tsx` no tiene ningún sistema de skins: los colores están hardcodeados y dispersos por todo el archivo (`#fff` en nave/asteroides/balas/HUD, `#0ff` en el power-up, `#000` de fondo, naranja translúcido en el propulsor), sin ninguna constante central ni selector. Este spec cierra esa brecha únicamente para Asteroids — no generaliza el mecanismo al resto del catálogo (ver Decisions).

## Scope

**In:**

- Nuevo tipo `SkinId` (`"clasico" | "neon" | "retro"`) y constante `SKIN_PALETTES` dentro de `components/games/asteroids/AsteroidsGame.tsx`, con una paleta completa por skin (ver Data model).
- Estado de skin activo (`useState<SkinId>`) inicializado en `"clasico"`, sincronizado a un `skinRef` (mismo patrón que `pausedRef`) para que el loop de dibujo fuera de React lea siempre el valor vigente.
- Lectura de la preferencia guardada en `localStorage` (`asteroids-skin`) al montar el componente, con `try/catch` igual criterio que `lib/session.ts`.
- Escritura en `localStorage` cada vez que se cambia de skin, también con `try/catch`.
- Selector visual: un `<select>` HTML nativo superpuesto en la esquina inferior derecha del canvas (overlay DOM dentro del propio componente), con las 3 opciones identificadas por nombre (CLASICO/NEON/RETRO), reflejando el skin activo.
- Todas las clases internas del motor (`Bullet`, `Asteroid`, `Ship`, `PowerUp`, `Particle`) y las funciones `drawHUD`/`drawLifeIcon`/`draw` dejan de usar colores hardcodeados y reciben la paleta activa como parámetro.

**Out of scope (para specs futuros):**

- Selector de skin en el HUD externo de `GamePlayer.tsx` o cambios a `GameEngineProps`/`lib/game-engines.ts`.
- Generalizar el sistema de skins a Tetris, Arkanoid o Snake.
- Skins adicionales más allá de `neon`/`retro`/`clasico`.
- Sonidos o efectos distintos por skin (solo cambia la paleta de colores).
- Controles táctiles/gestos especiales para el selector (usa el comportamiento estándar de un `<button>`).

## Data model

```ts
// components/games/asteroids/AsteroidsGame.tsx
type SkinId = "clasico" | "neon" | "retro";

type SkinPalette = {
  bg: string;
  ship: string;
  asteroid: string;
  bullet: string;
  powerup: string;
  thruster: string; // rgba() completo, para la llama del propulsor
  particleRGB: string; // "r,g,b" para interpolar el alpha de las partículas
  hudText: string;
  hudAccent: string; // indicador "3x" del power-up activo
};

const SKIN_STORAGE_KEY = "asteroids-skin";

const SKIN_PALETTES: Record<SkinId, SkinPalette> = {
  clasico: {
    bg: "#000",
    ship: "#fff",
    asteroid: "#fff",
    bullet: "#fff",
    powerup: "#0ff",
    thruster: "rgba(255, 130, 0, 0.85)",
    particleRGB: "255,255,255",
    hudText: "#fff",
    hudAccent: "#0ff",
  },
  neon: {
    bg: "#000",
    ship: "#f5ff00", // var(--yellow), ancla en games.color = "yellow"
    asteroid: "#ff006e", // var(--magenta)
    bullet: "#00f5ff", // var(--cyan)
    powerup: "#00ff88", // var(--green)
    thruster: "rgba(255, 140, 0, 0.9)",
    particleRGB: "0,245,255",
    hudText: "#f5ff00",
    hudAccent: "#00ff88",
  },
  retro: {
    bg: "#000",
    ship: "#ffb000", // ámbar, fósforo de monitor vectorial clásico
    asteroid: "#ffb000",
    bullet: "#ffb000",
    powerup: "#ffb000",
    thruster: "rgba(255, 176, 0, 0.85)",
    particleRGB: "255,176,0",
    hudText: "#ffb000",
    hudAccent: "#ffb000",
  },
};
```

No se agregan columnas ni tablas en Supabase, ni se toca `GameEngineProps`/`GAME_ENGINES` — todo el estado nuevo vive dentro de `AsteroidsGame.tsx`.

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 11-asteroids-skins`) se crea y activa la rama `spec-11-asteroids-skins` (comportamiento por defecto vía `AutoCreateBranch: true`). Cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo. No se agrupan varios pasos en un mismo commit.

1. Agregar `SkinId`, `SKIN_STORAGE_KEY` y `SKIN_PALETTES` como constantes de módulo en `components/games/asteroids/AsteroidsGame.tsx` (junto a `RADII`/`SPEEDS`/`POINTS`), con los valores exactos del Data model.
2. Cambiar la firma de `draw(ctx: CanvasRenderingContext2D)` a `draw(ctx: CanvasRenderingContext2D, palette: SkinPalette)` en las clases `Bullet`, `Asteroid`, `PowerUp`, `Ship` y `Particle`, reemplazando cada color hardcodeado por el campo correspondiente de `palette` (`palette.bullet`, `palette.asteroid`, `palette.powerup` en trazo y relleno del power-up, `palette.ship` en el contorno de la nave, `palette.thruster` en la llama, y `` `rgba(${palette.particleRGB},${alpha.toFixed(2)})` `` en `Particle.draw`).
3. En el componente, agregar `const [skin, setSkin] = useState<SkinId>("clasico")` y `const skinRef = useRef<SkinId>(skin)`, sincronizados con un `useEffect(() => { skinRef.current = skin; }, [skin])` (mismo patrón que `pausedRef`).
4. Agregar un `useEffect` de montaje que lee `localStorage.getItem(SKIN_STORAGE_KEY)` dentro de un `try/catch`, y si el valor es `"clasico" | "neon" | "retro"` llama a `setSkin(valor)`; cualquier error o valor inválido se ignora y el skin se queda en `"clasico"`.
5. Agregar `function handleSkinChange(id: SkinId)` que llama a `setSkin(id)` y, dentro de un `try/catch`, `localStorage.setItem(SKIN_STORAGE_KEY, id)`.
6. Dentro del `useEffect` principal (loop del juego), al inicio de la función `draw()` calcular `const palette = SKIN_PALETTES[skinRef.current];`, usar `palette.bg` en el `ctx.fillRect` de fondo, pasar `palette` a cada llamada `.draw(ctx, palette)` de balas/asteroides/power-ups/nave/partículas, y actualizar `drawHUD`/`drawLifeIcon` para recibir `palette` y usar `palette.hudText`/`palette.hudAccent` en vez de `"#fff"`/`"#0ff"`.
7. Cambiar el `return` del componente: envolver el `<canvas>` en un `<div style={{ position: "relative", width: "100%", height: "100%" }}>` y agregar, como hermano del canvas, un overlay `<select>` posicionado en `position: absolute; right: 10px; bottom: 10px; z-index: 4;`, con una `<option>` por cada `SkinId` (`Object.keys(SKIN_PALETTES) as SkinId[]`) mostrando su nombre en mayúsculas (CLASICO/NEON/RETRO), `value={skin}` y `onChange={(e) => handleSkinChange(e.target.value as SkinId)}`.
8. Verificar manualmente con `npm run dev` en `/juegos/asteroides/jugar`: el skin por defecto es `clasico` y se ve idéntico al comportamiento previo a este spec; hacer click en `neon` y `retro` en medio de una partida en curso y confirmar que nave/asteroides/balas/power-up/HUD/partículas cambian de color al instante sin reiniciar ni pausar; recargar la página y confirmar que el último skin elegido se mantiene; confirmar que el botón activo se distingue visualmente de los otros dos; confirmar que el resto de la mecánica (colisiones, power-up, niveles, vidas, HUD externo de `GamePlayer.tsx`, modal de fin de partida, guardado de puntuación) sigue funcionando igual; confirmar que Tetris, Arkanoid y Snake no cambiaron de comportamiento.

## Acceptance criteria

- [x] `AsteroidsGame.tsx` expone un `<select>` con las 3 opciones (CLASICO/NEON/RETRO) superpuesto en la esquina inferior derecha del canvas, sin modificar `GamePlayer.tsx` ni `GameEngineProps`/`GAME_ENGINES`.
- [x] El skin activo por defecto es `clasico` y reproduce exactamente la paleta actual (blanco/cian/negro/naranja), sin ningún cambio visual respecto al comportamiento previo a este spec.
- [x] Elegir `neon` cambia de inmediato, sin pausar ni reiniciar la partida, los colores de nave (`#f5ff00`), asteroides (`#ff006e`), balas (`#00f5ff`), power-up (`#00ff88`), HUD y partículas.
- [x] Elegir `retro` cambia de inmediato todos los elementos a un único tono ámbar (`#ffb000`) sobre fondo negro, manteniendo buen contraste en el trazo fino (`lineWidth: 1.5`) de nave y asteroides.
- [x] El skin elegido persiste en `localStorage` bajo la clave `asteroids-skin` y se recuerda al recargar la página o volver a entrar a `/juegos/asteroides/jugar`.
- [x] Si `localStorage` no está disponible (p. ej. modo privado), el juego sigue funcionando normalmente y solo deja de recordar el skin entre sesiones, sin errores en consola.
- [x] El `<select>` refleja siempre el skin activo (incluido el restaurado desde `localStorage` al cargar la página).
- [x] Cambiar de skin no reinicia ni altera el estado de la partida en curso (nave, asteroides, puntuación, vidas y nivel se mantienen intactos).
- [x] El resto de la mecánica de Asteroids (colisiones, power-up, niveles, HUD externo de `GamePlayer.tsx`, modal de fin de partida, guardado de puntuación) sigue funcionando exactamente igual que antes de este spec.
- [x] Tetris, Arkanoid y Snake no cambian de comportamiento.
- [x] `npm run build` compila sin errores de TypeScript.

**Nota de verificación:** se jugó de punta a punta en el navegador (Chrome vía automatización) sobre `/juegos/asteroides/jugar`: skin `clasico` por defecto idéntico al comportamiento previo; cambio a `neon` y luego a `retro` en medio de una partida en curso, confirmando aplicación instantánea sin reiniciar ni pausar y sin alterar puntuación/vidas/nivel; recarga de página confirmando persistencia de `retro` vía `localStorage` y el `<select>` reflejándolo; botón "FIN" disparando el modal "FIN DEL JUEGO", guardado de puntuación exitoso y "JUGAR DE NUEVO" reiniciando la partida manteniendo el skin elegido; `git diff --stat` confirmó que solo se tocó `AsteroidsGame.tsx`; Tetris (`/juegos/caida/jugar`) verificado sin cambios de comportamiento. El caso de `localStorage` no disponible (modo privado) y el consumo del power-up se verificaron por revisión de código (rutas `try/catch` y paso de `palette` a `PowerUp.draw`) en vez de forzarlos en vivo, mismo criterio que specs anteriores (08/09) para casos de borde de bajo riesgo.

## Decisions

- **Sí:** el selector vive como overlay DOM dentro del propio `AsteroidsGame.tsx`, sin tocar `GamePlayer.tsx` ni `GameEngineProps`. Razón: decisión explícita del usuario — mantiene el cambio 100% contenido en Asteroids sin afectar el contrato compartido con el resto de los juegos.
- **Sí:** persistencia en `localStorage` bajo la clave `asteroids-skin`, con `try/catch` igual patrón que `lib/session.ts`. Razón: decisión explícita del usuario — recordar la preferencia entre sesiones con el mismo criterio de tolerancia a fallos ya establecido en el proyecto.
- **Sí:** el cambio de skin se aplica al instante, incluso en medio de una partida. Razón: decisión explícita del usuario — solo afecta qué colores usa cada `draw()`, no la lógica ni el estado del juego.
- **Sí:** la paleta `clasico` replica exactamente los colores actuales (blanco/cian/negro/naranja) como default. Razón: pedido explícito del usuario original ("clasico" como default) — no debe alterar el aspecto visual actual para quien no toque el selector.
- **Sí:** la paleta `neon` ancla la nave en el amarillo de `games.color` (`#f5ff00`, mismo tono que la clase `.neon-yellow` ya existente) y reutiliza las variables CSS de acento del sitio (`--magenta`, `--cyan`, `--green` en `app/globals.css`) para asteroides/balas/power-up en vez de inventar colores nuevos. Razón: consistencia con la paleta de marca ya establecida; además resuelve la ambigüedad marcada por el diagnóstico de `skin-designer` sobre si el cian del power-up compite con la nave — aquí no compite porque la nave es amarilla, no cian.
- **Sí:** la paleta `retro` es monocromática ámbar (`#ffb000`) para todos los elementos, en vez de un gris desaturado. Razón: resuelve directamente el riesgo de contraste marcado por el diagnóstico de `skin-designer` (el trazo fino de 1.5px podía perder contraste con un gris apagado sobre fondo `#000`), y el ámbar evoca los monitores vectoriales de fósforo de los cabinets arcade originales de Asteroids, dándole identidad "retro" real en vez de solo "menos saturado".
- **No:** no se generaliza el mecanismo de skins a Tetris, Arkanoid o Snake en este spec. Razón: decisión explícita del usuario — el pedido es específico de Asteroids; extenderlo a otros juegos queda para un spec futuro si se decide.
- **No:** no se agrega un selector de skin en el HUD externo de `GamePlayer.tsx`. Razón: decisión explícita del usuario — evita tocar el contrato compartido `GameEngineProps` por una funcionalidad que hoy solo usa un juego.
- **Sí:** el selector es un `<select>` HTML nativo con las 3 opciones por nombre, en vez de 3 botones circulares de color. Razón: decisión explícita del usuario tras probar la primera implementación — los círculos de color no dejaban identificar cuál era el skin `neon` sin adivinar; el nombre de texto elimina la ambigüedad.

## Risks

| Riesgo                                                                                                                                                                       | Mitigación                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage` podría no estar disponible (modo privado, políticas del navegador).                                                                                           | Mismo patrón `try/catch` que `lib/session.ts`: el juego sigue funcionando y simplemente no persiste el skin entre sesiones, sin errores en consola. |
| El overlay de botones podría superponerse visualmente con el HUD interno dibujado en canvas (score/nivel/vidas/3x, franja superior).                                         | El selector se ubica en la esquina inferior derecha del canvas, franja libre de HUD en los tres skins.                                              |
| Cambiar la paleta por skin podría alterar accidentalmente el fondo del canvas y afectar el contraste del overlay "EN PAUSA" externo (`rgba(0,0,0,0.6)`) de `GamePlayer.tsx`. | Los tres skins mantienen `bg: "#000"` — solo cambian los elementos dibujados encima, nunca el fondo del canvas.                                     |

## What is **not** in this spec

- Selector de skin en el HUD externo de `GamePlayer.tsx` o cambios a `GameEngineProps`/`GAME_ENGINES`.
- Generalizar el sistema de skins a Tetris, Arkanoid o Snake.
- Skins adicionales más allá de `neon`/`retro`/`clasico`.
- Sonidos o efectos distintos por skin.
- Controles táctiles/gestos especiales para el selector.

Cada uno de estos, si se implementa, va en su propio spec.
