# Juegos implementados

Fuente: tabla `games` de Supabase (catálogo completo) cruzada con `lib/game-engines.ts`
(`GAME_ENGINES`), que es el registro real de qué juegos tienen un componente jugable
conectado en `/juegos/[id]/jugar`. Actualizado 2026-09-07.

Un juego está **implementado** solo si tiene entrada en `GAME_ENGINES`; si no, `GamePlayer.tsx`
muestra una animación placeholder aunque el juego exista en el catálogo de Supabase.

## Implementados (4)

| id (`games.id`) | Título                   | Categoría | Componente                                     | Vidas | Spec                                                        | Mejor score / plays |
| --------------- | ------------------------ | --------- | ---------------------------------------------- | ----- | ----------------------------------------------------------- | ------------------- |
| `asteroides`    | ASTEROIDES               | SHOOTER   | `components/games/asteroids/AsteroidsGame.tsx` | Sí    | `specs/05-asteroids-real-game.md` (+ fix en `specs/07-...`) | 3980 / 3 partidas   |
| `caida`         | CAÍDA (Tetris)           | PUZZLE    | `components/games/tetris/TetrisGame.tsx`       | No    | `specs/08-tetris-real-game.md`                              | 5678 / 3 partidas   |
| `bloque-buster` | BLOQUE BUSTER (Arkanoid) | ARCADE    | `components/games/arkanoid/ArkanoidGame.tsx`   | Sí    | `specs/09-arkanoid-real-game.md`                            | 70 / 1 partida      |
| `serpentina`    | SERPENTINA (Snake)       | ARCADE    | `components/games/snake/SnakeGame.tsx`         | No    | `specs/10-snake-real-game.md`                               | 50 / 2 partidas     |

### Detalle

**ASTEROIDES** — Pilota una nave triangular a la deriva en un campo de asteroides
toroidal. Rota, impulsa y dispara para partir rocas grandes en medianas y medianas en
pequeñas, mientras recoges power-ups de disparo triple. Tres vidas, con invencibilidad
temporal al reaparecer.

**CAÍDA** — Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y
limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.

**BLOQUE BUSTER** — Arkanoid real: controla la paleta con el mouse o con ← → para
desviar la pelota y destruir bloques de colores en 5 niveles con patrones distintos
(parrilla, pirámide, tablero de ajedrez, filas con huecos y marco con cruz), cada uno
un 10% más rápido que el anterior. Tienes solo 3 vidas para completar los 5 niveles.

**SERPENTINA** — Guía la serpiente por una grilla de 40×30 celdas devorando frutas de
22 variedades distintas: cada una la hace crecer un segmento y suma 10 puntos. Cada 5
frutas comidas sube de nivel y la velocidad aumenta; un choque contra la pared o contra
tu propio cuerpo termina la partida al instante, sin vidas de repuesto.

## En el catálogo pero sin implementar (5)

Existen como fila en `games` (se ven en `/games` y tienen página de detalle), pero no
tienen componente en `GAME_ENGINES`, así que `/juegos/[id]/jugar` cae al placeholder
animado en vez de un juego real.

| id            | Título      | Categoría |
| ------------- | ----------- | --------- |
| `gloton`      | GLOTÓN      | ARCADE    |
| `invasores`   | INVASORES   | SHOOTER   |
| `ranaria`     | RANARIA     | ARCADE    |
| `duelo-pixel` | DUELO PIXEL | VERSUS    |
| `rocas`       | ROCAS       | SHOOTER   |

`rocas` es una descripción muy similar a `asteroides` (mismo concepto de nave/rocas);
`asteroides` es el que tiene el motor real registrado.
