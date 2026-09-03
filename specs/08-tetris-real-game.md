# SPEC 08 — Juego real de Tetris (adaptación de `references/started-games/03-tetris`)

> **Status:** Implemented
> **Depends on:** SPEC 05, SPEC 06
> **Date:** 2026-09-02
> **Objective:** Adaptar el juego de Tetris ya construido en `references/started-games/03-tetris` a un componente cliente de Next.js, reutilizar el id `caida` del catálogo (cuya descripción ya es Tetris) para integrarlo, y generalizar el wiring de `GamePlayer.tsx` de un caso especial único a un registro `id → motor` para que agregar futuros juegos reales no siga acumulando `if`s.

## Por qué existe este spec

SPEC 05 dejó un patrón probado para portar un juego canvas de `references/started-games/` a un componente React (contrato de props, `useEffect` único de montaje, HUD interno conviviendo con el externo), pero lo implementó como un caso especial hardcodeado (`game.id === "asteroides"`) en `app/juegos/[id]/jugar/GamePlayer.tsx`, porque en ese momento solo existía un juego real. Este es el segundo juego real que se porta a la plataforma, así que corresponde generalizar ese wiring a un registro (`id → componente`) antes de agregar Tetris, en vez de sumar un segundo `if` idéntico. A diferencia de Asteroids —que necesitó un id de catálogo nuevo porque su placeholder temático (`rocas`) ya estaba en uso con otro nombre—, la fila `caida` en Supabase ya describe textualmente Tetris ("Piezas geométricas descienden... limpia líneas... la velocidad aumenta cada 10 líneas"), así que este spec reutiliza ese id en vez de crear uno nuevo. Tetris tampoco tiene concepto de "vidas" (tiene LÍNEAS en su lugar), lo que obliga a que el HUD externo genérico deje de asumir que todo motor reporta vidas.

## Scope

**In:**

- Nuevo archivo `lib/game-engines.ts`: tipo `GameEngineProps` (el contrato de props que ya usa `AsteroidsGame.tsx`, con `onLivesChange`/`onLevelChange` ahora opcionales), tipo `GameEngineEntry` (`{ Component, hasLives }`) y el registro `GAME_ENGINES: Record<string, GameEngineEntry>`, con `asteroides` como primera entrada (migrando el caso especial existente) y `caida` como segunda (Tetris).
- Refactor de `app/juegos/[id]/jugar/GamePlayer.tsx`: reemplazo de `isAsteroids`/`game.id === "asteroides"` por `const engine = GAME_ENGINES[game.id]`, en las dos `useEffect` de puntaje/nivel simulados, en `restart()`, y en el ternario de render (`.crt-screen`).
- Ajuste al HUD externo de `GamePlayer.tsx` para ocultar el bloque "Vidas" cuando `engine?.hasLives` es `false` (Tetris no muestra corazones).
- Nuevo componente `components/games/tetris/TetrisGame.tsx`: puerto de la lógica completa de `game.js` (tablero 10×20, 8 piezas con rotación y wall-kick, ghost piece, líneas, niveles, caída dura/suave, mini-preview de la siguiente pieza) como componente cliente con dos `<canvas>` propios (tablero + siguiente pieza), ciclo de vida vía `useEffect` y comunicación con el Reproductor mediante el mismo contrato de props que Asteroids (sin `onLivesChange`).
- Verificación de la fila `caida` en Supabase (`title`/`short`/`long`/`cat`/`cover`/`color`) — sin necesidad de `UPDATE` porque el contenido ya coincide con Tetris (ver Decisions).

**Out of scope (para specs futuros):**

- Toggle de tema claro/oscuro del juego original (`references/started-games/03-tetris` lo trae vía `localStorage`) — el proyecto ya tiene su propio tema visual CRT.
- Tecla `P` de pausa interna del juego original — la pausa ya la controla `GamePlayer.tsx` vía el botón PAUSA/REANUDAR existente y la prop `paused`.
- Sonido/efectos de audio (el original tampoco los tiene).
- Controles táctiles/móviles (solo teclado, igual que el original: ← → mover, ↑ o X rotar, ↓ caída suave, Espacio caída dura).
- Portar `04-arkanoid` ni ningún otro juego de `references/started-games/`.
- Corregir `specs/07-fix-asteroids-keyboard-listener-modal-input.md` (bug de teclado de Asteroids) — sigue siendo un spec independiente, aunque este spec sí aplica preventivamente la misma lección a Tetris (ver Implementation plan, paso 5).
- Reemplazar o modificar cualquier otro juego del catálogo existente.

## Data model

