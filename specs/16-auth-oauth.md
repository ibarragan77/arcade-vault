# SPEC 16 — Inicio de sesión con Google y GitHub (OAuth)

> **Status:** Implemented
> **Depends on:** SPEC 15, SPEC 04
> **Date:** 2026-10-14
> **Objective:** Activar el inicio de sesión y el registro con Google y GitHub mediante Supabase Auth (OAuth con PKCE), generando automáticamente un `username` válido y único para quien entra por primera vez y vinculando la identidad a la cuenta existente cuando el correo coincide.

## Por qué existe este spec

El SPEC 15 dejó los botones "Google" y "GitHub" de `/login` deshabilitados con la etiqueta "PRÓXIMAMENTE" y separó OAuth en este spec (ver _Decisions_ del SPEC 15). Aquí se activan.

El obstáculo real no es el botón, es el modelo de datos. El trigger `handle_new_user` del SPEC 15 hace `upper(raw_user_meta_data ->> 'username')` y `profiles.username` es `NOT NULL` con un `CHECK` de formato `^[A-Z0-9_]{3,10}$`. Un usuario que llega por Google o GitHub **no trae `username`** en sus metadatos, así que, sin cambios, el `INSERT` en `profiles` falla y Supabase devuelve "Database error saving new user". Por eso este spec modifica el trigger antes de tocar el frontend.

El flujo OAuth también es distinto al de los enlaces de correo: usa PKCE y devuelve un `code`, no un `token_hash`. Necesita su propia ruta (`/auth/callback`); `/auth/confirm` no se toca.

Las apps OAuth (Google Cloud y GitHub) y los proveedores en el Dashboard de Supabase **ya están configurados** (decisión del usuario). El spec solo lista lo que hay que verificar.

## Scope

**In:**

- Botones **Google** y **GitHub** activos en `/login` y también en `/registro`, con un único componente compartido (`components/auth/OAuthButtons.tsx`). Quitan la etiqueta "PRÓXIMAMENTE" y reutilizan los estilos actuales de los botones sociales de `LoginForm.tsx`.
- Función `signInWithOAuth(supabase, provider)` en `lib/auth.ts` que llama a `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${origin}/auth/callback` } })` y devuelve el mismo resultado `{ ok: true } | { ok: false, error, code? }` con el error traducido al español.
- Ruta `app/auth/callback/route.ts` (GET): recibe `code`, llama a `supabase.auth.exchangeCodeForSession(code)` con el cliente de servidor y redirige a `/`. Si falta `code`, si el intercambio falla o si el proveedor devuelve `error` / `error_description`, redirige a `/login?error=oauth`.
- `/login` lee `?error=oauth` y muestra "No se pudo iniciar sesión con ese proveedor. Inténtalo de nuevo." (mismo mecanismo que `?error=enlace`).
- Migración que reemplaza `public.handle_new_user()`:
  - Si `raw_user_meta_data ->> 'username'` viene (registro por correo del SPEC 15), se usa tal cual, en mayúsculas. El comportamiento y el error por duplicado no cambian.
  - Si no viene (OAuth), se **autogenera** un `username` válido y único.
- `/perfil` muestra una fila nueva "Método de acceso" (solo lectura) con los proveedores vinculados: "Correo y contraseña", "Google", "GitHub".
- Vinculación automática de identidades por correo verificado (comportamiento por defecto de Supabase): si entras con Google/GitHub con un correo que ya tiene cuenta, se agrega la identidad a esa cuenta y se conservan `username` y puntajes.
- Documentación: README (URLs a verificar en Supabase, Google y GitHub) y `CLAUDE.md` (rutas y sección de Auth).

**Out of scope (para specs futuros):**

- **Editar el `username`** (ni el autogenerado ni el de correo). Se mantiene el "no editar" del SPEC 15; el usuario quiere poder cambiarlo "luego", y eso va en un spec propio junto con el resto de edición de perfil.
- Foto de perfil / `avatar_url` del proveedor. No se agrega ninguna columna a `profiles`.
- Otros proveedores (Discord, Apple, etc.).
- Vincular o desvincular proveedores manualmente desde `/perfil` (`linkIdentity` / `unlinkIdentity`).
- Pantalla obligatoria de "elige tu username" tras el primer login (se descartó; ver _Decisions_).
- Cambios en el flujo de correo + contraseña, confirmación de correo o recuperación (SPEC 15).
- Que un usuario creado solo por OAuth pueda fijar contraseña desde `/recuperar` como flujo oficial (ver _Risks_).
- Cambiar la política RLS de `scores` o la API de `useSession()`.
- Crear o modificar las apps OAuth en Google Cloud / GitHub y los proveedores en el Dashboard (ya están hechos).

## Data model

```sql
-- Migración: apply_migration "auth_oauth_username_autogen"
-- Reemplaza la función del SPEC 15. El trigger on_auth_user_created no cambia.

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  requested text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  base      text;
  candidate text;
  attempts  int := 0;
