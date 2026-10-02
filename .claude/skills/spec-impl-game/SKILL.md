---
name: spec-impl-game
description: Igual que /spec-impl (valida que el estado signifique "Approved", crea la rama spec-NN-slug e implementa paso a paso con pausas para revisar diffs), pero para specs de un juego del catálogo. Al terminar la implementación ejecuta en secuencia — nunca en paralelo — los agentes skin-designer y mobile-porter sobre ese juego, con una pausa de revisión después de cada uno.
disable-model-invocation: true
argument-hint: <NN-spec-name>
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Agent, SendMessage, Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(git log:*), Bash(git diff:*), Bash(git stash:*), Bash(cat:*), Bash(ls:*), mcp__supabase__list_tables, mcp__supabase__execute_sql
---

# /spec-impl-game — Implementador de specs aprobadas de juegos + skins + soporte móvil

Este comando es una **copia propia del proyecto** de `/spec-impl` (`.claude/skills/spec-impl/SKILL.md`), con
dos fases extra al final. Las fases 1 a 4 siguen exactamente los mismos lineamientos que `/spec-impl`; las
fases 5 y 6 ejecutan, uno después del otro, los agentes `skin-designer` (`.claude/agents/skin-designer.md`)
y `mobile-porter` (`.claude/agents/mobile-porter.md`) sobre el juego de la spec.

Si cambias `/spec-impl`, revisa si el cambio también aplica aquí: este archivo no lo hereda automáticamente.

## Session context

Estado actual del repositorio:
!`git status --short`

Rama actual:
!`git branch --show-current`

Specs disponibles en esta carpeta:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist"`

Configuración de creación de rama:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, no config file)"`

Registro de motores de juego (`GAME_ENGINES`, ids de `games.id` → componente):
!`cat lib/game-engines.ts 2>/dev/null || echo "lib/game-engines.ts no existe"`

---

## Instrucciones

Sigue estas seis fases en orden estricto. **No avances a la siguiente fase si la anterior no se completó
correctamente.** Responde siempre en el idioma del usuario (por defecto, español).

---

### Fase 1 — Identificar la spec y el juego

El argumento recibido es: `$ARGUMENTS`

Si `$ARGUMENTS` está vacío:

- Lista los archivos disponibles en `specs/` (ya los tienes arriba).
- Pide al usuario que indique el nombre exacto de la spec.
- Detente y espera la respuesta. No continúes.

Si `$ARGUMENTS` tiene un valor:

- Busca el archivo en `specs/`. El usuario puede haber escrito el nombre completo (`01-mvp-arkanoid`), solo
  el número (`01`) o solo el slug (`mvp-arkanoid`). Intenta encontrar el archivo correcto en cualquiera de
  esos casos.
- Si no encuentras el archivo, muestra las specs disponibles y pide al usuario que corrija el nombre.
- Si lo encuentras, continúa al paso 1b.

#### 1b — Identificar el juego (`games.id`)

Lee la spec y determina a qué juego del catálogo corresponde:

1. Busca en el texto de la spec claves de `GAME_ENGINES` (ver Session context: `asteroides`, `caida`,
   `bloque-buster`, `serpentina`, …) o rutas `components/games/<slug>/<Nombre>Game.tsx`, y crúzalas con el
   registro para obtener el par `id → componente`.
2. Si la spec porta un juego **nuevo** que todavía no está en `GAME_ENGINES`, toma el `id` que su plan de
   implementación dice registrar ahí y el componente que dice crear. Puedes confirmar que ese `id` existe en
   Supabase con `mcp__supabase__execute_sql` usando `select id, title from games` (**solo lectura**; nunca
   `insert`/`update`/`delete`).

Según el resultado:

- **Ningún juego:** detente con este mensaje y no crees rama ni toques nada:

  ```
  ❌ Esta spec no corresponde a un juego del catálogo.

  /spec-impl-game solo trabaja con specs que implementan o modifican un juego
  registrado (o por registrar) en GAME_ENGINES, porque al final ejecuta los
  agentes skin-designer y mobile-porter sobre ese juego.

  Para esta spec usa /spec-impl [nombre].
  ```

- **Más de un juego:** pregunta con `AskUserQuestion` cuál es el juego sobre el que deben correr los
  agentes, ofreciendo los ids encontrados. Espera la respuesta.
- **Exactamente uno:** guárdalo; lo mostrarás en el resumen de la Fase 3 (`Juego: <id> → <componente>`).

Continúa a la Fase 2.

---

### Fase 2 — Validar el estado de la spec

Lee el archivo de la spec que ubicaste en la Fase 1 (con la herramienta Read o `cat`).

