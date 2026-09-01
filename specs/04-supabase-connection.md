# SPEC 04 — Conexión base a Supabase (cliente + variables de entorno)

> **Status:** Implemented
> **Depends on:** (ninguno)
> **Date:** 2026-09-01
> **Objective:** Establecer la conexión base de la aplicación Next.js a Supabase (cliente browser y server, variables de entorno) y verificarla con una ruta de health-check, dejando la autenticación y la persistencia de datos para specs futuros.

## Por qué existe este spec

Arcade Vault hoy no tiene ningún backend: la sesión de usuario (`lib/session.ts`) y los scores (`lib/scores.ts`) viven enteramente en `localStorage`, tal como quedó documentado explícitamente en SPEC 01. Ya existe un proyecto de Supabase provisionado (`.mcp.json` apunta al project ref `gikfspfbjagrbexkazon`, y `.env.local` ya tiene `SUPABASE_DB_PASSWORD`), pero no hay ningún código en el repo que lo use. Este spec conecta la aplicación a ese proyecto: instala el SDK, define los wrappers de cliente para Client y Server Components, y agrega una ruta de verificación. Es deliberadamente el spec más chico posible — no toca login, no toca scores, no crea tablas — para dejar una base sólida sobre la que specs futuros (auth real, persistencia de scores) puedan construir sin reabrir esta parte.

## Scope

**In:**

- Instalar `@supabase/supabase-js` y `@supabase/ssr` vía npm.
- Variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local` con los valores reales del proyecto ya provisionado, y documentadas (vacías) en `.env.example`.
- `lib/supabase/client.ts`: wrapper `createClient()` para Client Components, usando `createBrowserClient` de `@supabase/ssr`.
- `lib/supabase/server.ts`: wrapper `async createClient()` para Server Components y Route Handlers, usando `createServerClient` de `@supabase/ssr` con las cookies de `next/headers` (`getAll`/`setAll`).
- Ruta `GET /api/supabase-health` que usa el cliente server para hacer una llamada real contra el proyecto (`supabase.auth.getUser()`) y confirma en runtime que la URL y la key son correctas.

**Out of scope (para specs futuros):**

- Autenticación real (login/signup, reemplazo de `app/login` y `lib/session.ts`).
- Persistencia de scores/leaderboard (reemplazo de `lib/scores.ts` y la data falsa de `app/salon`).
- Middleware de refresco de sesión (`lib/supabase/proxy.ts` + `middleware.ts`) — no tiene sentido sin login real; se agrega junto con el spec de auth.
- Generación de tipos TypeScript del esquema (`lib/database.types.ts`) — el esquema hoy está vacío (sin tablas); se genera cuando existan tablas reales.
- Cualquier tabla, migración o esquema en la base de datos de Supabase.

## Data model

Este spec no introduce estructuras de datos en Supabase (no crea tablas ni migraciones). Sí define el contrato de la ruta de verificación:

```ts
// app/api/supabase-health/route.ts
// Respuesta de éxito: 200 { ok: true }
// Respuesta de fallo (URL/key inválida, proyecto inalcanzable): 500 { ok: false, error: string }
```

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 04-supabase-connection`) se crea y activa la rama `spec-04-supabase-connection` (comportamiento por defecto vía `AutoCreateBranch: true`). Cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo (ej. `Add Supabase client wrappers`). No se agrupan varios pasos en un mismo commit.

