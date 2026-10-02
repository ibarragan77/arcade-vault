# SPEC — Juego real de Frogger sobre el id `ranaria` (diseño nuevo, sin código de referencia)

> **Status:** Approved
> **Depends on:** SPEC 06, SPEC 10
> **Date:** 2026-10-01
> **Objective:** Diseñar e implementar un Frogger por grilla desde cero en `components/games/frogger/FroggerGame.tsx`, reutilizando el id `ranaria` del catálogo (actualizando su `title`/`short`/`long`) y registrándolo en `GAME_ENGINES` para que se juegue en `/juegos/ranaria/jugar`.

## Por qué existe este spec

Esta spec nació en el game jam con supuestos que no coincidían con el repo (play-page propia `app/games/frogger/play/page.tsx`, rutas `/games/frogger` y `/hall-of-fame`, `lib/supabase/types.ts`, color `lime`, una play-page de Space Invaders inexistente) y con contradicciones internas (canvas 480×640 vs 640×560, bocas en la fila 0 vs 1, río en las filas 7–2 vs 1–6). Esta versión la alinea con la arquitectura real: el juego es un motor más de `GAME_ENGINES`, renderizado por `GamePlayer.tsx` en la ruta dinámica `/juegos/[id]/jugar`, con el mismo contrato que Asteroids/Tetris/Arkanoid/Snake. Igual que Snake (SPEC 10), no hay fuente en `references/started-games/`, así que la lógica se diseña desde cero.

## Scope

**In:**

- `UPDATE` sobre la fila `id = 'ranaria'` de Supabase: `title` = `RANARIA`, `short`/`long` reescritos con la descripción real del juego. `cat` (`ARCADE`), `color` (`green`) y `cover` (`cover-rana`) no cambian.
- Nuevo componente `components/games/frogger/FroggerGame.tsx` (`"use client"`), con el contrato `GameEngineProps` de `lib/game-engines.ts`: lógica completa de Frogger por grilla, dibujada con primitivas canvas (sin imágenes).
- Canvas lógico de 640×560 (16 columnas × 14 filas de 40 px), centrado con franjas negras laterales dentro de `.crt-screen` (4:3), mismo criterio que `TetrisGame.tsx`.
- Carretera de 5 carriles (coches y camiones), río de 5 carriles (troncos y grupos de tortugas que se sumergen), 5 bocas destino, 3 vidas, niveles con velocidad creciente y temporizador por rana.
- HUD interno en canvas (fila 0), que convive con el HUD externo de `GamePlayer.tsx`.
- Registrar `ranaria: { Component: FroggerGame, hasLives: true }` en `GAME_ENGINES`.
- Después del plan, `/spec-impl-game` corre `skin-designer` y luego `mobile-porter` sobre `ranaria`. Esos agentes agregan los skins (`clasico`/`neon`/`retro`) y los controles táctiles. Su trabajo no forma parte de los pasos ni de los criterios de esta spec.

**Out of scope (para specs futuros):**

- Una play-page propia (`app/games/frogger/play/page.tsx`) o un modal de fin de partida propio: se reutilizan `GamePlayer.tsx` y su modal.
- Una fila nueva `frogger` en `games` o un cover CSS nuevo.
- Cambios a `GamePlayer.tsx`, `GameEngineProps`, `lib/scores.ts` o al esquema de Supabase.
- Sprites o assets externos (todo se dibuja con primitivas canvas).
- Animación elaborada de muerte (explosiones, partículas).
- Power-ups o eventos: mosca bonus en las bocas, cocodrilo disfrazado de tronco, rana acompañante.
- Teclas propias de pausa (`P`/`Esc`): la pausa la controla solo el botón del HUD externo.
- Supabase Auth, RLS y Realtime.

## Data model

```ts
// lib/game-engines.ts (entrada nueva, el resto del archivo no cambia)
ranaria: { Component: FroggerGame, hasLives: true },
```