En el contenido del archivo, busca la línea que contiene el estado de la spec. La etiqueta suele ser
`**Status:**` (inglés) o `**Estado:**` (español), pero puede estar en cualquier idioma. Identifícala por su
posición (línea de estado cerca del inicio de la spec) y por la máquina de estados que la rodea, no por la
etiqueta exacta.

**Regla absoluta:** solo puedes continuar si el estado **significa "Approved"** — sin importar el idioma
en que esté escrito.

Trata cualquiera de estos (y sus equivalentes en otros idiomas) como el estado **Approved** y continúa:

- Inglés: `Approved`
- Español: `Aprobado`
- Portugués: `Aprovado`
- Francés: `Approuvé`
- Alemán: `Genehmigt`
- Italiano: `Approvato`
- …o la palabra de cualquier otro idioma que claramente signifique "aprobado"

Cualquier otro valor (Draft / Borrador, In review / En revisión, Implemented / Implementado, Obsolete /
Obsoleto, o cualquier valor no reconocido) significa **detenerse** y mostrar el mensaje de error de abajo.

| Categoría de estado                       | Ejemplos (cualquier idioma)                       | Acción                                                               |
| ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Approved                                  | `Approved`, `Aprobado`, `Aprovado`, `Approuvé`, … | Continúa a la Fase 3.                                                |
| Draft                                     | `Draft`, `Borrador`, …                            | Detente. Muestra el mensaje de error de abajo.                       |
| In review                                 | `In review`, `En revisión`, …                     | Detente. Muestra el mensaje de error de abajo.                       |
| Implemented                               | `Implemented`, `Implementado`, …                  | Detente. Muestra el mensaje de error de abajo.                       |
| Obsolete                                  | `Obsolete`, `Obsoleto`, …                         | Detente. Muestra el mensaje de error de abajo.                       |
| Línea de estado no encontrada / no válida | —                                                 | Detente. El archivo no sigue el formato esperado. Díselo al usuario. |

Si no estás seguro de si un valor significa "aprobado", **no lo asumas**. Detente y pide al usuario que lo
aclare o que actualice la spec con la palabra canónica.

**Mensaje de error estándar cuando el estado no significa Approved:**

```
❌ No puedo implementar esta spec.

Estado actual: [ESTADO ENCONTRADO]
Solo trabajo con specs cuyo estado signifique "Approved" (por ejemplo `Approved`,
`Aprobado`, o el equivalente en otro idioma).

Para continuar tienes dos opciones:
  1. Si la spec está lista para implementarse, ábrela y cambia el estado
     a "Approved" (o el término equivalente que use tu equipo) manualmente.
     Ese cambio lo hace el humano, no el agente.
  2. Si la spec todavía necesita trabajo, usa /spec [nombre] para retomarla.
```

No ofrezcas alternativas ni sugieras "igual puedo empezar si quieres". El bloqueo es intencional.

---

### Fase 3 — Crear la rama de git y cambiarte a ella

Una vez confirmado que el estado significa `Approved`:

0. **Revisa primero el working tree.** Mira la salida de `git status --short` en el Session context de
   arriba. Si **no está vacía**, detente, muestra los cambios pendientes y pregunta:

   ```
   ⚠️ Hay cambios sin commitear en el working tree.
   Cambiar de rama los arrastraría. ¿Qué quieres hacer?
     1. Commitearlos o guardarlos con stash tú mismo, y volver a correr este comando  (recomendado)
     2. Continuar de todos modos — los cambios viajan a la nueva rama
   ```

   Espera la respuesta. **No hagas stash ni commit en nombre del usuario** salvo que te lo pida
   explícitamente. Si el working tree está limpio, pasa directo al paso 1 sin mencionarlo.

1. Deriva el nombre de la rama del nombre completo del archivo de la spec, sin la extensión. Formato:
   `spec-NN-slug`. Ejemplos:

   - `01-mvp-arkanoid.md` → rama `spec-01-mvp-arkanoid`
   - `02-powerups.md` → rama `spec-02-powerups`

2. Lee la bandera `AutoCreateBranch` de la **Configuración de creación de rama** mostrada en el Session
   context de arriba.

   - Si el archivo de configuración no existe, falta el valor o el valor no se reconoce → trátalo como
     `true` (el default).
   - Solo un `false` explícito (en cualquier capitalización) desactiva la creación automática de la rama.

   **Si `AutoCreateBranch` es `true` (default):** procede sin preguntar.

   - Si la rama **no existe**: créala con `git checkout -b spec-NN-slug`.
   - Si **ya existe**: significa que se está retomando trabajo previo. Cámbiate a ella, lee
     `git log --oneline` de la rama y dile al usuario qué pasos del plan ya parecen hechos y desde qué paso
     propones retomar. Espera la confirmación del punto de retome antes de implementar nada. Si el plan ya
     parece completo, propone retomar directamente en la Fase 5 o en la Fase 6, según corresponda.
   - En ambos casos: cámbiate a la rama con `git checkout spec-NN-slug` y confirma que el cambio fue
     exitoso antes de continuar.

   **Si `AutoCreateBranch` es `false`:** pregunta antes de tocar git. Muestra:

   ```
   AutoCreateBranch está en false.
   ¿Creo y me cambio a la rama spec-NN-slug? [y/N]
   ```

   - Si el usuario responde **sí**: crea/cámbiate a la rama exactamente como en el caso `true` de arriba.
   - Si el usuario responde **no** o deja la respuesta vacía: **no crees ninguna rama.** Dile al usuario
     que implementarás sobre la rama actual (la que aparece en el Session context de arriba) y pide
     confirmación explícita para continuar ahí. No improvises: espera la respuesta.

