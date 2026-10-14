# SPEC 19 — Privilegios mínimos de tablas y validación de endpoints

> **Status:** Approved
> **Depends on:** SPEC 03, SPEC 04, SPEC 06, SPEC 17
> **Date:** 2026-10-14
> **Objective:** Cerrar los hallazgos 2, 3 y 4 de la auditoría de seguridad dejando a `anon`/`authenticated` solo con los privilegios que la app usa, haciendo que `/api/supabase-health` no filtre errores y validando tipo, longitud y saltos de línea en `/api/contact`.

## Por qué existe este spec

La auditoría de `security-guardian` del 2026-10-14 dejó tres hallazgos abiertos (los otros, de dependencias, se cerraron en el SPEC 18). Se agrupan porque son endurecimientos pequeños de superficie pública, pero viven en tres lugares distintos: **base de datos** (una migración), `app/api/supabase-health/route.ts` y `app/api/contact/route.ts`.

Estado verificado el 2026-10-14 (consulta a Supabase y lectura del código):

- `anon` y `authenticated` tienen `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` sobre `games`, `scores` y `profiles`. RLS bloquea `INSERT`/`UPDATE`/`DELETE` indebidos, pero `TRUNCATE` no pasa por RLS (PostgREST no lo expone, por eso no hay vector directo hoy).
- La secuencia `scores_id_seq` tiene `rwU` para `anon` y `authenticated`.
- Los privilegios por defecto (`pg_default_acl`) del rol `postgres` en `public` conceden `arwdDxtm` a `anon`, `authenticated` y `service_role` para tablas, `rwU` para secuencias y `X` para funciones; el mismo patrón existe para `supabase_admin`. Cualquier tabla futura nace abierta.
- La app solo escribe con `insert` en `scores` (`lib/scores.ts`). `profiles` se escribe únicamente por el trigger `on_auth_user_created` (`SECURITY DEFINER`), que no depende de los privilegios de `anon`/`authenticated`.
- `app/api/supabase-health/route.ts` devuelve `error.message` (línea 12) y `String(err)` (línea 19) en una ruta pública sin autenticación. Ningún código de la app llama a este endpoint.
- `app/api/contact/route.ts` hace `body.name?.trim()` sin comprobar el tipo (un `name` que no sea string lanza una excepción y responde 500), no limita la longitud de `name`, `email` ni `msg`, e interpola `name` en el asunto sin quitar saltos de línea.

## Scope

**In:**

- **Migración `restrict_table_privileges`:**
  - `games` y `profiles`: `anon` y `authenticated` quedan solo con `SELECT`.
  - `scores`: `anon` y `authenticated` quedan con `SELECT` e `INSERT`; `USAGE` en `scores_id_seq` (necesario para el `insert` de invitados).
  - Se revocan `TRUNCATE`, `TRIGGER`, `REFERENCES`, `DELETE` y `UPDATE` (y `INSERT` donde no se usa).
  - `service_role` y `postgres` no se tocan.
- **Privilegios por defecto:** `alter default privileges for role postgres in schema public` revoca de `anon` y `authenticated` los privilegios sobre tablas y secuencias, para que las tablas futuras nazcan sin acceso y cada spec conceda lo que necesite. No se modifican los defaults de `supabase_admin`.
- **`/api/supabase-health`:** responder un error genérico `{ ok: false, error: "Servicio no disponible" }` con status 500 y registrar el detalle en el servidor con `console.error`. La respuesta de éxito `{ ok: true }` no cambia.
- **`/api/contact`:**
  - Validar que `name`, `email`, `msg` y `company` sean `string` (si no, 400 `Campos inválidos`; `company` ausente sigue permitido).
  - Límites tras `trim()`: `name` ≤ 80, `email` ≤ 254, `msg` ≤ 2000 caracteres. Si se excede, 400 `Campos inválidos`.
  - Quitar saltos de línea y caracteres de control de `name` antes de usarlo en el asunto (`subject`).
  - Mantener intacto el honeypot `company` (sigue respondiendo `{ ok: true }` sin enviar nada) y el envío de texto plano.
- **Documentación:** `references/security/security-checklist.md` (marcar el ítem de privilegios) y `references/security/security-guardian-memory.md` (hallazgos 2, 3 y 4 → `Resuelto`); `CLAUDE.md` si cambia algo de lo que describe sobre Supabase o los endpoints.

**Out of scope (para specs futuros):**

- Rate limiting de `/api/contact` y CAPTCHA.
- Anti-trampas en `scores` (tope máximo de `score`, validación de `name` más allá del `CHECK` actual).
- Content-Security-Policy.
- Eliminar `/api/supabase-health`: se mantiene.
- Cambios en las políticas RLS existentes (siguen igual).
- Cambios en los defaults de `supabase_admin` ni en `service_role`.
- Cambios en el formulario del frontend de contacto (límites en el cliente, contador de caracteres).
- Los riesgos aceptados de la auditoría y las verificaciones del Dashboard.

## Data model

Este spec no introduce tablas ni columnas. Solo una migración de permisos y constantes de validación.