begin
  -- Registro por correo (SPEC 15): el username viene del formulario.
  -- Si ya existe, el INSERT falla igual que antes y el signUp devuelve error.
  if requested is not null then
    insert into public.profiles (id, username) values (new.id, upper(requested));
    return new;
  end if;

  -- OAuth: sin username. Se deriva del proveedor y se completa con 4 dígitos.
  base := upper(regexp_replace(
    coalesce(
      new.raw_user_meta_data ->> 'user_name',          -- GitHub
      new.raw_user_meta_data ->> 'preferred_username',
      new.raw_user_meta_data ->> 'name',               -- Google
      split_part(new.email, '@', 1),
      ''
    ),
    '[^A-Za-z0-9_]', '', 'g'));
  base := left(base, 6);
  if base = '' then base := 'PLAYER'; end if;

  loop
    candidate := base || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where username = candidate);
    attempts := attempts + 1;
    if attempts >= 10 then
      candidate := 'P' || upper(substr(md5(new.id::text), 1, 9)); -- 10 chars, sin colisión práctica
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;
```

```ts
// lib/auth.ts — función nueva (cliente de navegador)
export type OAuthProvider = "google" | "github";
export async function signInWithOAuth(
  supabase: SupabaseClient,
  provider: OAuthProvider,
): Promise<AuthResult>; // misma forma { ok: true } | { ok: false, error, code? } del resto del archivo
```

Convenciones:

- Sin tablas ni columnas nuevas. `profiles`, `scores` y las políticas RLS no cambian.
- El `username` autogenerado cumple siempre `^[A-Z0-9_]{3,10}$`: prefijo de hasta 6 caracteres `[A-Z0-9_]` + 4 dígitos (máx. 10). Las letras con tilde o ñ se descartan al limpiar (p. ej. "Iván" → `IVN`), no se transliteran.
- Si el nombre del proveedor queda vacío tras limpiar, el prefijo es `PLAYER`.
- La sesión sigue en cookies de `@supabase/ssr`; el `code_verifier` de PKCE también vive en cookies, por eso el inicio y el retorno deben ocurrir en el **mismo navegador**.
- No se añaden variables de entorno. Se reutilizan `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `redirectTo` se arma con `window.location.origin`, así que funciona igual en local y en producción siempre que ambas URLs estén en _Redirect URLs_.

## Implementation plan

**Flujo de trabajo en git:** `/spec-impl 16-auth-oauth` crea y cambia a la rama `spec-16-auth-oauth`. Cada paso se revisa antes de seguir; no se commitea automáticamente.

**Verificación previa (Dashboard / consolas externas, ya configurado según el usuario; confirmar antes del paso 1):**

- Supabase → Authentication → Providers: **Google** y **GitHub** activados con su Client ID / Secret.
- Supabase → Authentication → URL Configuration: `http://localhost:3000/auth/callback` (y la URL de producción equivalente) en _Redirect URLs_.
- Google Cloud y GitHub: la _Authorized redirect URI_ / _Authorization callback URL_ es `https://<ref-del-proyecto>.supabase.co/auth/v1/callback`.

Pasos:

1. **Migración del trigger.** Aplicar el SQL de _Data model_ con `apply_migration`. Verificar con `execute_sql` (en una transacción con `rollback` o limpiando después) que: (a) un `INSERT` en `auth.users` con `raw_user_meta_data = '{"username":"ABC"}'` crea el perfil `ABC`; (b) uno con `'{"user_name":"octocat"}'` crea un perfil que cumple el `CHECK`; (c) uno sin metadatos ni nombre crea un perfil `PLAYERnnnn`. Correr `get_advisors` (seguridad) y confirmar que no hay alertas nuevas. Sistema funcional: el registro por correo del SPEC 15 sigue igual.
2. **Capa de auth.** Agregar `signInWithOAuth` a `lib/auth.ts` (con mapeo de errores a español, sin mostrar texto crudo) y crear `app/auth/callback/route.ts`. Antes de escribirla, revisar `node_modules/next/dist/docs/01-app/` para la convención vigente de Route Handlers y `cookies()`. Probar la ruta sin `code` (debe redirigir a `/login?error=oauth`).
3. **Componente `OAuthButtons`.** Crear `components/auth/OAuthButtons.tsx` (Client Component) con los dos botones, estado de carga que deshabilita ambos mientras redirige y mensaje de error accesible (`role="alert"`) si `signInWithOAuth` falla. Reutilizar los estilos actuales de los botones sociales.
4. **`/login`.** Sustituir los dos botones deshabilitados "PRÓXIMAMENTE" de `LoginForm.tsx` por `<OAuthButtons />` y manejar `?error=oauth` en `app/login/page.tsx` + `LoginForm.tsx`, junto al `?error=enlace` existente.
5. **`/registro`.** Agregar `<OAuthButtons />` con un separador "o" respecto al formulario, mismo patrón visual que en `/login`.
6. **`/perfil`.** Leer `user.identities` en `app/perfil/page.tsx` y mostrar la fila "Método de acceso" con los proveedores vinculados (etiquetas en español; `email` → "Correo y contraseña"). Si `user.email` es nulo (GitHub con correo privado), mostrar "—" en la fila de correo.
7. **Documentación.** Actualizar el README (sección Autenticación: proveedores, _Redirect URLs_ y callbacks de Google/GitHub) y `CLAUDE.md` (rutas `/auth/callback`, botones activos en `/login` y `/registro`, mención del `username` autogenerado y del trigger actualizado).

