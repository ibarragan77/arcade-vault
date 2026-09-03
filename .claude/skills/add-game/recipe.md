# Receta para portar un juego de `references/started-games/`

Este archivo es la referencia técnica que consulta el skill `/add-game` al escribir un spec. Destila lo que SPEC 05 (`specs/05-asteroids-real-game.md`) y SPEC 06 (`specs/06-leaderboard-and-games-table.md`) ya resolvieron para Asteroids, para que no haya que re-derivarlo cada vez. **No es texto para copiar literal en el spec** — es el conocimiento que el spec generado debe reflejar en sus propias palabras, adaptado al juego concreto.

---

## Contrato del componente del motor

Referencia viva: `components/games/asteroids/AsteroidsGame.tsx`.

- Ubicación: `components/games/<slug>/<Nombre>Game.tsx`, client component (`"use client"`).
- Canvas: `<canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", height: "100%", display: "block" }} />`, con `W`/`H` = la resolución lógica **fija** del juego original (la que ya trae su `index.html`/constantes), escalada visualmente por CSS al 100% de `.crt-screen` (que usa `aspect-ratio: 4/3`). Si el juego original no es 4:3 (p. ej. Tetris es más vertical), decide junto con el usuario si se acepta el letterboxing dentro de `.crt-screen` o si hace falta ajustar el contenedor — anótalo como decisión explícita en el spec, no lo asumas.
- Props (mínimo fijo, más los opcionales que apliquen):
  ```ts
  type <Nombre>GameProps = {
    paused: boolean;
    onScoreChange: (score: number) => void;
    onLivesChange?: (lives: number) => void; // solo si el juego tiene concepto de vidas
    onLevelChange?: (level: number) => void; // solo si el juego tiene concepto de nivel
    onGameOver: (finalScore: number) => void;
  };
  ```
- Todo el estado del motor (entidades, score, vidas, nivel, timers) se crea **dentro de un único `useEffect` de montaje** (`useEffect(() => { ... }, [])`), nunca en variables de módulo — dos partidas o un remount no deben compartir estado.
- Los listeners de input (`keydown`/`keyup`, y `mousemove`/`click` si aplica) se registran dentro de ese mismo efecto y se remueven en su cleanup.
- El loop corre con `requestAnimationFrame`; el cleanup del efecto llama `cancelAnimationFrame` sobre el frame pendiente.
- Pausa: un `useEffect` aparte sincroniza `paused` (prop) hacia un `pausedRef`, para que el loop —que corre una sola vez— pueda leer el valor en vivo sin reiniciar el efecto principal. Cuando `paused` es `true`, el loop sigue pidiendo frames y dibuja el último estado, pero no llama a `update(dt)`. Al pasar de pausado a no pausado, `lastTime` se resetea a `null` para que el próximo `dt` no incluya el tiempo pausado.
- Game over: se elimina cualquier overlay de "GAME OVER" dibujado por el juego original (en canvas o en DOM) y cualquier reinicio interno vía tecla. En su lugar, en el instante exacto en que la condición de game over del juego original se cumple, se llama **una sola vez** a `props.onGameOver(score)` y se detiene el loop (no se vuelve a pedir `requestAnimationFrame`). El único "fin de partida" visible es el modal ya existente de `GamePlayer.tsx`.
- El HUD interno que el juego original dibuja sobre el canvas (score, nivel, vidas, power-ups, etc.) **se conserva tal cual** — convive con el HUD externo de `GamePlayer.tsx` (uno es la estética arcade del juego, el otro es el marco de la plataforma). Solo se retira el overlay de game over, nunca el HUD normal.
- Los callbacks (`onScoreChange`, `onLivesChange`, `onLevelChange`) se disparan cada vez que esos valores cambian dentro de la lógica de actualización del juego (colisiones, pérdida de vida, avance de nivel/líneas), igual que en `AsteroidsGame.tsx`.

## Assets externos (imágenes, audio)

Caso de referencia: `references/started-games/04-arkanoid` (spritesheet PNG + 2 sonidos MP3), a diferencia de Asteroids/Tetris que son 100% canvas primitivo sin assets.

- Copiar los archivos de `references/started-games/<origen>/assets/` a `public/games/<slug>/` — Next.js sirve estáticos únicamente desde `public/`, nunca desde `references/`.
- Cargar `Image`/`Audio` apuntando a las rutas nuevas (`/games/<slug>/...`), nunca a las rutas relativas del origen (`assets/...`).
- Si el juego original arranca su loop dentro de un callback de precarga (p. ej. `loadSpritesheet(callback)`), portar ese gate a una precarga (`Promise.all` de `Image`/`Audio` con sus eventos `load`/`canplaythrough`) **dentro del mismo `useEffect` de montaje**, antes de arrancar `requestAnimationFrame` — nunca a nivel de módulo, por la misma razón que el resto del estado.
- Input no-teclado (mouse/click sobre botones dibujados en el canvas): portar el hit-testing manual tal cual lo tenga el original, registrado/limpiado en el mismo efecto que el resto de los listeners.

## Wiring en `GamePlayer.tsx`

Estado actual (un solo juego real portado): `app/juegos/[id]/jugar/GamePlayer.tsx` usa un caso especial hardcodeado:

