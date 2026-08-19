# SPEC 02 — Home y Acerca de de Arcade Vault

> **Status:** Approved
> **Depends on:** SPEC 01
> **Date:** 2026-08-19
> **Objective:** Migrar las pantallas Home (landing) y Acerca de + Contacto de `references/templates/home-about` a las rutas `/` y `/about`, moviendo la Biblioteca actual (hoy en `/`) a `/games` y actualizando el Nav y las navegaciones internas que dependían de que `/` fuera la Biblioteca.

## Por qué existe este spec

El prototipo nuevo en `references/templates/home-about` separa "Inicio" (landing con hero, features, preview de juegos, stats, actividad en vivo y pricing), "Biblioteca" (grid de juegos con buscador y filtros) y "Acerca de" (misión del proyecto + formulario de contacto simulado) como tres pantallas distintas, tal como refleja su `nav.jsx`. El MVP de SPEC 01 no tenía Home ni Acerca de: `/` era directamente la Biblioteca. Este spec introduce Home en `/`, agrega Acerca de en `/about`, y reubica la Biblioteca en `/games`, lo que obliga a actualizar 5 puntos del código que hoy navegan a `/` asumiendo que ahí está la Biblioteca.

## Scope

**In:**

- Página `/` con la nueva Home: hero con siluetas flotantes decorativas, sección "¿Por qué Arcade Vault?" (4 feature cards), preview de los primeros 6 juegos de `GAMES`, sección de stats, sección de actividad en vivo (últimas puntuaciones + top jugadores del día), sección de precios (plan único gratis + FAQ) y CTA final.
- Página `/about` con Acerca de + Contacto: hero con misión del proyecto, `highlight-row` de 3 tarjetas con iconos, divisor decorativo animado, y formulario de contacto (nombre, correo, mensaje) con validación básica (sacudida visual si falta un campo) y confirmación simulada tipo terminal al enviar — sin backend ni persistencia, igual que en el prototipo.
- Migración de la Biblioteca actual (hoy en `app/page.tsx`) a `app/games/page.tsx`, sin cambios funcionales — solo cambia la ruta.
- Actualización de `components/Nav.tsx`: enlaces "Inicio" (`/`), "Biblioteca" (`/games`) y "Acerca de" (`/about`) como secciones separadas, en el menú de escritorio y en el panel móvil.
- Actualización de las navegaciones internas que hoy apuntan a `/` esperando la Biblioteca: `app/salon/page.tsx`, `app/juegos/[id]/page.tsx`, `app/juegos/[id]/jugar/GamePlayer.tsx` (ver detalle en el plan).
- Migración a `app/globals.css` de los bloques CSS `HOME PAGE`, `ABOUT PAGE`, `ACTIVITY (leaderboard + ticker)` y `PRICING` de `references/templates/home-about/styles.css`.
- Un hook compartido `useReveal()` (IntersectionObserver sobre `.reveal`), ya que ahora tanto Home como Acerca de lo necesitan.

**Out of scope (para specs futuros):**

- Envío real del formulario de contacto (backend, email, guardado en base de datos). El formulario solo simula el envío en el cliente, igual que `about.jsx`.
- Bloque CSS `GAMEPAD` y `Theme variants` de `styles.css` (no los usa Home ni Acerca de).
- Cualquier lógica de datos reales (los bloques de stats, actividad en vivo, top jugadores y FAQ de precios de Home siguen siendo contenido de ejemplo, igual que en el prototipo).
- Sistema de créditos funcional (fuera de alcance, igual que en SPEC 01).

## Data model

No se introducen estructuras de datos compartidas ni persistidas. Home reutiliza `GAMES` de `lib/data.ts` (ya existente) para la sección de preview (`GAMES.slice(0, 6)`).

El resto del contenido de ejemplo de Home (features, stats, ticker de actividad, top jugadores, FAQ de precios) vive como arrays/objetos **literales dentro de `app/page.tsx`**, igual que en el prototipo, porque no se reutilizan en ninguna otra pantalla:

```ts
// dentro de app/page.tsx, sin exportar
type Feature = { i: string; t: string; d: string; c: "cyan" | "yellow" | "magenta" | "green" };
type StatBlock = { n: string; u: string; s: string };
type TickerRow = { p: string; g: string; s: number; t: string; c: string };
type TopPlayerRow = { r: number; p: string; s: number };
type FaqItem = { q: string; a: string };
```

El formulario de contacto de `/about` usa estado local del componente, sin persistencia:

```ts
// dentro de app/about/page.tsx, sin exportar
type ContactForm = { name: string; email: string; msg: string };
```

## Implementation plan

