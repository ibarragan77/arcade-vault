# Game Jam — memoria de temas trabajados

Este archivo lo mantiene el agente `game-jam` (`.claude/agents/game-jam.md`). Registra cada tema de game
jam que el agente ha recibido y los conceptos de juego (`game-id`) que propuso para ese tema, para no
repetir un tema ya trabajado ni volver a proponer un `game-id` que ya tiene motor real.

No es un spec ni reemplaza `references/implemented-games.md` (que refleja el estado real del catálogo).
Este archivo refleja el _historial de temas y propuestas_, independientemente de si se llegaron a
implementar.

Estados posibles: `Sugerido`, `Aceptado`, `Rechazado`, `Implementado`.

## Historial

| Fecha      | Tema                                                                              | game-id           | Título          | Carpeta                           | Estado   |
| ---------- | --------------------------------------------------------------------------------- | ----------------- | --------------- | --------------------------------- | -------- |
| 2026-09-08 | Estilo Frogger — cruzar un escenario esquivando obstáculos/enemigos en movimiento | `ranaria`         | RANARIA         | `specs/game-jam/ranaria/`         | Sugerido |
| 2026-09-08 | Estilo Frogger — cruzar un escenario esquivando obstáculos/enemigos en movimiento | `travesia`        | TRAVESÍA        | `specs/game-jam/travesia/`        | Sugerido |
| 2026-09-08 | Estilo Frogger — cruzar un escenario esquivando obstáculos/enemigos en movimiento | `contracorriente` | CONTRACORRIENTE | `specs/game-jam/contracorriente/` | Sugerido |

<!-- El agente agrega una fila nueva por cada game-id que propone en una sesión. Nunca reescribe ni borra filas anteriores. -->
