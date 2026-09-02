# SPEC 05 — Juego real de Asteroids (adaptación de `references/started-games/02-asteroids`)

> **Status:** Implemented
> **Depends on:** SPEC 01
> **Date:** 2026-09-01
> **Objective:** Adaptar el juego de Asteroids ya construido en `references/started-games/02-asteroids` (canvas HTML5 puro) a un componente cliente de Next.js, agregarlo como una entrada nueva del catálogo (`asteroides`) e integrarlo con el HUD, pausa, modal de fin de partida y guardado de puntuación ya existentes en el Reproductor, sin tocar el resto de los juegos.

## Por qué existe este spec

Todo el catálogo actual (`GAMES` en `lib/data.ts`) usa el mismo Reproductor genérico (`app/juegos/[id]/jugar/GamePlayer.tsx`) de SPEC 01: una pantalla CRT con "enemigos" animados en CSS y una puntuación que sube sola con `setInterval`, sin lógica de juego real. `references/started-games/02-asteroids` ya tiene un juego de Asteroids completo y funcional (nave, asteroides que se parten, power-up de disparo triple, partículas, vidas, niveles) escrito en un `game.js` de un solo archivo con estado a nivel de módulo y listeners globales — no apto para montarse/desmontarse como un componente React. Este spec lo porta a un componente propio que reemplaza la pantalla falsa solo para esta entrada del catálogo, dejando el resto del Reproductor (HUD, pausa, modal, guardado de puntaje) intacto y reutilizado.

## Scope

**In:**

- Nueva entrada `asteroides` en `GAMES` (`lib/data.ts`), independiente del placeholder existente `rocas` (que no se toca).
- Nueva portada `.cover-asteroides` en `app/globals.css`, con el mismo patrón visual (gradiente + capas decorativas) que el resto de las portadas del catálogo.
- Componente `components/games/asteroids/AsteroidsGame.tsx`: puerto a TypeScript de la lógica completa de `game.js` (nave, disparo, asteroides con partición en fragmentos, power-up de disparo triple, partículas de explosión, envolvimiento de bordes, invencibilidad temporal con parpadeo), como componente cliente con su propio `<canvas>`, ciclo de vida vía `useEffect` y comunicación con el Reproductor mediante props/callbacks.
- Modificación de `app/juegos/[id]/jugar/GamePlayer.tsx` para renderizar `AsteroidsGame` en lugar del `.game-arena` falso cuando `game.id === "asteroides"`, alimentando el HUD (Puntuación, Vidas, Nivel) con los valores reales del motor y disparando el modal de fin de partida existente al perder la última vida o al pulsar "FIN".

**Out of scope (para specs futuros):**

- Controles táctiles/móviles (el original y este spec son solo teclado: ← → rotar, ↑ impulso, Espacio disparar).
- Sonido/efectos de audio (el original tampoco los tiene).
- Corregir el tag genérico "TECLADO / TÁCTIL" de la ficha de detalle para que sea específico por juego.
- Reemplazar o modificar el juego "ROCAS" ni ningún otro juego del catálogo existente — siguen usando el simulador falso sin cambios.
- Generalizar `GamePlayer` a un sistema de motores de juego inyectables/plug-in para futuros juegos reales — este spec integra Asteroids como caso especial acotado (`game.id === "asteroides"`), no rediseña el Reproductor.
- Leaderboard real o persistente para Asteroids — la ficha de detalle sigue usando `seededScores()` simulado, igual que el resto del catálogo.

## Data model

Nueva entrada literal en `GAMES` (`lib/data.ts`), usando el tipo `Game` ya existente (sin cambios de tipos):

```ts
{
  id: "asteroides",
  title: "ASTEROIDES",
  short: "Nave triangular, gravedad cero, rocas que se parten en pedazos.",
  long: "Pilota una nave triangular a la deriva en un campo de asteroides toroidal. Rota, impulsa y dispara para partir rocas grandes en medianas y medianas en pequeñas, mientras recoges power-ups de disparo triple. Tres vidas, con invencibilidad temporal al reaparecer.",
  cat: "SHOOTER",
  cover: "cover-asteroides",
  color: "yellow",
  best: 38900,
  plays: "3.1K",
}
```

Contrato del nuevo componente (sin exportar tipos fuera del archivo):

```ts
// components/games/asteroids/AsteroidsGame.tsx
type AsteroidsGameProps = {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};
```

El estado interno del motor (nave, balas, asteroides, partículas, power-ups) deja de vivir en variables de módulo (`let ship, bullets, ...` como en el original) y pasa a crearse de nuevo en cada montaje del componente, dentro de un `useEffect`, para que dos partidas (o un remount por reinicio) no compartan estado.

