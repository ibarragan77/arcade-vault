# SPEC 17 — Endurecimiento de seguridad básico

> **Status:** Approved
> **Depends on:** SPEC 04, SPEC 06, SPEC 15
> **Date:** 2026-10-14
> **Objective:** Aplicar el checklist de seguridad de `references/security/security-checklist.md`: verificar RLS, exigir contraseñas fuertes (mínimo 8 con minúsculas, mayúsculas, dígitos y símbolos), limitar signups por IP, añadir headers de seguridad en Next.js y cerrar las alertas de `get_advisors`.

## Por qué existe este spec

El checklist mezcla tres tipos de cambio: **código** (`next.config.ts`, `lib/auth.ts`), **base de datos** (una migración) y **ajustes del Dashboard de Supabase** (requisitos de contraseña, rate limits). Un solo spec los agrupa porque son un mismo objetivo (superficie de ataque mínima antes de publicar), pero cada paso del plan indica claramente dónde vive el cambio.

Estado verificado el 2026-10-14 (consulta a Supabase):

- RLS **ya está habilitado** en `games`, `scores` y `profiles`, con políticas: `games_select_public`, `profiles_select_public`, `scores_select_public` y `scores_insert_guest_or_self`.
- `get_advisors` reporta 3 WARN: `public.rls_auto_enable()` es `SECURITY DEFINER` y ejecutable por `anon` y por `authenticated` (vía `/rest/v1/rpc/rls_auto_enable`), y la protección contra contraseñas filtradas está desactivada.
- `proxy.ts` ya protege `/perfil` (convención `proxy` de Next 16) y `app/perfil/page.tsx` vuelve a comprobar `getUser()` y redirige a `/login` si no hay sesión. El resto del sitio es público a propósito (el invitado puede jugar y guardar puntaje).
- `lib/auth.ts` solo valida el largo (`PASSWORD_MIN = 8`); no exige clases de caracteres.
- `next.config.ts` no define `headers`.
- El plan de Supabase es **Free** (decisión del usuario): _Leaked password protection_ requiere plan Pro y no puede activarse.

## Scope

**In:**

- **RLS (solo verificación):** confirmar con `list_tables` y `pg_policies` que `games` y `scores` tienen RLS habilitado y políticas coherentes. Sin migración nueva.
- **Protección de rutas con `proxy.ts` (solo verificación):** confirmar que `proxy.ts` (SPEC 15) redirige `/perfil` a `/login` sin sesión, que las demás rutas siguen públicas y que `app/perfil/page.tsx` repite la comprobación en el servidor. Sin cambios de código.
- **Migración `revoke_execute_rls_auto_enable`:** `revoke execute on function public.rls_auto_enable() from public, anon, authenticated`. El event trigger `ensure_rls` sigue funcionando porque se ejecuta como evento del motor, no por RPC.
- **Requisitos de contraseña** (las 4 clases): mínimo 8 caracteres, al menos una minúscula, una mayúscula, un dígito y un símbolo.
  - Ajuste en el Dashboard de Supabase (Authentication → Sign In / Providers → Password requirements): _Minimum password length_ = 8 y _Lowercase, uppercase letters, digits and symbols_. Es el respaldo del servidor.
  - `validatePassword` en `lib/auth.ts` aplica la misma regla en el cliente con mensajes en español, y el mapeo de `weak_password` deja de decir solo "al menos 8 caracteres".
  - Las pantallas `/registro` y `/restablecer` muestran la regla completa como texto de ayuda en lugar de "Mínimo 8 caracteres.".
