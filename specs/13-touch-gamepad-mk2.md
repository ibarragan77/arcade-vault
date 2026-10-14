# SPEC 13 — Gamepad táctil MK-II (apariencia de `references/gamepad-assets`)

> **Status:** Draft
> **Depends on:** SPEC 11, SPEC 12
> **Date:** 2026-10-01
> **Objective:** Reemplazar los botones táctiles circulares de Asteroids por un componente reutilizable `TouchGamepad` que replique la apariencia del "Gamepad MK-II" de `references/gamepad-assets/` (D-pad en cruz con hub luminoso + botones A/B con relieve y glow), con los acentos tomados del skin activo y sin cambiar el comportamiento de input de la spec 12.

## Por qué existe este spec

La spec 12 dejó Asteroids jugable en un celular con un overlay funcional, pero con un estilo provisorio: botones circulares de 52px con borde de color y fondo translúcido, armados con estilos inline (`touchButtonStyle`). En `references/gamepad-assets/` (`gamepad.html` + `gamepad-neon.png`) ya existe el diseño definitivo del gamepad de Arcade Vault: el "MK-II". Este spec trae esa apariencia al juego y la deja en un componente compartido, para que las futuras specs de soporte móvil de Tetris, Arkanoid y Snake lo reutilicen en vez de volver a dibujar botones.

## Scope

**In:**

- Nuevo componente cliente `components/games/TouchGamepad.tsx` con su CSS Module `components/games/TouchGamepad.module.css`, que replica la estructura visual del MK-II **sin carcasa** (sin el panel `.gp` ni sus pseudo-elementos de borde y puntitos):
  - D-pad en cruz de 144×144px: 4 botones de 46px (`border-radius: 8px`, gradiente oscuro, sombra inferior `0 4px 0`, relieve interno) con flechas SVG triangulares, y un hub central de 46px con una gema en rombo que pulsa (`@keyframes pulse-led`, 2s).
  - Botones de acción A y B de 64px, en el orden de la referencia (B a la izquierda y A a la derecha, `gap: 16px`), circulares, con gradiente radial, brillo especular, glow exterior, anillo punteado (`.ab-ring`) y la letra en `var(--pixel)` (Press Start 2P, ya cargada por `app/layout.tsx`).
  - Estado presionado idéntico al `.on` de la referencia (hundimiento `translateY`, glow interno y externo, anillo visible), controlado por estado React según los dedos activos sobre cada botón, no por `:active`.
  - Botones deshabilitados: se renderizan con el mismo aspecto pero atenuados (opacidad reducida, sin glow), con el atributo `disabled`, sin estado presionado y sin llamar callbacks.
  - La gema del hub no se anima bajo `prefers-reduced-motion: reduce`.
- Tamaños fijos de la versión móvil de la referencia (46px el D-pad y 64px A/B), sin variante de escritorio: el overlay solo se muestra en dispositivos táctiles.
- Los acentos del gamepad vienen por props y se aplican como variables CSS (`--pad-primary`, `--pad-secondary`) en el contenedor raíz. Los glows y tonos translúcidos se derivan con `color-mix(in srgb, …)`. `--pad-primary` reemplaza al cian de la referencia (flechas presionadas, hub, gema y botón B) y `--pad-secondary` al magenta (botón A).
- Dos campos nuevos en `SkinPalette`/`SKIN_PALETTES` de `AsteroidsGame.tsx`: `padPrimary` y `padSecondary` (valores en _Data model_). Con el skin `neon`, el gamepad queda idéntico a `gamepad-neon.png`.
- `AsteroidsGame.tsx` reemplaza su overlay actual (la cruz de 3 botones, el botón de disparo suelto y `touchButtonStyle`) por un único `<TouchGamepad>`, con este mapeo:
  - `up` → empuje (`ArrowUp`)
  - `left` → rotar a la izquierda (`ArrowLeft`)
  - `right` → rotar a la derecha (`ArrowRight`)
  - `a` → disparo (`Space`)
  - `down` y `b` → visibles pero deshabilitados
