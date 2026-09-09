# SPEC — Ranaria: maratón infinito de cruce (sin metas fijas, permadeath)

> **Status:** Draft
> **Depends on:** SPEC 05, SPEC 06, SPEC 10
> **Date:** 2026-09-08
> **Objective:** Diseñar e implementar el motor real de RANARIA como una variante infinita: la rana escala carriles de tráfico y río generados proceduralmente que se vuelven más rápidos y densos cuanto más alto llega, con una sola vida (cualquier colisión termina la partida) y puntaje basado en la distancia máxima alcanzada.

## Por qué existe este spec

Es la segunda de dos variantes alternativas para el `game-id` `ranaria` (la otra, `opcion-a-clasico-niveles.md`, es un Frogger clásico de niveles fijos con metas y temporizador). Esta variante conserva el mismo tema —cruzar carriles esquivando obstáculos en movimiento— pero cambia la estructura del juego: en vez de niveles discretos con metas y un temporizador por vida, la partida es un único recorrido continuo hacia arriba, sin techo, con dificultad que escala con la distancia y una sola vida (permadeath), más cercano a un endless runner vertical que al Frogger original. A diferencia de la Opción A, el `short`/`long` actual del placeholder no encaja con este modo (menciona nenúfares y un temporizador que no existen aquí), así que este spec sí necesita reescribirlos.

## Scope

**In:**

- `UPDATE` sobre la fila `id = 'ranaria'` en Supabase: `short`/`long` reescritos para describir el modo infinito (sin metas fijas, sin temporizador, avance continuo con dificultad creciente). `title` (`RANARIA`), `cat` (`ARCADE`), `color` (`green`) y `cover` (`cover-rana`) se mantienen sin cambios.
- Nuevo componente `components/games/ranaria/RanariaGame.tsx`, 100% canvas primitivo, canvas de `800×600`, con una cámara vertical que se desplaza conforme la rana avanza; carriles generados proceduralmente por delante de la cámara y reciclados por detrás.
- Una sola vida: cualquier colisión con un vehículo, o caer al río sin soporte, termina la partida de inmediato (`hasLives: false`, sin `onLivesChange`).
- Dificultad creciente continua: cada cierto umbral de distancia (ej. cada 20 filas escaladas) aumenta la velocidad de los carriles y la densidad de obstáculos, sin "niveles" discretos ni reinicio de layout.
- Puntaje = distancia máxima alcanzada (filas escaladas) × 10, más un bonus opcional (+50) por recoger moscas que aparecen ocasionalmente en carriles seguros.
- Registrar `ranaria: { Component: RanariaGame, hasLives: false }` en `GAME_ENGINES`.

**Out of scope (para specs futuros):**

- Metas de nenúfar / niveles fijos con layout renovado (ver `opcion-a-clasico-niveles.md`, mismo `game-id`, mecánica distinta).
- Vidas múltiples o temporizador de cualquier tipo.
- Sprites propios para rana/vehículos/troncos/moscas — formas geométricas de color, mismo criterio que Asteroids/Tetris.
- Controles táctiles/móviles.
- Reemplazar o modificar cualquier otro juego del catálogo existente.

## Data model

```sql
UPDATE games
SET
  short = 'Sube sin parar esquivando el tráfico y el río. Un solo golpe y se acabó.',
  long = 'La rana escala sin fin carriles de coches y un río de troncos generados sin descanso. No hay metas ni reloj: solo cuánto más alto te atreves a llegar antes del primer golpe. La velocidad y la densidad del tráfico crecen cuanto más subes.'
WHERE id = 'ranaria';
```

`cat`, `color` y `cover` no se tocan.

Estado interno del motor (creado dentro de un único `useEffect` de montaje):

```ts
type LaneType = "safe" | "traffic" | "river";

type Obstacle = {
  x: number;
  width: number;
  kind: "car" | "truck" | "log" | "turtle";
  submerged?: boolean;
};

type Lane = {
  worldRow: number; // fila absoluta desde el inicio de la partida, crece sin límite
  type: LaneType;
  direction: 1 | -1;
  speedPxPerSec: number;
  obstacles: Obstacle[];
  hasFly?: boolean; // bonus opcional, solo en carriles safe
};

let lanesWindow: Lane[]; // ventana de filas visibles + margen, generadas por delante y recicladas por detrás de la cámara
let cameraWorldRow: number; // fila del mundo que corresponde al borde inferior visible
let frog: { col: number; worldRow: number; ridingVx: number };
let distance: number; // = frog.worldRow, la fila más alta alcanzada
let score: number; // distance * 10 + bonus de moscas
let difficultyTier: number; // 1 + Math.floor(distance / 20), escala velocidad/densidad
```

No se agregan columnas ni tablas nuevas en Supabase — reutiliza el esquema de SPEC 06 sin cambios, solo actualiza contenido de una fila existente.

## Implementation plan

**Flujo de trabajo en git:** rama sugerida `spec-ranaria-opcion-b` (creada por `/spec-impl` si esta variante es la elegida). Un commit por paso completado.

