# SPEC 03 — Envío real de correo en el formulario de Acerca de (Resend)

> **Status:** Implemented
> **Depends on:** SPEC 02
> **Date:** 2026-08-19
> **Objective:** Conectar el formulario de contacto de `/about` (ya implementado y simulado desde SPEC 02) a un envío real de correo electrónico usando Resend, a través de un Route Handler propio, sin modificar el diseño visual existente.

## Por qué existe este spec

SPEC 02 implementó la pantalla `/about` completa siguiendo el prototipo `references/templates/home-about/about.jsx`, pero dejó explícitamente fuera de alcance el envío real del formulario ("Envío real del formulario de contacto (backend, email, guardado en base de datos)"). Este spec cierra ese pendiente: agrega un Route Handler (`app/api/contact/route.ts`) que usa el SDK de Resend para enviar el mensaje por correo, y adapta `app/about/page.tsx` para llamarlo y manejar sus estados (carga, éxito, error), conservando exactamente el mismo HTML/CSS del template en el estado inicial y en el estado de éxito.

## Scope

**In:**

- Route Handler `app/api/contact/route.ts` (método `POST`) que recibe `{ name, email, msg }`, valida los campos en el servidor, y usa el SDK `resend` para enviar un correo a `ivan_barragan@hotmail.com` desde `onboarding@resend.dev`.
- Instalación de la dependencia `resend` (SDK oficial de Node/TypeScript) vía npm.
- Variable de entorno `RESEND_API_KEY` (y `CONTACT_EMAIL_TO="ivan_barragan@hotmail.com"`) leídas en el Route Handler mediante `process.env`. Se crea `.env.example` documentando ambas (sin valores reales).
- Actualización de `app/about/page.tsx`:
  - El `onSubmit` pasa de `setSent(form.name.trim())` directo a: validar campos vacíos (igual que hoy, con `shake`) → si están completos, hacer `fetch("/api/contact", { method: "POST", ... })` → mostrar el bloque `terminal-success` existente solo si la respuesta es exitosa, o un nuevo bloque de error si falla.
  - Nuevo estado `status: "idle" | "sending" | "sent" | "error"` que reemplaza al booleano implícito actual.
  - Mientras `status === "sending"`, el botón "▶ ENVIAR MENSAJE" se deshabilita y su texto cambia a "ENVIANDO…".
  - Si `status === "error"`, se muestra un bloque de error estilo terminal (mismo lenguaje visual que `.terminal-success`, ver Data model / Implementation plan) con un botón "REINTENTAR" que vuelve a `status: "idle"` sin perder lo escrito en el formulario.
  - Campo honeypot oculto (`company` o similar, con estilos inline `position:absolute; left:-9999px` y `tabIndex={-1}`, `autoComplete="off"`) agregado al formulario. Si llega no-vacío al Route Handler, este responde `200 OK` sin enviar ningún correo (rechazo silencioso, para no delatar el mecanismo a bots).
- Validación server-side mínima en el Route Handler: `name`, `email` y `msg` no vacíos tras `trim()`, y `email` con formato válido (regex simple). Si falla, responde `400` con `{ error: "..." }`.

**Out of scope (para specs futuros):**

- Persistencia del mensaje en base de datos.
- Panel de administración para ver mensajes recibidos.
- Rate limiting por IP o CAPTCHA (el honeypot es la única mitigación anti-spam de este spec).
- Verificación de dominio propio en Resend / envío desde un correo con dominio propio (`contacto@arcadevault.com` o similar) — se usa `onboarding@resend.dev` mientras no exista dominio verificado.
- Reply-To hacia el correo del visitante (decisión explícita: no se implementa en este spec).
- Notificaciones al visitante (correo de confirmación automática a quien llena el formulario). Solo se notifica al equipo.
- Internacionalización o localización de los mensajes de error.

## Data model

No se introduce persistencia. Sí se define el contrato entre cliente y Route Handler:

```ts
// app/api/contact/route.ts — request body esperado
type ContactRequestBody = {
  name: string;
  email: string;
  msg: string;
  company?: string; // honeypot; si viene no-vacío, se descarta silenciosamente
};

// Respuesta de éxito: 200 { ok: true }
// Respuesta de validación fallida: 400 { error: string }
// Respuesta de fallo de envío (Resend caído, red, etc.): 502 { error: string }
```

