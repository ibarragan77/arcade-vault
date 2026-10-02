# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — a platform for playing games online and competing for high scores (per README.md, in Spanish). Beyond the initial `create-next-app` scaffold: it now has a real Supabase-backed game catalog, a leaderboard, five playable games, a simulated login, and a contact form that sends email via Resend.

## Spec Driven Design

This repo follows Spec Driven Design via the `Klerith/fernando-skills` package, already installed under `.claude/skills/`:

- `/spec <description>` — clarifies a feature through questions, then writes `specs/NN-slug.md` in `Draft` state. Never writes code.
- `/spec-impl <NN-slug>` — only runs on a spec whose state means "Approved". Creates/switches to branch `spec-NN-slug` (unless `specs/.spec-config.yml` sets `AutoCreateBranch: false`), then implements the plan step by step, pausing for review after each step. Never commits automatically.
- `/spec-impl-game <NN-slug>` — project-specific copy of `/spec-impl` (`.claude/skills/spec-impl-game/`) for specs that implement or modify a catalog game. Same phases and rules (Approved-only, `spec-NN-slug` branch, step-by-step pauses, never commits), plus an upfront check that the spec maps to a `GAME_ENGINES` id (otherwise it stops and points to `/spec-impl`). After the plan is done it runs `skin-designer` and then `mobile-porter` on that game — sequentially, never in parallel — pausing for review after each agent. Changes to `/spec-impl` are not inherited automatically; keep both in sync by hand.
- `/add-game <carpeta en references/started-games>` — project-specific skill (`.claude/skills/add-game/`) that investigates a source game, reconciles it against the Supabase `games` catalog, and generates a `Draft` spec ready for `/spec-impl`. It never writes app code or touches Supabase beyond read-only queries. Read `.claude/skills/add-game/recipe.md` for the established game-engine component contract before touching anything under `components/games/`.

Existing specs live in `specs/01` through `specs/14`, covering: MVP static screens, home page, contact email, Supabase connection, the leaderboard/games-table migration off hardcoded data, one real game port per spec (Asteroids, Tetris, Arkanoid, Snake), Asteroids skins (11), touch controls (12, 13) and Frogger/game-screen performance (14). Game-jam specs live under `specs/game-jam/<game-id>/` (Frogger: `specs/game-jam/frogger/01-frogger.md`). Read the two most recent specs before writing a new one — they set the current conventions and language (Spanish).

## Skills

Usa siempre /frontend-design para diseñar la interfaz de usuario.

## Agentes

- `game-planner` (`.claude/agents/game-planner.md`) — subagente de solo planificación que recomienda qué
  juego conviene portar o agregar a continuación al catálogo (investiga Supabase `games`,
  `lib/game-engines.ts`, `references/implemented-games.md` y `references/started-games/`). Nunca escribe
  código de la app ni specs — el siguiente paso sigue siendo `/add-game` o `/spec`. Invócalo cuando se
  pregunte "qué juego agregamos después" o se pida el agente explícitamente. Mantiene su propio historial
  de recomendaciones en `references/game-planner-memory.md` para no repetir sugerencias ya rechazadas o
  ya implementadas.
- `skin-designer` (`.claude/agents/skin-designer.md`) — subagente que revisa si un juego dado tiene
  implementados al menos tres skins (`neon`, `retro`, `clasico` como default) y si esas paletas funcionan
  bien contra el fondo oscuro real del sitio (Arcade Vault no tiene modo claro). Siempre confirma el `id`
  del juego contra Supabase/`GAME_ENGINES` antes de investigar, y usa `references/started-games/03-tetris`
  solo como referencia secundaria del patrón mecánico de tema intercambiable — ese juego no trae los 3
  skins pedidos, solo un toggle claro/oscuro. Si el diagnóstico da `Sin skins` o `Parcial`, ya no se
  limita a recomendar `/spec`: implementa directamente los skins faltantes en el único componente del
  juego confirmado, generalizando el patrón real de `specs/11-asteroids-skins.md` /
  `components/games/asteroids/AsteroidsGame.tsx` (constantes `SkinId`/`SKIN_PALETTES`, `skinRef`,
  persistencia en `localStorage`, overlay `<select>`). Nunca toca `GamePlayer.tsx`,
  `lib/game-engines.ts`, `GameEngineProps`, otro componente de juego, ni escribe specs, y nunca commitea
  sus propios cambios — deja el working tree para que el usuario lo pruebe en el navegador (el agente no
  tiene herramientas de navegador). Invócalo cuando se pregunte "el juego X tiene sus tres skins", "revisa
  los skins de X" o se pida el agente explícitamente (`@skin-designer`). Registra el estado real de skins
  por juego en `references/game-themes.md` (una fila por id, estilo `references/implemented-games.md`) y
  mantiene su propio historial de diagnósticos/implementaciones en `references/skin-designer-memory.md`
  para no repetir análisis ya hechos sobre el mismo juego.
