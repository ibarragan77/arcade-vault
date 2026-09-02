# SPEC 06 — Leaderboard y catálogo de juegos reales en Supabase

> **Status:** Approved
> **Depends on:** SPEC 04
> **Date:** 2026-09-01
> **Objective:** Reemplazar el catálogo de juegos hardcodeado (`GAMES` en `lib/data.ts`) y el leaderboard 100% simulado (`seededScores()`, `lib/scores.ts` en `localStorage`) por dos tablas reales en Supabase (`games` y `scores`), leídas y escritas desde `/games`, `/juegos/[id]`, `/juegos/[id]/jugar` y `/salon`.

## Por qué existe este spec

SPEC 04 conectó la aplicación a Supabase (cliente browser/server + health-check) pero el proyecto sigue sin ninguna tabla y sin ningún código que lo use para datos reales. Hoy todo el catálogo vive en un array literal (`GAMES`) y todo el "leaderboard" es matemática aleatoria (`seededScores()`) regenerada en cada render; `saveScore()` escribe en `localStorage` pero ningún componente vuelve a leer esos datos. Este spec conecta ambas piezas: crea `games` y `scores` en Supabase, siembra `games` con el catálogo actual y hace que el leaderboard sea real de punta a punta (se guarda una partida, aparece en `/salon` y en la ficha del juego). Sigue sin existir autenticación real (eso queda fuera de alcance, igual que en SPEC 04): el nombre del jugador se sigue escribiendo a mano, sin usuario ni login.

## Scope

**In:**

- Tabla `games` en Supabase (id, title, short, long, cat, cover, color), poblada por migración con los 9 juegos que hoy están en `GAMES` (`lib/data.ts`).
- Tabla `scores` en Supabase (id, game_id → games.id, name, score, created_at), vacía al crearse.
- RLS habilitado en ambas tablas: lectura pública en `games` y `scores`; inserción pública solo en `scores` (con `CHECK` de `score >= 0` y `name` de 1 a 10 caracteres); sin `UPDATE`/`DELETE` públicos en ninguna de las dos.
- `lib/games.ts`: `getGames(supabase)` (catálogo completo con `best`/`plays` calculados desde `scores`) y `getGame(supabase, id)` (un juego base, sin stats).
- `lib/scores.ts`: se reescribe por completo — `saveScore(supabase, { game, score, name })` (insert real), `getTopScores(supabase, gameId, limit)` (ranking real ordenado por score) y `getGameStats(supabase, gameId)` (`best` = score máximo, `plays` = cantidad de partidas guardadas).
- `lib/data.ts`: se le quitan `GAMES`, `PLAYERS`, `seededScores()` y el tipo `ScoreRow`; el tipo `Game` pierde `best`/`plays` (pasan a un tipo derivado `GameWithStats` en `lib/games.ts`); se conservan `GameCategory`, `GameColor`, `Game` (base) y `CATS`.
- `app/games/page.tsx` pasa a ser un Server Component async que hace `getGames()` vía el cliente server de Supabase y renderiza un nuevo Client Component `app/games/GamesGrid.tsx` con la búsqueda/filtro/tilt actuales, recibiendo los juegos ya cargados como prop.
- `app/juegos/[id]/page.tsx` reemplaza `GAMES.find` + `seededScores()` por `getGame()` + `getTopScores()` + `getGameStats()` vía el cliente server.
- `app/juegos/[id]/jugar/page.tsx` reemplaza `GAMES.find` por `getGame()` vía el cliente server.
- `app/juegos/[id]/jugar/GamePlayer.tsx` reemplaza el `saveScore()` de `localStorage` por el nuevo `saveScore()` async contra Supabase (cliente browser), con manejo de error si el insert falla (sin marcar `saved = true`, mostrando un mensaje y permitiendo reintentar).
- `app/salon/page.tsx` reemplaza `GAMES`/`seededScores()` por `getGames()` (para las tabs) y `getTopScores()` (para el podio y la tabla), ambos vía el cliente browser en `useEffect`; se elimina la sección "TU MEJOR MARCA EN {juego}" (dependía de números inventados a partir de la sesión simulada).

**Out of scope (para specs futuros):**