1. Ejecutar `npm install @supabase/supabase-js @supabase/ssr` en la raíz del proyecto.
2. Agregar a `.env.local` (ya ignorado por `.gitignore`, ya tiene `RESEND_API_KEY`, `CONTACT_EMAIL_TO`, `SUPABASE_DB_PASSWORD`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://gikfspfbjagrbexkazon.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_hflGzGbS7SO87YQa-YblMQ_EZuYY8c2
   ```
   Son claves públicas por diseño (seguras de exponer en el cliente), obtenidas del proyecto ya provisionado vía el MCP de Supabase conectado a este repo.
3. Actualizar `.env.example` agregando (sin valores):
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   ```
4. Crear `lib/supabase/client.ts`:
   ```ts
   import { createBrowserClient } from "@supabase/ssr";

   export function createClient() {
     return createBrowserClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
     );
   }
   ```
5. Crear `lib/supabase/server.ts`:
   ```ts
   import { createServerClient } from "@supabase/ssr";
   import { cookies } from "next/headers";

   export async function createClient() {
     const cookieStore = await cookies();

     return createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
       {
         cookies: {
           getAll() {
             return cookieStore.getAll();
           },
           setAll(cookiesToSet) {
             try {
               cookiesToSet.forEach(({ name, value, options }) =>
                 cookieStore.set(name, value, options),
               );
             } catch {
               // setAll llamado desde un Server Component sin proxy de sesión; se puede ignorar
               // porque este spec no maneja refresco de sesión todavía (ver Out of scope).
             }
           },
         },
       },
     );
   }
   ```
6. Crear `app/api/supabase-health/route.ts`:
   - `export async function GET()`.
   - Instanciar el cliente server (`await createClient()` de `lib/supabase/server`).
   - Llamar a `supabase.auth.getUser()` dentro de un `try/catch`.
   - Distinguir el caso "no hay sesión" (respuesta esperada, sin usuario logueado — no hay login todavía en este spec) de un error real de conectividad (red, URL o key inválidos): responder `200 { ok: true }` en el primer caso, `500 { ok: false, error }` en el segundo.
   - Si la llamada lanza una excepción (red caída, URL malformada), capturarla y responder `500 { ok: false, error: String(err) }`.
7. Verificar manualmente con `npm run dev`: abrir `http://localhost:3000/api/supabase-health` y confirmar `{ ok: true }`. Opcionalmente, cambiar temporalmente `NEXT_PUBLIC_SUPABASE_URL` a un valor inválido y confirmar que la ruta responde `500 { ok: false, ... }`, luego revertir el valor.

## Acceptance criteria

- [ ] `npm install` agrega `@supabase/supabase-js` y `@supabase/ssr` a `dependencies` en `package.json`.
- [ ] `.env.local` contiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores reales del proyecto.
- [ ] `.env.example` documenta ambas variables sin valores reales.
- [ ] `lib/supabase/client.ts` exporta `createClient()` que devuelve un cliente vía `createBrowserClient`.
- [ ] `lib/supabase/server.ts` exporta un `createClient()` async que devuelve un cliente vía `createServerClient`, leyendo cookies con `await cookies()` de `next/headers`.
- [ ] `GET /api/supabase-health` devuelve `200 { ok: true }` cuando el servidor corre con las variables de entorno reales configuradas.
- [ ] `GET /api/supabase-health` devuelve `500 { ok: false, error }` si `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` son inválidas.
- [ ] `npm run build` compila sin errores de TypeScript.
- [ ] No se modifica ningún archivo de `app/login`, `lib/session.ts`, `lib/scores.ts` ni `app/salon` (fuera de alcance de este spec).

## Decisions

- **Sí:** alcance acotado solo a la conexión base (cliente + variables de entorno + health-check), sin auth ni scores. Razón: decisión explícita del usuario tras aclarar que "conexión a Supabase" era más chico que "auth + scores".
- **Sí:** se usa la publishable key moderna (`sb_publishable_...`) en vez del anon key legacy (JWT). Razón: decisión explícita del usuario, siguiendo la recomendación actual de Supabase para proyectos nuevos.
- **Sí:** el middleware de refresco de sesión se deja para el spec de auth. Razón: decisión explícita del usuario — sin login real no hay sesión que refrescar.
- **Sí:** no se generan tipos TypeScript del esquema en este spec. Razón: decisión explícita del usuario — el esquema está vacío (sin tablas) hoy.
- **Sí:** se agrega una ruta `GET /api/supabase-health` que queda en el repo de forma permanente (no se borra al terminar el spec). Razón: sirve como forma reproducible de re-verificar la conexión en cualquier momento futuro, no solo durante la implementación de este spec.
- **Sí:** los valores reales de `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` se escriben directamente en `.env.local` durante `/spec-impl` (no los agrega el usuario manualmente después, a diferencia de `RESEND_API_KEY` en SPEC 03). Razón: son claves públicas por diseño, el proyecto Supabase ya existe y sus valores ya se obtuvieron vía el MCP de Supabase conectado a este repo.
- **No:** no se crean tablas, migraciones ni políticas RLS en este spec. Razón: fuera de alcance; se define junto con el spec de scores.

## Risks

| Riesgo                                                                                                                                                                                                                | Mitigación                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Si `.env.local` no está configurado en el entorno donde corre la app (otra máquina, CI), `/api/supabase-health` fallará con `500`.                                                                                    | Esperado; el health-check está pensado justamente para detectar este caso rápido.                                         |
| Si en el futuro se agrega una service role key con permisos elevados, un error de nombre de variable podría exponerla al cliente si se prefija con `NEXT_PUBLIC_` por error.                                          | Ninguna key con permisos elevados se agrega en este spec; queda como advertencia para specs futuros que sí las necesiten. |
| El proyecto Supabase (`gikfspfbjagrbexkazon`) está vacío hoy; si se borra o cambia de project ref sin actualizar `.env.local`/`.mcp.json`, la conexión se rompe silenciosamente hasta que se note en el health-check. | Aceptado; el health-check es la forma de detectarlo, no hay monitoreo automático en este spec.                            |

## What is **not** in this spec

- Autenticación real (login/signup).
- Persistencia de scores/leaderboard.
- Middleware de refresco de sesión.
- Generación de tipos TypeScript del esquema.
- Tablas, migraciones o RLS en la base de datos.

Cada uno de estos, si se implementa, va en su propio spec.
