# SPEC — Ranaria: cruce clásico por niveles (carriles fijos + metas)

> **Status:** Draft
> **Depends on:** SPEC 05, SPEC 06, SPEC 09, SPEC 10
> **Date:** 2026-09-08
> **Objective:** Diseñar e implementar el motor real de RANARIA como un Frogger clásico de niveles fijos: cruzar carriles de tráfico y un río de troncos hasta llenar las 5 metas de nenúfares antes de que se acabe el tiempo, con 3 vidas y velocidad creciente por nivel.

## Por qué existe este spec

No existe ninguna carpeta en `references/started-games/` con un juego de cruce de carriles que portar — solo el placeholder `ranaria` en Supabase (categoría ARCADE, sin motor en `GAME_ENGINES`). Este spec diseña la lógica desde cero, igual que hizo SPEC 10 con Snake, reutilizando el contrato de componente y el patrón de movimiento discreto por grilla ya establecido allí, más el patrón de vidas/temporizador/niveles de Asteroids y Arkanoid (SPEC 05/09). El `short`/`long` actual del placeholder (`"Cruza la autopista de pixeles."` / `"Salta entre carriles de coches a toda velocidad y troncos a la deriva en el río. Llega a los nenúfares antes de que se acabe el tiempo."`) ya describe con precisión este modo clásico — a diferencia de la Opción B (maratón infinito), este spec no necesita reescribir esos textos. Esta es una de dos variantes alternativas para el mismo `game-id`; la otra (`opcion-b-maraton-infinita.md`) reemplaza las metas fijas y el temporizador por un avance infinito de permadeath.

## Scope

**In:**

- Reutiliza el id `ranaria` **sin** modificar `title`/`short`/`long`/`cat`/`color`/`cover` — el placeholder actual ya describe fielmente este modo.
- Nuevo componente `components/games/ranaria/RanariaGame.tsx`, 100% canvas primitivo (sin assets externos, formas geométricas para rana/auto/camión/tronco/tortuga), canvas de `800×600` con grilla lógica de 20 columnas × 15 filas (celda de 40px, 4:3 exacto, sin letterboxing).
- Carriles de tráfico (varias filas, dirección y velocidad alternadas), carriles de río con troncos y tortugas (algunas se sumergen periódicamente), al menos una fila segura intermedia entre tráfico y río, y una fila de meta superior con 5 huecos de nenúfar.
- Movimiento discreto por grilla (un paso de celda por pulsación de flecha, sin auto-repetición), físicas de "montar" troncos/tortugas (la rana se desplaza con la velocidad del carril mientras está sobre uno).
- Sistema de 3 vidas, temporizador por vida (cuenta regresiva, ej. 25s, se reinicia al perder una vida o al llenar todas las metas), avance de nivel al llenar las 5 metas (velocidad +10% y layout de obstáculos renovado).
- Registrar `ranaria: { Component: RanariaGame, hasLives: true }` en `GAME_ENGINES` (`lib/game-engines.ts`).

**Out of scope (para specs futuros):**

- El modo maratón infinito sin metas fijas (ver `opcion-b-maraton-infinita.md`, mismo `game-id`, mecánica distinta).
- Sprites propios para rana/vehículos/troncos — se dibujan con formas geométricas de color, mismo criterio "canvas primitivo" que Asteroids/Tetris.
- Controles táctiles/móviles.
- Multijugador de cualquier tipo.
- Reemplazar o modificar cualquier otro juego del catálogo existente.

## Data model

No requiere `INSERT` ni `UPDATE` en Supabase — reutiliza la fila `ranaria` existente tal cual (SPEC 06).

```ts
// lib/game-engines.ts (entrada nueva, el resto del archivo no cambia)
export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  // ...entradas existentes sin cambios
  ranaria: { Component: RanariaGame, hasLives: true },
};
```

Estado interno del motor (creado dentro de un único `useEffect` de montaje, nunca en variables de módulo):

