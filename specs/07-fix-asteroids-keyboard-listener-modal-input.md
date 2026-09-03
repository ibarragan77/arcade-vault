# SPEC 07 — Fix del listener de teclado global de Asteroides sobre el input del modal "FIN DEL JUEGO"

> **Status:** Draft
> **Depends on:** SPEC 05
> **Date:** 2026-09-01
> **Objective:** Hacer que el listener de teclado global de `AsteroidsGame.tsx` deje de interceptar Espacio/flechas cuando el juego está en pausa, para que el input de nombre del modal "FIN DEL JUEGO" reciba esas teclas con normalidad.

## Por qué existe este spec

`AsteroidsGame.tsx` registra `keydown`/`keyup` en `window` una sola vez al montar (`useEffect` con deps `[]`) y usa un `pausedRef` (línea 332-336) solo para pausar el loop de `update()`/`draw()` vía `requestAnimationFrame`. El `handleKeyDown` (línea 350-354) llama `e.preventDefault()` para `ArrowLeft`/`ArrowRight`/`ArrowUp`/`Space` sin mirar ese `pausedRef`, así que sigue interceptando esas teclas incluso cuando el juego está pausado. `GamePlayer.tsx` pasa `paused={paused || over}` (línea 112), o sea que cuando la partida termina (`over === true`) el componente ya está "pausado" en ese sentido, pero el listener global no lo sabe. El modal "FIN DEL JUEGO" (línea 158-201 de `GamePlayer.tsx`) muestra un `<input>` de nombre; al escribir ahí, `preventDefault()` bloquea que se inserte el espacio y que las flechas muevan el cursor de texto, obligando a corregir el nombre sin poder usar esas teclas.

## Scope

**In:**

- `components/games/asteroids/AsteroidsGame.tsx`: `handleKeyDown` deja de hacer `e.preventDefault()` y de registrar la tecla en `keys`/`justPressed` cuando `pausedRef.current` es `true`.

**Out of scope (para specs futuros):**

- Cualquier cambio a `GamePlayer.tsx` o a la estructura/JSX del modal "FIN DEL JUEGO".
- Autofocus del input de nombre al abrir el modal.
- Chequeo por elemento con foco (`e.target`/`document.activeElement`) — el fix se resuelve con el estado de pausa existente, que ya cubre el único caso real (el modal solo aparece con `paused || over` en `true`).
- Cambios a la mecánica de juego, puntuación, niveles o cualquier otra parte del motor de `AsteroidsGame.tsx`.
- Cualquier otro juego del catálogo (`GAMES`) — solo Asteroides tiene motor propio con listener de teclado.

## Data model

Este fix no introduce ni modifica estructuras de datos. Reutiliza el `pausedRef` ya existente en `AsteroidsGame.tsx` (línea 332).

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 07-fix-asteroids-keyboard-listener-modal-input`) se crea y activa la rama `spec-07-fix-asteroids-keyboard-listener-modal-input` (comportamiento por defecto vía `AutoCreateBranch: true`).

1. En `components/games/asteroids/AsteroidsGame.tsx`, modificar `handleKeyDown` (línea 350-354) para que, si `pausedRef.current` es `true`, retorne de inmediato sin llamar `e.preventDefault()` ni tocar `keys`/`justPressed`. Verificación manual: jugar una partida de Asteroides, pausar con el botón "PAUSA" y confirmar que las flechas/espacio ya no mueven la nave ni disparan mientras está en pausa (comportamiento visual sin cambios, ya que `update()` tampoco corre en pausa).
2. Verificar manualmente con `npm run dev`: entrar a `/juegos/asteroides/jugar`, jugar hasta perder las 3 vidas (o usar el botón "FIN"), y en el modal "FIN DEL JUEGO" hacer click en el input de nombre, escribir un nombre con un espacio (p. ej. `"AB CD"`) y usar las flechas izquierda/derecha para mover el cursor y corregir una letra. Confirmar que el input refleja los espacios y los movimientos de cursor con normalidad, y luego guardar la puntuación.

## Acceptance criteria

- [ ] Con el juego en pausa (por el botón "PAUSA" o porque `over === true`), presionar Espacio o las flechas no llama `preventDefault()` ni afecta el estado interno del juego (`keys`, `justPressed`).
- [ ] En el modal "FIN DEL JUEGO", el input de nombre acepta escribir espacios (la barra espaciadora inserta un espacio en el texto).
- [ ] En el modal "FIN DEL JUEGO", las flechas izquierda/derecha mueven el cursor de texto dentro del input de nombre en vez de no hacer nada.
- [ ] Con el juego en curso (no pausado), las flechas y Espacio siguen controlando la nave y disparando exactamente igual que antes del fix (sin regresión).
- [ ] `npm run build` compila sin errores de TypeScript.
- [ ] No se modifica `GamePlayer.tsx` ni ningún otro archivo fuera de `AsteroidsGame.tsx`.

## Decisions

- **Sí:** gatear la intercepción de teclas por `pausedRef.current`, reutilizando el ref que ya existe para pausar el loop. Razón: decisión explícita del usuario — es el fix mínimo, coincide exactamente con el bug (el modal de nombre solo aparece con el juego en pausa) y no requiere lógica nueva de detección de foco.
- **No:** chequear `e.target`/`document.activeElement` para detectar si hay un input enfocado. Razón: decisión explícita del usuario — hoy es redundante, ya que el único input de texto de la página (el del modal) solo existe cuando el juego está pausado; agregar ese chequeo sería complejidad sin caso de uso actual.
- **No:** autofocus del input de nombre al abrir el modal. Razón: decisión explícita del usuario — se mantiene el spec acotado solo al fix del listener, sin tocar `GamePlayer.tsx`.
- **No:** tocar `handleKeyUp`. Razón: no hace `preventDefault()` ni bloquea nada hoy; el bug descrito es exclusivo de `handleKeyDown`.

## What is **not** in this spec

- Cambios a `GamePlayer.tsx` o al modal "FIN DEL JUEGO".
- Autofocus del input de nombre.
- Detección de foco por `e.target`/`document.activeElement`.
- Cambios a la mecánica de juego o a otros juegos del catálogo.

Cada uno de estos, si se implementa, va en su propio spec.