Constantes de módulo en `FroggerGame.tsx` (datos puros, no estado mutable):

```ts
const COLS = 16;
const ROWS = 14;
const CELL = 40; // px
const W = COLS * CELL; // 640
const H = ROWS * CELL; // 560

// Filas (0 = arriba)
const ROW_HUD = 0; // score, nivel, vidas y barra de tiempo
const ROW_GOALS = 1; // 5 bocas destino
const ROW_RIVER_TOP = 2; // río: filas 2–6 (5 carriles)
const ROW_RIVER_BOT = 6;
const ROW_SAFE_MID = 7; // mediana segura
const ROW_ROAD_TOP = 8; // carretera: filas 8–12 (5 carriles)
const ROW_ROAD_BOT = 12;
const ROW_START = 13; // base de inicio
const START_COL = 7;

// Cada boca ocupa 2 columnas; las columnas 0, 3, 6, 9, 12 y 15 de la fila 1 son muro.
const GOAL_COLS = [1, 4, 7, 10, 13]; // columna izquierda de cada boca

const JUMP_MS = 120;
const START_LIVES = 3;
const TURTLE_VISIBLE_MS = 3000;
const TURTLE_SUBMERGED_MS = 1500;
const SPEED_STEP = 1.15; // multiplicador de velocidad por nivel
```

Tipos locales (no exportados):

```ts
type Direction = "up" | "down" | "left" | "right";
type EntityType = "car" | "truck" | "log" | "turtle";

type Entity = {
  x: number; // columna izquierda en celdas (float)
  width: number; // en celdas
  type: EntityType;
  phaseMs?: number; // solo tortugas: desfase del ciclo de inmersión
};

type Lane = {
  row: number;
  speed: number; // px/frame a 60 fps, ya escalada por nivel
  dir: 1 | -1;
  entities: Entity[];
};

type Frog = {
  x: number; // columna en celdas (float: el río la arrastra)
  row: number;
  jumping: boolean;
  jumpT: number; // ms transcurridos del salto
  fromX: number;
  fromRow: number;
  toX: number;
  toRow: number;
};
```

Estado del motor, creado dentro de un único `useEffect` de montaje (nunca en variables de módulo): `lanes`, `frog`, `pendingDir`, `goalsFilled: boolean[5]`, `score`, `lives`, `level`, `timeLeftMs`, `bestRowThisFrog`, `elapsedMs` (reloj del ciclo de tortugas).

Reglas numéricas:

- Desplazamiento de una entidad por frame: `x += (lane.speed * lane.dir * dt) / (16.67 * CELL)`, en celdas.
- `lane.speed = baseSpeed * SPEED_STEP ** (level - 1)`; las velocidades base van de 1.5 a 4 px/frame en la carretera y de 1 a 3 px/frame en el río.
- Tiempo por rana: `timeLimitMs = Math.max(15000, 30000 - (level - 1) * 2000)`.
- Una tortuga está sumergida cuando `(elapsedMs + phaseMs) % 4500 >= TURTLE_VISIBLE_MS`.

No se agregan columnas ni tablas en Supabase: se reutiliza el esquema de SPEC 06 y solo cambia el contenido de una fila existente.

## Implementation plan

