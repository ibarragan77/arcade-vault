# SPEC 10 — Juego real de Snake (diseño nuevo, sin código de referencia)

> **Status:** Implemented
> **Depends on:** SPEC 05, SPEC 06, SPEC 08, SPEC 09
> **Date:** 2026-09-03
> **Objective:** Diseñar e implementar un juego de Snake por grilla desde cero (sin puerto de `references/started-games/`, ya que no existe fuente), reutilizando el id `serpentina` del catálogo actualizando su `title`/`short`/`long` a la descripción real del juego, usando las 22 frutas de `references/source-assets/snake-assets/fruits.png` como recompensas, y registrándolo en `GAME_ENGINES` (`lib/game-engines.ts`).

## Por qué existe este spec

A diferencia de Asteroids, Tetris y Arkanoid (SPECs 05/08/09), no existe una carpeta en `references/started-games/` con un `game.js` de Snake que portar — solo se dispone de un spritesheet de frutas (`fruits.png`, 3790×442px, 22 variedades) y su mapa de coordenadas (`sprites.js`). Este spec diseña la lógica del juego desde cero, pero reutiliza en su totalidad el contrato de componente, el patrón de precarga de assets y el registro `GAME_ENGINES` ya establecidos por los specs anteriores — no se reabre ninguna decisión de arquitectura de la plataforma, solo las de diseño propias de Snake (grilla, velocidad, colisiones, puntaje).

## Scope

**In:**

- `UPDATE` sobre la fila `id = 'serpentina'` en Supabase: `title`/`short`/`long` reescritos con la descripción real del juego (grilla, frutas, crecimiento, velocidad creciente). `cat` (`ARCADE`), `color` (`green`) y `cover` (`cover-snake`) se mantienen sin cambios — el cover existente ya es verde y con elementos que evocan una serpiente.
- Copia de `references/source-assets/snake-assets/fruits.png` a `public/games/snake/`.
- Nuevo componente `components/games/snake/SnakeGame.tsx`: lógica completa de Snake por grilla (movimiento discreto, colisiones, frutas, velocidad creciente, HUD interno), como componente cliente, con el mismo contrato de props que `AsteroidsGame.tsx`/`TetrisGame.tsx`/`ArkanoidGame.tsx`.
- Registrar `serpentina: { Component: SnakeGame, hasLives: false }` en `GAME_ENGINES` (`lib/game-engines.ts`) — sin tocar la estructura del registro.

**Out of scope (para specs futuros):**

- Wrap-around en los bordes (teletransportar al lado opuesto) — se decidió game over al chocar con la pared, ver Decisions.
- Vidas o reaparición tras chocar — Snake termina la partida al primer choque, ver Decisions.
- Puntaje distinto por tipo de fruta — todas valen igual, ver Decisions.
- Controles táctiles/móviles.
- Sprites propios para el cuerpo de la serpiente (no existen en `snake-assets/`; se dibuja con bloques de color, ver Decisions).
- Reemplazar o modificar cualquier otro juego del catálogo existente.

## Data model

```ts
// lib/game-engines.ts (entrada nueva, el resto del archivo no cambia)
export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  asteroides: { Component: AsteroidsGame, hasLives: true },
  caida: { Component: TetrisGame, hasLives: false },
  "bloque-buster": { Component: ArkanoidGame, hasLives: true },
  serpentina: { Component: SnakeGame, hasLives: false },
};
```

`SnakeGame.tsx` implementa `GameEngineProps` invocando `onScoreChange` y `onLevelChange` (no aplica `onLivesChange`, igual criterio que `TetrisGame.tsx`: `hasLives: false` hace que `GamePlayer.tsx` oculte el campo "Vidas" del HUD externo automáticamente).

Estado interno del motor (creado dentro de un único `useEffect` de montaje, nunca en variables de módulo):

```ts
type Cell = { col: number; row: number };
type Direction = "up" | "down" | "left" | "right";

// grilla lógica: 40 columnas x 30 filas, celda de 20px -> canvas 800x600
const GRID_COLS = 40;
const GRID_ROWS = 30;
const CELL = 20;

let snake: Cell[]; // snake[0] = cabeza
let direction: Direction; // dirección actual aplicada
let nextDirection: Direction; // última tecla válida pendiente de aplicar en el próximo tick
let fruit: { cell: Cell; sprite: keyof typeof FRUIT_SPRITES };
let score: number;
let level: number; // 1 + Math.floor(fruitsEaten / 5)
let fruitsEaten: number;
let tickIntervalMs: number; // 150ms inicial, -10ms por nivel, piso 60ms
let accumulatorMs: number; // acumula dt hasta alcanzar tickIntervalMs
```