- Autenticación real y cualquier vínculo entre `scores.name` y un usuario/id real (sigue siendo texto libre, igual que hoy).
- Panel de administración o cualquier UI para crear/editar/borrar juegos — `games` se puebla solo por la migración de este spec.
- Paginación del leaderboard (se listan los primeros N por juego, sin "cargar más").
- Cualquier cambio a `app/login` o `lib/session.ts`.
- Cambios al motor de `AsteroidsGame.tsx` o a cualquier otro juego — este spec solo toca de dónde vienen los datos del catálogo y el leaderboard.
- Carpeta local `supabase/migrations/` ni Supabase CLI — la migración se aplica directo al proyecto remoto vía el MCP de Supabase, igual criterio que SPEC 04.

## Data model

```sql
create table games (
  id text primary key,
  title text not null,
  short text not null,
  long text not null,
  cat text not null check (cat in ('ARCADE', 'PUZZLE', 'SHOOTER', 'VERSUS')),
  cover text not null,
  color text not null check (color in ('cyan', 'magenta', 'yellow', 'green')),
  created_at timestamptz not null default now()
);

create table scores (
  id bigint generated always as identity primary key,
  game_id text not null references games(id),
  name text not null check (char_length(name) between 1 and 10),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);
```

Tipos TypeScript resultantes:

```ts
// lib/data.ts (se mantiene, recortado)
export type Game = {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: GameCategory;
  cover: string;
  color: GameColor;
};

// lib/games.ts (nuevo)
export type GameWithStats = Game & { best: number; plays: number };

// lib/scores.ts (reescrito)
export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
  date: string;
};
```