- **Límite de signups por IP:** bajar _Rate Limits → Sign-ups and sign-ins_ (por IP) en el Dashboard a un valor definido en el paso 4. Sin código.
- **Headers de seguridad en `next.config.ts`** para todas las rutas: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (cámara, micrófono y geolocalización deshabilitados) y `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- **Leaked password protection:** dejarla documentada como **no aplicable en plan Free** (README) y como alerta aceptada hasta que se pase a Pro.
- Documentación: README (sección Seguridad con los ajustes del Dashboard) y `CLAUDE.md` (regla de contraseña y headers); marcar el checklist de `references/security/security-checklist.md`.

**Out of scope (para specs futuros):**

- **Content-Security-Policy.** Riesgo alto de romper canvas, sprites, Supabase y OAuth; requiere su propio spec con pruebas extensas.
- **CAPTCHA** (Turnstile / hCaptcha) en `/registro`.
- **Límite de peticiones propio** en `proxy.ts` o en `/api/contact`.
- **Endurecer las políticas de `scores`** (validar rango de `score`, longitud de `name`, límite de inserciones por IP).
- **Forzar el cambio de contraseña** de cuentas existentes que no cumplan la nueva regla.
- Activar _Leaked password protection_ (requiere plan Pro).
- Rotación de claves, auditoría de dependencias, MFA.
- Cambios en OAuth (SPEC 16), `useSession()`, `proxy.ts` o `components/games/**`.

## Data model

Este spec no introduce tablas ni columnas. Solo una migración de permisos y constantes de validación.

```sql
-- Migración: apply_migration "revoke_execute_rls_auto_enable"
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
```

```ts
// lib/auth.ts — validatePassword extendido (misma firma: string | null)
// Regla: length >= PASSWORD_MIN y al menos una [a-z], una [A-Z], un [0-9] y un símbolo.
export const PASSWORD_HINT: string; // texto de ayuda compartido por /registro y /restablecer
```

```ts
// next.config.ts
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];
// headers: async () => [{ source: "/(.*)", headers: securityHeaders }]
```

Convenciones:

- "Símbolo" = cualquier carácter que no sea letra ni dígito ASCII (`[^A-Za-z0-9]`). Coincide con la lista de símbolos de Supabase.
- Los mensajes de error siguen en español y nunca muestran texto crudo de Supabase.
- `PASSWORD_MIN` se mantiene en 8 y sigue siendo la única fuente del mínimo.

## Implementation plan

**Flujo de trabajo en git:** `/spec-impl 17-security-hardening` crea y cambia a la rama `spec-17-security-hardening`. Cada paso se revisa antes de seguir; no se commitea automáticamente.

1. **Verificar RLS.** Con `list_tables` y `pg_policies` confirmar que `games`, `scores` y `profiles` tienen RLS y las 4 políticas esperadas. Registrar el resultado; no se cambia nada. Sistema funcional: sin cambios.
2. **Migración de `rls_auto_enable`.** Aplicar el `revoke` de _Data model_ con `apply_migration`. Verificar con `get_advisors` (seguridad) que desaparecen las 2 alertas `*_security_definer_function_executable`, y con `execute_sql` que `has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')` es `false`. Comprobar que crear una tabla de prueba en `public` (dentro de una transacción con `rollback`) sigue activando RLS por el event trigger.
3. **Headers en Next.js.** Revisar `node_modules/next/dist/docs/01-app/` para la convención vigente de `headers` en `next.config.ts` y añadir `securityHeaders` conservando `allowedDevOrigins`. Verificar con `curl -I http://localhost:3000/` y en `/juegos/[id]/jugar`, `/login` y `/api/supabase-health` que los 5 headers llegan.
4. **Rate limit de signups (Dashboard).** Definir el valor (propuesta: 5 signups/sign-ins por IP por hora para `Sign-ups and sign-ins`; confirmar contra los límites disponibles en el plan Free) y aplicarlo en Authentication → Rate Limits. Sin código. Documentar el valor final en el README.
5. **Requisitos de contraseña (Dashboard).** Activar _Minimum password length_ = 8 y _Lowercase, uppercase letters, digits and symbols_ en Authentication → Sign In / Providers. Verificar con un `signUp` de prueba contra la API que una contraseña débil devuelve `weak_password`.
6. **Validación en el cliente.** Extender `validatePassword` en `lib/auth.ts` con las 4 clases, exportar `PASSWORD_HINT`, actualizar el mensaje de `weak_password` en `mapError` y reemplazar el texto "Mínimo {PASSWORD_MIN} caracteres." en `app/registro/page.tsx` y `app/restablecer/page.tsx` por `PASSWORD_HINT`. Prueba manual: cada clase faltante muestra el error y una contraseña válida pasa.
7. **Leaked password protection y documentación.** Documentar en README (sección Seguridad) los ajustes del Dashboard, el valor del rate limit y que _Leaked password protection_ queda pendiente por plan Free; actualizar `CLAUDE.md` (regla de contraseña, headers) y marcar los ítems del checklist de `references/security/security-checklist.md` que quedaron cubiertos.

8. **Verificar la protección de rutas.** Sin sesión (ventana privada o `curl -I -L` sin cookies): `/perfil` y `/perfil/` responden con redirección a `/login`, mientras `/`, `/games`, `/salon`, `/juegos/<id>/jugar`, `/login`, `/registro`, `/recuperar` y `/auth/callback` no redirigen a `/login` por falta de sesión. Con sesión: `/perfil` carga. Confirmar en `proxy.ts` que `PROTECTED_PATHS` solo contiene `/perfil` y que el `matcher` sigue cubriendo las rutas y los headers del paso 3 llegan también en la redirección. No se modifica código; si algo falla, se registra como hallazgo para un spec nuevo.

## Acceptance criteria

- [ ] `list_tables` muestra `rls_enabled: true` en `games`, `scores` y `profiles`, y `pg_policies` conserva las 4 políticas existentes sin cambios.
- [ ] `get_advisors` (seguridad) ya no reporta `anon_security_definer_function_executable` ni `authenticated_security_definer_function_executable`.
- [ ] La única alerta de seguridad restante es `auth_leaked_password_protection`, y está documentada en el README como no aplicable en plan Free.
- [ ] `anon` y `authenticated` no pueden ejecutar `public.rls_auto_enable()`, y una tabla nueva creada en `public` sigue naciendo con RLS habilitado.
- [ ] `curl -I` a `/`, `/login`, `/juegos/<id>/jugar` y `/api/supabase-health` devuelve `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` y `Strict-Transport-Security`.
- [ ] Los juegos (canvas, sprites, controles táctiles), el login con correo, Google y GitHub y el formulario de contacto siguen funcionando con los headers activos.
- [ ] En Supabase, _Minimum password length_ = 8 y _Lowercase, uppercase letters, digits and symbols_ están activos, y un `signUp` con `abcdefgh` es rechazado con `weak_password`.
- [ ] `validatePassword` rechaza, con mensaje en español, una contraseña de menos de 8 caracteres, una sin minúscula, una sin mayúscula, una sin dígito y una sin símbolo, y acepta `Abcdef1!`.
- [ ] `/registro` y `/restablecer` muestran `PASSWORD_HINT` y no el texto "Mínimo 8 caracteres.".
- [ ] El rate limit de signups por IP tiene el valor definido en el paso 4 y está registrado en el README.
- [ ] Una cuenta existente puede iniciar sesión aunque su contraseña no cumpla la nueva regla.
- [ ] Sin sesión, `/perfil` redirige a `/login`; con sesión, carga normalmente.
- [ ] Sin sesión, `/`, `/games`, `/salon`, `/juegos/<id>/jugar`, `/login` y `/registro` siguen siendo accesibles (el invitado puede jugar).
- [ ] `PROTECTED_PATHS` en `proxy.ts` contiene únicamente `/perfil`, y `app/perfil/page.tsx` mantiene su propia comprobación de `getUser()`.
- [ ] No cambian `proxy.ts`, `lib/session.ts`, `app/auth/**`, `components/games/**`, `GameEngineProps` ni `lib/game-engines.ts`.
- [ ] `npm run build` compila sin errores de TypeScript y `npm run lint` no reporta errores.

## Decisions

- **Sí:** RLS solo se verifica. Razón: ya está habilitado en las tablas con políticas coherentes; una migración sería ruido.
- **Sí:** la protección de rutas solo se verifica, no se amplía. Razón: `proxy.ts` ya cubre `/perfil`, la única ruta que exige sesión; proteger más rutas rompería el modo invitado. La comprobación duplicada en la página es defensa en profundidad, porque el proxy solo redirige y no es la barrera de los datos (esa es RLS).
- **Sí:** `revoke execute` sobre `rls_auto_enable()`. Razón: decisión del usuario (opción recomendada). Cierra el RPC público sin mover la función ni tocar el event trigger `ensure_rls`.
- **No:** mover la función a otro esquema. Razón: más invasivo y puede romper el event trigger.
- **No:** ignorar las alertas. Razón: exponen una función `SECURITY DEFINER` en la API pública.
- **Sí:** las 4 clases de caracteres (minúscula, mayúscula, dígito y símbolo). Razón: decisión explícita del usuario.
- **Sí:** validar en cliente **y** en el Dashboard. Razón: el cliente da mensajes inmediatos en español y el Dashboard es la barrera real, porque el cliente se puede saltar llamando a la API directamente.
- **Sí:** no tocar cuentas existentes. Razón: la regla solo aplica al registrar o cambiar contraseña; hoy hay un solo usuario y forzar el cambio añadiría un flujo nuevo.
- **Sí:** _Leaked password protection_ queda pendiente. Razón: el plan es Free y la opción requiere Pro; se documenta para activarla al migrar de plan.
- **No:** lista de contraseñas comunes en el cliente como sustituto. Razón: no la pidió el usuario, aumenta el peso del bundle y la cobertura sería parcial.
- **Sí:** rate limits nativos de Supabase Auth para signups por IP. Razón: decisión del usuario (opción recomendada); sin código, aplicados antes de llegar a la app.
- **No:** CAPTCHA ni límite propio en `proxy.ts`. Razón: el primero necesita cuenta del proveedor y UI nueva; el segundo es frágil en serverless sin almacenamiento compartido.
- **Sí:** además de los 3 headers del checklist, `Permissions-Policy` y HSTS. Razón: decisión del usuario (opción recomendada); bajo riesgo de romper el sitio.
- **No:** `Content-Security-Policy`. Razón: puede romper canvas, sprites, Supabase y OAuth; merece su propio spec.
- **Sí:** `X-Frame-Options: DENY`. Razón: el sitio no se incrusta en iframes en ninguna parte.

## Risks

| Riesgo                                                                                                         | Mitigación                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| El `revoke` rompe el event trigger `ensure_rls` y las tablas nuevas nacen sin RLS.                             | El paso 2 prueba crear una tabla en una transacción con `rollback` y comprueba que RLS queda activo.                                    |
| HSTS con `includeSubDomains` sobre un dominio con subdominios sin HTTPS los deja inaccesibles por 2 años.      | Solo se sirve por HTTPS (hosting de producción); en `localhost` los navegadores lo ignoran. Revisar subdominios antes de desplegar.     |
| Un rate limit demasiado bajo bloquea a usuarios legítimos detrás de la misma IP (NAT, colegio, red móvil).     | Valor propuesto moderado en el paso 4, ajustable desde el Dashboard sin desplegar. Se documenta en el README.                           |
| Las cuentas existentes con contraseña débil siguen siendo débiles.                                             | Aceptado: solo hay 1 usuario hoy y el cambio forzado queda fuera de alcance.                                                            |
| La regla del cliente y la del Dashboard divergen (p. ej. otra lista de símbolos) y el cliente deja pasar algo. | El cliente considera símbolo cualquier carácter no alfanumérico; si el servidor rechaza, `weak_password` se traduce a un mensaje claro. |
| `X-Frame-Options: DENY` o `Permissions-Policy` rompen algo no previsto (p. ej. un iframe de OAuth o sensores). | Criterio de aceptación explícito de juegos, login con proveedores y contacto con los headers activos.                                   |
| Los cambios del Dashboard no quedan en el repo y se pierden al recrear el proyecto.                            | El paso 7 los documenta en el README con los valores exactos.                                                                           |

## What is **not** in this spec

- Content-Security-Policy.
- CAPTCHA o rate limiting propio en la app.
- Endurecimiento de las políticas de `scores`.
- Activar _Leaked password protection_ (plan Pro).
- Forzar el cambio de contraseñas existentes.
- MFA, rotación de claves o auditoría de dependencias.

Cada uno de estos, si se implementa, va en su propio spec.