```ts
// lib/game-engines.ts
export type GameEngineProps = {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange?: (lives: number) => void; // ausente si el juego no tiene vidas
  onLevelChange?: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};

export type GameEngineEntry = {
  Component: React.ComponentType<GameEngineProps>;
  hasLives: boolean;
};

export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  asteroides: { Component: AsteroidsGame, hasLives: true },
  caida: { Component: TetrisGame, hasLives: false },
};
```

`TetrisGame.tsx` implementa `GameEngineProps` sin invocar nunca `onLivesChange` (no existe el concepto de vidas). El estado interno del motor (`board`, `current`, `next`, `score`, `lines`, `level`, `dropInterval`, `dropAccum`) deja de vivir en variables de módulo (como en el original) y se crea dentro de un `useEffect` de montaje, igual criterio que `AsteroidsGame.tsx`.

No se agregan columnas ni tablas nuevas en Supabase — reutiliza el esquema de SPEC 06 sin cambios.

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 08-tetris-real-game`) se crea y activa la rama `spec-08-tetris-real-game` (comportamiento por defecto vía `AutoCreateBranch: true`). Cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo. No se agrupan varios pasos en un mismo commit.

1. Crear `lib/game-engines.ts` con `GameEngineProps`, `GameEngineEntry` y `GAME_ENGINES`, registrando únicamente `asteroides: { Component: AsteroidsGame, hasLives: true }` por ahora (Tetris se agrega en el paso 6).
2. Refactorizar `app/juegos/[id]/jugar/GamePlayer.tsx` para usar `const engine = GAME_ENGINES[game.id];` en vez de `isAsteroids`: las dos `useEffect` con guarda (`setInterval` de puntaje falso, avance de nivel falso) pasan a `if (engine) return;`; `restart()` incrementa `resetKey` cuando `engine` existe; el ternario de render usa `engine ? <engine.Component key={resetKey} paused={paused || over} onScoreChange={setScore} onLivesChange={setLives} onLevelChange={setLevel} onGameOver={endGame} /> : <div className="game-arena">...`. Además, envolver el `hud-stat` de "Vidas" en una condición que lo omite cuando `engine && !engine.hasLives`.
3. Verificar manualmente con `npm run dev` que Asteroids (`/juegos/asteroides/jugar`) sigue comportándose exactamente igual que antes del refactor (HUD con Vidas visible, pausa, modal, guardado) — este paso no cambia comportamiento visible, solo la implementación interna.
4. Crear `components/games/tetris/TetrisGame.tsx`, portando `COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES` y las funciones `createBoard`, `randomPiece`, `collide`, `rotateCW`, `tryRotate`, `merge`, `clearLines`, `ghostY`, `hardDrop`, `softDrop`, `lockPiece`, `spawn`, `drawBlock`, `drawGrid`, `draw`, `drawNext` desde `references/started-games/03-tetris/game.js` casi verbatim, con estas adaptaciones:
   - Todo el estado (`board`, `current`, `next`, `score`, `lines`, `level`, `dropInterval`, `dropAccum`, `lastTime`, `animId`) se crea dentro de un único `useEffect` de montaje, no en variables de módulo.
   - Dos `<canvas>` propios del componente: tablero (`width={300} height={600}`) y siguiente pieza (`width={120} height={120}`), obtenidos vía `useRef`, no por `document.getElementById`.
   - Los textos SCORE/LINES/LEVEL (que en el original son elementos DOM fuera del canvas) se portan como JSX dentro del propio componente, junto al mini-canvas de siguiente pieza, como panel interno que coexiste con el HUD externo de `GamePlayer.tsx` — mismo criterio que el `drawHUD` interno de `AsteroidsGame.tsx`, adaptado a que el original de Tetris ya usaba DOM en vez de dibujo en canvas para estos textos.
   - Los listeners de teclado se registran en `window` dentro del efecto de montaje y se remueven en su cleanup; se elimina la tecla `KeyP` de pausa interna (la pausa llega vía prop).
   - Se elimina `endGame()`'s manipulación del `#overlay` DOM y el botón `restartBtn`; en su lugar, en el instante en que `spawn()` detecta colisión inicial (game over), se llama una única vez a `props.onGameOver(score)` y se detiene el loop (no se vuelve a llamar `requestAnimationFrame`).
   - Se elimina el toggle de tema claro/oscuro (`theme-toggle`, `applyTheme`, `localStorage.getItem('tetris-theme')`) — no aplica en la plataforma.
   - `props.onScoreChange(score)` y `props.onLevelChange(level)` se llaman cada vez que esos valores cambian (`clearLines`, `softDrop`, `hardDrop`). `props.onLivesChange` nunca se invoca.
   - Patrón de pausa idéntico a `AsteroidsGame.tsx`: un `pausedRef` sincronizado por un efecto aparte; cuando `paused` es `true` el loop sigue pidiendo frames y dibuja el último estado sin avanzar `dropAccum`/física; al reanudar, `lastTime` se resetea a `null`.
   - Al desmontar, el cleanup cancela el `requestAnimationFrame` pendiente y remueve los listeners de teclado.