No se agregan columnas ni tablas nuevas en Supabase — reutiliza el esquema de SPEC 06 sin cambios, solo actualiza contenido de una fila existente.

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 10-snake-real-game`) se crea y activa la rama `spec-10-snake-real-game` (comportamiento por defecto vía `AutoCreateBranch: true`). Cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo. No se agrupan varios pasos en un mismo commit.

1. Migración de Supabase: `UPDATE games SET title = ..., short = ..., long = ... WHERE id = 'serpentina'` con textos reales del juego (grilla, frutas, crecimiento, velocidad creciente por nivel). `cat`, `color` y `cover` no se tocan.
2. Copiar `references/source-assets/snake-assets/fruits.png` a `public/games/snake/fruits.png`.
3. Crear `components/games/snake/SnakeGame.tsx` con estas reglas concretas:
   - Canvas único de `800×600` (grilla lógica 40×30 celdas de 20px, 4:3 exacto, sin letterboxing).
   - Todo el estado (`snake`, `direction`, `nextDirection`, `fruit`, `score`, `level`, `fruitsEaten`, `tickIntervalMs`, `accumulatorMs`) se crea dentro de un único `useEffect` de montaje.
   - Precarga: un `Promise` que carga `fruits.png` (evento `load`) apuntando a `/games/snake/fruits.png` — nunca a la ruta relativa `snake-assets/...` del origen — antes de iniciar el loop; el cleanup del efecto aborta la carga en curso (`img.src = ""`) si el componente se desmonta antes de que resuelva, para evitar la condición de carrera de precarga ya identificada y corregida en SPEC 09 (doble montaje de React Strict Mode en desarrollo). Canvas en negro mientras la precarga no resuelve.
   - El mapa de coordenadas de `sprites.js` (`fruits: { banana: {x,y,w,h}, ... }`, 22 entradas) se porta como constante `FRUIT_SPRITES` del módulo (son datos puros, no estado mutable).
   - Estado inicial: serpiente de 3 segmentos, cabeza en `col 10, row 15`, cuerpo extendiéndose hacia la izquierda (`col 9`, `col 8`), dirección inicial `"right"`. Una fruta aparece en una celda libre aleatoria, con un sprite aleatorio entre las 22 disponibles de `FRUIT_SPRITES`.
   - Movimiento por grilla (no continuo como Asteroids/Arkanoid): el loop de `requestAnimationFrame` acumula `dt` en `accumulatorMs`; cuando `accumulatorMs >= tickIntervalMs`, se resta el intervalo y se avanza la serpiente exactamente una celda en la dirección de `direction` (actualizada desde `nextDirection` al inicio de ese tick).
   - Input: `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` actualizan `nextDirection`, ignorando la tecla si implica un giro de 180° instantáneo (p. ej. presionar `ArrowLeft` mientras `direction === "right"`) cuando la serpiente mide más de 1 segmento. Listener de teclado registrado/limpiado en el mismo efecto de montaje.
   - Colisión con fruta: si la nueva celda de la cabeza coincide con `fruit.cell`, la serpiente crece (no se elimina la cola ese tick), `score += 10` (`props.onScoreChange(score)`), `fruitsEaten++`, se recalcula `level = 1 + Math.floor(fruitsEaten / 5)` (si cambió, `props.onLevelChange(level)` y `tickIntervalMs = Math.max(60, 150 - (level - 1) * 10)`), y aparece una nueva fruta en una celda libre aleatoria con sprite aleatorio.
   - Colisión con pared: si la nueva celda de la cabeza cae fuera de `[0, GRID_COLS)` x `[0, GRID_ROWS)`, se llama una única vez a `props.onGameOver(score)` y se detiene el loop (no se vuelve a pedir `requestAnimationFrame`).
   - Colisión consigo misma: si la nueva celda de la cabeza coincide con cualquier segmento del cuerpo **excepto la cola** (la cola libera esa celda en el mismo tick al avanzar, salvo que la serpiente haya crecido ese tick), se llama una única vez a `props.onGameOver(score)` y se detiene el loop, mismo criterio que la colisión con pared.
   - Render: cabeza y cuerpo como bloques de color sólido (`#3ddc84` cuerpo, tono distinto y más claro para la cabeza), un bloque por celda con un pequeño margen entre celdas para distinguir segmentos; la fruta se dibuja con `ctx.drawImage` recortando `FRUIT_SPRITES` sobre `fruits.png`, escalada a `CELL x CELL`.
   - HUD interno dibujado en canvas: `"Score: " + score` arriba a la izquierda, `"Nivel: " + level` arriba centrado — mismo criterio visual que `ArkanoidGame.tsx`, convive con el HUD externo de `GamePlayer.tsx`.
   - Patrón de pausa idéntico a `AsteroidsGame.tsx`/`ArkanoidGame.tsx`: `pausedRef` sincronizado por un efecto aparte; con `paused = true` el loop sigue pidiendo frames y dibuja el último estado sin avanzar el acumulador ni la serpiente; al reanudar, `lastTime` se resetea a `null` para que el próximo `dt` no incluya el tiempo pausado.
   - Al desmontar, el cleanup cancela el `requestAnimationFrame` pendiente, remueve el listener de teclado y aborta la precarga de la imagen si seguía en curso.