- Ubicación como overlay flotante sobre el canvas, igual que en la spec 12:
  - D-pad pegado abajo a la izquierda (`left: 16`, `bottom: 16`).
  - Grupo A/B abajo a la derecha (`right: 16`, `bottom: 44`), por encima del `<select>` de skin.
  - El botón "Ocultar/Mostrar controles" queda apilado arriba del D-pad (`bottom: 168`).
- Se conserva todo el comportamiento de la spec 12: multi-touch por `Touch.identifier` (`changedTouches`), `preventDefault()` en `touchstart`/`touchend`/`touchcancel`, sin `onClick`, liberación de la tecla en `touchcancel`, aviso de "girá tu dispositivo" en portrait, ocultar/mostrar persistido en `asteroids-touch-hidden` y alimentación de los mismos `keysRef`/`justPressedRef` que usa el teclado.

**Out of scope (para specs futuros):**

- Agregar controles táctiles (con o sin `TouchGamepad`) a Tetris, Arkanoid o Snake.
- Actualizar `.claude/agents/mobile-porter.md` para que use `TouchGamepad` en vez del patrón inline de la spec 12.
- La carcasa/panel del MK-II (`.gp`, el borde doble, la textura de puntitos y el glow inferior) y su versión como barra debajo del canvas.
- La variante de escritorio de 50/74px y cualquier estilo `:hover`.
- Iluminar los botones del overlay al presionar las teclas físicas (el `keydown`/`keyup` de `gamepad.html`).
- El mapeo de teclado de la referencia (WASD, Z/J, X/K): Asteroids sigue escuchando solo las teclas que ya escucha.
- Funciones nuevas para `down` o `b` en Asteroids (por ejemplo, hiperespacio).
- Cambios a `GamePlayer.tsx`, `GameEngineProps` o `lib/game-engines.ts`.
- Vibración háptica.

## Data model

```ts
// components/games/TouchGamepad.tsx
export type GamepadButton = "up" | "down" | "left" | "right" | "a" | "b";

export type GamepadColors = {
  primary: string; // reemplaza al cian de la referencia: D-pad presionado, hub/gema, botón B
  secondary: string; // reemplaza al magenta de la referencia: botón A
};

type TouchGamepadProps = {
  colors: GamepadColors;
  disabled?: GamepadButton[]; // se dibujan atenuados y no llaman callbacks
  onPress: (button: GamepadButton, touchId: number) => void;
  onRelease: (touchId: number) => void;
  dpadStyle?: React.CSSProperties; // posición del D-pad, la define el padre
  actionsStyle?: React.CSSProperties; // posición del grupo A/B, la define el padre
};
```

Estado interno de `TouchGamepad`: `touchesRef = useRef<Map<number, GamepadButton>>(new Map())`, que asocia cada dedo con su botón, y `const [pressed, setPressed] = useState<ReadonlySet<GamepadButton>>(new Set())`, derivado de ese mapa y usado solo para el estado visual `.on`. El gamepad no conoce teclas ni acciones de juego: solo informa qué botón tocó qué dedo.

```ts
// components/games/asteroids/AsteroidsGame.tsx — campos nuevos en SkinPalette
type SkinPalette = {
  // ...campos existentes de spec 11...
  padPrimary: string;
  padSecondary: string;
};

// valores por skin
// clasico: padPrimary "#fff",    padSecondary "#0ff"
// neon:    padPrimary "#00f5ff", padSecondary "#ff006e"  // idéntico a gamepad-neon.png
// retro:   padPrimary "#ffb000", padSecondary "#ffb000"  // monocromo ámbar

// Mapeo del gamepad a las acciones táctiles existentes de spec 12
const GAMEPAD_ACTIONS: Partial<Record<GamepadButton, TouchAction>> = {
  up: "thrust",
  left: "rotateLeft",
  right: "rotateRight",
  a: "fire",
};
const GAMEPAD_DISABLED: GamepadButton[] = ["down", "b"];
```

