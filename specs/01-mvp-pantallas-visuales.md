# SPEC 01 — MVP visual de las pantallas de Arcade Vault

> **Status:** Implemented
> **Depends on:** (ninguno)
> **Date:** 2026-08-14
> **Objective:** Migrar las 5 pantallas del prototipo estático en `references/templates` (Biblioteca, Detalle, Reproductor, Auth, Salón de la Fama) a rutas reales de Next.js App Router, replicando fielmente su diseño e interacciones sin implementar lógica de juego real.

## Por qué existe este spec

El prototipo en `references/templates` es una SPA de un solo archivo HTML con React vía CDN, ruteo por `location.hash` y estado de sesión "levantado" en un único componente `App` que pasa props hacia abajo. El proyecto real es Next.js 16 App Router con TypeScript, así que la migración no es un copy-paste: hay que convertir el ruteo por hash en rutas de archivo, y el estado de sesión (antes en un solo árbol de componentes) en algo que funcione entre páginas independientes sin recargar. Este spec fija esas dos decisiones antes de tocar código.

## Scope

**In:**

- Página `/` con la Biblioteca (hero, buscador, chips de categoría, grid de tarjetas de juego con efecto tilt al pasar el mouse).
- Página `/juegos/[id]` con el Detalle del juego (portada, tags, descripción, stats, tabla de mejores puntuaciones, botón "Jugar ahora").
- Página `/juegos/[id]/jugar` con el Reproductor (HUD, pantalla CRT decorativa con ticker de puntuación falso y "enemigos" animados en CSS, pausa, modal de fin de partida con formulario para guardar puntuación).
- Página `/login` con Auth (tabs "Iniciar sesión" / "Crear cuenta", botón de invitado, botones sociales decorativos).
- Página `/salon` con el Salón de la Fama (tabs por juego, podio top 3, tabla de posiciones, fila "tu mejor marca" si hay sesión).
- Componente `Nav` global (barra desktop + panel móvil) montado en `app/layout.tsx`, resaltando la ruta activa.
- Migración de los datos mock (`GAMES`, `CATS`, `PLAYERS`, `seededScores`) de `data.jsx` a un módulo TypeScript reutilizable.
- Sesión de usuario simulada (login / invitado / logout) persistida en `localStorage`, sincronizada entre páginas sin recarga completa.
- Guardado simulado de puntuaciones en `localStorage`, con confirmación visual en el modal de fin de partida.
- Footer estático igual al del prototipo.

**Out of scope (para specs futuros):**

- Lógica de juego real para cualquiera de los 8 juegos listados (Bloque Buster, Caída, Serpentina, Glotón, Invasores, Rocas, Ranaria, Duelo Pixel).
- Autenticación real (backend, validación de credenciales, OAuth de Google/GitHub — los botones sociales quedan decorativos, sin acción).
- Persistencia en servidor o base de datos (todo vive en `localStorage` del navegador).
- Sistema de créditos/monedas funcional (el contador "CRÉDITOS · 03" del nav queda fijo, igual que en el prototipo).
- Tests automatizados (no hay test runner configurado en el proyecto).

## Data model

```ts
// lib/data.ts
export type GameCategory = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";
export type GameColor = "cyan" | "magenta" | "yellow" | "green";

export type Game = {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: GameCategory;
  cover: string; // clase CSS de portada, p.ej. "cover-bricks" (ya definida en globals.css)
  color: GameColor;
  best: number;
  plays: string;
};

export const GAMES: Game[]; // los mismos 8 juegos de data.jsx
export const CATS: readonly ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"];
export const PLAYERS: string[]; // los mismos 18 nombres de data.jsx

export type ScoreRow = { rank: number; name: string; score: number; date: string };
export function seededScores(seed: number, count?: number): ScoreRow[];
```