1. Mover el contenido actual de `app/page.tsx` (pantalla Biblioteca: hero, buscador, chips, grid con `GameCard`) a `app/games/page.tsx` tal cual, sin cambios funcionales.
2. Crear `lib/useReveal.ts`: hook compartido `useReveal()` con `IntersectionObserver` sobre `.reveal` (agrega la clase `in` al entrar en viewport, con `disconnect()` en el cleanup), extraído del prototipo para que lo usen tanto Home como Acerca de.
3. Reescribir `app/page.tsx` como la nueva Home (client component), migrando `home.jsx`:
   - `FloatingSilhouettes` (SVGs decorativos), `FeatureIcon`, `MiniCard` como componentes locales del archivo.
   - Usa `useReveal()` de `lib/useReveal.ts`.
   - Las 7 secciones del prototipo: hero, "¿Por qué Arcade Vault?", preview de juegos (`GAMES.slice(0, 6)` vía `MiniCard`), stats, actividad en vivo + top jugadores, pricing, CTA final.
   - Las navegaciones (`navigate({name: ...})` en el prototipo) se traducen a `useRouter().push(...)`: `"biblioteca"` → `/games`, `"auth"` → `/login`, `"salon"` → `/salon`, `"detalle", id` → `/juegos/${id}`.
4. Crear `app/about/page.tsx` (client component), migrando `about.jsx`:
   - `HighlightIcon` (HEART, BROWSER, PLANT) como componente local.
   - Usa `useReveal()` de `lib/useReveal.ts` para el divisor y la sección de contacto.
   - Hero con misión del proyecto y `highlight-row` de 3 tarjetas.
   - Formulario de contacto controlado (`name`, `email`, `msg`): si algún campo está vacío al enviar, aplica la clase `shake` por 400ms y no continúa; si todos están completos, muestra el bloque `terminal-success` con el nombre enviado y un botón "ENVIAR OTRO MENSAJE" que reinicia el formulario.
5. Añadir a `app/globals.css` los bloques `HOME PAGE` (incluye `.home`, `.home-hero`, `.home-silos`, `.home-title`, `.home-section`, `.feature-grid`, `.feature-card`, `.mini-rail`, `.mini-card`, `.home-stats`, `.home-final`, `.reveal`/`.reveal.in`, líneas 930–1069), `ABOUT PAGE` (`.about-hero`, `.about-title`, `.about-mission`, `.highlight-row`, `.highlight`, `.about-divider`, `.div-pixels`, `.about-contact`, `.contact-grid`, `.contact-form`, `.terminal-success`, `.term-body`, líneas 1071–1150), `ACTIVITY` (`.activity-grid`, `.activity-card`, `.ticker`, `.tick-row`, `.top-list`, `.top-row`, líneas 1621–1671) y `PRICING` (`.pricing-grid`, `.price-card`, `.pricing-faq`, `.faq-item`, líneas 1672–1725) de `references/templates/home-about/styles.css`. No se migran `GAMEPAD` ni `Theme variants`.
6. Actualizar `components/Nav.tsx`:
   - Agregar enlace "Inicio" → `/`, activo cuando `pathname === "/"`.
   - Cambiar el enlace "Biblioteca" para apuntar a `/games`; activo cuando `pathname === "/games"` o `pathname.startsWith("/juegos")`.
   - Agregar enlace "Acerca de" → `/about`, activo cuando `pathname === "/about"`.
   - Aplicar los tres enlaces tanto en el menú de escritorio como en el panel móvil. El logo sigue apuntando a `/`.
7. Actualizar las navegaciones que hoy asumen `/` = Biblioteca:
   - `app/salon/page.tsx`: botón "VOLVER A LA BIBLIOTECA" → `router.push("/games")`.
   - `app/juegos/[id]/page.tsx`: enlace "VOLVER AL VAULT" → `href="/games"`.
   - `app/juegos/[id]/jugar/GamePlayer.tsx`: botón "VOLVER AL VAULT" → `router.push("/games")`.
   - `app/login/page.tsx`: los `router.push("/")` tras iniciar sesión, crear cuenta o entrar como invitado **se mantienen** apuntando a `/` (ahora Home).
8. Revisar que no queden referencias rotas o inconsistentes a la Biblioteca en `/` (buscar `router.push("/")` y `href="/"` en todo `app/` y `components/`).

## Acceptance criteria

