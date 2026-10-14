# CLAUDE.md

Este archivo da guía a Claude Code (claude.ai/code) para trabajar con el código de este repositorio.

@AGENTS.md

## Proyecto

Arcade Vault — una plataforma para jugar online y competir por altos puntajes (según el README.md, en español). Más allá del scaffold inicial de `create-next-app`, ahora tiene un catálogo de juegos real respaldado por Supabase, un leaderboard, cinco juegos jugables, autenticación real con Supabase Auth (spec 15) y un formulario de contacto que envía correo con Resend.

## Spec Driven Design

Este repo sigue Spec Driven Design mediante el paquete `Klerith/fernando-skills`, ya instalado en `.claude/skills/`:

- `/spec <descripción>` — aclara una funcionalidad con preguntas y luego escribe `specs/NN-slug.md` en estado `Draft`. Nunca escribe código.
- `/spec-impl <NN-slug>` — solo corre sobre un spec cuyo estado signifique "Approved". Crea/cambia a la rama `spec-NN-slug` (salvo que `specs/.spec-config.yml` tenga `AutoCreateBranch: false`) e implementa el plan paso a paso, pausando para revisión después de cada paso. Nunca commitea automáticamente.
- `/spec-impl-game <NN-slug>` — copia específica del proyecto de `/spec-impl` (`.claude/skills/spec-impl-game/`) para specs que implementan o modifican un juego del catálogo. Mismas fases y reglas (solo Approved, rama `spec-NN-slug`, pausas por paso, nunca commitea), más una verificación previa de que el spec corresponda a un id de `GAME_ENGINES` (si no, se detiene y apunta a `/spec-impl`). Al terminar el plan ejecuta `skin-designer` y luego `mobile-porter` sobre ese juego — en secuencia, nunca en paralelo — con una pausa de revisión después de cada agente. Los cambios en `/spec-impl` no se heredan automáticamente; mantén ambos sincronizados a mano.
- `/add-game <carpeta en references/started-games>` — skill específico del proyecto (`.claude/skills/add-game/`) que investiga un juego fuente, lo reconcilia con el catálogo `games` de Supabase y genera un spec `Draft` listo para `/spec-impl`. Nunca escribe código de la app ni toca Supabase más allá de consultas de solo lectura. Lee `.claude/skills/add-game/recipe.md` para conocer el contrato establecido de los componentes de motor de juego antes de tocar algo en `components/games/`.

Los specs existentes están en `specs/01` a `specs/15` y cubren: pantallas estáticas del MVP, home, correo de contacto, conexión a Supabase, la migración del leaderboard/tabla de juegos fuera de datos hardcodeados (06), un port de juego real por spec (Asteroids 05, Tetris 08, Arkanoid 09, Snake 10), un fix de teclado de Asteroids (07), skins de Asteroids (11), controles táctiles (12, más la 13 — gamepad MK-II, aún `Draft`, `TouchGamepad` todavía no construido), performance de Frogger/pantalla de juego (14) y registro/login/autenticación con Supabase Auth (15; el OAuth con Google/GitHub queda para un spec 16 aún no escrito). Los specs de game jam están en `specs/game-jam/<game-id>/`: `frogger/01-frogger.md` (`Approved`, implementado como `ranaria`) y `ranaria/opcion-a-*.md` / `opcion-b-*.md` (dos alternativas `Draft` del primer jam). Lee los dos specs más recientes antes de escribir uno nuevo — fijan las convenciones y el idioma actuales (español).

## Skills

Usa siempre /frontend-design para diseñar la interfaz de usuario.

Skills del proyecto (`.claude/skills/`): `spec`, `spec-impl`, `spec-impl-game` y `add-game` (ver _Spec Driven Design_ arriba).

## Agentes

Subagentes del proyecto en `.claude/agents/<nombre>.md` (ahí están el alcance, las restricciones y el checklist completos; léelo antes de invocarlos o modificarlos). Ninguno commitea sus cambios. Comparten reglas: confirman el `id` del juego contra Supabase/`GAME_ENGINES`, y nunca tocan `GamePlayer.tsx`, `lib/game-engines.ts`, `GameEngineProps` ni el componente de otro juego.