- `const isAsteroids = game.id === "asteroides";`
- Dos `useEffect` (puntaje falso por `setInterval`, avance de nivel falso) con guarda `if (isAsteroids) return;`.
- `restart()` incrementa `resetKey` solo `if (isAsteroids)`.
- El render es un ternario: `isAsteroids ? <AsteroidsGame key={resetKey} paused={...} onScoreChange={setScore} onLivesChange={setLives} onLevelChange={setLevel} onGameOver={endGame} /> : <div className="game-arena">...`.

**Al agregar el segundo juego real, refactorizar primero a un registro** (antes de agregar el nuevo juego, como paso propio del plan):

1. Crear `lib/game-engines.ts` exportando algo como:
   ```ts
   export type GameEngineProps = {
     paused: boolean;
     onScoreChange: (score: number) => void;
     onLivesChange?: (lives: number) => void;
     onLevelChange?: (level: number) => void;
     onGameOver: (finalScore: number) => void;
   };

   export const GAME_ENGINES: Record<string, ComponentType<GameEngineProps>> = {
     asteroides: AsteroidsGame,
   };
   ```
2. En `GamePlayer.tsx`, reemplazar `isAsteroids` por `const Engine = GAME_ENGINES[game.id];` y las guardas `if (isAsteroids) return;` por `if (Engine) return;`.
3. `restart()`: reemplazar `if (isAsteroids) setResetKey(...)` por `if (Engine) setResetKey(...)`.
4. Render: `Engine ? <Engine key={resetKey} paused={paused || over} onScoreChange={setScore} onLivesChange={setLives} onLevelChange={setLevel} onGameOver={endGame} /> : <div className="game-arena">...`.

Para el tercer juego en adelante, este refactor ya existe — el plan del spec solo agrega una entrada nueva al `Record`.

Si el motor no reporta vidas/nivel (props opcionales sin usar), el HUD externo de `GamePlayer.tsx` necesita una decisión explícita por juego sobre qué mostrar en esos campos (ocultar, mostrar "—", o reusar el campo para otra métrica) — esto se pregunta en la Fase 3 del skill, no se asume aquí.

## Catálogo y Supabase (SPEC 06)

- La tabla `games` ya tiene 9 filas seedeadas: `bloque-buster, caida, serpentina, gloton, invasores, rocas, asteroides, ranaria, duelo-pixel` (columnas `id, title, short, long, cat, cover, color`).
- Portar un juego nuevo normalmente **actualiza** una fila placeholder existente (`update` de `title`/`short`/`long`/`cover`), no crea una fila nueva — salvo que el usuario decida coexistir con el placeholder en vez de reemplazarlo (como hizo Asteroids, que se agregó junto a `rocas` en vez de reemplazarla).
- `best`/`plays` **no** se tocan directamente — se calculan en vivo desde `scores` por `getGames()`/`getGameStats()` (`lib/games.ts`/`lib/scores.ts`), no hay nada que migrar ahí.
- Cover CSS: nuevo bloque `.cover-<slug>` en `app/globals.css` (o edición del existente si se reutiliza un placeholder), mismo patrón que los demás — `background` (gradiente) + `::after`/`::before` decorativos — visualmente distinto del resto de las portadas.
- RLS y esquema de `games`/`scores` ya existen (SPEC 06); no hace falta tocar políticas ni estructura de tablas para portar un juego nuevo, solo datos.

## Checklist de aceptación reusable

Base para la sección "Acceptance criteria" del spec generado — adaptar quitando los ítems que no apliquen (p. ej. sin "vidas" si el juego no las tiene):

- [ ] El catálogo (`/games`) muestra la tarjeta del juego con los datos reales de Supabase (título, cover, categoría).
- [ ] La ficha (`/juegos/<id>`) muestra leaderboard real vía `getTopScores`/`getGameStats` (vacío/"0" si no hay partidas todavía).
- [ ] `/juegos/<id>/jugar` renderiza el canvas real del motor (no el `.game-arena` falso).
- [ ] Los controles del juego original funcionan igual que en la fuente (teclado y, si aplica, mouse).
- [ ] El HUD externo de `GamePlayer.tsx` refleja en tiempo real los valores reales que reporta el motor (score, y vidas/nivel si aplica).
- [ ] Perder la última vida (o la condición de game over equivalente) dispara el modal "FIN DEL JUEGO" existente, sin ningún overlay de game over dibujado dentro del canvas.
- [ ] El botón "FIN" del HUD también dispara el modal con la puntuación acumulada hasta ese momento.
- [ ] "PAUSA"/"REANUDAR" congelan y continúan el juego sin saltos bruscos.
- [ ] Guardar la puntuación llama a `saveScore({ game: "<id>", score, name })` contra Supabase.
- [ ] Recargar la ficha del juego y `/salon` reflejan la partida real guardada.
- [ ] "JUGAR DE NUEVO" reinicia completamente la partida sin arrastrar estado anterior.
- [ ] "SALIR" no deja el loop de animación ni los listeners corriendo en segundo plano.
- [ ] El resto del catálogo (incluidos los juegos con `.game-arena` falso) no cambia de comportamiento.
- [ ] `npm run build` compila sin errores de TypeScript.