4. Registrar `serpentina: { Component: SnakeGame, hasLives: false }` en `GAME_ENGINES` (`lib/game-engines.ts`).
5. Verificar manualmente con `npm run dev`: `/games` muestra la tarjeta "SERPENTINA" con el texto actualizado; abrir `/juegos/serpentina`; jugar una partida completa en `/juegos/serpentina/jugar` (mover con las 4 flechas, confirmar que no se puede girar 180° instantáneamente, comer varias frutas viendo sprites distintos y crecimiento del cuerpo, subir de nivel y notar el aumento de velocidad, chocar con una pared y con el propio cuerpo en partidas separadas); confirmar que el HUD externo muestra Puntuación y Nivel reales y no muestra el campo Vidas; confirmar pausa sin saltos, modal de fin de partida, guardado de puntuación, "JUGAR DE NUEVO" y "SALIR"; confirmar que Asteroids, Tetris, Arkanoid y el resto del catálogo no cambiaron de comportamiento.

## Acceptance criteria

- [x] `/games` incluye la tarjeta "SERPENTINA" (categoría ARCADE, portada `cover-snake`, color green) con el `title`/`short`/`long` reales del juego.
- [x] `/juegos/serpentina` muestra la ficha del juego con leaderboard real (`getTopScores`/`getGameStats`), vacío/"0" si no hay partidas todavía.
- [x] `/juegos/serpentina/jugar` renderiza el canvas real de Snake (no el `.game-arena` falso) dentro de la pantalla CRT existente.
- [x] Las 4 flechas mueven la serpiente; no se puede girar 180° instantáneamente sobre el propio cuerpo.
- [x] Comer una fruta suma 10 puntos, hace crecer la serpiente un segmento, y hace aparecer una nueva fruta en una celda libre con un sprite aleatorio entre las 22 de `fruits.png`.
- [x] Cada 5 frutas comidas sube el nivel y aumenta la velocidad de la serpiente (piso de 60ms por tick).
- [x] El HUD externo de `GamePlayer.tsx` refleja en tiempo real Puntuación y Nivel reales, y no muestra el campo "Vidas".
- [x] Chocar contra cualquier pared del tablero, o contra el propio cuerpo, dispara automáticamente el modal "FIN DEL JUEGO" con la puntuación final correcta, sin ningún overlay dibujado dentro del canvas.
- [x] El botón "FIN" del HUD también dispara el modal con la puntuación acumulada hasta ese momento.
- [x] "PAUSA"/"REANUDAR" congelan y continúan el juego sin saltos de posición ni de velocidad.
- [x] Guardar la puntuación llama a `saveScore({ game: "serpentina", score, name })` y la partida aparece luego en la ficha del juego y en `/salon`.
- [x] "JUGAR DE NUEVO" reinicia completamente la partida (serpiente de 3 segmentos, nivel 1, puntuación 0, velocidad inicial) sin arrastrar estado anterior.
- [x] "SALIR" navega a `/juegos/serpentina` y no deja el loop de animación ni el listener de teclado corriendo en segundo plano.
- [x] Asteroids, Tetris y Arkanoid siguen funcionando exactamente igual que antes de este spec.
- [x] `npm run build` compila sin errores de TypeScript.

## Decisions