| Agente                     | Para qué                                                                                                   | Registro público / memoria                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `game-planner`             | Recomienda qué juego portar a continuación (solo planifica; luego `/add-game` o `/spec`).                  | `references/game-planner-memory.md`                                          |
| `game-jam`                 | Dado un tema, propone un concepto y escribe dos specs `Draft` alternativos en `specs/game-jam/<game-id>/`. | `references/game-jam-memory.md`                                              |
| `skin-designer`            | Revisa e implementa los 3 skins (`neon`, `retro`, `clasico`) de un juego (patrón spec 11).                 | `references/game-themes.md`, `references/skin-designer-memory.md`            |
| `mobile-porter`            | Revisa e implementa controles táctiles de un juego (checklist de 9 puntos, patrón spec 12).                | `references/mobile-support.md`, `references/mobile-porter-memory.md`         |
| `game-performance-booster` | Audita y optimiza FPS de un juego (checklist de 9 puntos, patrón spec 14 / Frogger).                       | `references/performance.md`, `references/game-performance-booster-memory.md` |

Invócalos con lenguaje natural ("qué juego agregamos después", "revisa los skins / el mobile / el performance de X", "hagamos un game jam sobre X") o con `@<nombre>`. `game-planner` y `game-jam` nunca escriben código de la app; `game-jam` solo escribe specs. `skin-designer`, `mobile-porter` y `game-performance-booster` implementan en el único componente del juego y dejan el working tree sin commitear para que el usuario lo pruebe (no tienen herramientas de navegador, salvo el booster, que mide con Playwright y requiere `npm run dev`).

## Hook de formato

`.claude/settings.json` registra un hook `PostToolUse` (`.claude/hooks/format-on-write.js`) que corre en cada `Write`/`Edit`: formatea con Prettier y revisa ESLint automáticamente. No hace falta correr `npm run lint` después de cada edición solo por eso, aunque sigue siendo la forma de revisar todo el proyecto.

## Arquitectura

- **Next.js 16.3.1 / React 19**, solo App Router (directorio `app/`), TypeScript, Tailwind CSS v4 (vía `@tailwindcss/postcss`, configurado en `app/globals.css`, sin archivo `tailwind.config.*`).
- El alias de ruta `@/*` apunta a la raíz del repo (`tsconfig.json`).
- **Esta versión de Next.js tiene cambios incompatibles respecto a los datos de entrenamiento.** Antes de escribir código de rutas o de obtención de datos, consulta `node_modules/next/dist/docs/` (`01-app/` para App Router) para ver la API vigente — no asumas que aplican las convenciones antiguas de Next.js.
- Convención notable de App Router 16 ya en uso: los componentes de ruta reciben los tipos auxiliares globales y autogenerados `PageProps<'/route'>` / `LayoutProps<'/route'>` (ver `app/layout.tsx`) en lugar de props `params`/`searchParams` tipadas a mano. Estos tipos no requieren import y los (re)generan `next dev`, `next build` o `next typegen`.

### Rutas (`app/`)

- `/` (`app/page.tsx`) — home, lee el catálogo real vía `lib/games.ts`.
- `/games` (`app/games/page.tsx` + `GamesGrid.tsx`) — listado del catálogo como Server Component, respaldado por Supabase.
- `/juegos/[id]` — página de detalle del juego (descripción, mejores puntajes, estadísticas) vía `getGame`/`getTopScores`/`getGameStats`.
- `/juegos/[id]/jugar` — página de juego; renderiza `GamePlayer.tsx`, que busca el motor del juego en `GAME_ENGINES` (ver abajo) y, si no hay ninguno registrado, cae a una animación placeholder.
- `/salon` — leaderboard/salón de la fama, lee datos reales de Supabase (ya no hay sección simulada de "tu mejor puntaje").
- `/login` (`app/login/page.tsx` + `LoginForm.tsx`) — inicio de sesión real con correo y contraseña (Supabase Auth), "Jugar como invitado" y botones Google/GitHub deshabilitados ("PRÓXIMAMENTE"). La página lee `?error=enlace` (lo deja `/auth/confirm`).
- `/registro` — crea la cuenta (`username` único, correo, contraseña); exige confirmar el correo antes de poder iniciar sesión.
- `/recuperar` y `/restablecer` — pedir el enlace de recuperación y fijar la contraseña nueva (requiere la sesión de recuperación que deja `/auth/confirm`).
- `/perfil` — usuario y correo con "Cerrar sesión"; protegida por `proxy.ts` (sin sesión redirige a `/login`).
- `/auth/confirm` (`app/auth/confirm/route.ts`, GET) — recibe `token_hash` + `type` (`signup`/`recovery`/`email`) del enlace del correo, llama a `verifyOtp` y redirige a `/` o `/restablecer`; si falla, a `/login?error=enlace`.
- `/about` — página estática "acerca de".
- `/api/contact` — endpoint POST que valida un body con nombre/email/mensaje (con un campo honeypot `company`) y envía correo vía Resend.
- `/api/supabase-health` — endpoint de verificación de conectividad de la configuración de Supabase.

### Capa de datos (`lib/`)