`plays` deja de ser un string abreviado ("12.4K") y pasa a ser un entero real (cantidad de filas en `scores` para ese `game_id`), que arrancará en 0 para todos los juegos hasta que se guarden partidas reales.

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 06-leaderboard-and-games-table`) se crea y activa la rama `spec-06-leaderboard-and-games-table` (comportamiento por defecto vía `AutoCreateBranch: true`). Cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo. No se agrupan varios pasos en un mismo commit.

1. Vía `mcp__supabase__apply_migration`, crear las tablas `games` y `scores` (con los `CHECK` y la foreign key del Data model), habilitar RLS en ambas, y agregar las policies: `games` — `select` público (`using (true)`); `scores` — `select` público (`using (true)`) e `insert` público (`with check (true)`, ya cubierto por los `CHECK` de columna). Sin policies de `update`/`delete` en ninguna (quedan bloqueadas por RLS por defecto).
2. En la misma migración (o una segunda inmediatamente después), sembrar `games` con un `insert` de las 9 filas actuales de `GAMES` (`bloque-buster`, `caida`, `serpentina`, `gloton`, `invasores`, `rocas`, `asteroides`, `ranaria`, `duelo-pixel`) con sus `title`/`short`/`long`/`cat`/`cover`/`color` tal como están hoy en `lib/data.ts`. Verificar con `mcp__supabase__execute_sql` (`select * from games`) que las 9 filas quedaron bien.
3. Editar `lib/data.ts`: quitar `GAMES`, `PLAYERS`, `seededScores()` y `ScoreRow`; quitar `best`/`plays` del tipo `Game`. Dejar `GameCategory`, `GameColor`, `Game`, `CATS`.
4. Crear `lib/games.ts` con `getGames(supabase)` y `getGame(supabase, id)` (tipos de `SupabaseClient` de `@supabase/supabase-js`, funcionan tanto con el cliente browser como el server). `getGames()` hace un `select` de `games` y un `select` de `scores` (`game_id, score`), y agrega `best`/`plays` por `game_id` en memoria.
5. Reescribir `lib/scores.ts`: quitar el `localStorage`; agregar `saveScore(supabase, entry)` (insert), `getTopScores(supabase, gameId, limit)` (`select`, `.eq('game_id', gameId)`, `.order('score', { ascending: false })`, `.limit(limit)`, mapeado a `ScoreRow` con `rank` calculado por posición y `date` formateada desde `created_at`), y `getGameStats(supabase, gameId)` (un `count` `head: true` para `plays`, y el primer resultado de un `order('score', desc).limit(1)` para `best`, `0` si no hay filas).
6. Crear `app/games/GamesGrid.tsx` (Client Component) moviendo ahí toda la lógica actual de `app/games/page.tsx` (búsqueda, chips de categoría, `GameCard` con tilt), recibiendo `games: GameWithStats[]` como prop en vez de importar `GAMES`. Convertir `app/games/page.tsx` en Server Component async que llama a `getGames()` con el cliente server de `lib/supabase/server` y renderiza `<GamesGrid games={games} />`.
7. Editar `app/juegos/[id]/page.tsx`: reemplazar `GAMES.find` por `getGame(supabase, id)` (`notFound()` si es `null`), y `seededScores(...)` por `getTopScores(supabase, id, 10)` + `getGameStats(supabase, id)` para `best`/`plays` en el `stat-strip`.
8. Editar `app/juegos/[id]/jugar/page.tsx`: reemplazar `GAMES.find` por `getGame(supabase, id)` con el cliente server.
9. Editar `app/juegos/[id]/jugar/GamePlayer.tsx`: importar el cliente browser (`createClient` de `lib/supabase/client`) y el nuevo `saveScore`; al pulsar "GUARDAR PUNTUACIÓN" llamar `await saveScore(supabase, { game: game.id, score, name })` dentro de un `try/catch` — en éxito `setSaved(true)` como hoy, en error mostrar un mensaje (`"NO SE PUDO GUARDAR, REINTENTA"`) sin tocar `saved`, dejando el botón disponible para reintentar.
10. Editar `app/salon/page.tsx`: quitar el import de `GAMES`/`seededScores`; en un `useEffect` inicial, `getGames(supabase)` (cliente browser) para poblar las tabs y fijar `tab` al primer juego devuelto; en un segundo `useEffect` que depende de `tab`, `getTopScores(supabase, tab, 12)` para el podio y la tabla. Eliminar por completo el bloque de "TU MEJOR MARCA EN {game.title}" (`youRank`, `youScore` y el JSX asociado) y ya no usar `useSession` en esta página.
11. Verificar manualmente con `npm run dev`: `/games` muestra las 9 tarjetas con "MEJOR PUNTUACIÓN" en 0; entrar a `/juegos/asteroides`, jugar una partida completa, guardar la puntuación; confirmar que `/juegos/asteroides` (best/plays y leaderboard) y `/salon` (tab ASTEROIDES) ya reflejan esa partida real; confirmar que el resto de los juegos del catálogo no cambiaron de comportamiento de juego (solo su fuente de datos).

## Acceptance criteria

- [ ] `mcp__supabase__list_tables` muestra `games` y `scores` con las columnas, constraints y RLS del Data model.
- [ ] `select * from games` devuelve exactamente 9 filas, una por cada juego que hoy está en `GAMES` en `lib/data.ts`, con los mismos `id`/`title`/`short`/`long`/`cat`/`cover`/`color`.
- [ ] `/games` renderiza las 9 tarjetas leyendo `games` desde Supabase (no desde `lib/data.ts`), con búsqueda por nombre y chips de categoría funcionando igual que antes.
- [ ] `/juegos/asteroides` (y cualquier otro id del catálogo) muestra "Mejor global" y el leaderboard leyendo la tabla `scores` real, mostrando "0" y una lista vacía si el juego todavía no tiene partidas guardadas.
- [ ] Terminar una partida en `/juegos/asteroides/jugar`, escribir un nombre y pulsar "GUARDAR PUNTUACIÓN" inserta una fila real en `scores` (verificable con `mcp__supabase__execute_sql`).
- [ ] Tras guardar una puntuación, recargar `/juegos/asteroides` muestra esa puntuación en el leaderboard y actualiza "Mejor global"/"Partidas" si corresponde.
- [ ] `/salon` muestra tabs por cada juego de `games`, y al cambiar de tab el podio y la tabla reflejan los `scores` reales de ese juego (vacíos si no hay ninguno todavía).
- [ ] `/salon` ya no muestra ninguna sección de "TU MEJOR MARCA".
- [ ] Si `saveScore` falla (por ejemplo, `game_id` inexistente o red caída), `GamePlayer` muestra un mensaje de error y no marca la puntuación como guardada, permitiendo reintentar.
- [ ] Intentar un `insert`/`update`/`delete` directo sobre `games`, o un `update`/`delete` sobre `scores`, con el anon key público, es rechazado por RLS.
- [ ] `npm run build` compila sin errores de TypeScript.
- [ ] No se modifica `app/login`, `lib/session.ts`, ni el motor de `AsteroidsGame.tsx`.

## Decisions

- **Sí:** un solo spec combinado para la tabla de juegos y el leaderboard, en vez de dos specs separados. Razón: decisión explícita del usuario — ambos se pidieron juntos y comparten el mismo trabajo de esquema en Supabase.
- **Sí:** "tabla de juegos" significa una tabla real en Supabase (`games`) que reemplaza el array `GAMES`, no una vista de tabla en la UI. Razón: decisión explícita del usuario, consistente con que SPEC 04 dejó la conexión a Supabase lista sin ningún uso real todavía.
- **Sí:** reemplazo completo del leaderboard simulado — se elimina `seededScores()` y el `saveScore()` de `localStorage`; `/salon` y `/juegos/[id]` pasan a leer datos reales. Razón: decisión explícita del usuario; dejar ambos sistemas conviviendo sería confuso y no aporta valor.
- **Sí:** `games` se puebla por migración SQL con un `insert` de las 9 filas actuales, no queda vacía ni se llena a mano después. Razón: decisión explícita del usuario, evita que el catálogo desaparezca al cambiar de fuente de datos.
- **Sí:** `best` y `plays` se calculan en vivo desde `scores` (no son columnas estáticas en `games`). Razón: decisión explícita del usuario — con un leaderboard real, tiene sentido que las estadísticas del catálogo reflejen partidas reales en vez de números inventados.
- **Sí:** `plays` pasa de un string abreviado ("12.4K") a un entero real (cantidad de partidas guardadas). Razón: consecuencia directa de la decisión anterior — abreviar un conteo que empieza en 0 para todos los juegos sería engañoso.
- **Sí:** sin autenticación real, `scores.name` sigue siendo texto libre escrito a mano (igual que hoy), sin `user_id` ni relación con `session.ts`. Razón: decisión explícita del usuario; auth real queda fuera de alcance, igual que en SPEC 04.
- **Sí:** se elimina la sección "TU MEJOR MARCA" de `/salon`. Razón: decisión explícita del usuario — sin autenticación real ni nombres únicos, no hay forma confiable de saber cuál fila del leaderboard es "la del usuario actual".
- **Sí:** las tablas se crean vía `mcp__supabase__apply_migration` directo contra el proyecto remoto, sin carpeta local `supabase/migrations/` ni Supabase CLI. Razón: decisión explícita del usuario, mismo criterio que SPEC 04 (que ya obtuvo las keys del proyecto vía el MCP en vez de inicializar tooling local nuevo).
- **Sí:** RLS habilitado con lectura pública en ambas tablas e inserción pública solo en `scores`; sin `update`/`delete` públicos en ninguna. Razón: no hay autenticación que distinga usuarios, así que la única operación de escritura que tiene sentido exponer al anon key es agregar una puntuación nueva; editar/borrar puntuajes o juegos queda fuera de alcance (ver "Out of scope").
- **Sí:** `getGames`/`getGame`/`getTopScores`/`getGameStats`/`saveScore` reciben el cliente de Supabase como parámetro en vez de crearlo internamente. Razón: permite reusar la misma lógica de consulta tanto en Server Components (cliente server) como en Client Components (cliente browser), sin duplicar código.
- **No:** no se agrega paginación al leaderboard. Razón: fuera de alcance; el volumen de datos esperado es bajo y no se pidió explícitamente.
- **No:** no se genera una carpeta de tipos TypeScript del esquema (`lib/database.types.ts`) en este spec. Razón: mismo criterio que SPEC 04 — se puede agregar después sin bloquear este trabajo; los tipos de este spec se escriben a mano en `lib/games.ts`/`lib/scores.ts`.

## Risks

| Riesgo                                                                                                                                                                         | Mitigación                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin autenticación, cualquiera con el anon key público puede insertar puntuaciones falsas o spam en `scores`.                                                                   | Aceptado para este spec (igual que hoy, donde el "leaderboard" ya era 100% inventado); los `CHECK` de `score >= 0` y `name` de 1–10 caracteres limitan el abuso más obvio. |
| `getGames()` hace una consulta adicional a `scores` para calcular `best`/`plays` de las 9 filas; si el catálogo creciera mucho, ese cálculo en memoria dejaría de ser trivial. | Aceptado; el catálogo tiene 9 juegos y no se espera que crezca en este spec. Si crece, se puede mover el cálculo a una vista o función SQL en un spec futuro.              |
| Si `saveScore` falla silenciosamente por un error de red intermitente, el jugador podría creer que perdió su puntuación.                                                       | El paso 9 del plan exige manejo explícito de error en `GamePlayer` (mensaje + reintento), no un fallo silencioso.                                                          |

## What is **not** in this spec

- Autenticación real o cualquier vínculo entre puntuaciones y un usuario/id real.
- Panel de administración para crear/editar/borrar juegos.
- Paginación del leaderboard.
- Cambios a `app/login`, `lib/session.ts` o al motor de `AsteroidsGame.tsx`.
- Carpeta local `supabase/migrations/` o Supabase CLI.

Cada uno de estos, si se implementa, va en su propio spec.