- [ ] La ruta `/` muestra la nueva Home: hero con siluetas flotantes, sección "¿Por qué Arcade Vault?", preview de 6 juegos, stats, actividad en vivo + top jugadores, pricing y CTA final.
- [ ] Las tarjetas de la sección "JUEGOS DISPONIBLES AHORA" muestran los primeros 6 juegos de `GAMES` y al hacer clic navegan a `/juegos/[id]`.
- [ ] Los botones "EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →" e "INSERTAR MONEDA →" navegan a `/games`.
- [ ] Los botones "CREAR CUENTA" y "EMPEZAR GRATIS →" navegan a `/login`.
- [ ] El botón "VER SALÓN →" navega a `/salon`.
- [ ] `/games` muestra la Biblioteca (buscador, chips de categoría, grid de 8 juegos) igual que antes en SPEC 01, ahora en su nueva ruta.
- [ ] La ruta `/about` muestra el hero de misión, las 3 tarjetas `highlight-row` y el formulario de contacto.
- [ ] Enviar el formulario de contacto en `/about` con algún campo vacío dispara la animación de sacudida y no muestra confirmación.
- [ ] Enviar el formulario de contacto en `/about` con los tres campos completos muestra el bloque de confirmación tipo terminal con el nombre ingresado.
- [ ] El botón "ENVIAR OTRO MENSAJE" en `/about` reinicia el formulario a su estado vacío.
- [ ] El Nav muestra "Inicio", "Biblioteca" y "Acerca de" como enlaces separados; cada uno se resalta en su ruta correspondiente (`/`, `/games` + `/juegos/*`, `/about`).
- [ ] Las secciones marcadas con `.reveal` en Home y en Acerca de reciben la clase `in` (y su animación de aparición) al entrar en el viewport al hacer scroll.
- [ ] "VOLVER A LA BIBLIOTECA" en `/salon` y "VOLVER AL VAULT" en el detalle de juego y en el reproductor navegan a `/games`.
- [ ] Iniciar sesión, crear cuenta o entrar como invitado desde `/login` redirige a `/` (Home).
- [ ] En pantallas menores a 980px la grilla de features de Home pasa a 2 columnas, y a 520px a 1 columna; en pantallas menores a 820px el `highlight-row` de Acerca de pasa a 1 columna.
- [ ] La navegación entre Home, Biblioteca, Acerca de y el resto de pantallas no produce errores ni warnings de hidratación en la consola del navegador.

## Decisions

- **Sí:** `/` pasa a ser Home y la Biblioteca se mueve a `/games` (no `/biblioteca`). Razón: decisión explícita del usuario; coincide con `nav.jsx` del prototipo, que trata "Inicio" y "Biblioteca" como secciones separadas.
- **Sí:** se implementa también la pantalla Acerca de completa (componente, ruta y formulario de contacto simulado), no solo sus estilos. Razón: pedido explícito del usuario tras revisar el draft — inicialmente se había dejado solo como análisis de estilos, pero se corrigió para incluir el componente completo en este mismo spec.
- **Sí:** la ruta de Acerca de es `/about` (no `/acerca-de`). Razón: coincide con el nombre de sección `"about"` usado en `nav.jsx` del prototipo y con la convención en inglés ya usada en `/games` y `/login`.
- **Sí:** el formulario de contacto no persiste ni envía datos a ningún backend; solo simula el envío en el cliente (estado `sent` + mensaje tipo terminal), igual que `about.jsx`. Razón: coherente con el resto del MVP, que es únicamente visual (SPEC 01 tampoco implementa backend real).
- **Sí:** se extrae un hook compartido `useReveal()` a `lib/useReveal.ts` en vez de duplicar la lógica de `IntersectionObserver` en Home y en Acerca de. Razón: ambas pantallas necesitan el mismo comportamiento; evita repetir el mismo hook en dos archivos.
- **Sí:** los datos de ejemplo de Home (features, stats, ticker, top jugadores, FAQ) quedan inline en `app/page.tsx`, igual que en el prototipo, porque no se reutilizan en ninguna otra pantalla.
- **Sí:** se migran los bloques CSS `HOME PAGE`, `ABOUT PAGE`, `ACTIVITY` y `PRICING`; se excluyen `GAMEPAD` y `Theme variants` por no ser usados por Home ni por Acerca de.
- **Sí:** los redirects post-login (`app/login/page.tsx`) se mantienen hacia `/` (ahora Home), no hacia `/games`. Es un cambio de comportamiento respecto a SPEC 01 (donde `/` era la Biblioteca), pero consistente con que Home sea ahora la pantalla de bienvenida tras autenticarse.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Mover la Biblioteca de `/` a `/games` rompe cualquier enlace o marcador guardado que apuntara a `/` esperando la Biblioteca. | Aceptado como parte del cambio de alcance; el proyecto está en desarrollo, sin usuarios reales todavía. |
| El `IntersectionObserver` de `useReveal` podría no limpiarse bien si el usuario navega rápido entre rutas. | Se usa `disconnect()` en el cleanup del `useEffect`, igual que en el prototipo. |
| El formulario de contacto simulado podría dar la falsa impresión de que el mensaje se envía de verdad. | Fuera de alcance resolverlo aquí; si se requiere envío real, va en un spec futuro (backend/email). |

## What is **not** in this spec

- Envío real del formulario de contacto (backend, email, base de datos).
- Bloques CSS `GAMEPAD` y `Theme variants`.
- Sistema de créditos funcional.
- Tests automatizados.

Cada uno de estos, si se implementa, va en su propio spec.