```ts
// app/about/page.tsx — estado local del formulario
type ContactForm = { name: string; email: string; msg: string; company: string };
type SubmitStatus = "idle" | "sending" | "sent" | "error";
```

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 03-contact-email-resend`) se crea y activa la rama `spec-03-contact-email-resend` (comportamiento por defecto de `/spec-impl` vía `AutoCreateBranch: true`). Además, cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo del paso completado (ej. `Add Resend route handler for /api/contact`). No se agrupan varios pasos en un mismo commit.

1. Ejecutar `npm install resend` en la raíz del proyecto.
2. Crear `.env.example` en la raíz con:
   ```
   RESEND_API_KEY=
   CONTACT_EMAIL_TO=ivan_barragan@hotmail.com
   ```
   (`.env*` ya está en `.gitignore`; el usuario copiará esto a `.env.local` y pegará su API key real de Resend después de este spec).
3. Crear `app/api/contact/route.ts`:
   - `export async function POST(request: Request)`.
   - Parsear el JSON del body; si falla el parseo, responder `400`.
   - Validar `name`, `email`, `msg` no vacíos tras `trim()` y `email` con regex simple (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Si falla, responder `400 { error: "Campos inválidos" }`.
   - Si `company` (honeypot) viene no vacío tras `trim()`, responder `200 { ok: true }` inmediatamente sin llamar a Resend.
   - Instanciar `new Resend(process.env.RESEND_API_KEY)` y llamar a `resend.emails.send({ from: "onboarding@resend.dev", to: process.env.CONTACT_EMAIL_TO!, subject: \`Nuevo mensaje de ${name} — Arcade Vault\`, text: mensaje formateado con name/email/msg })`.
   - Si `resend.emails.send` devuelve error o lanza excepción, responder `502 { error: "No se pudo enviar el mensaje" }`.
   - Si todo sale bien, responder `200 { ok: true }`.
4. Actualizar `app/about/page.tsx`:
   - Cambiar `const [sent, setSent] = useState<string | null>(null)` por `const [status, setStatus] = useState<SubmitStatus>("idle")` + mantener `sentName` (nombre a mostrar en el mensaje de éxito) en un estado separado o derivado.
   - Agregar `company: ""` al estado inicial de `form` y un `<input>` honeypot oculto dentro del `<form>` (fuera del flujo visual, con `aria-hidden="true"`).
   - Reescribir `onSubmit`: validar campos vacíos (igual que hoy) → `setStatus("sending")` → `fetch("/api/contact", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(form) })` → si `res.ok`, `setStatus("sent")`; si no, `setStatus("error")`.
   - En el JSX: `status === "idle"` muestra el formulario tal cual hoy, con el botón mostrando "ENVIANDO…" y `disabled` cuando `status === "sending"`; `status === "sent"` muestra el bloque `terminal-success` existente sin cambios; `status === "error"` muestra un bloque nuevo `.terminal-error` (mismo layout que `.terminal-success`: barra de puntos, título `VAULT-OS // TERMINAL`, líneas `[OK]`/`[ERROR]`) terminando en una línea `line error` con el mensaje de fallo y un botón "REINTENTAR" (`onClick={() => setStatus("idle")}`, sin resetear `form` para no perder lo escrito).
5. Agregar a `app/globals.css` la clase `.terminal-error` (o reutilizar `.terminal-success` con un modificador `.terminal-success.is-error` que cambie el color de la línea final a rojo/magenta de error, reutilizando las variables de color ya definidas en el CSS del template) y el estilo del botón "REINTENTAR" (reutilizar `.btn.ghost` ya existente).
6. Verificar manualmente en `npm run dev`: enviar el formulario con `RESEND_API_KEY` configurada en `.env.local` y confirmar que llega un correo real a `ivan_barragan@hotmail.com`; simular un fallo (API key inválida o vacía) y confirmar que se muestra el bloque de error con "REINTENTAR" funcional.

## Acceptance criteria

- [ ] `npm install resend` agrega `resend` a `dependencies` en `package.json`.
- [ ] Existe `.env.example` con `RESEND_API_KEY` y `CONTACT_EMAIL_TO` documentados (sin valores reales de API key).
- [ ] `POST /api/contact` con `name`, `email` y `msg` válidos y `RESEND_API_KEY` configurada envía un correo real a la dirección de `CONTACT_EMAIL_TO`, con remitente `onboarding@resend.dev` y responde `200 { ok: true }`.
- [ ] `POST /api/contact` con algún campo vacío o `email` con formato inválido responde `400` y no llama a Resend.
- [ ] `POST /api/contact` con el campo honeypot (`company`) no vacío responde `200 { ok: true }` sin enviar ningún correo.
- [ ] `POST /api/contact` cuando Resend falla (API key inválida, error de red) responde `502` y no rompe el servidor.
- [ ] En `/about`, enviar el formulario con algún campo vacío sigue mostrando la animación `shake` existente, sin llamar a la API.
- [ ] En `/about`, al enviar el formulario completo, el botón se deshabilita y muestra "ENVIANDO…" mientras espera la respuesta.
- [ ] En `/about`, si la API responde éxito, se muestra el bloque `terminal-success` existente con el nombre ingresado, igual que en SPEC 02.
- [ ] En `/about`, si la API responde error (400 o 502), se muestra un bloque de error estilo terminal con un botón "REINTENTAR" que vuelve al formulario sin perder lo escrito.
- [ ] El campo honeypot no es visible ni accesible por teclado (`tabIndex={-1}`) en la UI real.
- [ ] La navegación y el resto de `/about` (hero, highlight-row, divisor) no cambian respecto a SPEC 02.

## Decisions

- **Sí:** el correo se envía a `ivan_barragan@hotmail.com`. Razón: decisión explícita del usuario.
- **Sí:** se usa `onboarding@resend.dev` como remitente. Razón: no hay dominio propio verificado en Resend todavía; es el remitente de pruebas que Resend habilita sin configuración DNS.
- **Sí:** no se implementa Reply-To hacia el correo del visitante. Razón: decisión explícita del usuario; para responder, el equipo copia el correo del cuerpo del mensaje.
- **Sí:** protección anti-spam limitada a un honeypot simple. Razón: decisión explícita del usuario; suficiente para bots simples sin añadir fricción (CAPTCHA) ni dependencias externas.
- **Sí:** en caso de fallo se muestra un mensaje de error inline con botón de reintento, en vez de reutilizar únicamente la animación `shake`. Razón: decisión explícita del usuario — el `shake` ya tiene un significado distinto (campos vacíos) y el usuario prefirió un estado de error explícito.
- **Sí:** la `RESEND_API_KEY` la agrega el usuario manualmente en `.env.local` después de esta implementación; el spec solo deja `.env.example` documentado. Razón: decisión explícita del usuario, evita compartir la key real en la conversación.
- **No:** no se persiste el mensaje en base de datos ni se implementa panel de administración. Razón: fuera de alcance; el objetivo es solo el envío real del correo, igual de acotado que el resto del MVP.
- **No:** no se implementa rate limiting ni CAPTCHA. Razón: fuera de alcance de este spec; se puede añadir en uno futuro si el honeypot resulta insuficiente.
- **Sí:** durante `/spec-impl` se crea la rama `spec-03-contact-email-resend` al iniciar (ya es el comportamiento por defecto) y se hace un commit al completar cada paso del plan, antes de pasar al siguiente. Razón: decisión explícita del usuario, para tener el historial de git desglosado por paso en vez de un solo commit final.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Sin dominio verificado, Resend podría marcar los correos enviados desde `onboarding@resend.dev` como spam en algunos proveedores. | Aceptado por ahora; migrar a dominio propio verificado queda para un spec futuro si se vuelve un problema real. |
| Si `RESEND_API_KEY` no está configurada en `.env.local`, todo envío fallará con `502`. | Esperado mientras el usuario no configure la key; el estado de error de la UI ya cubre este caso. |
| El honeypot es una mitigación básica; bots más sofisticados podrían evadirlo. | Aceptado como primera línea de defensa; rate limiting/CAPTCHA quedan fuera de alcance de este spec. |

## What is **not** in this spec

- Persistencia del mensaje o panel de administración.
- Rate limiting o CAPTCHA.
- Dominio propio verificado en Resend / remitente personalizado.
- Reply-To hacia el visitante.
- Correo de confirmación automática al visitante.

Cada uno de estos, si se implementa, va en su propio spec.