1. Migración de Supabase: `UPDATE games SET short = ..., long = ... WHERE id = 'ranaria'` con el texto del modo infinito. `title`, `cat`, `color` y `cover` no se tocan.
2. Crear el esqueleto de `components/games/ranaria/RanariaGame.tsx`: canvas `800×600`, loop `requestAnimationFrame` con `pausedRef`, cámara fija en `cameraWorldRow = 0`, rana estática en la fila de salida.
3. Implementar la generación procedural de carriles: al iniciar, generar una ventana inicial de filas por delante de la cámara; cada frame, si la rana se acerca al borde superior de la ventana generada, generar nuevas filas (tipo alternado `safe`/`traffic`/`river` con probabilidad ponderada) y descartar las filas que quedaron muy por debajo de la cámara.
4. Garantizar que cada carril de tráfico/río generado tenga al menos un hueco/soporte transitable en el momento de su generación (verificación simple de espaciado mínimo entre obstáculos), para evitar carriles imposibles de cruzar.
5. Implementar movimiento discreto de la rana (igual criterio que la Opción A: un paso de celda por pulsación de flecha), física de montar troncos/tortugas visibles, y desplazamiento de la cámara hacia arriba cuando la rana sube de fila (la cámara nunca retrocede).
6. Implementar colisión: chocar con un vehículo, o quedar en una fila `river` sin soporte, llama una única vez a `props.onGameOver(score)` y detiene el loop — sin vidas de repuesto.
7. Implementar el cálculo de `distance`/`score` (cada nueva fila máxima alcanzada suma 10 puntos vía `props.onScoreChange`), la aparición ocasional de moscas en carriles `safe` (+50 puntos al recogerlas) y el escalado de dificultad por `difficultyTier` (velocidad de carriles y densidad de obstáculos aumentan cada 20 filas).
8. Dibujar el HUD interno (score, distancia actual) sobre el canvas; confirmar patrón de pausa idéntico al resto de motores (`pausedRef`, reseteo de `lastTime` al reanudar).
9. Registrar `ranaria: { Component: RanariaGame, hasLives: false }` en `GAME_ENGINES`.
10. Verificar manualmente con `npm run dev`: subir varias decenas de filas notando el aumento de velocidad/densidad, recoger al menos una mosca, morir por vehículo y por caída al río en partidas separadas, confirmar que el modal de fin de partida muestra la puntuación correcta y que no se muestra el campo "Vidas" en el HUD externo.

## Acceptance criteria

- [ ] `/juegos/ranaria/jugar` renderiza el canvas real de Ranaria en modo infinito (no el `.game-arena` falso).
- [ ] La rana avanza siempre hacia carriles generados proceduralmente, sin techo de distancia ni metas fijas.
- [ ] Estar sobre un tronco o tortuga visible desplaza a la rana con la velocidad del carril; una tortuga sumergida no sostiene a la rana.
- [ ] Chocar con un vehículo, o caer al río sin soporte, dispara de inmediato el modal "FIN DEL JUEGO" con la puntuación final correcta, sin overlay propio en el canvas.
- [ ] La puntuación aumenta al alcanzar cada nueva fila máxima, y aumenta con un bonus adicional al recoger una mosca.
- [ ] La velocidad y densidad de obstáculos aumentan de forma perceptible conforme avanza la distancia.
- [ ] El HUD externo de `GamePlayer.tsx` refleja en tiempo real la Puntuación real y no muestra el campo "Vidas".
- [ ] El botón "FIN" del HUD dispara el modal con la puntuación acumulada hasta ese momento.
- [ ] "PAUSA"/"REANUDAR" congelan y continúan el juego (cámara, carriles) sin saltos.
- [ ] Guardar la puntuación llama a `saveScore({ game: "ranaria", score, name })` y la partida aparece en la ficha del juego y en `/salon`.
- [ ] "JUGAR DE NUEVO" reinicia completamente la partida (distancia 0, puntuación 0, velocidad inicial) sin arrastrar estado anterior.
- [ ] "SALIR" no deja el loop de animación ni el listener de teclado corriendo en segundo plano.
- [ ] El resto del catálogo no cambia de comportamiento.
- [ ] `npm run build` compila sin errores de TypeScript.

## Decisions

- **Sí:** permadeath de un solo golpe (`hasLives: false`) en vez de vidas múltiples, para dar la tensión de "maratón" propia de un endless runner. Mismo criterio de `hasLives` que Snake (SPEC 10).
- **Sí:** generación procedural de carriles con reciclado bajo la cámara, en vez de niveles fijos, porque no hay techo de progreso que diseñar a mano.
- **Sí:** se reescribe `short`/`long` de `ranaria` porque el texto actual del placeholder menciona explícitamente nenúfares y un temporizador que no existen en este modo.
- **No:** no se cambian `title`, `cat`, `color` ni `cover` — siguen encajando visualmente (verde, temática de cruce) independientemente del modo interno.
- **Sí:** verificación de espaciado mínimo al generar cada carril, para garantizar que siempre exista al menos una ruta transitable y evitar carriles imposibles por mala suerte del generador aleatorio.
- **No:** metas de nenúfar o niveles discretos, eso es exactamente la Opción A para este mismo `game-id`.

## Risks

| Riesgo                                                                                                                                           | Mitigación                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un generador procedural sin cuidado podría crear un carril de río sin ningún tronco/tortuga transitable, bloqueando al jugador de forma injusta. | El paso 4 del plan implementa explícitamente una verificación de espaciado mínimo al generar cada carril, garantizando al menos un hueco/soporte transitable. |
| Sin techo de progreso, el escalado de dificultad podría volverse imposible de leer visualmente a distancias muy altas.                           | El escalado es por umbrales fijos (cada 20 filas) con incrementos moderados, no una función sin límite superior perceptible en sesiones de juego normales.    |

## What is **not** in this spec

- Metas de nenúfar o niveles fijos con layout renovado.
- Vidas múltiples o temporizador.
- Sprites propios para rana/vehículos/troncos/moscas.
- Controles táctiles/móviles.
- Cambios a cualquier otro juego del catálogo existente.

Cada uno de estos, si se implementa, va en su propio spec.