## Implementation plan

**Flujo de trabajo en git:** al iniciar la implementación (`/spec-impl 05-asteroids-real-game`) se crea y activa la rama `spec-05-asteroids-real-game` (comportamiento por defecto vía `AutoCreateBranch: true`). Cada vez que se complete un paso de este plan y se pase al siguiente, se debe crear un commit con los cambios de ese paso, con un mensaje descriptivo. No se agrupan varios pasos en un mismo commit.

1. Agregar el bloque `.cover-asteroides` a `app/globals.css` (junto a los demás `.cover-*`, después de `.cover-rocas`), siguiendo el mismo patrón (`background` + `::after`/`::before` decorativos) que el resto de las portadas, con una composición visualmente distinta a `.cover-rocas` para que ambas tarjetas del catálogo no se vean idénticas.
2. Agregar la nueva entrada `asteroides` a `GAMES` en `lib/data.ts` (ver Data model). Con este paso el juego ya aparece en `/games`, tiene ficha en `/juegos/asteroides` con leaderboard simulado, y es jugable en `/juegos/asteroides/jugar` con el Reproductor falso genérico (el sistema queda funcional de punta a punta tras este paso).
3. Crear `components/games/asteroids/AsteroidsGame.tsx`, portando `Bullet`, `Asteroid`, `PowerUp`, `Ship`, `Particle` y las constantes (`RADII`, `SPEEDS`, `POINTS`, `POWERUP_DROP_CHANCE`, `POWERUP_DURATION`, `POWERUP_TTL`, `TRIPLE_SPREAD`, `W = 800`, `H = 600`) desde `references/started-games/02-asteroids/game.js` casi verbatim, con estas adaptaciones:
   - El estado del juego (`ship`, `bullets`, `asteroids`, `particles`, `powerUps`, `score`, `lives`, `level`, `state`, etc.) se crea dentro de un `useEffect` que corre una sola vez al montar, no en variables de módulo.
   - Los listeners `window.addEventListener('keydown'/'keyup', ...)` se registran dentro de ese mismo `useEffect` y se remueven en su función de cleanup (el original los deja para siempre a nivel de módulo, lo cual no es válido en un componente que se monta/desmonta).
   - El `canvas`/`ctx` se obtienen vía `useRef<HTMLCanvasElement>` dentro del efecto, no por `document.getElementById`.
   - Se elimina `drawOverlay('GAME OVER', ...)` y el reinicio interno vía Espacio (`if (pressed('Space')) initGame();` en `state === 'gameover'`): en su lugar, en el instante en que `lives <= 0` (dentro de `killShip()`), se llama una única vez a `props.onGameOver(score)` y se detiene el loop (no se vuelve a llamar `requestAnimationFrame`).
   - `drawHUD()` **se conserva tal cual** (SCORE, NIVEL, iconos de vidas y el temporizador "3x" del power-up dibujados directamente en el canvas) — es el único texto que sigue dibujando el motor sobre la pantalla del juego; conviven con el HUD externo de `GamePlayer.tsx` (son informativamente redundantes pero visualmente distintos: uno es parte de la estética arcade del propio juego, el otro es el marco de la plataforma). Solo se retira `drawOverlay`, nunca `drawHUD`.
   - Se llama a `props.onScoreChange(score)`, `props.onLivesChange(lives)` y `props.onLevelChange(level)` cada vez que esos valores cambian dentro de `update()` (colisión bala-asteroide, `killShip()`, `nextLevel()`).
   - Cuando `props.paused === true`, el loop sigue en `requestAnimationFrame` pero no llama a `update(dt)` para ese frame (sí sigue llamando a `draw()`, dejando el último frame congelado en pantalla); al pasar de pausado a no pausado, se resetea `lastTime` a `null` para que el próximo `dt` no incluya el tiempo pausado.
   - Al desmontar el componente, el cleanup del `useEffect` cancela el `requestAnimationFrame` pendiente (`cancelAnimationFrame`) además de remover los listeners de teclado.
   - El `<canvas>` se renderiza como `<canvas ref={canvasRef} width={800} height={600} style={{ width: "100%", height: "100%", display: "block" }} />`, manteniendo la resolución lógica fija 800×600 del original y escalando visualmente al 100% de `.crt-screen` (que ya usa `aspect-ratio: 4/3`, igual proporción).