## Acceptance criteria

- [ ] La migración se aplica sin error y `get_advisors` (seguridad) no reporta alertas nuevas.
- [ ] Un `INSERT` en `auth.users` con `username` en los metadatos crea el perfil con ese valor en mayúsculas; con un `username` duplicado falla (comportamiento del SPEC 15 intacto).
- [ ] Un `INSERT` en `auth.users` sin `username` crea un perfil cuyo `username` cumple `^[A-Z0-9_]{3,10}$` y es único; si el nombre queda vacío tras limpiar, el prefijo es `PLAYER`.
- [ ] Los botones Google y GitHub aparecen **habilitados** en `/login` y en `/registro`, y la etiqueta "PRÓXIMAMENTE" ya no existe en el código.
- [ ] Pulsar "Google" lleva a la pantalla de consentimiento de Google; pulsar "GitHub" lleva a la de GitHub.
- [ ] Tras autorizar con Google, se vuelve por `/auth/callback`, queda la sesión iniciada, se redirige a `/` y `Nav` muestra el `username` autogenerado.
- [ ] Lo mismo con GitHub.
- [ ] Un usuario nuevo por OAuth tiene una fila en `profiles` con un `username` válido (verificado con `execute_sql`).
- [ ] Iniciar sesión con Google/GitHub usando el correo de una cuenta ya existente de correo + contraseña **no crea un usuario nuevo**: se agrega la identidad y se conservan `username` y puntajes (verificado en _Auth → Users_ y en `profiles`).
- [ ] Cancelar el consentimiento en el proveedor, o abrir `/auth/callback` sin `code` o con un `code` inválido, redirige a `/login?error=oauth` y `/login` muestra el mensaje en español.
- [ ] `/perfil` muestra "Método de acceso" con "Google", "GitHub" y/o "Correo y contraseña" según las identidades; con `email` nulo no se rompe.
- [ ] Un puntaje guardado con sesión OAuth queda con `user_id = auth.uid()` y `name = username`, y aparece en `/salon`.
- [ ] Recargar la página mantiene la sesión y "Cerrar sesión" desde `/perfil` la elimina.
- [ ] El inicio de sesión por correo + contraseña, el registro, la confirmación, la recuperación y "Jugar como invitado" siguen funcionando.
- [ ] No cambian `proxy.ts`, `lib/session.ts`, `app/auth/confirm/route.ts`, `components/games/**`, `GameEngineProps` ni `lib/game-engines.ts`.
- [ ] `npm run build` compila sin errores de TypeScript y `npm run lint` no reporta errores.

## Decisions