1. **Actualizar la fila `ranaria` en Supabase.** `UPDATE games SET title = 'RANARIA', short = ..., long = ... WHERE id = 'ranaria'`, con textos reales del juego (carretera, río de troncos y tortugas, cinco bocas, tres vidas, tráfico que acelera por nivel). `cat`, `color` y `cover` no se tocan. El implementador muestra el SQL final y **lo ejecuta el usuario** en el SQL Editor de Supabase, salvo que el usuario autorice explícitamente aplicarlo vía MCP. Verificación: `/games` muestra la tarjeta RANARIA con el texto nuevo.
2. **Crear el esqueleto de `components/games/frogger/FroggerGame.tsx`:**
   - Constantes y tipos del Data model.
   - Un contenedor `div` con fondo `#000`, flex centrado y `height: 100%`, con un `<canvas width={640} height={560} style={{ height: "100%", width: "auto" }} />` (letterboxing como Tetris).
   - Un único `useEffect` de montaje con el loop de `requestAnimationFrame`, el patrón `pausedRef` de `AsteroidsGame.tsx` y un `draw()` que pinta solo el fondo por zonas: fila 0 negra, fila 1 verde oscuro con bocas verde claro de borde dorado, río azul oscuro, filas 7 y 13 verde oscuro, carretera gris muy oscuro con líneas de carril.
   - El componente todavía **no** se registra en `GAME_ENGINES`, así que el sitio no cambia.
3. **Implementar `buildLanes(level)`**, función pura del módulo, con los 10 carriles:
   - Carretera (filas 8–12): sentidos alternos; mezcla de coches (1 celda) y camiones (2–3 celdas); huecos de al menos 2 celdas entre vehículos.
   - Río (filas 2–6): sentidos alternos; troncos de 2–4 celdas con huecos de al menos 1 celda; grupos de tortugas de 2–3 celdas con `phaseMs` distinto por grupo. Al menos 2 de los 5 carriles son de tortugas.
   - Cada carril tiene al menos 2 entidades. Las velocidades se escalan por `SPEED_STEP ** (level - 1)`.
   - Movimiento en loop: al salir completamente por un borde, la entidad reaparece por el opuesto (`x = COLS` o `x = -width`).
   - `draw()` dibuja las entidades: coches como rectángulos rojo/amarillo/azul con ruedas circulares; camiones grises con cabina diferenciada; troncos marrones con líneas de textura; tortugas como círculos verdes con escamas; tortugas sumergidas solo como contorno semitransparente.
4. **Rana e input:**
   - Rana inicial en `(START_COL, ROW_START)`, dibujada como una elipse verde brillante de 28×24 px con dos ojos blanco/negro y patas extendidas mientras salta.
   - Un listener `keydown` en `document` (registrado y limpiado en el efecto de montaje) toma las 4 flechas: guarda `pendingDir` y llama `preventDefault()` para que la página no haga scroll.
   - Si la rana no está saltando y hay `pendingDir`, inicia un salto de 1 celda: `toX = Math.round(x) ± 1` en horizontal, `toRow = row ± 1` en vertical.
   - Se ignora un salto que la sacaría de `[0, COLS - 1]` en horizontal, o de `[ROW_GOALS, ROW_START]` en vertical.
   - El salto interpola visualmente durante `JUMP_MS` (120 ms). Al terminar fija la posición y llama a la resolución de celda (paso 5).
   - Las teclas se ignoran mientras `pausedRef` es `true`.
5. **Colisiones, soporte en el río y bocas.** Funciones del módulo, evaluadas sobre el centro de la rana (`x + 0.5`):
   - `checkRoadCollision`: en las filas 8–12, la rana muere si su centro cae dentro de `[e.x, e.x + e.width)` de algún vehículo de su carril. Se evalúa en cada frame, no solo al aterrizar.
   - `getSupport`: en las filas 2–6, cuando la rana no está saltando, busca el tronco o tortuga **no sumergida** que contiene su centro. Si existe, la rana se desplaza con la entidad. Si no existe, la rana muere: cayó al agua o la tortuga se sumergió bajo ella.
   - En el río, la rana muere si su centro sale de `[0, COLS)` arrastrada por la corriente.
   - Al aterrizar en `ROW_GOALS`: se redondea `x`. Si la columna cae en una boca libre, la boca se marca. Si cae en un muro o en una boca ocupada, la rana muere.