4. Editar `app/juegos/[id]/jugar/GamePlayer.tsx`:
   - Agregar `const isAsteroids = game.id === "asteroides";` y `const [resetKey, setResetKey] = useState(0);`.
   - Añadir un `if (isAsteroids) return;` al inicio del `useEffect` del `setInterval` que simula el puntaje falso, y otro al inicio del `useEffect` que simula el avance de nivel falso (`score % 2500`), para que no compitan con los valores reales que reporta `AsteroidsGame`.
   - Dentro de `.crt-screen`, reemplazar el `<div className="game-arena">...</div>` por un renderizado condicional: si `isAsteroids`, `<AsteroidsGame key={resetKey} paused={paused} onScoreChange={setScore} onLivesChange={setLives} onLevelChange={setLevel} onGameOver={endGame} />`; si no, el `.game-arena` falso existente (sin cambios).
   - En `restart()`, cuando `isAsteroids` es `true`, además de los `setScore(0); setLives(3); setLevel(1); ...` existentes, incrementar `resetKey` (`setResetKey((k) => k + 1)`) para forzar el remount completo de `AsteroidsGame` (nave, asteroides y power-ups vuelven a su estado inicial).
5. Verificar manualmente con `npm run dev`: abrir `/juegos/asteroides`, jugar una partida completa en `/juegos/asteroides/jugar` (mover, disparar, partir asteroides, perder las 3 vidas), confirmar que el HUD, la pausa, el modal de fin de partida, el guardado de puntuación y "JUGAR DE NUEVO" funcionan como se describe en Acceptance criteria, y confirmar que el resto de los juegos del catálogo (incluido "ROCAS") no cambiaron su comportamiento.

## Acceptance criteria

- [ ] `/games` incluye la tarjeta "ASTEROIDES" (categoría SHOOTER, portada `cover-asteroides`) junto al resto del catálogo.
- [ ] `/juegos/asteroides` muestra la ficha del juego con portada, tags, descripción, stats y leaderboard simulado, igual que el resto del catálogo.
- [ ] `/juegos/asteroides/jugar` renderiza el canvas real del juego (no el `.game-arena` falso) dentro de la pantalla CRT existente, escalado al 100% del contenedor sin distorsionar la proporción 4:3.
- [ ] Las flechas ← → rotan la nave, ↑ impulsa y Espacio dispara; el disparo respeta el cooldown, y el spread de triple disparo se activa mientras el power-up recogido está vigente.
- [ ] Los asteroides grandes se parten en dos medianos y los medianos en dos pequeños al ser destruidos, sumando 20/50/100 puntos según el tamaño destruido; nave, balas y asteroides envuelven los bordes del área de juego.
- [ ] El HUD superior (Puntuación, Vidas, Nivel) refleja en tiempo real los valores reales que reporta `AsteroidsGame`, no valores simulados.
- [ ] El canvas sigue dibujando su propio HUD interno (SCORE, NIVEL, iconos de vidas y el temporizador "3x" cuando el power-up está activo), igual que en el original, además del HUD externo de `GamePlayer.tsx`.
- [ ] Perder la última vida dispara automáticamente el modal "FIN DEL JUEGO" existente con la puntuación final correcta, sin ningún overlay de "GAME OVER" dibujado dentro del canvas (el HUD interno del canvas no se ve afectado).
- [ ] El botón "FIN" del HUD también dispara el modal de fin de partida con la puntuación acumulada hasta ese momento, incluso si aún quedan vidas.
- [ ] El botón "PAUSA" congela el juego (deja de avanzar la física/estado, se ve el último frame) y "REANUDAR" lo continúa sin saltos bruscos de posición; mientras está en pausa se ve el overlay genérico "EN PAUSA" ya existente en `GamePlayer.tsx`.
- [ ] Guardar la puntuación en el modal de fin de partida llama a `saveScore({ game: "asteroides", score, name })`, igual que el resto de los juegos.
- [ ] "JUGAR DE NUEVO" reinicia completamente la partida (nave al centro, 3 vidas, nivel 1, puntuación 0, asteroides nuevos), sin arrastrar estado de la partida anterior.
- [ ] "SALIR" navega a `/juegos/asteroides` y no deja el loop de animación ni los listeners de teclado corriendo en segundo plano tras desmontar el Reproductor.
- [ ] El resto de los juegos del catálogo (incluido "ROCAS") siguen mostrando el `.game-arena` falso con el puntaje simulado por `setInterval`, sin cambios de comportamiento.
- [ ] `npm run build` compila sin errores de TypeScript.

## Decisions