- **Sí:** `username` autogenerado en el trigger para usuarios OAuth. Razón: decisión explícita del usuario (opción recomendada). Entra directo al juego sin pasos extra y mantiene la unicidad garantizada por la base de datos.
- **Sí:** el `username` autogenerado se puede cambiar "luego", pero la edición queda **fuera** de este spec. Razón: el usuario eligió "editable luego"; hacerlo aquí arrastraría validación, unicidad en actualización, política RLS de `UPDATE` sobre `profiles` y pantalla de edición, es decir otro dominio completo. Se mantiene el "no editar username" del SPEC 15 hasta ese spec.
- **Sí:** vinculación automática de identidades por correo verificado. Razón: decisión explícita del usuario (opción recomendada) y es el comportamiento por defecto de Supabase; Google y GitHub devuelven correos verificados, así que no hay riesgo de apropiarse de una cuenta ajena. Evita cuentas duplicadas y puntajes repartidos.
- **Sí:** botones en `/login` y `/registro`, y "Método de acceso" en `/perfil`. Razón: decisión explícita del usuario. Es lo mínimo para que el flujo se entienda desde cualquier entrada.
- **Sí:** un componente compartido `OAuthButtons`. Razón: el mismo par de botones, su estado de carga y su manejo de errores aparecen en dos pantallas; duplicarlos garantiza que diverjan.
- **Sí:** ruta propia `/auth/callback` con `exchangeCodeForSession`, sin tocar `/auth/confirm`. Razón: OAuth con PKCE devuelve `code`, el correo devuelve `token_hash` + `type`. Son contratos distintos y mezclarlos complica una ruta que ya funciona.
- **Sí:** el flujo de registro por correo conserva su error por `username` duplicado. Razón: ahí el usuario eligió el nombre y necesita saber que no está disponible; en OAuth nadie lo eligió, así que se resuelve solo con el sufijo numérico.
- **Sí:** asumir las apps OAuth y los proveedores ya configurados. Razón: decisión del usuario. El spec solo lista qué verificar (_Redirect URLs_ y callbacks) antes del paso 1.
- **Sí:** `proxy.ts` sin cambios. Razón: su `matcher` ya cubre `/auth/callback`, que es público y no está protegido; refresca la cookie de sesión en las peticiones siguientes.
- **No:** pantalla obligatoria de "elige tu username" tras el primer login. Razón: añade un estado de "perfil incompleto" que habría que proteger en todas las rutas y rompe la promesa de entrar directo a jugar.
- **No:** guardar `avatar_url`. Razón: el usuario no lo pidió; implica columna nueva, política de lectura y UI en `Nav` y `/perfil`.
- **No:** rechazar el inicio OAuth cuando el correo ya existe. Razón: es la alternativa más segura pero obliga a desactivar el _linking_ automático y a manejar un error nuevo; el usuario eligió vincular.
- **No:** transliterar tildes y ñ al generar el `username`. Razón: añadiría la extensión `unaccent` y complejidad por un caso cosmético; el sufijo numérico mantiene la unicidad.
- **No:** `linkIdentity` / `unlinkIdentity` desde `/perfil`. Razón: es gestión de cuenta, otro spec; hoy la vinculación ocurre sola al iniciar sesión.

## Risks

| Riesgo                                                                                                                                                    | Mitigación                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El trigger es `security definer` sobre `auth.users`; un error en la nueva versión bloquea **todos** los registros, también los de correo.                 | `search_path` fijo, nombres calificados con `public.`, y el paso 1 prueba los tres casos (con `username`, con `user_name`, sin nada) y corre `get_advisors` antes de tocar el frontend.                          |
| `Redirect URLs` o callbacks mal configurados rompen el retorno del proveedor (error `redirect_uri_mismatch` o vuelta a `/login`).                         | La "Verificación previa" lista cada URL exacta; el criterio de aceptación de punta a punta lo comprueba. Si `redirectTo` no está en la lista, Supabase cae al _Site URL_ y el `code` llega a la ruta equivocada. |
| Vinculación automática: si en el futuro se agrega un proveedor con correos no verificados, alguien podría tomar una cuenta ajena.                         | Hoy solo se habilitan Google y GitHub (correo verificado). Documentado: no agregar proveedores sin revisar este supuesto.                                                                                        |
| Una cuenta por correo con confirmación pendiente y luego login OAuth con el mismo correo puede producir una identidad ya confirmada.                      | Comportamiento propio de Supabase y esperable (el proveedor ya verificó el correo). Se comprueba en _Auth → Users_ al probar el criterio de vinculación.                                                         |
| GitHub puede no devolver correo (correo privado sin permiso `user:email`), dejando `user.email` nulo; `lib/auth.ts` o `/perfil` asumirían texto.          | `/perfil` muestra "—" si es nulo. Nada en `useSession()` depende del correo. Se anota en el criterio de aceptación de `/perfil`.                                                                                 |
| El `code_verifier` PKCE vive en cookies: abrir el retorno en otro navegador o con cookies bloqueadas falla el intercambio.                                | El fallo redirige a `/login?error=oauth` con mensaje claro; no hay estado intermedio roto.                                                                                                                       |
| Un usuario creado solo por OAuth no tiene contraseña; `/recuperar` le enviaría un enlace que sí le permitiría fijar una, lo que agrega identidad `email`. | No se bloquea ni se promociona. Es consistente con la vinculación automática y queda fuera de este spec; se documentará si el comportamiento sorprende en las pruebas.                                           |
| `random()` produce colisiones de `username` bajo carga o con prefijos comunes ("JUGADO").                                                                 | Hasta 10 reintentos y un respaldo `P` + 9 caracteres derivados de `md5(id)`. Además el índice único de `profiles.username` es la última barrera.                                                                 |

## What is **not** in this spec

- Editar `username`, correo o contraseña desde `/perfil`.
- Foto de perfil / `avatar_url`.
- Otros proveedores OAuth.
- Vincular o desvincular proveedores a mano.
- Pantalla obligatoria de elección de `username`.
- Cambios al flujo de correo + contraseña o a la política RLS de `scores`.

Cada uno de estos, si se implementa, va en su propio spec.