3. Confirma visualmente al usuario que la spec está lista y qué rama está activa:

   ```
   ✅ Listo para implementar.

   Spec:   specs/NN-slug.md
   Rama:   spec-NN-slug  (activa)   (← o la rama actual, si no se creó una nueva)
   Estado: Approved   (← repite el valor real encontrado en la spec)
   Juego:  <id> → components/games/<slug>/<Nombre>Game.tsx
   Después: skin-designer → mobile-porter (en secuencia, con pausa entre ambos)
   ```

4. **Todavía no empieces a implementar.** Primero muestra el resumen de la spec para que el usuario lo
   tenga fresco. Extrae y muestra:
   - El **objetivo** (la línea después de `**Objective:**` / `**Objetivo:**` / etiqueta equivalente).
   - El **alcance** (la sección `## Scope` / `## Alcance` / equivalente).
   - El **plan de implementación** (la sección con los pasos numerados — `## Implementation plan` /
     `## Plan de implementación` / equivalente).
   - Los **criterios de aceptación** (el checklist — `## Acceptance criteria` / `## Criterios de
aceptación` / equivalente).

Identifica los encabezados de sección por su significado, no por la redacción exacta: la spec puede estar
escrita en cualquier idioma.

---

### Fase 4 — Implementar paso a paso

Después de mostrar el resumen de la spec, dile al usuario:

```
Voy a implementar la spec siguiendo exactamente el plan de implementación.
Pausaré después de cada paso para que revises el diff.
Al terminar el plan, correré skin-designer y luego mobile-porter sobre el juego.

¿Empezamos con el Paso 1?
```

Espera una confirmación explícita ("sí", "dale", "adelante" o equivalente). No empieces sin ella.

Una vez confirmado, sigue estas reglas durante toda la implementación:

**Nunca commitees automáticamente.** Ni por paso, ni al final, ni después de los agentes. Tú escribes el
código y muestras el diff; commitear es decisión y comando del usuario. Solo commitea si te lo pide
explícitamente.

**Una regla por encima de todas:** implementa lo que dice la spec. Si algo de la spec te parece mejorable,
menciónalo como observación, pero implementa lo acordado. Los cambios a la spec van en la spec, no en el
código por sorpresa.

**Ritmo de trabajo:**

- Implementa un paso del plan.
- Muestra un resumen de qué archivos tocaste y qué hiciste.
- Di: `Paso N completado. ¿Puedes revisar el diff y me dices si sigo con el Paso N+1?`
- Espera confirmación antes de continuar.

**Si durante la implementación encuentras una ambigüedad** que la spec no resuelve:

- Detente.
- Describe la ambigüedad con exactitud.
- Presenta dos o tres opciones concretas.
- Espera la decisión del usuario.
- No improvises.

**Si el usuario pide algo que está fuera del alcance de la spec:**

- Recuérdale que está fuera del alcance de esta spec.
- Sugiere anotarlo para la siguiente spec.
- No lo implementes en esta rama.

**Al terminar el último paso:**

```
✅ Todos los pasos del plan están implementados.

Siguiente: revisión de skins del juego <id> con el agente skin-designer.
¿Lo lanzo?
```

Espera confirmación. No lances el agente sin ella.

---

### Fase 5 — Agente `skin-designer`

Lanza el agente con la herramienta `Agent` (`subagent_type: "skin-designer"`). El prompt debe incluir,
como mínimo:

- El `id` de juego **ya confirmado por el usuario** y su componente, indicando explícitamente que no debe
  volver a preguntarlo (ej. `"El id ya está confirmado: <id> → <componente>. No lo vuelvas a preguntar."`).
- La ruta de la spec recién implementada (`specs/NN-slug.md`) y la rama activa, como contexto de qué cambió.
- Un recordatorio de sus reglas duras: editar solo ese componente, no commitear, no cambiar de rama, no
  escribir en `specs/`, Supabase solo en lectura, y actualizar `references/game-themes.md` y
  `references/skin-designer-memory.md`.