5. Gatear la intercepción de teclado (`e.preventDefault()` en Espacio y flechas) con `pausedRef.current` desde el primer commit de este componente, aplicando preventivamente la misma corrección que `specs/07-fix-asteroids-keyboard-listener-modal-input.md` describe para Asteroids, para que el modal de fin de partida pueda recibir texto sin que el juego intercepte las teclas mientras está pausado/terminado.
6. Registrar `caida: { Component: TetrisGame, hasLives: false }` en `GAME_ENGINES` (`lib/game-engines.ts`).
7. Verificar con `mcp__supabase__execute_sql` (`select * from games where id = 'caida'`) que `title`/`short`/`long`/`cat`/`cover`/`color` ya describen Tetris correctamente; no se requiere `UPDATE` salvo que la revisión encuentre una discrepancia de texto.
8. Verificar manualmente con `npm run dev`: `/games` muestra la tarjeta "CAÍDA" con datos reales; abrir `/juegos/caida`; jugar una partida completa en `/juegos/caida/jugar` (mover, rotar con wall-kick, caída suave y dura, limpiar líneas, subir de nivel, perder por apilar hasta arriba); confirmar que el HUD externo muestra Puntuación y Nivel reales y **no** muestra el bloque Vidas; confirmar pausa, modal de fin de partida, guardado de puntuación, "JUGAR DE NUEVO" y "SALIR"; confirmar que Asteroids y el resto del catálogo no cambiaron de comportamiento tras el refactor del registro.

## Acceptance criteria

- [x] `/games` incluye la tarjeta "CAÍDA" (categoría PUZZLE, portada `cover-tetro`, color magenta) con datos reales de Supabase, sin cambios visuales respecto al placeholder salvo que ahora es jugable de verdad.
- [x] `/juegos/caida` muestra la ficha del juego con leaderboard real (`getTopScores`/`getGameStats`), vacío/"0" si no hay partidas todavía.
- [x] `/juegos/caida/jugar` renderiza el tablero real de Tetris (no el `.game-arena` falso) dentro de la pantalla CRT existente, junto al mini-preview de la siguiente pieza.
- [x] Las flechas ← → mueven la pieza, ↑/X rotan con wall-kick, ↓ hace caída suave y Espacio hace caída dura (verificado en el navegador); las líneas completas se limpian y suman puntos según `LINE_SCORES` multiplicado por el nivel (verificado por revisión de código — `clearLines()` es un puerto casi literal del original y se ejecuta dentro del mismo `lockPiece()` ya probado en vivo; no se logró forzar una fila completa a ciegas durante la sesión de pruebas manuales).
- [x] El nivel sube cada 10 líneas y la velocidad de caída aumenta en consecuencia, igual que el original (verificado por revisión de código, misma fórmula que el original — no observado en vivo por la misma razón que el punto anterior).
- [x] El HUD externo de `GamePlayer.tsx` refleja en tiempo real Puntuación y Nivel reales; el bloque "Vidas" no se muestra para este juego.
- [x] Apilar piezas hasta la parte superior del tablero dispara automáticamente el modal "FIN DEL JUEGO" con la puntuación final correcta, sin ningún overlay de "GAME OVER" dibujado dentro del canvas ni el botón "Reiniciar" original.
- [x] El botón "FIN" del HUD también dispara el modal con la puntuación acumulada hasta ese momento.
- [x] "PAUSA"/"REANUDAR" congelan y continúan el juego sin saltos de posición ni de velocidad de caída.
- [x] Escribir el nombre en el modal de fin de partida funciona con teclado normal (espacio, flechas) sin que el juego intercepte esas teclas.
- [x] Guardar la puntuación llama a `saveScore({ game: "caida", score, name })` y la partida aparece luego en la ficha del juego y en `/salon`.
- [x] "JUGAR DE NUEVO" reinicia completamente la partida (tablero vacío, puntuación y líneas en 0, nivel 1) sin arrastrar estado anterior.
- [x] "SALIR" navega a `/juegos/caida` y no deja el loop de animación ni los listeners de teclado corriendo en segundo plano.
- [x] Asteroids (`/juegos/asteroides/jugar`) y el resto del catálogo siguen funcionando exactamente igual que antes de este spec, tras el refactor de `GamePlayer.tsx` al registro `GAME_ENGINES`.
- [x] `npm run build` compila sin errores de TypeScript.