6. **Puntaje, vidas, temporizador y niveles** (`killFrog`, `scoreGoal`, `completeRound`):
   - **Puntaje:**
     - +10 por cada fila nueva más alta alcanzada en el intento actual de la rana (`bestRowThisFrog`).
     - +50 al ocupar una boca.
     - +`Math.floor(timeLeftMs / 1000) * 10` de bonus de tiempo al ocupar una boca.
     - +200 al completar la ronda (5 bocas).
     - Cada cambio de puntaje llama `onScoreChange(score)`.
   - **Temporizador:** `timeLeftMs` baja solo mientras el juego no está en pausa. Se reinicia a `timeLimitMs` al ocupar una boca, al morir y al empezar una ronda. Si llega a 0, la rana muere.
   - **`killFrog()`:** `lives--` y `onLivesChange(lives)`.
     - Si `lives === 0`, llama **una sola vez** a `onGameOver(score)` y detiene el loop (no pide más frames).
     - Si no, la rana vuelve a `(START_COL, ROW_START)` y se reinician el temporizador y `bestRowThisFrog`.
   - **Boca ocupada:** la rana vuelve al inicio con temporizador y `bestRowThisFrog` reiniciados. Si las 5 bocas están llenas, se llama a `completeRound()`.
   - **`completeRound()`:** `level++`, `onLevelChange(level)`, vacía las bocas, reconstruye `lanes = buildLanes(level)` y reinicia el temporizador.
7. **HUD interno en la fila 0:**
   - Puntaje arriba a la izquierda (`"Score: " + score`, blanco, 16 px).
   - `"Nivel " + level` centrado.
   - Un ícono de rana (círculo verde) por vida restante, arriba a la derecha.
   - Una barra de tiempo en la parte baja de la fila 0, con ancho proporcional a `timeLeftMs / timeLimitMs` y color verde (>50 %), amarillo (>25 %) o rojo.
   - Las bocas ocupadas se dibujan con una silueta de rana dentro.
   - No hay ningún overlay de GAME OVER en el canvas.
8. **Registrar el motor.** Agregar `ranaria: { Component: FroggerGame, hasLives: true }` a `GAME_ENGINES` en `lib/game-engines.ts`. Desde este paso `/juegos/ranaria/jugar` renderiza el juego real, y `GamePlayer.tsx` muestra vidas, puntaje y nivel y gestiona el modal, el guardado vía `saveScore`, "JUGAR DE NUEVO" (`resetKey`) y "SALIR".
9. **Verificación.** Correr `npm run build` sin errores de TypeScript. Con `npm run dev`, jugar una partida completa en `/juegos/ranaria/jugar` y comprobar cada muerte, ocupar las 5 bocas, subir de nivel, pausar, guardar el puntaje, "JUGAR DE NUEVO" y "SALIR". Confirmar que los otros cuatro juegos no cambiaron.

## Acceptance criteria