```ts
// lib/session.ts
export type SessionUser = { name: string } | null;

// Lee/escribe localStorage["av_user"] y notifica a otras páginas vía un
// evento custom "av-session-change" (además de "storage" entre pestañas).
export function useSession(): {
  user: SessionUser;
  login(user: SessionUser): void;
  loginAsGuest(): void;
  logout(): void;
};
```

```ts
// lib/scores.ts
export type SavedScore = { game: string; score: number; name: string; at: number };

// Lee/escribe localStorage["av_scores"] (array de SavedScore).
export function saveScore(entry: Omit<SavedScore, "at">): void;
```

Convenciones:

- Claves de `localStorage`: `av_user` y `av_scores`, idénticas a las del prototipo, para no romper compatibilidad si ya hay datos guardados en desarrollo.
- Las clases CSS de portada (`.cover-bricks`, `.cover-tetro`, etc.) ya existen en `app/globals.css` migrado; no se crean assets de imagen nuevos.

## Implementation plan

1. Crear `lib/data.ts` con los tipos `Game`, `ScoreRow` y las constantes `GAMES`, `CATS`, `PLAYERS` y la función `seededScores`, migrados desde `references/templates/data.jsx`.
2. Crear `lib/session.ts` con el hook `useSession()` (lectura/escritura de `localStorage["av_user"]` + evento `av-session-change`) y `lib/scores.ts` con `saveScore()`.
3. Crear `components/Nav.tsx` (client component) migrando `nav.jsx`: logo, enlaces de escritorio, contador de créditos fijo, botón de sesión (usa `useSession`), panel móvil con backdrop. Usa `usePathname()` de `next/navigation` para resaltar el enlace activo. Montarlo en `app/layout.tsx` junto al footer estático (tomado de `app.jsx`), reemplazando el `<main>` actual del layout.
4. Reescribir `app/page.tsx` como la pantalla Biblioteca (client component): hero, buscador, chips de categoría y grid de `GameCard` con efecto tilt al hover, migrado desde `biblioteca.jsx`. Los clics en tarjeta/botón "JUGAR" navegan a `/juegos/[id]` con `next/link` o `useRouter`.
5. Crear `app/juegos/[id]/page.tsx` con la pantalla Detalle, migrado desde `detalle.jsx`: portada, tags, descripción, stats, leaderboard vía `seededScores`, botones "Jugar ahora" (→ `/juegos/[id]/jugar`) y "Volver al vault" (→ `/`). Si el `id` no existe en `GAMES`, usar `notFound()`.
6. Crear `app/juegos/[id]/jugar/page.tsx` con la pantalla Reproductor (client component), migrado desde `reproductor.jsx`: HUD, CRT con ticker de puntuación (`setInterval`) y animaciones CSS existentes, pausa, fin de partida, y modal de guardado que llama a `saveScore()`.
7. Crear `app/login/page.tsx` con la pantalla Auth (client component), migrado desde `auth.jsx`: tabs, formulario, botón de invitado y sociales decorativos, usando `useSession().login` / `loginAsGuest`, con redirección a `/` tras "loguear".
8. Crear `app/salon/page.tsx` con el Salón de la Fama, migrado desde `salon.jsx`: tabs por juego, podio, tabla, y fila "tu mejor marca" condicionada a `useSession().user`.
9. Revisar `app/layout.tsx` y `app/page.tsx` para eliminar cualquier resto del placeholder original de `create-next-app` que haya quedado sin usar.

## Acceptance criteria

