# SPEC 15 — Registro, inicio de sesión y autenticación real con Supabase Auth

> **Status:** Implemented
> **Depends on:** SPEC 04, SPEC 06
> **Date:** 2026-10-14
> **Objective:** Reemplazar la sesión simulada de `localStorage` por autenticación real con Supabase Auth (correo + contraseña, confirmación por correo y recuperación de contraseña), con pantallas `/login`, `/registro` y `/perfil`, un `username` único por jugador y puntajes vinculados al usuario autenticado.

## Por qué existe este spec

Hoy `/login` no autentica a nadie: `lib/session.ts` guarda `{ name }` en `localStorage` y cualquier texto sirve como "usuario". La tabla `scores` acepta `INSERT` público con un `name` libre, así que nada impide que dos personas usen el mismo nombre o que alguien se haga pasar por otro en el salón de la fama.

Este spec agrega identidad real **sin romper al invitado**: quien no inicia sesión sigue pudiendo jugar y guardar puntaje con nombre libre, como hoy.

El pedido original incluía también inicio de sesión con Google y GitHub. Se **separa en otro spec** (ver _Decisions_) porque depende de configuración externa (apps OAuth en Google Cloud y GitHub, proveedores en el dashboard de Supabase) que no se puede verificar desde el código.

## Scope

**In:**

- Autenticación con **Supabase Auth**, método correo + contraseña, con **confirmación de correo obligatoria** mediante enlace.
- Pantallas nuevas o reescritas (todas en español, con el estilo visual actual de `.auth-card`):
  - `/login` — inicio de sesión (correo + contraseña), enlace "¿Olvidaste tu contraseña?", enlace a `/registro` y botón "Jugar como invitado" (se conserva).
  - `/registro` — formulario con `username`, correo, contraseña y confirmación de contraseña. Al enviar, muestra el estado "Revisa tu correo para confirmar tu cuenta".
  - `/recuperar` — pide el correo y envía el enlace de recuperación.
  - `/restablecer` — fija la nueva contraseña (se llega desde el enlace del correo, con sesión de recuperación).
  - `/perfil` — muestra `username` y correo, y un botón "Cerrar sesión". Requiere sesión; sin ella redirige a `/login`.
- Ruta `app/auth/confirm/route.ts` (GET): recibe `token_hash` y `type` del enlace del correo, llama a `supabase.auth.verifyOtp` y redirige a `/` (confirmación de registro) o a `/restablecer` (recuperación).
- Botones "Google" y "GitHub" de la UI actual: se **muestran deshabilitados** con la etiqueta "PRÓXIMAMENTE". No hacen nada.
- Tabla `public.profiles` con `username` único, creada automáticamente por un trigger al crearse el usuario en `auth.users`.
- Columna `scores.user_id` (nullable) y política RLS que impide suplantar a otro usuario.
- `lib/session.ts` reescrito para leer la sesión real de Supabase. **Se mantiene la forma de la API**: `useSession()` sigue devolviendo `{ user, login, loginAsGuest, logout }` con `user: { name: string } | null`, donde `name` es el `username`. Así `Nav.tsx`, `GamePlayer.tsx` y los motores casi no cambian.
- `proxy.ts` en la raíz (convención de Next 16, reemplaza a `middleware.ts`): refresca la sesión de Supabase en cada request y protege solo `/perfil`.
- Al guardar un puntaje con sesión activa, `saveScore` envía `user_id` y el `name` es el `username` del perfil. Sin sesión, funciona como hoy (nombre libre, `user_id` nulo).
- Actualizar `.env.example` y el README con las URLs de redirección que hay que configurar en Supabase.

**Out of scope (para specs futuros):**