- **Sí:** se reutiliza el id `serpentina` existente actualizándolo (`UPDATE`) en vez de crear un id nuevo. Razón: decisión explícita del usuario — el placeholder ya es temáticamente una serpiente (`cover-snake` ya verde con detalles de serpiente).
- **No:** no se reemplaza `cover-snake`. Razón: decisión explícita del usuario — el cover existente ya evoca visualmente el juego, mismo criterio que Arkanoid con `cover-bricks`.
- **Sí:** canvas de `800×600` con grilla de 40×30 celdas de 20px. Razón: decisión explícita del usuario — mantiene el 4:3 exacto de `.crt-screen` sin necesitar letterboxing, y encaja perfectamente en celdas enteras.
- **Sí:** game over al chocar contra la pared (sin wrap-around). Razón: decisión explícita del usuario — comportamiento clásico tipo Nokia Snake, simple y predecible.
- **Sí:** sin concepto de vidas — la partida termina en el primer choque (`hasLives: false`). Razón: decisión explícita del usuario — diseño clásico de Snake, mismo criterio que Tetris.
- **Sí:** la velocidad aumenta con el progreso (cada 5 frutas sube un nivel y baja el intervalo de tick 10ms, piso 60ms), reportado vía `onLevelChange`. Razón: decisión explícita del usuario — da sensación de dificultad creciente, aprovechando el campo "Nivel" del HUD externo que ya existe para otros juegos.
- **Sí:** todas las frutas valen 10 puntos por igual, sin diferenciar por tipo de sprite. Razón: decisión explícita del usuario — la variedad de las 22 frutas es solo visual, evita tener que asignar y mantener 22 valores de puntaje sin beneficio claro de gameplay.
- **Sí:** la fruta mostrada en cada aparición se elige al azar entre las 22 disponibles en `fruits.png`. Razón: decisión explícita del usuario — aprovecha todo el spritesheet y da variedad visual constante.
- **Sí:** el cuerpo de la serpiente se dibuja con bloques de color sólido (sin sprite propio). Razón: decisión explícita del usuario — no existen sprites de serpiente en `snake-assets/` (solo de frutas), y conseguirlos/generarlos queda fuera de alcance de este spec; mismo criterio "canvas primitivo" que Asteroids/Tetris.
- **Sí:** el movimiento es discreto por grilla (acumulador de tiempo hasta alcanzar `tickIntervalMs`), a diferencia del movimiento continuo de Asteroids/Arkanoid. Razón: es el mecanismo de juego estándar de Snake; el contrato de `GameEngineProps`/loop de `requestAnimationFrame` no cambia, solo cómo se interpreta `dt` dentro de `update()`.
- **Sí:** se aplica desde el inicio el aprendizaje de SPEC 09 sobre la precarga de assets (abortar la carga en curso durante el cleanup del efecto). Razón: evitar repetir el bug de condición de carrera con React Strict Mode ya diagnosticado y corregido en Arkanoid.
- **No:** no se requiere ningún refactor de `GamePlayer.tsx` ni de la forma de `GAME_ENGINES`. Razón: el registro ya se generalizó en SPEC 08 y se usó para el tercer juego real en SPEC 09; este es el cuarto y solo agrega una entrada.

## Risks

| Riesgo                                                                                                                      | Mitigación                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El movimiento por grilla con acumulador es un patrón distinto al de los demás motores (movimiento continuo por `dt`).       | Se documenta explícitamente en el plan de implementación; el contrato externo (`GameEngineProps`, loop de `requestAnimationFrame`, pausa vía `pausedRef`) no cambia, solo la lógica interna de `update()`. |
| La precarga de un único asset (`fruits.png`) podría repetir la condición de carrera de SPEC 09 si no se aplica el fix.      | El plan incluye explícitamente abortar la carga en curso en el cleanup del efecto, tal como se corrigió en SPEC 09.                                                                                        |
| Elegir una celda libre aleatoria para la fruta podría iterar mucho si la serpiente ocupa casi toda la grilla (1200 celdas). | Con solo 5 puntos por nivel y game over relativamente frecuente por diseño de Snake, es improbable llegar a una serpiente que ocupe una fracción relevante de las 1200 celdas; se acepta para este spec.   |

## What is **not** in this spec

- Wrap-around en los bordes del tablero.
- Vidas o reaparición tras un choque.
- Puntaje distinto por tipo de fruta.
- Controles táctiles/móviles.
- Sprites propios para el cuerpo de la serpiente.
- Cambios a cualquier otro juego del catálogo existente.

Cada uno de estos, si se implementa, va en su propio spec.