- La instrucción de que, si encuentra una decisión de paleta genuinamente ambigua que en una sesión directa
  preguntaría con `AskUserQuestion`, **se detenga y la reporte con opciones concretas** en vez de adivinar.

Reglas de ejecución:

- **Espera a que `skin-designer` termine** (la notificación de finalización del agente) antes de hacer
  cualquier otra cosa. **Nunca lances `mobile-porter` en paralelo** ni antes de cerrar esta fase.
- Si el agente se detuvo reportando una ambigüedad, trasládale la pregunta al usuario (con
  `AskUserQuestion` si encaja) y retoma ese mismo agente con `SendMessage` pasándole la respuesta. No
  lances uno nuevo.

Cuando termine, muestra al usuario:

1. Un resumen del reporte del agente: estado (`Sin skins` / `Parcial` / `Completo`), qué skins implementó
   (si alguno), riesgos de contraste y la verificación manual en navegador que dejó pendiente.
2. La salida de `git diff --stat`.

Y pregunta:

```
Paso skin-designer completado. ¿Revisaste el diff de skins?
¿Lanzo mobile-porter sobre <id>?
```

Espera confirmación. No continúes sin ella.

---

### Fase 6 — Agente `mobile-porter`

Lanza el agente con la herramienta `Agent` (`subagent_type: "mobile-porter"`), con el mismo patrón de
prompt que la Fase 5:

- `id` ya confirmado y componente, sin volver a preguntarlo.
- Ruta de la spec y rama activa.
- Que los skins de ese juego ya quedaron resueltos en la fase anterior por `skin-designer` (para que el
  punto 7 de su checklist, colores acordes al skin, use `SKIN_PALETTES` con el estado `skin`).
- Recordatorio de sus reglas duras: editar solo ese componente, no commitear, no cambiar de rama, no
  escribir en `specs/`, Supabase solo en lectura, y actualizar `references/mobile-support.md` y
  `references/mobile-porter-memory.md`.
- Si encuentra un mapeo de botones u orientación genuinamente ambiguo, que se detenga y lo reporte con
  opciones concretas en vez de adivinar.

Mismas reglas de ejecución que la Fase 5: esperar a que termine, y si se detuvo por una ambigüedad,
preguntarle al usuario y retomarlo con `SendMessage`.

Cuando termine, muestra al usuario un resumen de su reporte (estado del checklist de 9 puntos, esquema de
botones, orientación, archivo cambiado, verificación manual pendiente en celular) y la salida de
`git diff --stat`. Cierra con:

```
✅ Implementación de la spec + skin-designer + mobile-porter completados.

Siguientes pasos (manuales):
  1. Verifica los criterios de aceptación de la spec uno por uno.
  2. Corre las verificaciones manuales que dejaron los agentes:
     skins en el navegador y controles táctiles en DevTools / celular real.
  3. Si todo pasa, cambia el estado de la spec a "Implemented" (o el
     equivalente en el idioma del repo).
  4. Haz el commit final antes de mergear esta rama.
     (Este comando nunca commitea por ti.)
```

---

## Resumen del comportamiento esperado

```
/spec-impl-game 10-snake-real-game   (estado: Approved)

  Fase 1   →  Encuentra specs/10-snake-real-game.md
  Fase 1b  →  Juego: serpentina → components/games/snake/SnakeGame.tsx
  Fase 2   →  Lee el estado → "Approved" → ✅ continúa
  Fase 3   →  git checkout -b spec-10-snake-real-game
              Muestra objetivo, alcance, plan y criterios
  Fase 4   →  Implementa paso a paso con pausas
              Al final pregunta si lanza skin-designer
  Fase 5   →  skin-designer sobre serpentina → espera que termine
              Muestra reporte + git diff --stat → pausa
  Fase 6   →  mobile-porter sobre serpentina → espera que termine
              Muestra reporte + git diff --stat
              Recuerda verificar criterios, cambiar a Implemented y commitear

/spec-impl-game 13-touch-gamepad-mk2   (estado: Draft)

  Fase 1   →  Encuentra la spec; Juego: asteroides
  Fase 2   →  Lee el estado → "Draft" → ❌ se detiene
              Muestra el mensaje de error estándar
              No crea rama, no toca código, no lanza agentes

/spec-impl-game 03-contact-email-resend

  Fase 1   →  Encuentra la spec
  Fase 1b  →  Ningún juego del catálogo → ❌ se detiene
              Sugiere usar /spec-impl
```

**La creación de la rama se controla con la bandera `AutoCreateBranch`** en `specs/.spec-config.yml`, igual
que en `/spec-impl`. Por defecto es `true`; ponla en `false` para que la Fase 3 pregunte `[y/N]` antes de
crear la rama.