- `mobile-porter` (`.claude/agents/mobile-porter.md`) — subagente que revisa si un juego dado se puede
  jugar bien en un celular/tablet táctil (sin romper la experiencia de teclado en la web) contra un
  checklist de 9 puntos derivado de `specs/12-asteroids-touch-controls.md`: detección `pointer: coarse`,
  overlay de botones conectado a la misma ruta de input que el teclado, multi-touch por
  `Touch.identifier`, aviso de orientación (elegida según la forma del canvas), ocultar/mostrar persistido
  en `<gameId>-touch-hidden`, colores por skin, sin solapes con HUD/`<select>`, y guarda de pausa. Si el
  diagnóstico da `Sin soporte` o `Parcial`, implementa directamente en el único componente del juego
  confirmado generalizando el patrón de `AsteroidsGame.tsx`. Mismas restricciones que `skin-designer`:
  nunca toca `GamePlayer.tsx`, `lib/game-engines.ts`, `GameEngineProps`, otro juego, `specs/`, ni commitea;
  no tiene herramientas de navegador, así que la prueba en celular queda para el usuario. Registra el
  estado por juego en `references/mobile-support.md` y su historial en `references/mobile-porter-memory.md`.
  Invócalo con "revisa el mobile de X", "el juego X se puede jugar en el celular" o `@mobile-porter`.
- `game-performance-booster` (`.claude/agents/game-performance-booster.md`) — subagente que recibe el `id`
  de un juego y lo audita contra un checklist de 9 puntos derivado de `specs/14-frogger-performance.md`:
  contador `?debug=fps` sin `setState`, fondo estático cacheado por skin en canvas offscreen, sin
  `shadowBlur` ni `ctx.filter` por entidad por frame (sprites con glow/filtro horneado y `pad = glow * 2`),
  cachés locales del loop indexadas por `SkinId`, sin renders de React ni callbacks por frame, un solo loop
  con cleanup, reglas CSS `body:has(.av-player)` presentes (solo las verifica) y ≥55 FPS con CPU 4× en todos
  los skins. Mide antes/después con Playwright (requiere `npm run dev` corriendo) y, si el diagnóstico da
  `Con problemas` o `Parcial`, implementa en el único componente del juego confirmado generalizando el
  patrón de `FroggerGame.tsx` (`buildBackground`/`buildSprite`/`getSprite`/`blitSprite`). Mismas
  restricciones que `mobile-porter` (además nunca toca `app/` ni `.css`). Registra las mediciones en
  `references/performance.md` y su historial en `references/game-performance-booster-memory.md`. Invócalo
  con "revisa el performance de X", "el juego X se traba" o `@game-performance-booster`.

## Formatting hook

`.claude/settings.json` registers a `PostToolUse` hook (`.claude/hooks/format-on-write.js`) that runs on every `Write`/`Edit` — it formats with Prettier and checks ESLint automatically. No need to manually run `npm run lint` after every edit for that reason alone, though it's still the way to check the whole project.

## Architecture

- **Next.js 16.3.1 / React 19**, App Router only (`app/` directory), TypeScript, Tailwind CSS v4 (via `@tailwindcss/postcss`, configured through `app/globals.css`, no `tailwind.config.*` file).
- Path alias `@/*` maps to the repo root (`tsconfig.json`).
- **This Next.js version has breaking changes vs. training data.** Before writing routing/data-fetching code, check `node_modules/next/dist/docs/` (`01-app/` for App Router) for the current API — do not assume older Next.js conventions apply.
- Notable App Router 16 convention already in use: route components take the global, auto-generated `PageProps<'/route'>` / `LayoutProps<'/route'>` helper types (see `app/layout.tsx`) instead of manually-typed `params`/`searchParams` props. These types require no import and are (re)generated by `next dev`, `next build`, or `next typegen`.