- **Inicio de sesión con Google y GitHub (OAuth).** Va en un spec propio (propuesto: `16-auth-oauth`). Aquí los botones quedan deshabilitados.
- Exigir login para jugar o para guardar puntaje. El invitado se mantiene.
- Migrar o reclamar puntajes anteriores guardados con nombre libre: las filas existentes quedan con `user_id = NULL`.
- Cambiar `username`, cambiar correo, cambiar contraseña desde `/perfil`, eliminar cuenta o subir avatar.
- Roles, permisos de administración o moderación del salón.
- Autenticación de dos factores.
- Restringir el `INSERT` de `scores` solo a usuarios autenticados o validar el puntaje en servidor (anti-trampas). Hoy el puntaje lo envía el cliente y sigue siendo así.
- Personalizar las plantillas de correo de Supabase o configurar SMTP propio (ver _Risks_).
- Migrar el formulario de contacto (SPEC 03) o cualquier otra ruta a requerir sesión.

## Data model

```sql
-- Migración: supabase/migrations o apply_migration "auth_profiles_and_score_user"

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null,
  created_at  timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Z0-9_]{3,10}$')
);
create unique index profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;
-- Lectura pública (el username se muestra en el salón); sin INSERT/UPDATE/DELETE desde el cliente.
create policy profiles_select_public on public.profiles for select using (true);

-- Trigger: crea el perfil al registrarse, tomando raw_user_meta_data->>'username' (en mayúsculas).
-- Función security definer con search_path fijo. Si el username ya existe, el INSERT falla
-- y Supabase devuelve error en el signUp (no se crea el usuario).
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, upper(new.raw_user_meta_data ->> 'username'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Puntajes vinculados al usuario (nullable: invitados y filas históricas)
alter table public.scores add column user_id uuid references auth.users (id) on delete set null;
create index scores_user_id_idx on public.scores (user_id);

-- Reemplaza scores_insert_public: o es invitado (user_id nulo) o es tu propio user_id
drop policy scores_insert_public on public.scores;
create policy scores_insert_guest_or_self on public.scores for insert
  with check (user_id is null or user_id = auth.uid());
```

```ts
// lib/session.ts — la API pública no cambia de forma
export type SessionUser = { name: string } | null; // name = profiles.username

// lib/auth.ts — funciones nuevas (cliente de navegador, sin estado React)
export type SignUpInput = { username: string; email: string; password: string };
export const USERNAME_RE = /^[A-Za-z0-9_]{3,10}$/; // se guarda en mayúsculas
export const PASSWORD_MIN = 8;
// signUp, signIn, signOut, requestPasswordReset, updatePassword → envuelven supabase.auth.*

// lib/scores.ts
export async function saveScore(
  supabase: SupabaseClient,
  entry: { game: string; score: number; name: string; userId?: string },
): Promise<void>;
```

Convenciones:

- El `username` se normaliza a mayúsculas en cliente (para el input) y en el trigger (fuente de verdad), consistente con el formato actual del salón.
- La sesión vive en cookies gestionadas por `@supabase/ssr`; no se guarda nada en `localStorage`. La clave antigua `av_user` se elimina al primer arranque.
- Mensajes de error al usuario en español; nunca se muestra el texto crudo de Supabase.
- No se añaden variables de entorno nuevas: se reutilizan `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Implementation plan

**Flujo de trabajo en git:** `/spec-impl 15-auth-registro-login` crea y cambia a la rama `spec-15-auth-registro-login`. Cada paso se revisa antes de seguir; no se commitea automáticamente.

**Prerrequisito manual (Dashboard de Supabase), antes del paso 1:**

- Authentication → Providers → Email: activado, "Confirm email" activado.
- Authentication → URL Configuration: `Site URL` = URL de la app; agregar `http://localhost:3000/auth/confirm` a _Redirect URLs_.
- Authentication → Email Templates: en "Confirm signup" y "Reset password", apuntar el enlace a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (y `type=recovery` para recuperación).

Pasos:

1. **Migración de base de datos.** Aplicar el SQL de _Data model_ (`profiles`, trigger, `scores.user_id`, política nueva). Verificar con `get_advisors` que no hay alertas de seguridad nuevas y que las filas existentes de `scores` siguen intactas. Sistema funcional: la app no cambia todavía y el `INSERT` de invitados sigue funcionando.
2. **Capa de auth.** Crear `lib/auth.ts` (wrappers de `supabase.auth.*` con validación de `USERNAME_RE` y `PASSWORD_MIN`, y mapeo de errores a español) y `app/auth/confirm/route.ts`. Probar la ruta con un enlace de confirmación manual.
3. **`proxy.ts` de sesión.** Crear `proxy.ts` en la raíz con un `matcher` que excluye `_next/static`, `_next/image`, el favicon e imágenes; refresca la sesión con `@supabase/ssr` y redirige `/perfil` a `/login` si no hay sesión. Actualizar el comentario obsoleto de `lib/supabase/server.ts` que dice "sin proxy de sesión". Antes de escribir el archivo, leer `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
4. **Reescribir `lib/session.ts`.** `useSession()` obtiene el usuario con `supabase.auth.getUser()`, suscribe `onAuthStateChange`, resuelve `username` desde `profiles`, y expone la misma forma `{ user, login, loginAsGuest, logout }`. `logout` llama a `supabase.auth.signOut()`. Se elimina `av_user` de `localStorage`.
5. **Pantalla `/registro`.** Formulario (username, correo, contraseña, confirmar contraseña), validación en cliente, llamada a `signUp` con `username` en `options.data`, y estado final "Revisa tu correo". Reutiliza clases `.auth-card`, `.field`, `.btn` existentes.
6. **Reescribir `/login`.** Quitar las pestañas y la lógica simulada; correo + contraseña con `signInWithPassword`, enlace a `/registro` y `/recuperar`, "Jugar como invitado" conservado, botones Google/GitHub deshabilitados con "PRÓXIMAMENTE". Maneja el error "correo sin confirmar" con mensaje y botón "Reenviar correo".
7. **Recuperación de contraseña.** Páginas `/recuperar` (envía `resetPasswordForEmail`) y `/restablecer` (llama a `updateUser({ password })`, luego redirige a `/`).
8. **Pantalla `/perfil`.** Muestra `username` y correo, y botón "Cerrar sesión". Actualizar `Nav.tsx`: con sesión, el botón del usuario enlaza a `/perfil` (hoy el clic cierra sesión directamente); el enlace móvil "Cuenta" apunta a `/perfil`.
9. **Puntajes vinculados.** `saveScore` acepta `userId` y lo envía; `GamePlayer.tsx` pasa `user.id` cuando hay sesión y deja el campo de nombre prellenado y de solo lectura con el `username`. Sin sesión, el comportamiento actual no cambia.
10. **Documentación.** Actualizar `.env.example`/README con las URLs de redirección y el prerrequisito de Dashboard, y actualizar la sección de rutas y de `lib/session.ts` en `CLAUDE.md`.

## Acceptance criteria

- [ ] Existen `/login`, `/registro`, `/recuperar`, `/restablecer` y `/perfil`, y cargan sin errores en consola.
- [ ] Registrarse con `username`, correo y contraseña válidos muestra "Revisa tu correo" y **no** inicia sesión hasta confirmar el correo.
- [ ] Abrir el enlace del correo de confirmación pasa por `/auth/confirm`, deja la sesión iniciada y redirige a `/`.
- [ ] Iniciar sesión con credenciales correctas redirige a `/` y `Nav` muestra el `username`.
- [ ] Iniciar sesión con contraseña incorrecta muestra un mensaje en español y no crea sesión.
- [ ] Iniciar sesión con un correo sin confirmar muestra el aviso y permite reenviar el correo.
- [ ] Registrarse con un `username` ya existente (sin importar mayúsculas/minúsculas) falla con un mensaje claro y no crea usuario.
- [ ] `username` fuera de `^[A-Za-z0-9_]{3,10}$` o contraseña de menos de 8 caracteres se rechaza en el formulario sin llamar a Supabase.
- [ ] "¿Olvidaste tu contraseña?" envía el correo; el enlace lleva a `/restablecer`, y tras fijar la nueva contraseña se puede iniciar sesión con ella y no con la anterior.
- [ ] Recargar la página con sesión iniciada mantiene la sesión (cookies), y cerrar sesión desde `/perfil` la elimina y `Nav` vuelve a "Iniciar Sesión".
- [ ] Abrir `/perfil` sin sesión redirige a `/login`; con sesión muestra `username` y correo.
- [ ] "Jugar como invitado" sigue funcionando: se puede jugar y guardar puntaje con nombre libre, y la fila queda con `user_id = NULL`.
- [ ] Con sesión iniciada, al guardar un puntaje la fila queda con `user_id = auth.uid()` y `name = username`, y aparece con ese nombre en `/salon` y `/juegos/[id]`.
- [ ] Un `INSERT` en `scores` con el `user_id` de otro usuario es rechazado por RLS (verificado con `execute_sql` simulando otro `auth.uid()`).
- [ ] Los botones Google y GitHub aparecen deshabilitados con "PRÓXIMAMENTE" y no disparan ninguna llamada.
- [ ] `localStorage` ya no contiene ni escribe la clave `av_user`.
- [ ] `get_advisors` (seguridad) no reporta alertas nuevas por `profiles`, el trigger ni las políticas de `scores`.
- [ ] Los componentes de motor (`components/games/**`), `GameEngineProps` y `lib/game-engines.ts` no cambian.
- [ ] `npm run build` compila sin errores de TypeScript y `npm run lint` no reporta errores.

## Decisions

- **Sí:** Supabase Auth con correo + contraseña. Razón: el proyecto ya usa Supabase y `@supabase/ssr`; el formulario actual ya pide usuario, correo y contraseña.
- **Sí:** dividir el trabajo en dos specs y dejar OAuth (Google/GitHub) para un spec propio. Razón: la recomendación de la skill ante 4+ dominios, y OAuth exige configurar apps externas (Google Cloud, GitHub) y el dashboard de Supabase, cosas que no se pueden verificar desde el repo. El usuario pidió OAuth en el alcance y aceptó la división recomendada. Los botones quedan visibles pero deshabilitados para no perder el diseño.
- **Sí:** confirmación de correo obligatoria con enlace. Razón: decisión explícita del usuario. Evita cuentas con correos ajenos y es requisito para que la recuperación de contraseña sea segura.
- **Sí:** el enlace del correo va a una ruta propia `/auth/confirm` con `token_hash` + `verifyOtp`, en vez del flujo PKCE por `code`. Razón: funciona aunque el usuario abra el enlace en otro navegador o dispositivo que el del registro, algo frecuente con correos de confirmación.
- **Sí:** `useSession()` conserva su forma `{ user, login, loginAsGuest, logout }` y se reescribe por dentro. Razón: decisión explícita del usuario (opción recomendada). Los 8 consumidores (Nav, GamePlayer y cuatro motores) casi no cambian. `login` queda como compatibilidad y puede quedar sin uso real tras reescribir `/login`.
- **Sí:** tabla `profiles` con `username` único, creada por trigger. Razón: decisión explícita del usuario. Garantiza unicidad en base de datos, algo que `user_metadata` no da, y deja `profiles` como lugar natural para futuros campos (avatar).
- **Sí:** `username` en formato `^[A-Z0-9_]{3,10}$`, en mayúsculas. Razón: coincide con el límite y el estilo actual (`toUpperCase().slice(0, 10)`) del salón y del HUD del juego.
- **Sí:** `scores.user_id` nullable y política `user_id is null or user_id = auth.uid()`. Razón: decisión explícita del usuario. Vincula puntajes a cuentas sin romper al invitado ni las filas históricas, e impide suplantar a otro usuario autenticado.
- **Sí:** `proxy.ts` refresca la sesión y solo protege `/perfil`. Razón: decisión explícita del usuario. Next 16 renombró `middleware` a `proxy`. Ninguna otra ruta debe exigir login porque el invitado se mantiene.
- **Sí:** rutas separadas `/registro`, `/recuperar`, `/restablecer`, además de `/login`. Razón: decisión explícita del usuario; permite enlazar cada flujo directamente.
- **No:** exigir login para guardar puntaje. Razón: cambiaría el producto (el invitado dejaría de aparecer en rankings) y se discutió como opción de mayor riesgo.
- **No:** dejar `scores` sin vincular a usuarios. Razón: el nombre seguiría siendo suplantable y la autenticación no tendría efecto visible en el salón.
- **No:** eliminar `useSession` en favor de un `AuthProvider` con contexto. Razón: más cambios en 8 archivos sin beneficio funcional ahora.
- **No:** migrar los puntajes antiguos a cuentas. Razón: no hay forma confiable de saber quién fue "PLAYER1"; quedan como históricos con `user_id` nulo.
- **No:** permitir editar `username`/correo/contraseña en `/perfil`. Razón: fuera del mínimo; cada uno es un flujo con sus propias validaciones.

## Risks

| Riesgo                                                                                                                                 | Mitigación                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El SMTP por defecto de Supabase tiene un límite muy bajo de correos por hora y solo entrega a miembros del equipo en proyectos nuevos. | Documentarlo en el README; para pruebas, usar correos del equipo o configurar SMTP propio (fuera de este spec). Se prueba con el panel _Auth → Users_ si el correo no llega.                           |
| Plantillas de correo o _Redirect URLs_ mal configuradas en el Dashboard rompen el enlace de confirmación.                              | El prerrequisito manual lista cada ajuste exacto. El criterio de aceptación de confirmación lo verifica de punta a punta.                                                                              |
| Un `username` duplicado hace fallar el trigger y el mensaje de Supabase es genérico ("Database error saving new user").                | `lib/auth.ts` consulta `profiles` antes de `signUp` para dar un mensaje claro, y además mapea el error genérico a "nombre de usuario no disponible" como red de seguridad ante condiciones de carrera. |
| Enumeración de usuarios: el aviso de `username` ocupado y de correo ya registrado revelan datos.                                       | `username` es público por diseño (se muestra en el salón). Para el correo, Supabase ya responde igual si el correo existe y la confirmación está activa; no se agrega un chequeo propio.               |
| El `INSERT` de `scores` sigue sin validar el puntaje en servidor, así que un cliente malicioso puede enviar cualquier valor.           | Riesgo ya existente, explícitamente fuera de este spec (anti-trampas). La política nueva solo impide suplantación de identidad, no falsificación de puntaje.                                           |
| `useSession()` pasa a ser asíncrono: el nombre del HUD aparece un instante después y puede haber un parpadeo en `Nav`.                 | Se mantiene el patrón actual de iniciar en `null` para coincidir con el render del servidor. `GamePlayer` ya prellena el nombre en un `useEffect`.                                                     |
| El trigger es `security definer` sobre `auth.users`; un error ahí bloquea todos los registros.                                         | `search_path` fijo, función mínima, y el paso 1 verifica con `get_advisors` y un registro de prueba antes de tocar el frontend.                                                                        |

## What is **not** in this spec

- Inicio de sesión con Google y GitHub (spec propio: `16-auth-oauth`).
- Obligar a iniciar sesión para jugar o guardar puntajes.
- Editar perfil, cambiar correo o contraseña desde `/perfil`, eliminar cuenta, avatar.
- Migración de puntajes históricos a cuentas.
- Roles, moderación, 2FA, SMTP propio y plantillas de correo personalizadas.
- Validación de puntajes en servidor (anti-trampas).

Cada uno de estos, si se implementa, va en su propio spec.