`TouchAction`, `TOUCH_ACTION_KEYS`, `TOUCH_HIDDEN_STORAGE_KEY`, `activeTouchesRef`, `handleTouchButtonStart` y `handleTouchButtonEnd` se mantienen tal cual. Lo único que se elimina es `touchButtonStyle`. No hay cambios en Supabase ni en `localStorage` (no se agregan claves nuevas).

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 13-touch-gamepad-mk2`) se crea y activa la rama `spec-13-touch-gamepad-mk2` (`AutoCreateBranch: true`). Cada paso completado se commitea por separado, sin agrupar varios pasos en un mismo commit.

1. Agregar `padPrimary` y `padSecondary` a `SkinPalette` y a las tres entradas de `SKIN_PALETTES` en `AsteroidsGame.tsx`, con los valores de _Data model_. Todavía no se usan, así que no hay cambios visuales.
2. Crear `components/games/TouchGamepad.module.css` con los estilos del MK-II portados desde `references/gamepad-assets/gamepad.html`:
   - Clases `dpad`, `dp`, `dpUp`/`dpDown`/`dpLeft`/`dpRight`, `hub`, `gem`, `actions`, `ab`, `abA`, `abB`, `ring`, `letter`, `on` y `disabled`.
   - Medidas fijas de la versión de ≤620px de la referencia.
   - El cian y el magenta reemplazados por `var(--pad-primary)` y `var(--pad-secondary)`, con glows vía `color-mix`.
   - Sin carcasa ni `:hover`.
   - `@keyframes pulse-led`, desactivado bajo `prefers-reduced-motion: reduce`.
   - `touch-action: none`, `user-select: none` y `-webkit-tap-highlight-color: transparent` en todos los botones.
3. Crear `components/games/TouchGamepad.tsx` (`"use client"`):
   - Devuelve un fragmento con dos bloques hermanos: el D-pad y el grupo A/B. El padre posiciona cada uno en su esquina con las props `dpadStyle` y `actionsStyle`, que se aplican sobre el `style` de cada bloque.
   - Cada botón maneja `onTouchStart`/`onTouchEnd`/`onTouchCancel` con `preventDefault()`, recorre `e.changedTouches`, actualiza `touchesRef` y `pressed`, y llama a `onPress`/`onRelease`.
   - Los botones de `disabled` llevan el atributo `disabled` y la clase atenuada, y nunca llaman callbacks.
   - `colors` se inyecta como `--pad-primary`/`--pad-secondary` en el `style` de cada bloque.
   - Los `aria-label` van en español ("Arriba", "Abajo", "Izquierda", "Derecha", "A", "B").
   - El componente todavía no se usa en ningún lado.
4. En `AsteroidsGame.tsx`, reemplazar el overlay actual (el grid de 3 botones, el botón de disparo y `touchButtonStyle`) por `<TouchGamepad>`, con la misma condición de visibilidad (`isTouchDevice && !isPortrait && !touchOverlayHidden`):
   - `colors={{ primary: palette.padPrimary, secondary: palette.padSecondary }}`.
   - `disabled={GAMEPAD_DISABLED}`.
   - `onPress`, que traduce con `GAMEPAD_ACTIONS` y llama a `handleTouchButtonStart(action, touchId)`.
   - `onRelease={handleTouchButtonEnd}`.
   - `dpadStyle={{ position: "absolute", left: 16, bottom: 16, zIndex: 5 }}` y `actionsStyle={{ position: "absolute", right: 16, bottom: 44, zIndex: 5 }}`.
   - Mover "Ocultar/Mostrar controles" a `bottom: 168`.
5. Verificar manualmente con `npm run dev` en `/juegos/asteroides/jugar`, emulando un dispositivo táctil en landscape (por ejemplo, 740×360) desde el device toolbar de Chrome DevTools:
   - Con el skin `neon`, el gamepad se ve como `gamepad-neon.png` (sin la carcasa).
   - Cambiar a `clasico` y `retro` en plena partida recolorea el gamepad al instante.
   - ↑/←/→/A mueven la nave y disparan igual que el teclado, también en combinaciones simultáneas.
   - ↓ y B se ven atenuados y no hacen nada.
   - El estado presionado se ilumina mientras el dedo está apoyado y se apaga al soltar o cancelar.
   - No hay solapes con el `<select>` de skin ni con el botón de ocultar.
   - Ocultar/mostrar sigue persistiendo y el aviso de portrait sigue apareciendo.
   - En un dispositivo sin touch no aparece nada y el teclado no cambia.
   - Pausa, modal de fin de partida y guardado de puntuación funcionan igual.
   - Tetris, Arkanoid y Snake no cambian.
   - Correr `npm run build`.
6. Actualizar la fila `asteroides` de `references/mobile-support.md` (columna _Notas_) para indicar que el overlay usa `TouchGamepad` (MK-II) desde la spec 13.

## Acceptance criteria

- [ ] Existen `components/games/TouchGamepad.tsx` y `components/games/TouchGamepad.module.css`, y `TouchGamepad` no importa nada de Asteroids ni conoce teclas de juego.
- [ ] En `/juegos/asteroides/jugar`, con emulación táctil en landscape y skin `neon`:
  - El overlay muestra un D-pad en cruz de 4 flechas con hub central y gema pulsante abajo a la izquierda, y los botones B (cian) y A (magenta) con letra pixel abajo a la derecha.
  - Visualmente coincide con `references/gamepad-assets/gamepad-neon.png`, salvo la carcasa.
- [ ] Con los skins `clasico` y `retro`, los acentos del gamepad cambian a los valores de `padPrimary`/`padSecondary` de ese skin, incluso si el skin se cambia en medio de una partida.
- [ ] ↑, ← y → producen exactamente el mismo efecto que `ArrowUp`, `ArrowLeft` y `ArrowRight`, y A el mismo que `Space`.
- [ ] Es posible mantener presionados varios botones a la vez (por ejemplo ↑ + ← + A) y las tres acciones se aplican simultáneamente.
- [ ] Un botón presionado muestra el estado `.on` de la referencia (hundido + glow) mientras haya un dedo sobre él, y vuelve al estado normal al soltar o en `touchcancel`, sin quedar "pegado".
- [ ] ↓ y B se ven atenuados, tienen el atributo `disabled` y tocarlos no produce ninguna acción ni estado presionado.
- [ ] Con `prefers-reduced-motion: reduce`, la gema del hub no se anima.
- [ ] El gamepad, el botón "Ocultar/Mostrar controles" y el `<select>` de skin no se superponen en un viewport de 740×360.
- [ ] Ocultar/mostrar controles, el aviso de portrait, la guarda de pausa y la persistencia en `asteroids-touch-hidden` funcionan igual que en la spec 12.
- [ ] En un dispositivo sin soporte táctil el gamepad nunca aparece y el teclado funciona exactamente igual que antes.
- [ ] `touchButtonStyle` ya no existe en `AsteroidsGame.tsx`.
- [ ] `GamePlayer.tsx`, `GameEngineProps` y `lib/game-engines.ts` no cambian, y Tetris, Arkanoid y Snake no cambian de comportamiento.
- [ ] `npm run build` compila sin errores de TypeScript y `npm run lint` no reporta errores.

## Decisions

- **Sí:** el gamepad es un componente compartido (`components/games/TouchGamepad.tsx`), pero en este spec solo lo usa Asteroids. Razón: decisión explícita del usuario. Asteroids es el único juego con overlay táctil hoy, y el componente queda listo para las specs de mobile de los otros juegos.
- **Sí:** overlay flotante sin carcasa, en vez de la carcasa translúcida sobre el canvas o de un panel debajo de él. Razón: decisión explícita del usuario. No le quita alto al canvas 4:3 en un landscape de celular, que ya es justo.
- **Sí:** se dibuja el gamepad completo (4 flechas + A + B) con ↓ y B visibles pero inactivos, en vez de ocultar los botones que Asteroids no usa. Razón: decisión explícita del usuario. Mantiene el aspecto fiel a la referencia y una sola forma para todos los juegos.
- **Sí:** se mantiene la forma, el relieve, las sombras y la animación del MK-II, pero los acentos salen del skin activo. Razón: decisión explícita del usuario. Preserva el punto "colores por skin" del checklist de `mobile-porter` (spec 12), y con `neon` el resultado es idéntico a la captura.
- **Sí:** se agregan los campos `padPrimary`/`padSecondary` a `SKIN_PALETTES`, en vez de reusar `ship`/`bullet`. Razón: decisión explícita del usuario. Con `neon`, reusar `ship` habría pintado el D-pad de amarillo y no de cian como en la referencia.
- **Sí:** estilos en un CSS Module propio, el primero del repo. Razón: decisión explícita del usuario. El MK-II necesita pseudo-elementos, `@keyframes`, `prefers-reduced-motion` y variables CSS, que no son posibles con estilos inline, y así se evita agregar ~150 líneas a `app/globals.css` para un único componente.
- **Sí:** tamaño fijo de la versión móvil de la referencia (46px el D-pad y 64px A/B). Razón: decisión explícita del usuario. El overlay solo existe en dispositivos táctiles, y ese tamaño entra en ~360px de alto junto al botón de ocultar.
- **Sí:** el estado presionado se controla con estado React derivado de los dedos activos, no con `:active`. Razón: decisión explícita del usuario. `:active` es poco confiable en mobile cuando se llama `preventDefault()` en `touchstart`, que es imprescindible para el multi-touch de la spec 12.
- **No:** el teclado físico no ilumina los botones del overlay. Razón: decisión explícita del usuario. Queda fuera para mantener el componente desacoplado del input de teclado de cada juego.
- **No:** no se actualiza el agente `mobile-porter` para usar `TouchGamepad`. Razón: fuera del alcance acordado; se hará cuando se generalice el soporte móvil a otro juego.
- **No:** no se tocan `GamePlayer.tsx`, `GameEngineProps` ni `GAME_ENGINES`. Razón: mismo criterio que las specs 11 y 12.

## Risks

| Riesgo                                                                                                                                         | Mitigación                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color-mix()` no está disponible en navegadores móviles viejos (Safari < 16.2, Chrome < 111), así que los glows derivados quedarían sin color. | Cada `box-shadow`/`background` con `color-mix` lleva antes una declaración de respaldo con un color sólido, que el navegador usa si no entiende `color-mix`. Solo se pierde el glow translúcido, no la usabilidad.        |
| El grupo A/B (144px de ancho) y el D-pad (144px) podrían no entrar a los costados en un canvas angosto, o tapar demasiado del juego.           | Se verifica en 740×360 (paso 5). La suma (144 + 144 + 32 de márgenes = 320px) es menor que el ancho del canvas en ese viewport. Si no alcanza, se ajusta el `bottom`/`left`/`right` sin cambiar el tamaño de los botones. |
| Un dedo que se desliza de un botón a otro sin levantarse no cambia de botón (los touch events quedan asociados al elemento donde empezaron).   | Es el mismo comportamiento que la spec 12, ya validado en un celular real. El botón original se libera al levantar el dedo o en `touchcancel`.                                                                            |
| El estado visual (`pressed` en `TouchGamepad`) y el estado de input (`activeTouchesRef` en Asteroids) podrían desincronizarse.                 | Ambos se actualizan en los mismos handlers de `touchend`/`touchcancel` por `Touch.identifier`. Los botones deshabilitados no registran el dedo en ninguno de los dos.                                                     |
| `mobile-porter` sigue documentando el patrón inline de la spec 12, que este spec reemplaza en Asteroids.                                       | Se anota en `references/mobile-support.md` (paso 6) y queda explícito en _Out of scope_ que el agente se actualiza en un spec futuro.                                                                                     |

## What is **not** in this spec

- Controles táctiles para Tetris, Arkanoid o Snake.
- Actualizar el agente `mobile-porter`.
- La carcasa/panel del MK-II y la variante de escritorio de 50/74px.
- Feedback visual del teclado físico sobre el overlay.
- Funciones nuevas para ↓ o B en Asteroids.
- Cambios a `GamePlayer.tsx`, `GameEngineProps` o `lib/game-engines.ts`.

Cada uno de estos, si se implementa, va en su propio spec.