```sql
-- Migración: apply_migration "restrict_table_privileges"
revoke all on public.games, public.scores, public.profiles from anon, authenticated;
grant select on public.games, public.scores, public.profiles to anon, authenticated;
grant insert on public.scores to anon, authenticated;
revoke all on sequence public.scores_id_seq from anon, authenticated;
grant usage on sequence public.scores_id_seq to anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
```

```ts
// app/api/contact/route.ts — límites (constantes locales)
const MAX_NAME = 80;
const MAX_EMAIL = 254;
const MAX_MSG = 2000;
```

Convenciones:

- Los límites se miden en caracteres, después de `trim()`.
- "Caracteres de control" = el rango `\u0000-\u001F` y `\u007F`; en `name` se reemplazan por un espacio y se colapsan espacios repetidos antes de componer el asunto.
- Los mensajes de error siguen en español y no revelan detalles internos.
- La respuesta de error de `/api/contact` sigue siendo `{ error: "Campos inválidos" }` (400), igual que hoy.

## Implementation plan

**Flujo de trabajo en git:** `/spec-impl 19-table-privileges-and-endpoint-validation` crea y cambia a la rama `spec-19-table-privileges-and-endpoint-validation`. Cada paso se revisa antes de seguir; no se commitea automáticamente.

1. **Línea base.** Con `execute_sql` registrar `role_table_grants`, el ACL de `scores_id_seq` y `pg_default_acl` (estado de _Por qué existe este spec_), y probar que hoy un `insert` de invitado en `scores` funciona. Sistema funcional: sin cambios.
2. **Migración de privilegios.** Aplicar el SQL de _Data model_ con `apply_migration`. Verificar con `execute_sql` que `anon` y `authenticated` solo tienen `SELECT` en `games`/`profiles`, `SELECT` + `INSERT` en `scores` y `USAGE` en `scores_id_seq`, y que `pg_default_acl` ya no concede a `anon`/`authenticated` en `public`. Verificar con `get_advisors` (seguridad) que no aparecen alertas nuevas.
3. **Probar la app contra la migración.** Con `npm run dev`: cargar `/`, `/games`, `/salon` y `/juegos/<id>`, y guardar un puntaje como invitado y como usuario con sesión (flujo de `lib/scores.ts`). Registrarse y confirmar que el trigger sigue creando el `profile`. Si algo falla, revertir con `grant` y registrarlo como ambigüedad antes de seguir.
4. **`/api/supabase-health`.** Cambiar las dos respuestas de error por `{ ok: false, error: "Servicio no disponible" }` (status 500) y añadir `console.error` con el detalle. Verificar: éxito → `{ ok: true }`; simular fallo (p. ej. `NEXT_PUBLIC_SUPABASE_URL` inválida en una ejecución local) → respuesta genérica y detalle solo en la consola del servidor.
5. **Validación en `/api/contact`.** Añadir comprobación de tipo, las tres constantes de longitud y el saneamiento de `name` para el asunto, conservando el honeypot y el texto plano. Verificar con `curl`: body `{}`, `name` numérico, `name` de 81 caracteres, `msg` de 2001, `email` de 255, `name` con `\n` (el asunto queda en una línea), body válido con `company` (honeypot → `{ ok: true }` sin envío).
6. **Documentación.** Actualizar `references/security/security-checklist.md` (ítem de privilegios mínimos) y `references/security/security-guardian-memory.md` (hallazgos 2, 3 y 4 → `Resuelto`), y `CLAUDE.md` si corresponde.

## Acceptance criteria

- [ ] `role_table_grants` para `anon` y `authenticated` muestra solo `SELECT` en `games` y `profiles`, y solo `SELECT` e `INSERT` en `scores`.
- [ ] `anon` y `authenticated` no tienen `TRUNCATE`, `TRIGGER`, `REFERENCES`, `DELETE` ni `UPDATE` en ninguna de las tres tablas.
- [ ] `scores_id_seq` conserva `USAGE` para `anon` y `authenticated`.
- [ ] `pg_default_acl` del rol `postgres` en `public` ya no concede privilegios sobre tablas ni secuencias a `anon` ni `authenticated`.
- [ ] Una tabla de prueba creada en `public` (en una transacción con `rollback`) nace sin privilegios para `anon`/`authenticated` y con RLS habilitado.
- [ ] Un invitado puede guardar un puntaje y un usuario con sesión puede guardar uno a su nombre; el leaderboard (`/salon`) y las estadísticas siguen cargando.
- [ ] Registrar un usuario nuevo sigue creando su fila en `profiles`.
- [ ] `get_advisors` (seguridad) no reporta alertas nuevas respecto al estado de partida.
- [ ] `GET /api/supabase-health` responde `{ "ok": true }` con la configuración correcta.
- [ ] Con un fallo simulado, `GET /api/supabase-health` responde 500 con `{ "ok": false, "error": "Servicio no disponible" }` y el cuerpo no contiene `error.message` ni `String(err)`; el detalle aparece solo en el log del servidor.
- [ ] `POST /api/contact` con `name` no-string responde 400 `Campos inválidos` (no 500).
- [ ] `POST /api/contact` rechaza con 400 un `name` de 81 caracteres, un `email` de 255 y un `msg` de 2001, y acepta `name` de 80 y `msg` de 2000.
- [ ] Un `name` con saltos de línea llega al asunto como una sola línea, sin `\n` ni `\r`.
- [ ] El honeypot `company` sigue respondiendo `{ ok: true }` sin enviar correo, y un body válido sigue enviándose por Resend.
- [ ] No cambian `lib/scores.ts`, `lib/games.ts`, `proxy.ts`, `lib/session.ts`, `app/auth/**`, `components/games/**`, `GameEngineProps` ni `lib/game-engines.ts`.
- [ ] `npm run build` compila sin errores y `npm run lint` no introduce errores nuevos respecto a la línea base.
- [ ] Los hallazgos 2, 3 y 4 figuran como `Resuelto` en `references/security/security-guardian-memory.md`.

