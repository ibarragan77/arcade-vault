# SPEC 09 — Juego real de Arkanoid (adaptación de `references/started-games/04-arkanoid`)

> **Status:** Implemented
> **Depends on:** SPEC 05, SPEC 06, SPEC 08
> **Date:** 2026-09-02
> **Objective:** Adaptar el juego de Arkanoid ya construido en `references/started-games/04-arkanoid` a un componente cliente de Next.js, reutilizar el id `bloque-buster` del catálogo actualizando su `title`/`short`/`long` a la descripción real del juego, y registrarlo en `GAME_ENGINES` (`lib/game-engines.ts`, ya generalizado desde SPEC 08).

## Por qué existe este spec

Arkanoid es el primer juego portado que depende de assets externos reales (spritesheet PNG + 2 efectos de sonido MP3), a diferencia de Asteroids y Tetris que son 100% canvas primitivo. Esto obliga a un paso de copia de assets a `public/games/arkanoid/` y a un gate de precarga (`Promise.all` de `Image`/`Audio`) antes de arrancar el loop, patrón ya anticipado en `recipe.md` pero no usado hasta ahora. El registro `GAME_ENGINES` ya existe desde SPEC 08, así que este spec no necesita ningún refactor de `GamePlayer.tsx`, solo agregar una entrada nueva. A diferencia de Tetris (que no tiene vidas), Arkanoid sí tiene 3 vidas y niveles (1–5), como Asteroids, así que reutiliza el HUD externo completo sin ocultar ningún campo.

## Scope

**In:**

- `UPDATE` sobre la fila `id = 'bloque-buster'` en Supabase: `title`/`short`/`long` reescritos con la descripción real de Arkanoid (paddle, bloques de colores, 5 niveles, 3 vidas). `cat` (`ARCADE`), `color` (`cyan`) y `cover` (`cover-bricks`) se mantienen sin cambios — el cover existente ya evoca visualmente un breakout (pared de bloques en franjas de color).
- Copia de `references/started-games/04-arkanoid/assets/spritesheet-breakout.png`, `assets/sounds/ball-bounce.mp3` y `assets/sounds/break-sound.mp3` a `public/games/arkanoid/`.
- Nuevo componente `components/games/arkanoid/ArkanoidGame.tsx`: puerto de `levels.js` (los 5 patrones de `LEVELS`) y `game.js` (paddle, pelota, bloques, colisiones AABB, explosiones, sonidos, HUD interno de score/nivel/vidas) como componente cliente, con precarga de assets y el mismo contrato de props que `AsteroidsGame.tsx`/`TetrisGame.tsx`.
- Registrar `bloque-buster: { Component: ArkanoidGame, hasLives: true }` en `GAME_ENGINES` (`lib/game-engines.ts`) — sin tocar la estructura del registro, ya generalizada desde SPEC 08.

**Out of scope (para specs futuros):**

- Pausa interna por tecla `P`/`Escape` del original — la pausa ya la controla `GamePlayer.tsx` vía el botón PAUSA/REANUDAR y la prop `paused`.
- El selector de nivel por click dentro del overlay de pausa (botones 1–5) — decisión explícita del usuario, ver Decisions.
- El overlay de victoria "¡Completaste el juego!" dibujado en canvas — completar el nivel 5 pasa a disparar el mismo flujo de fin de partida que perder la última vida (ver Decisions).
- Controles táctiles/móviles (el original ya soporta mouse + teclado, eso sí se porta).
- Port de otro juego de `references/started-games/`.
- Reemplazar o modificar cualquier otro juego del catálogo existente.

## Data model

```ts
// lib/game-engines.ts (entrada nueva, el resto del archivo no cambia)
export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  asteroides: { Component: AsteroidsGame, hasLives: true },
  caida: { Component: TetrisGame, hasLives: false },
  "bloque-buster": { Component: ArkanoidGame, hasLives: true },
};
```

