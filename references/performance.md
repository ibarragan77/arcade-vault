# Performance por juego

Fuente: mediciones de `specs/14-frogger-performance.md`, cruzadas con `lib/game-engines.ts` (`GAME_ENGINES`).
Actualizado 2026-10-01.

Cómo se mide:

- **Frogger (`ranaria`):** contador propio con `/juegos/ranaria/jugar?debug=fps`. Muestra FPS, ms de `update()`
  y ms de `draw()`, promediados cada 500 ms. Cada medición dura 30 s de juego activo (60 muestras) y se reporta
  como `promedio (mínimo)`.
- **Otros juegos:** no tienen contador propio. Se miden con Chrome DevTools → Rendering → "Frame rendering
  stats".
- **CPU 4×:** throttling de CPU de Chrome DevTools (`Emulation.setCPUThrottlingRate`).
- **Tope de FPS:** la frecuencia del monitor. Un valor cercano a 60 en un monitor de 60 Hz o a 120 en uno de
  120 Hz significa que no se pierden frames.
- **Ojo con `draw`:** el ms de `draw()` mide solo lo que tarda la CPU en emitir los comandos de canvas. El
  raster del `shadowBlur` en la GPU y la composición de la página (`mix-blend-mode`, animaciones CSS) **no**
  entran en ese número. Solo se ven reflejados en el FPS.

| id (`games.id`) | Componente                                     | Skin      | FPS escritorio | FPS escritorio CPU 4× | FPS celular | Medido con                                     | Fecha      | Notas                                                                                               |
| --------------- | ---------------------------------------------- | --------- | -------------- | --------------------- | ----------- | ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `ranaria`       | `components/games/frogger/FroggerGame.tsx`     | `clasico` | 120 (119)      | 120 (112)             | pendiente   | Antes · `?debug=fps` · Playwright Chromium 154 | 2026-10-01 | draw 0.30 ms (4×: 1.29 ms), upd 0.00 ms. Máquina A. Rana quieta en la base, carriles en movimiento. |
| `ranaria`       | `components/games/frogger/FroggerGame.tsx`     | `neon`    | 120 (116)      | 120 (118)             | pendiente   | Antes · `?debug=fps` · Playwright Chromium 154 | 2026-10-01 | draw 0.30 ms (4×: 1.28 ms), upd 0.00 ms. Máquina A. Rana quieta en la base, carriles en movimiento. |
| `ranaria`       | `components/games/frogger/FroggerGame.tsx`     | `retro`   | 120 (120)      | 120 (114)             | pendiente   | Antes · `?debug=fps` · Playwright Chromium 154 | 2026-10-01 | draw 0.23 ms (4×: 1.20 ms), upd 0.00 ms. Máquina A. Rana quieta en la base, carriles en movimiento. |
| `asteroides`    | `components/games/asteroids/AsteroidsGame.tsx` | —         | pendiente      | pendiente             | pendiente   | DevTools "Frame rendering stats"               | —          | Línea base pendiente. Se mide en el paso 7, después del cambio de CSS.                              |
| `caida`         | `components/games/tetris/TetrisGame.tsx`       | —         | pendiente      | pendiente             | pendiente   | DevTools "Frame rendering stats"               | —          | Línea base pendiente. Se mide en el paso 7, después del cambio de CSS.                              |
| `bloque-buster` | `components/games/arkanoid/ArkanoidGame.tsx`   | —         | pendiente      | pendiente             | pendiente   | DevTools "Frame rendering stats"               | —          | Línea base pendiente. Se mide en el paso 7, después del cambio de CSS.                              |
| `serpentina`    | `components/games/snake/SnakeGame.tsx`         | —         | pendiente      | pendiente             | pendiente   | DevTools "Frame rendering stats"               | —          | Línea base pendiente. Se mide en el paso 7, después del cambio de CSS.                              |

**Máquina A:** Windows 11, NVIDIA GeForce RTX 4060 Ti (ANGLE D3D11), Chromium 154 controlado por Playwright,
viewport 1366×768, DPR 1, monitor de 120 Hz.
