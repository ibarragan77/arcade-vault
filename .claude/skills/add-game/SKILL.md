---
name: add-game
description: Investiga un juego fuente en references/started-games/, lo reconcilia con el catálogo de juegos en Supabase, y genera un spec en Draft (siguiendo el mismo formato de /spec) listo para /spec-impl. Úsalo para portar un nuevo juego jugable con leaderboard a la plataforma.
disable-model-invocation: true
argument-hint: "<carpeta en references/started-games, p.ej. 03-tetris>"
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Bash(ls:*), Bash(cat:*), Bash(date:*), mcp__supabase__list_tables, mcp__supabase__execute_sql
---

# /add-game — Generador de specs para portar juegos

## Session context

Today's date (use this for the spec header, never guess it):
!`date +%F`

Specs that already exist:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist yet"`

Juegos fuente disponibles en references/started-games/:
!`ls references/started-games/ 2>/dev/null || echo "references/started-games/ no existe"`

Juegos ya portados a componentes React:
!`ls components/games/ 2>/dev/null || echo "components/games/ no existe todavía"`

Branch-creation config (informativo, lo usa /spec-impl):
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, no config file)"`

---

Este skill **no escribe código ni toca Supabase**. Su único producto es un spec nuevo en `specs/`, en estado `Draft`, listo para que el usuario lo revise, lo apruebe y corra `/spec-impl` sobre él — exactamente el mismo flujo que ya se usó para SPEC 05 (Asteroids) y SPEC 06 (leaderboard/catálogo real).

Lee `recipe.md` (en el mismo directorio que este skill) antes de escribir cualquier spec — ahí está destilado el contrato de componente, el patrón de wiring en `GamePlayer.tsx` y la integración con Supabase que ya dejaron establecidos SPEC 05 y SPEC 06. No repitas ese trabajo de análisis desde cero: reutilízalo.

Tus respuestas deben estar en el mismo idioma que el prompt inicial del usuario (igual criterio que `/spec`).

## Fase 1 — Identificar el juego fuente

El argumento recibido es: `$ARGUMENTS`

- Si viene vacío: muestra las carpetas listadas arriba en "Juegos fuente disponibles" y pregunta cuál portar. Espera la respuesta, no continúes.
- Si viene con valor: resuélvelo contra `references/started-games/` con la misma tolerancia que `/spec-impl` usa para specs — el usuario puede escribir el nombre completo (`03-tetris`), solo el número (`03`) o solo el slug (`tetris`). Si no encuentras coincidencia, muestra las carpetas disponibles y pide que corrija.
- Si la carpeta resuelta ya tiene un componente en `components/games/<slug>/` (ver "Juegos ya portados" arriba), avisa que este juego parece ya portado y confirma con el usuario si de verdad quiere continuar (podría ser un re-trabajo intencional, p. ej. rehacer el spec de Asteroids). Si dice que no, detente.

Una vez identificada la carpeta:

1. Lee completo el archivo (o archivos) de lógica del juego (`game.js` y afines — puede haber más de uno, como `levels.js` en Arkanoid).
2. Lee el `index.html`/`style.css` del juego fuente para confirmar el tamaño real del canvas y detectar cualquier asset externo referenciado (imágenes, audio, fuentes).
3. Extrae mentalmente: estado a nivel de módulo, constantes, funciones/clases de entidades, manejo de input (teclado/mouse), conceptos de score/vidas/nivel, condición y manejo actual de "game over", y cualquier dependencia de assets externos.

## Fase 2 — Reconciliar con el catálogo de Supabase

1. Usa `mcp__supabase__list_tables` y luego `mcp__supabase__execute_sql` con `select * from games` (**solo lectura, nunca inserts/updates/migraciones** — eso lo hace `/spec-impl`, no este skill) para ver los ids/títulos/categorías/colores/covers actuales del catálogo.
2. Pregunta al usuario (AskUserQuestion) si el juego que se está portando:
   - **Reemplaza/actualiza un id placeholder existente** del catálogo (p. ej. Tetris → `caida`, Arkanoid → `bloque-buster`) — en ese caso el spec hará un `update` sobre esa fila (title/short/long/cover), no un insert.
   - **Se agrega como id nuevo independiente**, coexistiendo con el placeholder que temáticamente reemplaza (igual que `asteroides` se agregó junto a `rocas` en SPEC 05) — en ese caso el spec hará un `insert`.
3. Si es id nuevo: pregunta (en bloque, con recomendación marcada, igual estilo que `/spec`) `title`, `short`, `long`, `cat` (`ARCADE`/`PUZZLE`/`SHOOTER`/`VERSUS`), `color` (`cyan`/`magenta`/`yellow`/`green`) y el slug de la nueva clase `.cover-<slug>`.
4. Si es id existente: confirma con el usuario el `title`/`short`/`long` nuevos que reemplazarán a los actuales (muéstrale los valores actuales primero), y si el cover CSS existente se reemplaza o se conserva.

## Fase 3 — Preguntas específicas de arquitectura del motor

Consulta `recipe.md` y `components/games/asteroids/AsteroidsGame.tsx` como referencia del contrato ya establecido. Pregunta solo lo que el juego fuente concreto no resuelve por sí solo — no repitas preguntas cuya respuesta ya es obvia leyendo el código fuente:

1. **¿Tiene concepto de "vidas"?** Si no (p. ej. Tetris), decide junto con el usuario cómo se refleja eso en el HUD genérico de `GamePlayer.tsx` (ocultar el campo, o reusarlo para otra métrica del juego, p. ej. líneas). Anótalo como decisión explícita en el spec.
2. **¿Necesita input no-teclado (mouse) o precarga de assets (imágenes/audio)?** Si sí, el plan del spec debe incluir copiar esos assets a `public/games/<slug>/` (Next sirve estáticos desde `public/`, no desde `references/`) y un gate de precarga (`Promise.all` de `Image`/`Audio`) antes de arrancar el loop — ver detalle en `recipe.md`.
3. **Estado del wiring en `GamePlayer.tsx`**: usa Grep sobre `app/juegos/[id]/jugar/GamePlayer.tsx` para comprobar si todavía existe el caso especial único (`isAsteroids`/`game.id === "asteroides"`) o si ya existe un registro `id → Componente` de una iteración previa de este skill.
   - Si sigue el caso especial único: el plan del spec **debe incluir, como paso propio antes de agregar el nuevo juego**, el refactor a registro descrito en `recipe.md`.
   - Si ya existe un registro: el plan solo agrega una entrada nueva, sin tocar la estructura del registro.

## Fase 4 — Escribir el spec

Sigue exactamente el formato de `.claude/skills/spec/template.md` (Header con Status/Depends on/Date/Objective, Scope In/Out, Data model, Implementation plan numerado, Acceptance criteria en checklist, Decisions, Risks si aplica, cierre "What is **not** in this spec"). A diferencia de `/spec` genérico, aquí el plan y los criterios de aceptación se pre-pueblan con la receta de `recipe.md` en vez de partir de cero — solo las decisiones específicas de este juego (mapeo de catálogo, vidas/nivel, assets, refactor de registro sí/no) vienen de las Fases 2-3.

1. Determina el siguiente `NN` igual que `/spec`: máximo número existente en `specs/` + 1, con cero a la izquierda.
2. Genera un slug kebab-case a partir del título del juego (p. ej. `tetris-real-game`, siguiendo el estilo de `05-asteroids-real-game`).
3. Usa la fecha del session context de arriba — nunca la adivines.
4. El plan de implementación debe incluir, en este orden cuando aplique: (a) cover CSS nuevo/actualizado, (b) migración de Supabase (`update` o `insert` según lo decidido en Fase 2), (c) refactor de `GamePlayer.tsx` a registro (solo si aplica, ver Fase 3), (d) creación del componente `components/games/<slug>/<Nombre>Game.tsx` siguiendo el contrato de `recipe.md`, (e) copia de assets a `public/games/<slug>/` (solo si aplica), (f) wiring final en `GamePlayer.tsx`/registro, (g) verificación manual con `npm run dev`.
5. Los criterios de aceptación reutilizan el checklist reusable de `recipe.md`, adaptado al juego concreto (p. ej. sin ítem de "vidas" si el juego no las tiene).
6. Escribe el archivo en `specs/NN-slug.md`. **No pidas permiso para el nombre del archivo.** Marca `Status: Draft` — nunca `Approved`.
7. Si `specs/.spec-config.yml` no existe, créalo con el mismo contenido default que usa `/spec` (`AutoCreateBranch: true`); si ya existe, no lo toques.
8. Confirma al usuario: el path del archivo creado, que está en `Draft` y debe pasar a `Approved` tras revisarlo, y que el siguiente paso es correr `/spec-impl NN-slug`. **Detente ahí.** No propongas implementar nada tú mismo.

## Reglas duras

- **Nunca escribas código de la app** (`components/`, `app/`, `lib/`) en este skill — solo el archivo `.md` del spec.
- **Nunca apliques migraciones ni inserts/updates reales en Supabase.** `mcp__supabase__execute_sql` se usa exclusivamente para lecturas de contexto (Fase 2). La escritura real la hace `/spec-impl` cuando el usuario implemente el spec.
- **Nunca marques el spec como `Approved`.** Eso lo decide el usuario después de revisarlo.
- **Nunca asumas el mapeo de catálogo (reemplazo vs. id nuevo), la decisión sobre "vidas", ni si hace falta el refactor de registro** sin preguntar — son las tres decisiones que este skill existe para no adivinar.
- Si el juego fuente es sustancialmente más complejo que Asteroids/Tetris (múltiples archivos de lógica, motor de físicas propio, red/multijugador), dilo explícitamente y sugiere usar `/spec` genérico en su lugar para tener el proceso completo de preguntas — este skill asume juegos de un jugador, un solo canvas, sin backend propio más allá de `games`/`scores`.

## Arguments

`$ARGUMENTS` es el nombre o número de la carpeta dentro de `references/started-games/` a portar (no una descripción libre del juego). Si el usuario en cambio escribe una descripción libre (p. ej. "el juego de las naves"), trata de emparejarla contra las carpetas disponibles y confirma la coincidencia antes de continuar.
