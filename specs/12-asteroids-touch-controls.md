# SPEC 12 — Controles táctiles para Asteroids (piloto de soporte móvil)

> **Status:** Implemented
> **Depends on:** SPEC 05, SPEC 11
> **Date:** 2026-09-09
> **Objective:** Agregar un overlay de botones virtuales dentro de `AsteroidsGame.tsx`, con paleta acorde al skin activo, detección automática de dispositivo táctil, bloqueo de orientación portrait y opción de ocultar el overlay, para que Asteroids sea jugable de punta a punta en un teléfono/tablet táctil sin teclado externo.

## Por qué existe este spec

Ningún motor de juego del catálogo (Asteroids, Tetris, Arkanoid, Snake) tiene soporte táctil: los 4 son controlados por teclado (Arkanoid además con `mousemove` para la paleta), sin ningún listener `touch*`/`pointer*`. Las specs 05, 08, 09, 10 y 11 declararon explícitamente "controles táctiles/móviles" como fuera de alcance. Este spec revierte esa exclusión únicamente para Asteroids, como piloto — igual que spec 11 estableció el patrón de skins en un solo juego antes de generalizarlo, este spec establece el patrón de controles táctiles para que Tetris/Arkanoid/Snake lo adopten en specs futuros.

## Scope

**In:**

- Detección de dispositivo táctil dentro de `AsteroidsGame.tsx` vía `window.matchMedia("(pointer: coarse)")` (con fallback a `"ontouchstart" in window`), evaluada al montar el componente.
- Cuando se detecta touch: overlay de botones virtuales superpuesto al canvas — rotar izquierda, rotar derecha, empuje, disparo — que alimentan el mismo estado interno (`keys`/`justPressed`) ya usado por los listeners de teclado existentes, sin duplicar lógica de juego.
- Soporte multi-touch real: los 4 botones deben poder presionarse en combinaciones simultáneas (ej. empuje + rotar + disparo a la vez), trackeando cada dedo por `Touch.identifier` (no alcanza con `touchstart`/`touchend` genéricos).
- Paleta de los botones: reutiliza `SKIN_PALETTES`/`skinRef` ya existentes (spec 11) — el color de los botones cambia junto con el skin activo (clasico/neon/retro), incluso en medio de una partida.
- Bloqueo de orientación: si se detecta touch y el viewport está en portrait (`window.innerHeight > window.innerWidth`), se muestra un mensaje a pantalla completa ("Girá tu dispositivo a horizontal para jugar") en vez del canvas/overlay, recalculado en cada `resize`/`orientationchange`.
- Control para ocultar/mostrar el overlay táctil manualmente, persistido en `localStorage` (`asteroids-touch-hidden`) con el mismo patrón `try/catch` que el skin de spec 11.
- El overlay respeta el mismo guard de pausa que ya usa el teclado (`pausedRef`): los botones no disparan acciones mientras el juego está en pausa o el modal de fin de partida está abierto.

**Out of scope (para specs futuros):**

- Generalizar el patrón de controles táctiles a Tetris, Arkanoid o Snake.
- Cambios a `GamePlayer.tsx`, `GameEngineProps` o `lib/game-engines.ts` (todo el estado nuevo vive en `AsteroidsGame.tsx`, mismo criterio que spec 11).
- Soporte real de layout portrait; en portrait solo se pide rotar el dispositivo.
- Gestos (swipe/drag) como alternativa a los botones — el esquema elegido es overlay de botones virtuales únicamente.
- Vibración háptica (`navigator.vibrate`) u otro feedback más allá del estado visual "presionado" del botón.
- Cambios al tag hardcodeado "TECLADO / TÁCTIL" en `app/juegos/[id]/page.tsx` (dato compartido del catálogo, ya cubierto por decisión de spec 05).

## Data model

```ts
// components/games/asteroids/AsteroidsGame.tsx
type TouchAction = "rotateLeft" | "rotateRight" | "thrust" | "fire";

const TOUCH_HIDDEN_STORAGE_KEY = "asteroids-touch-hidden";

// Mapea cada botón virtual a la misma tecla lógica que ya escucha el motor,
// para no duplicar lógica de input:
const TOUCH_ACTION_KEYS: Record<TouchAction, string> = {
  rotateLeft: "ArrowLeft",
  rotateRight: "ArrowRight",
  thrust: "ArrowUp",
  fire: "Space",
};
```