## Decisions

- **Sí:** se reutiliza el id `caida` existente (actualizándolo si hiciera falta) en vez de crear un id nuevo. Razón: decisión explícita del usuario — a diferencia de Asteroids/`rocas`, la descripción de `caida` ya es literalmente Tetris, así que crear un id paralelo sería redundante.
- **Sí:** se refactoriza `GamePlayer.tsx` de un caso especial único a un registro `id → motor` (`lib/game-engines.ts`) en este mismo spec, no en uno posterior. Razón: decisión explícita del usuario al definir el alcance del skill `/add-game` — este es el segundo juego real, el momento exacto en que el caso especial dejaría de escalar.
- **Sí:** el registro incluye metadata `hasLives` por entrada, usada por `GamePlayer.tsx` para ocultar el bloque "Vidas" del HUD cuando el motor no reporta ese concepto. Razón: decisión explícita del usuario — mostrar corazones para un juego sin vidas sería confuso.
- **Sí:** se incluye el mini-canvas "siguiente pieza" dentro del propio componente, junto al panel interno de SCORE/LINES/LEVEL. Razón: decisión explícita del usuario, prioriza fidelidad al original sobre minimizar el alcance.
- **No:** no se toca el layout compartido de `.crt-screen` en `app/globals.css` ni el de otros juegos — el tablero y el mini-preview se escalan dentro del contenedor 4:3 existente. Razón: mismo criterio que SPEC 05 ("no rediseña el Reproductor"), el ajuste queda contenido dentro del propio componente de Tetris.
- **No:** no se porta el toggle de tema claro/oscuro ni la tecla `P` de pausa interna del original. Razón: decisión explícita del usuario — el proyecto ya tiene su propio tema CRT y su propio control de pausa vía HUD externo; duplicarlos generaría UI conflictiva, mismo criterio que SPEC 05 con el overlay de "GAME OVER".
- **Sí:** se gatea el `preventDefault` de teclado con `pausedRef.current` desde el primer commit del componente. Razón: aplica preventivamente la lección de `specs/07-fix-asteroids-keyboard-listener-modal-input.md` (bug ya identificado en Asteroids) para no repetirlo en Tetris, sin que esto implique resolver el spec 07 en sí.
- **No:** no se aplica ningún cambio de texto (`title`/`short`/`long`) a la fila `caida` salvo que la verificación del paso 7 encuentre una discrepancia real. Razón: el contenido actual ya describe Tetris con precisión (confirmado por lectura directa de la tabla `games`).

## Risks

| Riesgo                                                                                                                                                                                                | Mitigación                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El refactor de `GamePlayer.tsx` a `GAME_ENGINES` podría introducir una regresión silenciosa en Asteroids si algún guard o el orden de props cambia sutilmente.                                        | El paso 3 del plan exige verificación manual explícita de Asteroids inmediatamente después del refactor, antes de tocar nada de Tetris.                                                            |
| El tablero angosto (300×600, relación 1:2) dentro de un `.crt-screen` pensado para 4:3 podría verse desproporcionado o dejar mucho espacio vacío.                                                     | Aceptado como parte de la decisión de no rediseñar el layout compartido; el componente centra y escala el tablero + preview dentro del espacio disponible, sin forzar que ocupe el 100% del ancho. |
| Ocultar el bloque "Vidas" solo para algunos juegos introduce una rama condicional nueva en el HUD compartido de `GamePlayer.tsx`, que debe mantenerse consistente si se agregan más juegos sin vidas. | La condición se basa en la metadata `hasLives` del registro, centralizada en `lib/game-engines.ts`, no en un chequeo hardcodeado por id.                                                           |

## What is **not** in this spec

- Toggle de tema claro/oscuro del juego original.
- Tecla `P` de pausa interna (reemplazada por el control externo de `GamePlayer.tsx`).
- Sonido/efectos de audio.
- Controles táctiles/móviles.
- Port de `04-arkanoid` u otro juego de `references/started-games/`.
- Resolución de `specs/07-fix-asteroids-keyboard-listener-modal-input.md` para Asteroids (sigue siendo un spec independiente).
- Cambios a cualquier otro juego del catálogo existente.

Cada uno de estos, si se implementa, va en su propio spec.