```ts
type LaneType = "safe" | "traffic" | "river" | "goal";
type ObstacleKind = "car" | "truck" | "log" | "turtle";

type Obstacle = {
  x: number; // px, puede exceder los bordes del canvas mientras se recicla
  width: number;
  kind: ObstacleKind;
  submerged?: boolean; // solo turtle: alterna visible/sumergida cada ~2s
};

type Lane = {
  row: number; // 0 = fila superior (metas), 14 = fila inferior (salida)
  type: LaneType;
  direction: 1 | -1;
  speedPxPerSec: number;
  obstacles: Obstacle[];
};

type GoalSlot = { col: number; filled: boolean };

let lanes: Lane[]; // 15 filas, layout definido por nivel
let goals: GoalSlot[]; // 5 huecos en la fila superior
let frog: { col: number; row: number; ridingVx: number }; // ridingVx: velocidad heredada del tronco/tortuga actual, 0 si no está montada
let lives: number; // inicial 3
let level: number; // 1-based
let timeLeftMs: number; // por vida, reinicia en respawn y en avance de nivel
let score: number;
let highestRowReached: number; // para el bonus de +10 por fila nueva en la vida actual
```

## Implementation plan

**Flujo de trabajo en git:** rama sugerida `spec-ranaria-opcion-a` (creada por `/spec-impl` si esta variante es la elegida, no antes). Un commit por paso completado.

1. Confirmar que no hace falta ninguna migración de Supabase — el placeholder `ranaria` ya es preciso para este modo.
2. Crear el esqueleto de `components/games/ranaria/RanariaGame.tsx`: canvas `800×600`, `useEffect` de montaje con loop `requestAnimationFrame` y `pausedRef` (mismo patrón que `AsteroidsGame.tsx`), rana estática dibujada en la fila de salida, sin lógica de carriles todavía.
3. Definir el layout de nivel 1: 15 filas tipadas (`safe`/`traffic`/`river`/`goal`), obstáculos iniciales espaciados regularmente por carril con dirección y velocidad propias.
4. Implementar el movimiento discreto de la rana: cada pulsación de flecha mueve exactamente una celda dentro de los límites del tablero (columnas 0–19, filas 0–14), sin repetición automática al mantener presionada la tecla.
5. Implementar colisión con vehículos (pérdida de vida inmediata), física de "montar" troncos/tortugas visibles (la rana se desplaza horizontalmente con `ridingVx` cada frame mientras permanece sobre uno) y caída al río si la fila es `river` y la rana no está sobre ningún obstáculo (pérdida de vida). Las tortugas alternan visible/sumergida cada ~2s; sumergida equivale a ausencia de soporte.
6. Implementar la fila de metas: llegar sobre un `GoalSlot` libre lo marca `filled`, suma 50 puntos y reinicia la rana en la fila de salida; llegar sobre un slot ya lleno o fuera de cualquier slot cuenta como colisión (pérdida de vida).
7. Implementar el temporizador por vida (cuenta regresiva en HUD interno): llegar a 0 resta una vida igual que una colisión. Sumar 10 puntos cada vez que `highestRowReached` mejora dentro de la vida actual.
8. Conectar `props.onLivesChange`/`props.onScoreChange` en cada pérdida de vida/cambio de puntaje; cuando `lives` llega a 0, llamar una única vez a `props.onGameOver(score)` y detener el loop.
9. Implementar el avance de nivel: al llenar los 5 `GoalSlot`, `level++`, `props.onLevelChange(level)`, velocidad de todos los carriles +10%, nuevo layout de obstáculos, temporizador reiniciado, metas vaciadas.
10. Dibujar el HUD interno (score, vidas, nivel, temporizador restante) sobre el canvas, mismo criterio visual que `ArkanoidGame.tsx`; confirmar patrón de pausa (`pausedRef`, reseteo de `lastTime` al reanudar) idéntico al resto de motores.
11. Registrar `ranaria: { Component: RanariaGame, hasLives: true }` en `GAME_ENGINES`.
12. Verificar manualmente con `npm run dev`: cruzar exitosamente llenando las 5 metas y subir de nivel, perder una vida por auto/camión, perder una vida por caer al río, perder una vida por temporizador agotado, perder la última vida y confirmar el modal de fin de partida, guardar puntuación y confirmar que aparece en la ficha del juego y en `/salon`.