## Decisions

- **Sí:** privilegios mínimos estrictos (`SELECT` en `games` y `profiles`; `SELECT` + `INSERT` en `scores`). Razón: decisión del usuario (opción recomendada); la app no usa nada más y RLS deja de ser la única barrera.
- **No:** solo revocar `TRUNCATE`/`TRIGGER`/`REFERENCES`. Razón: dejar `UPDATE`/`DELETE` abiertos confiando solo en RLS es menos defensa en profundidad.
- **Sí:** conservar `USAGE` en `scores_id_seq`. Razón: el `insert` de invitados lo necesita; se verifica en el paso 3.
- **Sí:** revocar también los privilegios por defecto de `postgres` en `public`. Razón: decisión del usuario; sin esto, cada tabla nueva volvería a nacer abierta.
- **No:** tocar los defaults de `supabase_admin`, `service_role` ni `postgres` como dueño. Razón: son del propio Supabase y el Dashboard/Studio dependen de ellos; fuera de lo que reportó la auditoría.
- **Sí:** mantener `/api/supabase-health` con respuesta genérica. Razón: decisión del usuario; elimina la fuga sin perder el chequeo de conectividad documentado en el SPEC 04.
- **No:** eliminar `/api/supabase-health`. Razón: implicaría actualizar README, `CLAUDE.md` y el SPEC 04 sin que lo pidiera la auditoría.
- **Sí:** límites `name` ≤ 80, `email` ≤ 254, `msg` ≤ 2000. Razón: decisión del usuario (opción recomendada); 254 es el máximo práctico de un correo (RFC 5321) y los otros dos son holgados para un formulario de contacto.
- **Sí:** responder siempre `Campos inválidos` (400) para cualquier fallo de validación. Razón: mantiene el contrato actual del endpoint y no da pistas a un atacante.
- **Sí:** sanear solo `name` para el asunto. Razón: es el único campo que va a una cabecera; `email` ya pasa por `EMAIL_REGEX` sin espacios y `msg` va en el cuerpo de texto plano.
- **No:** rate limit o CAPTCHA en `/api/contact`. Razón: riesgo aceptado en la auditoría y fuera del alcance (necesita almacenamiento compartido o un proveedor externo).

## Risks

| Riesgo                                                                                                   | Mitigación                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revocar privilegios rompe el `insert` de `scores` (por ejemplo, por la secuencia) o alguna lectura.      | El paso 3 prueba lectura y escritura como invitado y con sesión antes de tocar los endpoints; la migración es reversible con `grant`.                    |
| El trigger `on_auth_user_created` deja de crear `profiles`.                                              | Es `SECURITY DEFINER` y no usa los privilegios de `anon`/`authenticated`; el paso 3 registra un usuario nuevo para comprobarlo.                          |
| Revocar los defaults de `postgres` afecta tablas que se creen desde el SQL Editor o futuras migraciones. | Es intencional: cada spec debe conceder explícitamente los privilegios; se documenta en `CLAUDE.md`/el checklist. `rls_auto_enable` sigue activando RLS. |
| Un cambio en el Dashboard o una migración externa vuelve a abrir los privilegios.                        | El agente `security-guardian` los revisa en cada auditoría.                                                                                              |
| Un límite demasiado bajo rechaza mensajes legítimos y el formulario muestra un error poco claro.         | Los límites son holgados (2000 caracteres); el frontend no cambia en este spec y se verifica que el formulario sigue mostrando su error genérico.        |
| Un `console.error` en `/api/supabase-health` podría registrar datos sensibles.                           | Solo se registra el error de Supabase/`catch`, que no contiene claves; no se registra el request.                                                        |

## What is **not** in this spec

- Rate limiting, CAPTCHA o anti-trampas en `scores`.
- Content-Security-Policy.
- Eliminar `/api/supabase-health`.
- Cambios en las políticas RLS, en los defaults de `supabase_admin` o en `service_role`.
- Cambios en el frontend del formulario de contacto.
- Riesgos aceptados y verificaciones de Dashboard de la auditoría.

Cada uno de estos, si se implementa, va en su propio spec.