- **Sí:** se agrega `asteroides` como entrada nueva e independiente del catálogo, sin reemplazar el placeholder existente `rocas`. Razón: decisión explícita del usuario ("el juego no es rocas").
- **Sí:** arquitectura de componente propio (`AsteroidsGame`) orquestado por `GamePlayer` vía props/callbacks, en vez de generalizar `GamePlayer` a un sistema de motores inyectables para juegos futuros. Razón: decisión explícita del usuario; acota el cambio a un solo juego real sin rediseñar el Reproductor genérico.
- **Sí:** el canvas mantiene la resolución lógica fija 800×600 del original (sin tocar su física/coordenadas) y se escala por CSS al 100% de `.crt-screen`. Razón: decisión explícita del usuario; la proporción 4:3 del original ya coincide con la del contenedor existente.
- **Sí:** el reinicio se logra remontando `AsteroidsGame` mediante un `key` incremental (`resetKey`), no con un método `reset()` imperativo vía `ref`. Razón: decisión explícita del usuario; más simple y evita mantener sincronizado un método de reset manual con todo el estado interno del motor.
- **Sí:** se elimina el overlay interno de "GAME OVER" del canvas original (`drawOverlay`); el único fin de partida visible es el modal React ya existente. Razón: decisión explícita del usuario, evita UI duplicada y el atajo de "Espacio para reiniciar" original, que ahora convive mal con el modal.
- **No:** no se elimina el HUD interno del canvas (`drawHUD`: SCORE, NIVEL, vidas, temporizador "3x"). Razón: corrección explícita del usuario — solo el overlay de fin de partida se retira; el HUD propio del juego (parte de su estética arcade) se conserva y convive con el HUD externo de la plataforma.
- **Sí:** la pausa congela el loop de `update` (mantiene el último frame dibujado) y reutiliza el overlay genérico "EN PAUSA" de `GamePlayer.tsx`; el motor no dibuja su propio overlay de pausa. Razón: decisión explícita del usuario, evita duplicar UI de pausa.
- **Sí:** alcance de controles limitado a teclado, idéntico al original (← → rotar, ↑ impulso, Espacio disparar); no se agregan controles táctiles/móviles. Razón: decisión explícita del usuario; la ficha genérica "TECLADO / TÁCTIL" del detalle queda como está, por ser un dato hardcodeado compartido con todo el catálogo.
- **Sí:** categoría `SHOOTER` y color de acento `yellow`. Razón: decisión explícita del usuario, consistente con el placeholder "ROCAS" que este juego reemplaza temáticamente (aunque con id distinto).
- **Sí:** se crea una portada nueva `.cover-asteroides` en vez de reutilizar `.cover-rocas`. Razón: aunque ambas entradas comparten temática, reutilizar la misma portada haría indistinguibles dos tarjetas distintas en el catálogo; se sigue el mismo patrón visual que el resto de las portadas.
- **Sí:** se corrige un problema del código original al portarlo a React: los listeners de teclado y el loop de `requestAnimationFrame`, que en `game.js` se registran una sola vez a nivel de módulo y nunca se limpian, ahora se registran y limpian dentro del ciclo de vida del componente (`useEffect` con cleanup). Razón: necesario para funcionar correctamente en una SPA con montaje/desmontaje de componentes; implícito en el pedido de "adaptarlo a esta plataforma de Next.js".

## Risks

| Riesgo                                                                                                                                                                                                   | Mitigación                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Congelar el loop mediante `paused` sin resetear `lastTime` al reanudar produciría un salto grande de `dt` (la nave/asteroides saltarían de posición al reanudar).                                        | El componente resetea `lastTime` a `null` al pasar de pausado a no pausado, igual que en el arranque inicial del loop original.                                                                      |
| Si el usuario reinicia varias veces muy rápido (múltiples remounts por `resetKey`), podría quedar más de un `requestAnimationFrame` corriendo si el cleanup del montaje anterior no se ejecuta a tiempo. | El `useEffect` de `AsteroidsGame` cancela explícitamente el `requestAnimationFrame` pendiente (`cancelAnimationFrame`) en su función de cleanup antes de que el nuevo montaje inicie su propio loop. |
| Los controles de teclado (flechas, espacio) podrían interferir si el usuario tiene el foco en otro campo de texto de la página mientras juega.                                                           | Aceptado, igual que en el juego original; no hay campos de texto visibles durante la partida en `/juegos/asteroides/jugar`.                                                                          |

## What is **not** in this spec

- Controles táctiles/móviles.
- Sonido/efectos de audio.
- Corrección del tag genérico "TECLADO / TÁCTIL" de la ficha de detalle.
- Cambios al juego "ROCAS" o a cualquier otro juego del catálogo existente.
- Generalización de `GamePlayer` a un sistema de motores de juego inyectables/plug-in.
- Leaderboard real o persistente para Asteroids.

Cada uno de estos, si se implementa, va en su propio spec.