- [ ] La fila `ranaria` de Supabase tiene el `title`/`short`/`long` nuevos y conserva `cat = ARCADE`, `color = green` y `cover = cover-rana`.
- [ ] `/games` muestra la tarjeta RANARIA con el texto nuevo.
- [ ] `/juegos/ranaria` muestra la ficha con el leaderboard real (vacío o "0" si no hay partidas).
- [ ] `/juegos/ranaria/jugar` renderiza el canvas real de 640×560, centrado con franjas negras dentro de la pantalla CRT, y no el `.game-arena` falso.
- [ ] Se distinguen visualmente la fila de HUD, las bocas, el río, la mediana, la carretera y la base de inicio.
- [ ] La rana aparece en la columna 7 de la fila 13 al empezar, tras cada muerte y tras cada boca ocupada.
- [ ] Cada flecha mueve la rana exactamente una celda, con una animación de salto de 120 ms; mantener o repetir la tecla durante un salto no acumula saltos extra en ese salto.
- [ ] La rana no puede saltar fuera de los bordes laterales ni por debajo de la fila 13.
- [ ] Las flechas no hacen scroll de la página mientras se juega.
- [ ] Los vehículos, troncos y tortugas se mueven en loop por sus carriles, en sentidos alternos, y reaparecen por el lado opuesto.
- [ ] Las tortugas alternan 3 s visibles y 1.5 s sumergidas, desfasadas por grupo.
- [ ] Sobre un tronco o una tortuga visible, la rana se desplaza con él.
- [ ] La rana muere al tocar un vehículo.
- [ ] La rana muere al caer al agua.
- [ ] La rana muere cuando se sumerge la tortuga que la sostiene.
- [ ] La rana muere al ser arrastrada fuera del borde del río.
- [ ] La rana muere al agotarse el tiempo.
- [ ] La rana muere al saltar a un muro o a una boca ocupada de la fila 1.
- [ ] Ocupar una boca libre suma 50 puntos más el bonus de tiempo, y dibuja una rana dentro de la boca.
- [ ] Cada fila nueva más alta en el intento actual suma 10 puntos.
- [ ] Completar las 5 bocas suma 200 puntos, sube el nivel, vacía las bocas y acelera el tráfico un 15 %.
- [ ] El tiempo por rana es de 30 s en el nivel 1 y baja 2 s por nivel, con un mínimo de 15 s.
- [ ] El HUD interno muestra puntaje, nivel, íconos de vidas y la barra de tiempo con colores verde/amarillo/rojo.
- [ ] El HUD externo de `GamePlayer.tsx` refleja en tiempo real puntaje, vidas (♥) y nivel.
- [ ] Perder la tercera vida dispara una sola vez el modal "FIN DEL JUEGO" con el puntaje correcto, sin overlay de game over en el canvas.
- [ ] El botón "FIN" del HUD también abre el modal con el puntaje acumulado.
- [ ] "PAUSA" congela tráfico, río, tortugas, rana y temporizador.
- [ ] "REANUDAR" continúa la partida sin saltos de posición ni de tiempo.
- [ ] Las teclas `P` y `Esc` no pausan el juego.
- [ ] Guardar el puntaje llama a `saveScore({ game: "ranaria", score, name })`, y la partida aparece en `/juegos/ranaria` y en `/salon` al recargar.
- [ ] "JUGAR DE NUEVO" reinicia desde cero: 3 vidas, nivel 1, puntaje 0, bocas vacías.
- [ ] "SALIR" no deja el loop ni el listener de teclado corriendo.
- [ ] Asteroids, Tetris, Arkanoid y Snake siguen funcionando igual.
- [ ] `npm run build` compila sin errores de TypeScript.

## Decisions