### Routes (`app/`)

- `/` (`app/page.tsx`) — home, reads the real catalog via `lib/games.ts`.
- `/games` (`app/games/page.tsx` + `GamesGrid.tsx`) — Server Component catalog listing, backed by Supabase.
- `/juegos/[id]` — game detail page (description, top scores, stats) via `getGame`/`getTopScores`/`getGameStats`.
- `/juegos/[id]/jugar` — gameplay page; renders `GamePlayer.tsx`, which looks up the game's engine in `GAME_ENGINES` (see below) and falls back to a placeholder animation if none is registered.
- `/salon` — leaderboard/hall of fame, reads real data from Supabase (no more simulated "your best score" section).
- `/login` — simulated session only (see `lib/session.ts`), not real auth.
- `/about` — static about page.
- `/api/contact` — POST endpoint that validates a name/email/message body (with a honeypot `company` field) and sends mail via Resend.
- `/api/supabase-health` — connectivity check endpoint for the Supabase setup.

### Data layer (`lib/`)

- `lib/data.ts` — shared static types only now (`Game`, `GameCategory`, `GameColor`, `CATS`). The hardcoded games catalog and simulated leaderboard have been removed from here — real data comes from Supabase.
- `lib/supabase/client.ts` / `lib/supabase/server.ts` — Supabase client factories (`@supabase/ssr`), split for browser vs. server usage.
- `lib/games.ts` — `getGames`/`getGame`, reading the `games` and `scores` tables and joining in `best`/`plays` stats per game.
- `lib/scores.ts` — `saveScore`/`getTopScores`/`getGameStats` against the `scores` table.
- `lib/game-engines.ts` — the `GAME_ENGINES` registry: `Record<gameId, { Component, hasLives }>`, mapping a Supabase `games.id` to its React game-engine component. This replaced an earlier one-off `isAsteroids` special case in `GamePlayer.tsx`. Adding a game means adding an entry here, not branching in `GamePlayer.tsx`.
- `lib/session.ts` — `useSession()` hook backed by `localStorage`; **not real authentication**, just a client-side display-name simulation used to prefill the score-save form.

### Games (`components/games/<slug>/<Name>Game.tsx`)

Five games are ported and registered in `GAME_ENGINES`, each a canvas-based component implementing the shared `GameEngineProps` contract (`paused`, `onScoreChange`, `onLivesChange?`, `onLevelChange?`, `onGameOver`):

| Catalog id (`games.id`)    | Component                                      | Has lives |
| -------------------------- | ---------------------------------------------- | --------- |
| `asteroides`               | `components/games/asteroids/AsteroidsGame.tsx` | yes       |
| `caida` (Tetris)           | `components/games/tetris/TetrisGame.tsx`       | no        |
| `bloque-buster` (Arkanoid) | `components/games/arkanoid/ArkanoidGame.tsx`   | yes       |
| `serpentina` (Snake)       | `components/games/snake/SnakeGame.tsx`         | no        |
| `ranaria` (Frogger)        | `components/games/frogger/FroggerGame.tsx`     | yes       |

Per-game status registries (one row per id) live in `references/`: `game-themes.md` (skins), `mobile-support.md` (touch) and `performance.md` (FPS measurements). `FroggerGame.tsx` is the reference implementation for canvas performance (offscreen background/sprite caches per skin, `?debug=fps` counter) — see `specs/14-frogger-performance.md` and the `game-performance-booster` agent.

Games with external assets (sprites/sounds, e.g. Arkanoid's spritesheet, Snake's fruit sprites) serve them from `public/games/<slug>/` — Next only serves static files from `public/`, never from `references/`. Source games being ported live under `references/started-games/` and are read-only reference material for `/add-game`, never imported at runtime.

### External services

- **Supabase** — `games` and `scores` tables, read/written via the clients above. Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).
- **Resend** — transactional email for the contact form. Requires `RESEND_API_KEY` and `CONTACT_EMAIL_TO`.