Estado nuevo en el componente: `isTouchDevice: boolean`, `isPortrait: boolean`, `touchOverlayHidden: boolean`, y `activeTouchesRef = useRef<Map<number, TouchAction>>(new Map())` para trackear cada dedo por `Touch.identifier`. No se agregan columnas ni tablas en Supabase, ni se toca `GameEngineProps`/`GAME_ENGINES` — todo vive dentro de `AsteroidsGame.tsx`.

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 12-asteroids-touch-controls`) se crea y activa la rama `spec-12-asteroids-touch-controls` (`AutoCreateBranch: true`). Cada paso completado se commitea por separado, sin agrupar varios pasos en un mismo commit.

1. Agregar `const [isTouchDevice, setIsTouchDevice] = useState(false)` y un `useEffect` de montaje que evalúa `window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window` y lo guarda. Sin cambios visuales todavía — el sistema queda funcional.
2. Agregar `const [isPortrait, setIsPortrait] = useState(false)` con un handler que compara `window.innerHeight > window.innerWidth`, evaluado al montar y en cada `resize`/`orientationchange` (con cleanup). Cuando `isTouchDevice && isPortrait`, el componente retorna temprano un overlay a pantalla completa con el mensaje "Girá tu dispositivo a horizontal para jugar" en vez del canvas.
3. Agregar `TouchAction`, `TOUCH_ACTION_KEYS`, `TOUCH_HIDDEN_STORAGE_KEY` como constantes de módulo y `activeTouchesRef`. Agregar `handleTouchButtonStart(action, touchId)` / `handleTouchButtonEnd(touchId)` que escriben directamente en el mismo objeto `keys`/`justPressed` que ya usan los listeners de teclado (vía `TOUCH_ACTION_KEYS[action]`), gateadas por `pausedRef.current` igual que `handleKeyDown`.
4. Agregar el overlay DOM de 4 botones virtuales, con `position: absolute` sobre el canvas, visibles solo si `isTouchDevice && !isPortrait && !touchOverlayHidden`. Layout final en forma de cruz tipo D-pad (ajustado a pedido del usuario tras revisar el resultado en pantalla y luego en un celular real — ver _Decisions_): empuje arriba-centro, rotar izquierda/derecha abajo a los costados, en un grid de 3×2 celdas de 52px (`gap: 4`) pegado al borde inferior izquierdo (`bottom: 16`); disparo como botón único separado en la esquina inferior derecha (`bottom: 44`), sin agruparse con el resto. Cada botón usa `onTouchStart`/`onTouchEnd`/`onTouchCancel` con `event.preventDefault()` (no `onClick`, para permitir multi-touch real vía `event.changedTouches`), coloreados con `SKIN_PALETTES[skin]` (el estado reactivo — ver _Ajustes durante la implementación_).
5. Agregar `const [touchOverlayHidden, setTouchOverlayHidden] = useState(false)`, un `useEffect` de montaje que lee `TOUCH_HIDDEN_STORAGE_KEY` de `localStorage` (`try/catch`), y un botón pequeño ("Ocultar controles" / "Mostrar controles") que togglea y persiste el estado (`try/catch`), visible solo cuando `isTouchDevice && !isPortrait`.
6. Verificar manualmente con `npm run dev` en `/juegos/asteroides/jugar`, emulando un dispositivo táctil desde el device toolbar de Chrome DevTools: en portrait aparece el mensaje de rotar; en landscape aparecen los 4 botones con el color del skin activo; combinaciones simultáneas (empuje+rotar+disparo) mueven la nave y disparan igual que con teclado; ocultar/mostrar el overlay funciona y persiste tras recargar; en un dispositivo sin touch el overlay nunca aparece y el teclado no cambia; confirmar que pausa, power-up, niveles, vidas, HUD externo, modal de fin de partida, guardado de puntuación y selector de skin siguen funcionando igual; confirmar que Tetris, Arkanoid y Snake no cambiaron de comportamiento.

## Acceptance criteria

- [x] En un dispositivo/emulación con `pointer: coarse` u `ontouchstart`, entrar a `/juegos/asteroides/jugar` en portrait muestra un mensaje pidiendo rotar el dispositivo, sin mostrar el canvas.
- [x] En el mismo dispositivo en landscape se muestra el canvas junto con un overlay de 4 botones virtuales (rotar izquierda, rotar derecha, empuje, disparo).
- [x] Cada botón produce exactamente el mismo efecto que su tecla equivalente (`ArrowLeft`/`ArrowRight`/`ArrowUp`/`Space`).
- [x] Es posible mantener presionados varios botones a la vez (ej. empuje + rotar) y que ambas acciones se apliquen simultáneamente, igual que con teclado.
- [x] Los botones cambian de color según el skin activo (clasico/neon/retro), incluso si el skin se cambia en medio de una partida.
- [x] Mientras el juego está pausado o el modal de fin de partida está abierto, los botones táctiles no disparan acciones de juego.
- [x] Existe un control para ocultar/mostrar el overlay táctil, y esa preferencia persiste en `localStorage` entre sesiones.
- [x] Si `localStorage` no está disponible, el juego sigue funcionando normalmente y el overlay solo deja de recordar si estaba oculto, sin errores en consola.
- [x] En un dispositivo sin soporte táctil, el overlay, el botón de ocultar y el mensaje de rotar nunca aparecen, y el teclado funciona exactamente igual que antes de este spec.
- [x] `GamePlayer.tsx`, `GameEngineProps` y `lib/game-engines.ts` no cambian.
- [x] Tetris, Arkanoid y Snake no cambian de comportamiento.
- [x] `npm run build` compila sin errores de TypeScript.

## Decisions

- **Sí:** overlay de botones virtuales en vez de gestos (swipe/drag). Razón: decisión explícita del usuario — más consistente entre juegos futuros y más fácil de mapear 1:1 a las teclas ya escuchadas.
- **Sí:** Asteroids como piloto en vez de empezar por el juego más simple (Snake). Razón: decisión explícita del usuario — al ser el caso con más acciones simultáneas, valida el caso difícil (multi-touch) antes de generalizar.
- **Sí:** los botones se colorean según el skin activo, reutilizando `SKIN_PALETTES` de spec 11 en vez de un estilo genérico. Razón: decisión explícita del usuario.
- **Sí:** detección automática por tipo de puntero en vez de un toggle manual para decidir si el overlay existe. Razón: decisión explícita del usuario — el juego debe funcionar en el teléfono sin configuración previa.
- **Sí:** en dispositivos híbridos (touch + teclado) el overlay se muestra igual y el teclado sigue funcionando en paralelo, más un botón manual para ocultar el overlay. Razón: decisión explícita del usuario.
- **Sí:** en portrait se fuerza un mensaje de "girá tu dispositivo" en vez de reacomodar el layout. Razón: decisión explícita del usuario — el canvas es 800×600 (4:3) y dejaría muy poco espacio real para los 4 botones en portrait.
- **Sí:** el layout final agrupa empuje + rotar izquierda/rotar derecha en una cruz tipo D-pad (como el Game Boy), con el disparo como botón único separado, en vez de las dos filas horizontales agrupadas de a pares descritas originalmente en el paso 4. Razón: decisión explícita del usuario tras revisar el resultado en pantalla.
- **Sí:** los botones se redujeron de 64px a 52px y el overlay se pegó al borde inferior real del canvas (`bottom: 16` en vez de `bottom: 60`), reubicando "Ocultar/Mostrar controles" arriba de la cruz. Razón: decisión explícita del usuario tras revisar una captura en un celular real, donde el layout anterior se veía desproporcionado para el tamaño de pantalla disponible.
- **No:** no se generaliza el patrón a Tetris/Arkanoid/Snake en este spec. Razón: decisión explícita del usuario — mismo criterio que spec 11, generalizar en specs futuros una vez validado el patrón.
- **No:** no se tocan `GamePlayer.tsx`, `GameEngineProps` ni `GAME_ENGINES`. Razón: mismo criterio que spec 11 — mantener el cambio 100% contenido en `AsteroidsGame.tsx`.
- **No:** no se implementan gestos, vibración háptica, ni soporte real de portrait. Razón: fuera del alcance acordado para este spec piloto.

## Ajustes durante la implementación

Tres desviaciones técnicas respecto a la letra literal del plan de implementación, encontradas y resueltas mientras se codificaba cada paso (no son decisiones de producto — son correcciones necesarias para que el comportamiento pedido funcionara de verdad):

- **Portrait no desmonta el `<canvas>`** (paso 2). El plan decía "el componente retorna temprano ... en vez del canvas", pero el `useEffect` que inicializa el loop del juego corre una sola vez al montar sobre `canvasRef.current`; si el canvas no se renderizara en el primer paint, el juego nunca arrancaría al rotar el dispositivo de portrait a landscape. Solución: el canvas queda siempre montado y el mensaje de "girá tu dispositivo" se superpone encima (`position: absolute`, fondo opaco), sin tocar el ciclo de vida del loop.
- **Color de los botones vía `skin` (estado reactivo), no `skinRef.current`** (paso 4). `skinRef.current` sólo se sincroniza en un `useEffect` que corre después de confirmar el render, así que leerlo en el JSX de los botones dejaría el color desfasado un ciclo al cambiar de skin en medio de una partida — justo el caso que pide el criterio de aceptación correspondiente.
- **Sin gate explícito de `pausedRef.current` en los handlers táctiles** (paso 3), pese a que el plan dice "gateadas por `pausedRef.current` igual que `handleKeyDown`". `handleKeyDown` tampoco chequea `pausedRef`: el gate real ya lo hace el loop principal, que no llama a `update()` mientras el juego está pausado (y deja de correr del todo cuando termina la partida). Replicar la estructura exacta de `handleKeyDown` cubre el criterio de aceptación sin agregar un chequeo redundante.

## Risks

| Riesgo                                                                                                                                                                        | Mitigación                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los eventos táctiles nativos pueden disparar además eventos sintéticos de mouse/click en algunos navegadores, duplicando la acción.                                           | Cada botón llama `event.preventDefault()` en `onTouchStart`/`onTouchEnd` y no registra `onClick`, evitando el doble disparo.                                                                                                                                                                                                             |
| Multi-touch mal trackeado podría "pegar" un botón presionado si el usuario levanta el dedo fuera del botón o interrumpe el gesto (ej. llamada entrante).                      | Usar `activeTouchesRef` indexado por `Touch.identifier` y escuchar también `onTouchCancel`, liberando la tecla asociada en ambos casos.                                                                                                                                                                                                  |
| El mensaje de "girá tu dispositivo" podría no recalcularse si el usuario cambia el tamaño de la ventana sin recargar (ej. modo split-screen en tablet).                       | Se recalcula en cada `resize`/`orientationchange`, no solo al montar.                                                                                                                                                                                                                                                                    |
| El overlay de botones podría superponerse visualmente con el HUD interno del canvas, el `<select>` de skin (spec 11, esquina inferior derecha) o el botón de ocultar/mostrar. | Layout final en cruz: empuje/rotar izq/rotar der agrupados en la esquina inferior izquierda (pegados al borde), disparo solo en la esquina inferior derecha por encima del `<select>` de skin, y "Ocultar/Mostrar controles" apilado arriba de la cruz; verificado sin superposiciones con viewport mobile-landscape simulado (740×360). |

## What is **not** in this spec

- Generalizar el patrón de controles táctiles a Tetris, Arkanoid o Snake.
- Cambios a `GamePlayer.tsx`, `GameEngineProps` o `lib/game-engines.ts`.
- Soporte real de layout portrait.
- Gestos (swipe/drag) como alternativa a los botones.
- Vibración háptica u otro feedback táctil.
- Cambios al tag "TECLADO / TÁCTIL" del catálogo.

Cada uno de estos, si se implementa, va en su propio spec.