`ArkanoidGame.tsx` implementa `GameEngineProps` invocando `onScoreChange`, `onLivesChange` y `onLevelChange` (los tres aplican, igual que Asteroids). El estado interno (`paddle`, `ball`, `blocks`, `explosions`, `lives`, `score`, `currentLevel`) deja de vivir en variables de módulo (como en el original) y se crea dentro de un `useEffect` de montaje.

No se agregan columnas ni tablas nuevas en Supabase — reutiliza el esquema de SPEC 06 sin cambios, solo actualiza contenido de una fila existente.

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 09-arkanoid-real-game`) se crea y activa la rama `spec-09-arkanoid-real-game` (comportamiento por defecto vía `AutoCreateBranch: true`). Cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo. No se agrupan varios pasos en un mismo commit.

1. Migración de Supabase: `UPDATE games SET title = ..., short = ..., long = ... WHERE id = 'bloque-buster'` con textos reales de Arkanoid (paddle, bloques de colores, 5 niveles, 3 vidas). `cat`, `color` y `cover` no se tocan.
2. Copiar `references/started-games/04-arkanoid/assets/spritesheet-breakout.png` y `assets/sounds/{ball-bounce.mp3,break-sound.mp3}` a `public/games/arkanoid/` (manteniendo la subcarpeta `sounds/`).
3. Crear `components/games/arkanoid/ArkanoidGame.tsx`, portando desde `references/started-games/04-arkanoid/{levels.js,game.js,assets/spritesheet.js}` casi verbatim, con estas adaptaciones:
   - `LEVELS` (los 5 patrones: parrilla completa, pirámide, tablero de ajedrez, filas con huecos, marco + cruz) se portan tal cual, como constante del módulo (son datos puros, no estado mutable).
   - Todo el estado mutable (`paddle`, `ball`, `blocks`, `explosions`, `lives`, `score`, `currentLevel`, `keys`) se crea dentro de un único `useEffect` de montaje, no en variables de módulo.
   - Precarga: antes de iniciar el loop, un `Promise.all` carga la imagen del spritesheet (evento `load`) y los dos `Audio` (evento `canplaythrough`), apuntando a `/games/arkanoid/spritesheet-breakout.png` y `/games/arkanoid/sounds/{ball-bounce.mp3,break-sound.mp3}` — nunca a las rutas relativas `assets/...` del original. Los helpers `drawSprite`/`drawFrame` de `spritesheet.js` se portan como funciones internas del componente, operando sobre el canvas offscreen ya cargado.
   - Un único `<canvas>` de `800×600` (mismo tamaño que Asteroids, ya 4:3, no requiere ajuste de `.crt-screen`).
   - Input: `mousemove` sobre el canvas mueve el paddle (con `getBoundingClientRect` + escalado, igual que el original) y `ArrowLeft`/`ArrowRight` también lo mueven vía teclado; ambos listeners se registran/limpian en el mismo efecto de montaje.
   - Se elimina la tecla `P`/`Escape` de pausa interna, `drawPauseOverlay()`, el listener `click` de selector de nivel y las constantes `PAUSE_BTN_*` — la pausa llega vía prop `paused` con el mismo patrón `pausedRef` que `AsteroidsGame.tsx`/`TetrisGame.tsx`.
   - Se elimina `drawOverlay('GAME OVER')` y `drawOverlay('¡Completaste el juego!')` — en el instante en que `lives` llega a 0, **o** se limpian todos los bloques del nivel 5 (condición de victoria original), se llama una única vez a `props.onGameOver(score)` y se detiene el loop (no se vuelve a pedir `requestAnimationFrame`).
   - `props.onScoreChange(score)` se llama cada vez que se rompe un bloque (+10 pts); `props.onLivesChange(lives)` cada vez que se pierde una vida; `props.onLevelChange(currentLevel)` cada vez que `loadLevel()` avanza de nivel.
   - El HUD interno (score, nivel, iconos de vida) dibujado en canvas se conserva tal cual, igual criterio que en Asteroids/Tetris — convive con el HUD externo de `GamePlayer.tsx`.
   - Efectos de sonido (`bounceSound`/`breakSound`, vía `cloneNode().play()`) se conservan igual, apuntando a las rutas nuevas bajo `/games/arkanoid/`.
   - Patrón de pausa idéntico a `AsteroidsGame.tsx`: `pausedRef` sincronizado por un efecto aparte; con `paused = true` el loop sigue pidiendo frames y dibuja el último estado sin avanzar física; al reanudar, `lastTime` se resetea a `null`.
   - Al desmontar, el cleanup cancela el `requestAnimationFrame` pendiente y remueve los listeners de mouse y teclado.
4. Registrar `"bloque-buster": { Component: ArkanoidGame, hasLives: true }` en `GAME_ENGINES` (`lib/game-engines.ts`).
5. Verificar manualmente con `npm run dev`: `/games` muestra la tarjeta "BLOQUE BUSTER" con el texto actualizado; abrir `/juegos/bloque-buster`; jugar una partida completa en `/juegos/bloque-buster/jugar` (mover el paddle con mouse y teclado, romper bloques, ver la animación de explosión, escuchar los sonidos de rebote/rotura, subir de nivel, perder las 3 vidas o completar el nivel 5); confirmar que el HUD externo muestra Puntuación, Vidas y Nivel reales; confirmar pausa, modal de fin de partida, guardado de puntuación, "JUGAR DE NUEVO" y "SALIR"; confirmar que Asteroids, Tetris y el resto del catálogo no cambiaron de comportamiento.

## Acceptance criteria

- [x] `/games` incluye la tarjeta "BLOQUE BUSTER" (categoría ARCADE, portada `cover-bricks`, color cyan) con el `title`/`short`/`long` reales de Arkanoid.
- [x] `/juegos/bloque-buster` muestra la ficha del juego con leaderboard real (`getTopScores`/`getGameStats`), vacío/"0" si no hay partidas todavía.
- [x] `/juegos/bloque-buster/jugar` renderiza el canvas real de Arkanoid (no el `.game-arena` falso) dentro de la pantalla CRT existente.
- [x] El paddle se mueve tanto con el mouse como con ← →, igual que en el original.
- [x] Romper un bloque suma 10 puntos, dispara la animación de explosión (4 frames) y reproduce el sonido de rotura; rebotar contra pared/paddle reproduce el sonido de rebote.
- [x] Completar todos los bloques de un nivel avanza al siguiente (velocidad de la pelota aumentando según `LEVELS[n].speed`), hasta el nivel 5.
- [x] El HUD externo de `GamePlayer.tsx` refleja en tiempo real Puntuación, Vidas y Nivel reales.
- [x] Perder la última vida, **o** completar el nivel 5, dispara automáticamente el modal "FIN DEL JUEGO" con la puntuación final correcta, sin ningún overlay de "GAME OVER"/victoria dibujado dentro del canvas.
- [x] No existe pausa interna por tecla `P`/`Escape` ni selector de nivel por click — la pausa solo la controla el HUD externo.
- [x] El botón "FIN" del HUD también dispara el modal con la puntuación acumulada hasta ese momento.
- [x] "PAUSA"/"REANUDAR" congelan y continúan el juego sin saltos de posición ni de velocidad de la pelota.
- [x] Guardar la puntuación llama a `saveScore({ game: "bloque-buster", score, name })` y la partida aparece luego en la ficha del juego y en `/salon`.
- [x] "JUGAR DE NUEVO" reinicia completamente la partida (nivel 1, 3 vidas, puntuación 0) sin arrastrar estado anterior.
- [x] "SALIR" navega a `/juegos/bloque-buster` y no deja el loop de animación ni los listeners de mouse/teclado corriendo en segundo plano.
- [x] Asteroids y Tetris siguen funcionando exactamente igual que antes de este spec.
- [x] `npm run build` compila sin errores de TypeScript.

**Nota de verificación:** todo lo anterior se verificó jugando de punta a punta en el navegador (Chrome vía automatización), incluyendo un bug real de precarga encontrado y corregido en el camino (ver commit "Cancelar assets pendientes de ArkanoidGame en el cleanup del efecto"). El avance de nivel y la condición de "victoria" del nivel 5 se verificaron por revisión de código (misma ruta de `loadLevel`/`onGameOver` ya ejercitada en vivo por la pérdida de vidas) en vez de jugando una partida completa hasta el nivel 5, igual criterio que SPEC 08 con la limpieza de líneas de Tetris.

## Decisions

- **Sí:** se reutiliza el id `bloque-buster` existente actualizándolo (`UPDATE`) en vez de crear un id nuevo. Razón: decisión explícita del usuario — el placeholder ya es temáticamente un breakout.
- **Sí:** se reescriben `title`/`short`/`long` con textos específicos de Arkanoid real. Razón: decisión explícita del usuario — más preciso que el placeholder genérico actual.
- **No:** no se reemplaza `cover-bricks`. Razón: decisión explícita del usuario — el gradiente actual (pared de bloques en franjas de color) ya evoca visualmente un breakout.
- **No:** no se porta la tecla interna `P`/`Escape` de pausa ni el selector de nivel por click del overlay de pausa. Razón: decisión explícita del usuario — la pausa ya la controla el HUD externo, y el selector de nivel sería una forma de "hacer trampa" que no tiene equivalente en ningún otro juego del catálogo.
- **Sí:** completar el nivel 5 (condición de "victoria" del original) dispara `onGameOver(score)`, el mismo flujo que perder la última vida. Razón: el contrato de motor (`recipe.md`) solo soporta un único fin de partida vía el modal existente, no un estado de "victoria" separado; la puntuación final ya refleja haber completado el juego.
- **Sí:** se agrega precarga de assets (`Promise.all` de la imagen del spritesheet y los dos `Audio`) dentro del `useEffect` de montaje, antes de iniciar el loop. Razón: primer juego portado que depende de assets externos reales (spritesheet PNG + sonidos), patrón ya anticipado en `recipe.md` pero no usado hasta ahora.
- **Sí:** el input de mouse (`mousemove` sobre el paddle) se conserva tal cual, registrado/limpiado en el mismo efecto que el resto de listeners. Razón: es el comportamiento del original y `recipe.md` ya contempla este caso explícitamente.
- **No:** no se requiere ningún refactor de `GamePlayer.tsx` ni de la forma de `GAME_ENGINES`. Razón: el registro ya se generalizó en SPEC 08; este es el tercer juego real y solo agrega una entrada.

## Risks

| Riesgo                                                                                                                        | Mitigación                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Las políticas de autoplay del navegador podrían bloquear `Audio.play()` si se dispara antes de cualquier gesto del usuario.   | El componente solo monta (y por lo tanto solo reproduce sonido) después de que el jugador presiona "JUGAR" en `GamePlayer.tsx`, un gesto real; se acepta que `cloneNode().play()` pueda rechazar su promesa sin romper el juego si el navegador igual lo bloquea. |
| La precarga de assets (imagen + 2 audios) es asíncrona y podría tardar visiblemente antes de mostrar el primer frame jugable. | El canvas se pinta en negro (fondo `#000`) hasta que la precarga resuelve; los assets son livianos (spritesheet ~30 KB, MP3 cortos), la espera esperada es imperceptible en conexiones normales.                                                                  |

## What is **not** in this spec

- Pausa interna por tecla `P`/`Escape` (reemplazada por el control externo de `GamePlayer.tsx`).
- Selector de nivel por click en el overlay de pausa.
- Overlay de victoria "¡Completaste el juego!" dibujado en canvas.
- Controles táctiles/móviles.
- Port de otro juego de `references/started-games/`.
- Cambios a cualquier otro juego del catálogo existente.

Cada uno de estos, si se implementa, va en su propio spec.