- `lib/data.ts` — ahora solo tipos estáticos compartidos (`Game`, `GameCategory`, `GameColor`, `CATS`). El catálogo hardcodeado y el leaderboard simulado se eliminaron de aquí — los datos reales vienen de Supabase.
- `lib/supabase/client.ts` / `lib/supabase/server.ts` — fábricas de clientes de Supabase (`@supabase/ssr`), separadas para navegador y servidor.
- `lib/games.ts` — `getGames`/`getGame`, leen las tablas `games` y `scores` y agregan las estadísticas `best`/`plays` por juego.
- `lib/scores.ts` — `saveScore`/`getTopScores`/`getGameStats` sobre la tabla `scores`. `saveScore` acepta `userId` opcional (`scores.user_id`); sin él el puntaje es de invitado.
- `lib/auth.ts` — funciones sobre `supabase.auth.*` (`signUp`, `signIn`, `signOut`, `resendConfirmation`, `requestPasswordReset`, `updatePassword`) y validadores (`USERNAME_RE`, `PASSWORD_MIN`). Devuelven `{ ok: true } | { ok: false, error, code? }` con los errores de Supabase traducidos al español; nunca se muestra el texto crudo.
- `lib/game-engines.ts` — el registro `GAME_ENGINES`: `Record<gameId, { Component, hasLives }>`, que mapea un `games.id` de Supabase a su componente React de motor de juego. Reemplazó un caso especial anterior `isAsteroids` en `GamePlayer.tsx`. Agregar un juego implica agregar una entrada aquí, no ramificar en `GamePlayer.tsx`.
- `lib/session.ts` — hook `useSession()` sobre la sesión real de Supabase Auth (cookies de `@supabase/ssr`, suscripción a `onAuthStateChange`). Devuelve `{ user, login, loginAsGuest, logout }` con `user: { id, name } | null`, donde `name` es el `profiles.username`. El invitado es "sin sesión" (`loginAsGuest` cierra la sesión). Arranca en `null` para coincidir con el render del servidor.
- `proxy.ts` (raíz) — convención `proxy` de Next 16 (reemplaza a `middleware`): refresca la sesión de Supabase en cada request y solo protege `/perfil`. Todo el resto del sitio es público porque el invitado sigue pudiendo jugar y guardar puntaje.

### Juegos (`components/games/<slug>/<Name>Game.tsx`)

Cinco juegos están portados y registrados en `GAME_ENGINES`, cada uno un componente basado en canvas que implementa el contrato compartido `GameEngineProps` (`paused`, `onScoreChange`, `onLivesChange?`, `onLevelChange?`, `onGameOver`):

| Id de catálogo (`games.id`) | Componente                                     | Tiene vidas |
| --------------------------- | ---------------------------------------------- | ----------- |
| `asteroides`                | `components/games/asteroids/AsteroidsGame.tsx` | sí          |
| `caida` (Tetris)            | `components/games/tetris/TetrisGame.tsx`       | no          |
| `bloque-buster` (Arkanoid)  | `components/games/arkanoid/ArkanoidGame.tsx`   | sí          |
| `serpentina` (Snake)        | `components/games/snake/SnakeGame.tsx`         | no          |
| `ranaria` (Frogger)         | `components/games/frogger/FroggerGame.tsx`     | sí          |

Los registros de estado por juego (una fila por id) viven en `references/`: `game-themes.md` (skins), `mobile-support.md` (táctil) y `performance.md` (mediciones de FPS). `FroggerGame.tsx` es la implementación de referencia de performance en canvas (cachés offscreen de fondo/sprites por skin, contador `?debug=fps`) — ver `specs/14-frogger-performance.md` y el agente `game-performance-booster`.

Los juegos con assets externos (sprites/sonidos, p. ej. el spritesheet de Arkanoid o los sprites de frutas de Snake) los sirven desde `public/games/<slug>/` — Next solo sirve archivos estáticos desde `public/`, nunca desde `references/`. Los juegos fuente que se portan viven en `references/started-games/` y son material de referencia de solo lectura para `/add-game`, nunca se importan en runtime.

### Servicios externos

- **Supabase** — tablas `games`, `scores` y `profiles` (`username` único, creado por el trigger `on_auth_user_created` al registrarse; `scores.user_id` es nullable y la política RLS `scores_insert_guest_or_self` impide guardar a nombre de otro usuario) más Supabase Auth, todo mediante los clientes de arriba. Requiere `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ver `.env.example`). La confirmación de correo y los enlaces dependen de ajustes del Dashboard documentados en el README.
- **Resend** — correo transaccional para el formulario de contacto. Requiere `RESEND_API_KEY` y `CONTACT_EMAIL_TO`.