## Acceptance criteria

- [ ] `/juegos/ranaria/jugar` renderiza el canvas real de Ranaria (no el `.game-arena` falso).
- [ ] Las 4 flechas mueven la rana exactamente una celda por pulsación, sin auto-repetición al mantener presionada.
- [ ] Estar sobre un tronco o tortuga visible desplaza a la rana con la velocidad del carril; una tortuga sumergida no sostiene a la rana.
- [ ] Chocar con un vehículo, o caer al río sin soporte, resta una vida y reaparece la rana en la fila de salida.
- [ ] El temporizador por vida llega a 0 y resta una vida igual que una colisión.
- [ ] Llegar a un hueco de nenúfar libre suma 50 puntos y lo marca como ocupado; llegar a uno ya ocupado o fuera de un hueco resta una vida.
- [ ] Llenar los 5 huecos de nenúfar avanza de nivel: aumenta la velocidad de los carriles un 10%, reinicia el temporizador y genera un nuevo layout de obstáculos.
- [ ] El HUD externo de `GamePlayer.tsx` refleja en tiempo real Puntuación, Vidas y Nivel reales.
- [ ] Perder la última vida dispara automáticamente el modal "FIN DEL JUEGO" con la puntuación final correcta, sin overlay propio dibujado en el canvas.
- [ ] El botón "FIN" del HUD también dispara el modal con la puntuación acumulada hasta ese momento.
- [ ] "PAUSA"/"REANUDAR" congelan y continúan el juego (carriles, temporizador) sin saltos.
- [ ] Guardar la puntuación llama a `saveScore({ game: "ranaria", score, name })` y la partida aparece en la ficha del juego y en `/salon`.
- [ ] "JUGAR DE NUEVO" reinicia completamente la partida (nivel 1, 3 vidas, puntuación 0, metas vacías).
- [ ] "SALIR" no deja el loop de animación ni el listener de teclado corriendo en segundo plano.
- [ ] El resto del catálogo no cambia de comportamiento.
- [ ] `npm run build` compila sin errores de TypeScript.

## Decisions

- **Sí:** grilla discreta de 20×15 celdas de 40px, canvas 800×600 exacto 4:3. Sin letterboxing y encaja en celdas enteras, mismo criterio que Snake (SPEC 10).
- **Sí:** se retoma `ranaria` sin tocar sus textos, porque el placeholder ya describe este modo con precisión (carriles, troncos, nenúfares, tiempo).
- **Sí:** 100% canvas primitivo sin sprites externos, mismo criterio que Asteroids/Tetris, para no ampliar el alcance del spec con producción de arte.
- **Sí:** temporizador por vida (no global a toda la partida), fiel al espíritu del Frogger arcade original.
- **No:** puntaje bonus por tiempo restante al llenar una meta. Simplifica el cálculo de puntaje sin restar tensión al reto principal (cruzar sin morir).
- **No:** controles táctiles/móviles, fuera de alcance de este spec.

## Risks

| Riesgo                                                                                                                                | Mitigación                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| El ciclo de sumersión de las tortugas podría sentirse injusto si no es predecible.                                                    | Ciclo fijo y visible (ej. 2s visible / 1s sumergida) con una transición de color perceptible antes de sumergirse.                                 |
| Generar obstáculos con espaciado regular en cada carril podría crear "pasillos" siempre en el mismo punto, haciendo el nivel trivial. | El espaciado se genera con un offset inicial aleatorio por carril y por nivel, manteniendo el intervalo fijo entre obstáculos de un mismo carril. |

## What is **not** in this spec

- Modo maratón infinito sin metas fijas (ver `opcion-b-maraton-infinita.md`).
- Sprites propios para rana/vehículos/troncos.
- Controles táctiles/móviles.
- Multijugador.
- Cambios a cualquier otro juego del catálogo existente.

Cada uno de estos, si se implementa, va en su propio spec.