- [x] La ruta `/` muestra la Biblioteca con buscador, chips de categoría y grid de 8 juegos.
- [x] Escribir en el buscador o cambiar de categoría filtra el grid sin recargar la página.
- [x] Hacer clic en una tarjeta o en su botón "JUGAR" navega a `/juegos/[id]` con el detalle correcto.
- [x] `/juegos/[id]` muestra portada, descripción, stats y tabla de mejores puntuaciones del juego correspondiente.
- [x] Visitar `/juegos/id-inexistente` devuelve la página 404 de Next.js.
- [x] El botón "JUGAR AHORA" navega a `/juegos/[id]/jugar`.
- [x] `/juegos/[id]/jugar` muestra el HUD y el CRT animado, y la puntuación sube automáticamente mientras no está en pausa ni terminada la partida.
- [x] El botón "PAUSA" detiene el ticker de puntuación y muestra "EN PAUSA" sobre el CRT.
- [x] El botón "FIN" abre el modal de fin de partida con la puntuación final.
- [x] Guardar la puntuación en el modal la persiste en `localStorage["av_scores"]` y muestra el mensaje de confirmación.
- [x] `/login` permite alternar entre "Iniciar sesión" y "Crear cuenta"; enviar cualquiera de los dos formularios marca al usuario como logueado y redirige a `/`.
- [x] El botón "Jugar como invitado" marca sesión de invitado y redirige a `/`.
- [x] Tras iniciar sesión, el Nav muestra el nombre de usuario en cualquier página sin recargar la pestaña.
- [x] Cerrar sesión desde el Nav vuelve a mostrar el botón "Iniciar Sesión" en todas las páginas.
- [x] `/salon` muestra tabs por juego, el podio top 3 y la tabla completa de posiciones.
- [x] Con sesión iniciada, `/salon` muestra la fila "tu mejor marca" al final de la tabla del juego seleccionado.
- [x] En pantallas menores a 840px el Nav colapsa a un botón de menú hamburguesa que abre el panel móvil.
- [x] La navegación entre las 5 pantallas no produce errores ni warnings de hidratación en la consola del navegador.

## Decisions

- **Sí:** rutas de archivo reales (`/juegos/[id]`, `/juegos/[id]/jugar`, `/login`, `/salon`) en vez de ruteo por hash. Razón: es la convención idiomática de Next.js App Router y habilita navegación con botón atrás/adelante y URLs compartibles.
- **Sí:** la pantalla Reproductor conserva el ticker de puntuación falso (`setInterval`) y las animaciones CSS del prototipo. Razón: no es lógica de juego real, es una animación decorativa; quitarla contradice el pedido de replicar fielmente "la parte visual".
- **Sí:** sesión de usuario simulada vía `localStorage` (`av_user`), sin backend. Razón: el MVP es solo visual y coincide con el comportamiento del prototipo.
- **Sí:** un hook `useSession()` basado en `localStorage` + evento custom (`av-session-change`) en vez de React Context. Razón: evita envolver el layout en un provider para un estado tan simple y funciona igual de bien entre páginas independientes.
- **Sí:** guardado de puntuaciones en `localStorage` (`av_scores`), igual que el prototipo. Razón: completa la experiencia de extremo a extremo sin requerir backend.
- **No:** la fila "tu mejor marca" del Salón de la Fama lee las puntuaciones reales guardadas en `av_scores`. Razón: el prototipo tampoco lo hace (usa una fórmula fija derivada del id del juego); se mantiene la misma fórmula simulada por fidelidad visual, ya que cruzar `av_scores` por juego es lógica adicional fuera de "solo visual".
- **No:** sistema de créditos funcional. Razón: fuera de alcance; el prototipo también lo deja fijo en "03".

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Diferencia de hidratación SSR/cliente al leer `localStorage` en `useSession` (el servidor no conoce la sesión en el primer render) | Inicializar el estado en `null`/invitado durante el render inicial y sincronizar con `localStorage` dentro de un `useEffect`, igual que hace `app.jsx` en el prototipo. |
| Animaciones CSS pesadas (grid scroll, scanlines, tilt 3D) podrían afectar el rendimiento en móviles de gama baja | Fuera de alcance de este spec; se evaluará si hay reportes de rendimiento reales. |

## What is **not** in this spec

- Lógica de juego real para cualquiera de los 8 juegos.
- Autenticación real (backend, validación, OAuth funcional).
- Persistencia en servidor o base de datos.
- Sistema de créditos funcional.
- Tests automatizados.

Cada uno de estos, si se implementa, va en su propio spec.