- **Sí:** reutilizar el id `ranaria` con un `UPDATE` en vez de insertar una fila `frogger`. Razón: decisión explícita del usuario. El relleno "RANARIA — Cruza la autopista de pixeles" ya es Frogger y ya tiene `cover-rana` verde. Es el mismo precedente que `serpentina` en SPEC 10.
- **No:** fila nueva `frogger` con color `lime`. Razón: `lime` no existe en `GameColor` (`cyan | magenta | yellow | green`), y además dejaría el relleno `ranaria` duplicado en el catálogo.
- **Sí:** un motor en `GAME_ENGINES` renderizado por `GamePlayer.tsx` en `/juegos/[id]/jugar`, en vez de una play-page propia. Razón: es la arquitectura real desde SPEC 08. La play-page propia y las rutas `/games/frogger/play` y `/hall-of-fame` de la versión anterior no existen en el repo.
- **No:** `dynamic(..., { ssr: false })` ni un modal propio que guarde en `localStorage` (`av_player_name`). Razón: `GamePlayer.tsx` ya es un client component que monta el motor, y ya resuelve el nombre (vía `useSession`), el guardado y el reinicio.
- **Sí:** canvas de 640×560 (16×14 celdas de 40 px) con franjas negras dentro del CRT 4:3. Razón: decisión explícita del usuario. Mantiene 5 carriles de carretera y 5 de río, y el mapa de Frogger es más alto que ancho. Sigue el mismo patrón visual que Tetris.
- **Sí:** fila 0 = HUD, fila 1 = bocas, filas 2–6 = río, fila 7 = mediana, filas 8–12 = carretera, fila 13 = inicio. Razón: resuelve las contradicciones de la versión anterior (bocas en la fila 0 o 1, río en las filas 7–2 o 1–6, HUD encima de las bocas).
- **Sí:** temporizador por rana, de 30 s con −2 s por nivel y mínimo de 15 s. Razón: decisión explícita del usuario. Con 15 s fijos casi no da tiempo de cruzar 12 filas esquivando tráfico.
- **Sí:** los +10 por fila cuentan por intento de rana (`bestRowThisFrog`), no por ronda. Razón: es coherente con el temporizador por rana y con el Frogger clásico. Con conteo por ronda, las ranas 2 a 5 no sumarían puntos por avanzar.
- **Sí:** posición horizontal de la rana en float. Al saltar o al llegar a las bocas se redondea a celda entera, y las colisiones se evalúan sobre su centro. Razón: el río la arrastra en continuo, así que una columna entera no sirve para el soporte ni para el borde.
- **Sí:** velocidades en px/frame normalizadas por `dt` y convertidas a celdas. Razón: la fórmula anterior (`entity.col += lane.speed * dt / 16`) mezclaba píxeles con columnas.
- **Sí:** primitivas canvas sin sprites. Razón: no hay assets de Frogger en el repo; es el mismo criterio que Asteroids y Tetris.
- **Sí:** 3 vidas (`hasLives: true`). Razón: Frogger clásico; es el mismo patrón que Asteroids y Arkanoid.
- **Sí:** skins y controles táctiles delegados a `skin-designer` y `mobile-porter` al final de `/spec-impl-game`. Razón: decisión explícita del usuario. Esos agentes generalizan los patrones de SPEC 11/12. Esta spec solo deja el motor jugable con teclado y una paleta.
- **No:** teclas de pausa propias. Razón: la pausa vive en el HUD de `GamePlayer.tsx`, igual que en los demás juegos.
- **No:** el implementador no ejecuta el `UPDATE` de Supabase por su cuenta. Razón: es una escritura en producción y `/spec-impl-game` trabaja con Supabase en solo lectura. Lo ejecuta el usuario, o lo autoriza explícitamente.

## Risks

| Riesgo                                                                                              | Mitigación                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Carriles sin hueco atravesable (carretera) o sin apoyo alcanzable (río) en niveles altos.           | `buildLanes` garantiza huecos mínimos y al menos 2 entidades por carril. La verificación del paso 9 incluye llegar al nivel 3. |
| Con `dt` grande (pestaña en segundo plano), una entidad cruza a la rana sin detectarse la colisión. | Se limita `dt` a 50 ms por frame, igual que el reseteo de `lastTime` al reanudar la pausa.                                     |
| La rana pierde el soporte en el instante exacto en que una tortuga empieza a sumergirse.            | Es el comportamiento buscado (criterio de aceptación). El contorno semitransparente avisa del estado.                          |
| `mobile-porter` necesita un esquema de botones que no rompa los saltos discretos.                   | Fuera de esta spec. El agente reutiliza la ruta de input (`pendingDir`) del teclado.                                           |

## What is **not** in this spec

- Play-page propia, modal propio o ruta `/games/frogger/play`.
- Fila nueva `frogger` o cover CSS nuevo.
- Sprites o assets externos.
- Animación elaborada de muerte.
- Power-ups: mosca, cocodrilo, rana acompañante.
- Skins y controles táctiles dentro del plan de esta spec (los agregan los agentes de `/spec-impl-game`).
- Teclas propias de pausa.
- Auth, RLS y Realtime.

Cada uno de estos, si se implementa, va en su propio spec.
