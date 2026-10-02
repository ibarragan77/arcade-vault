"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEngineProps } from "@/lib/game-engines";

type FroggerGameProps = GameEngineProps;

// ── Grilla ────────────────────────────────────────────────────────────────────
const COLS = 16;
const ROWS = 14;
const CELL = 40; // px
const W = COLS * CELL; // 640
const H = ROWS * CELL; // 560

// Filas (0 = arriba)
const ROW_HUD = 0; // score, nivel, vidas y barra de tiempo
const ROW_GOALS = 1; // 5 bocas destino
const ROW_RIVER_TOP = 2; // río: filas 2–6 (5 carriles)
const ROW_RIVER_BOT = 6;
const ROW_SAFE_MID = 7; // mediana segura
const ROW_ROAD_TOP = 8; // carretera: filas 8–12 (5 carriles)
const ROW_ROAD_BOT = 12;
const ROW_START = 13; // base de inicio

// Cada boca ocupa 2 columnas; las columnas 0, 3, 6, 9, 12 y 15 de la fila 1 son muro.
const GOAL_COLS = [1, 4, 7, 10, 13]; // columna izquierda de cada boca

// ── Rana ──────────────────────────────────────────────────────────────────────
const START_COL = 7;
const JUMP_MS = 120;
const START_LIVES = 3;

// ── Puntaje y tiempo ──────────────────────────────────────────────────────────
const ROW_POINTS = 10; // por cada fila nueva más alta del intento actual
const GOAL_POINTS = 50; // al ocupar una boca (+ segundos restantes × 10)
const ROUND_POINTS = 200; // al completar las 5 bocas

// 30 s en nivel 1, −2 s por nivel, mínimo 15 s
function timeLimitMs(level: number): number {
  return Math.max(15000, 30000 - (level - 1) * 2000);
}

type Direction = "up" | "down" | "left" | "right";

type Frog = {
  x: number; // columna en celdas (float: el río la arrastra)
  row: number;
  jumping: boolean;
  jumpT: number; // ms transcurridos del salto
  fromX: number;
  fromRow: number;
  toX: number;
  toRow: number;
};

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// ── Controles táctiles ────────────────────────────────────────────────────────
// Cada botón virtual es una dirección de salto: alimenta la misma función
// applyDirection() que usa el teclado (mismas guardas, un salto por toque).
type TouchAction = Direction;

const TOUCH_HIDDEN_STORAGE_KEY = "ranaria-touch-hidden";

// Cruz de 4 direcciones en un grid de 3×3 celdas de 52px
const TOUCH_BUTTONS: {
  action: TouchAction;
  label: string;
  glyph: string;
  col: number;
  row: number;
}[] = [
  { action: "up", label: "Saltar arriba", glyph: "▲", col: 2, row: 1 },
  { action: "left", label: "Saltar izquierda", glyph: "◄", col: 1, row: 2 },
  { action: "right", label: "Saltar derecha", glyph: "►", col: 3, row: 2 },
  { action: "down", label: "Saltar abajo", glyph: "▼", col: 2, row: 3 },
];

// Rotación del dibujo de la rana según hacia dónde saltó por última vez
const DIR_ANGLE: Record<Direction, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};

// ── Skins ─────────────────────────────────────────────────────────────────────
type SkinId = "clasico" | "neon" | "retro";

type SkinPalette = {
  // Fondo por zonas
  hudBg: string;
  goalRow: string; // muro de la fila de bocas
  goal: string; // relleno de cada boca libre
  goalBorder: string;
  river: string;
  safe: string; // mediana y base de inicio
  road: string;
  roadLine: string;
  // Carretera (peligros)
  cars: string[];
  truck: string;
  truckCab: string;
  wheel: string;
  windshield: string;
  // Río (apoyos)
  log: string;
  logLine: string;
  turtle: string;
  turtleScale: string;
  turtleSubmerged: string; // contorno de la tortuga sumergida (NO es apoyo)
  // Rana
  frog: string;
  frogDark: string;
  frogEye: string;
  frogPupil: string;
  // HUD interno (fila 0)
  hudText: string;
  hudAccent: string;
  timeTrack: string;
  timeOk: string;
  timeWarn: string;
  timeDanger: string;
  // Glow (shadowBlur en px) sobre rana, entidades sólidas y bordes de bocas.
  // 0 = sin glow (no altera el render).
  glow: number;
};

const SKIN_STORAGE_KEY = "frogger-skin";

const SKIN_PALETTES: Record<SkinId, SkinPalette> = {
  // Paleta original del port, copiada tal cual (incluidos los colores que
  // antes estaban inline: parabrisas y contorno de tortuga sumergida).
  clasico: {
    hudBg: "#000",
    goalRow: "#0b3d1a",
    goal: "#3ddc84",
    goalBorder: "#ffd23f",
    river: "#0a1f4d",
    safe: "#14532d",
    road: "#111114",
    roadLine: "rgba(255,255,255,0.35)",
    cars: ["#ff3b3b", "#ffd23f", "#3b82ff"],
    truck: "#8a8f98",
    truckCab: "#c7ccd4",
    wheel: "#222",
    windshield: "rgba(0,0,0,0.45)",
    log: "#7a4a1f",
    logLine: "#4e2e10",
    turtle: "#2f9e44",
    turtleScale: "#1b5e2a",
    turtleSubmerged: "rgba(47,158,68,0.45)",
    frog: "#7dff4f",
    frogDark: "#3fa31f",
    frogEye: "#fff",
    frogPupil: "#000",
    hudText: "#fff",
    hudAccent: "#ffd23f",
    timeTrack: "rgba(255,255,255,0.15)",
    timeOk: "#3ddc84",
    timeWarn: "#ffd23f",
    timeDanger: "#ff3b3b",
    glow: 0,
  },
  // Rana anclada en games.color = "green" (var(--green)); peligros en los
  // tonos .neon-* (magenta/amarillo/cian). Los apoyos del río usan rellenos
  // saturados pero de luminosidad media para que la rana verde brillante
  // siga destacando encima de ellos.
  neon: {
    hudBg: "#000",
    goalRow: "#04140c",
    goal: "#00343a",
    goalBorder: "#00f5ff", // var(--cyan)
    river: "#00103a",
    safe: "#1c0b33",
    road: "#08080c",
    roadLine: "rgba(0,245,255,0.45)",
    cars: ["#ff006e", "#f5ff00", "#00f5ff"], // var(--magenta/--yellow/--cyan)
    truck: "#b8004f",
    truckCab: "#ff006e",
    wheel: "#222",
    windshield: "rgba(0,0,0,0.45)",
    log: "#b35c00",
    logLine: "#ffb000",
    turtle: "#008a93",
    turtleScale: "#00f5ff",
    turtleSubmerged: "rgba(0,245,255,0.35)",
    frog: "#00ff88", // var(--green), ancla en games.color = "green"
    frogDark: "#00b35f",
    frogEye: "#fff",
    frogPupil: "#000",
    hudText: "#00ff88",
    hudAccent: "#ff006e",
    timeTrack: "rgba(0,245,255,0.18)",
    timeOk: "#00ff88",
    timeWarn: "#f5ff00",
    timeDanger: "#ff006e",
    glow: 10,
  },
  // Monocromo ámbar sin glow (mismo fósforo retro que Asteroids/Snake). La
  // legibilidad del río se resuelve por luminosidad: agua negra, apoyos en
  // ámbar medio/oscuro sólido, tortuga sumergida solo como contorno tenue y
  // rana en el ámbar más claro.
  retro: {
    hudBg: "#000",
    goalRow: "#1a1000",
    goal: "#3d2800",
    goalBorder: "#ffb000",
    river: "#000",
    safe: "#2a1c00",
    road: "#140d00",
    roadLine: "rgba(255,176,0,0.35)",
    cars: ["#ffb000", "#e09a00", "#ffc84d"],
    truck: "#cc8c00",
    truckCab: "#ffb000",
    wheel: "#3d2800",
    windshield: "rgba(0,0,0,0.45)",
    log: "#6b4700",
    logLine: "#2e1f00",
    turtle: "#9c6a00",
    turtleScale: "#4d3400",
    turtleSubmerged: "rgba(255,176,0,0.3)",
    frog: "#ffd27a",
    frogDark: "#b37c00",
    frogEye: "#ffe9b8",
    frogPupil: "#000",
    hudText: "#ffb000",
    hudAccent: "#ffd27a",
    timeTrack: "rgba(255,176,0,0.18)",
    timeOk: "#ffb000",
    timeWarn: "#cc8c00",
    timeDanger: "#ff7a00",
    glow: 0,
  },
};

// ── Carriles ──────────────────────────────────────────────────────────────────
const TURTLE_VISIBLE_MS = 3000;
const TURTLE_SUBMERGED_MS = 1500;
const TURTLE_CYCLE_MS = TURTLE_VISIBLE_MS + TURTLE_SUBMERGED_MS; // 4500
const SPEED_STEP = 1.15; // multiplicador de velocidad por nivel

type EntityType = "car" | "truck" | "log" | "turtle";

type Entity = {
  x: number; // columna izquierda en celdas (float)
  width: number; // en celdas
  type: EntityType;
  phaseMs?: number; // solo tortugas: desfase del ciclo de inmersión
};

type Lane = {
  row: number;
  speed: number; // px/frame a 60 fps, ya escalada por nivel
  dir: 1 | -1;
  span: number; // longitud del loop en celdas (count * spacing, >= COLS + width)
  entities: Entity[];
};

// Definición fija de los 10 carriles. `spacing` es la distancia entre los bordes
// izquierdos de dos entidades consecutivas: hueco = spacing - width
// (>= 2 celdas en carretera, >= 1 en el río).
type LaneSpec = {
  row: number;
  type: EntityType;
  width: number;
  count: number;
  spacing: number;
  speed: number; // px/frame base (nivel 1)
  dir: 1 | -1;
};

const LANE_SPECS: LaneSpec[] = [
  // Río (filas 2–6): velocidades 1–3 px/frame, sentidos alternos
  { row: 2, type: "log", width: 2, count: 5, spacing: 4, speed: 1, dir: -1 },
  { row: 3, type: "log", width: 4, count: 3, spacing: 7, speed: 2.5, dir: 1 },
  {
    row: 4,
    type: "turtle",
    width: 2,
    count: 5,
    spacing: 4,
    speed: 1.8,
    dir: -1,
  },
  { row: 5, type: "log", width: 3, count: 3, spacing: 7, speed: 1.2, dir: 1 },
  {
    row: 6,
    type: "turtle",
    width: 3,
    count: 4,
    spacing: 5,
    speed: 1.5,
    dir: -1,
  },
  // Carretera (filas 8–12): velocidades 1.5–4 px/frame, sentidos alternos
  {
    row: 8,
    type: "truck",
    width: 3,
    count: 2,
    spacing: 10,
    speed: 1.8,
    dir: -1,
  },
  { row: 9, type: "truck", width: 2, count: 3, spacing: 7, speed: 2.5, dir: 1 },
  { row: 10, type: "car", width: 1, count: 3, spacing: 7, speed: 4, dir: -1 },
  { row: 11, type: "car", width: 1, count: 3, spacing: 6, speed: 2, dir: 1 },
  { row: 12, type: "car", width: 1, count: 4, spacing: 5, speed: 1.5, dir: -1 },
];

function buildLanes(level: number): Lane[] {
  const factor = SPEED_STEP ** (level - 1);
  return LANE_SPECS.map((spec) => ({
    row: spec.row,
    speed: spec.speed * factor,
    dir: spec.dir,
    span: spec.count * spec.spacing,
    entities: Array.from({ length: spec.count }, (_, i) => ({
      x: i * spec.spacing,
      width: spec.width,
      type: spec.type,
      // Desfase distinto por grupo para que no se sumerjan todas a la vez
      ...(spec.type === "turtle"
        ? { phaseMs: (i * 1700 + spec.row * 900) % TURTLE_CYCLE_MS }
        : {}),
    })),
  }));
}

function isSubmerged(entity: Entity, elapsedMs: number): boolean {
  if (entity.type !== "turtle") return false;
  return (
    (elapsedMs + (entity.phaseMs ?? 0)) % TURTLE_CYCLE_MS >= TURTLE_VISIBLE_MS
  );
}

// Desplazamiento de un carril en un frame, en celdas.
function laneDx(lane: Lane, dtMs: number): number {
  return (lane.speed * lane.dir * dtMs) / (16.67 * CELL);
}

function covers(entity: Entity, centerX: number): boolean {
  return centerX >= entity.x && centerX < entity.x + entity.width;
}

// ── Colisiones (sobre el centro de la rana, en celdas) ───────────────────────
function checkRoadCollision(
  centerX: number,
  row: number,
  lanes: Lane[],
): boolean {
  if (row < ROW_ROAD_TOP || row > ROW_ROAD_BOT) return false;
  const lane = lanes.find((l) => l.row === row);
  return !!lane && lane.entities.some((e) => covers(e, centerX));
}

// Tronco o tortuga NO sumergida que sostiene a la rana, o null si cae al agua.
function getSupport(
  centerX: number,
  row: number,
  lanes: Lane[],
  elapsedMs: number,
): { lane: Lane; entity: Entity } | null {
  const lane = lanes.find((l) => l.row === row);
  if (!lane) return null;
  const entity = lane.entities.find(
    (e) => covers(e, centerX) && !isSubmerged(e, elapsedMs),
  );
  return entity ? { lane, entity } : null;
}

// Índice de la boca libre en la columna `col`, o -1 si es muro u ocupada.
function checkGoal(col: number, goalsFilled: boolean[]): number {
  const i = GOAL_COLS.findIndex((g) => col === g || col === g + 1);
  return i >= 0 && !goalsFilled[i] ? i : -1;
}

export default function FroggerGame({
  paused,
  onScoreChange,
  onLivesChange,
  onLevelChange,
  onGameOver,
}: FroggerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const [skin, setSkin] = useState<SkinId>("clasico");
  const skinRef = useRef<SkinId>(skin);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [touchOverlayHidden, setTouchOverlayHidden] = useState(false);
  const activeTouchesRef = useRef<Map<number, TouchAction>>(new Map());
  // Publicada por el useEffect del loop: misma ruta de input que el teclado.
  const applyDirectionRef = useRef<((dir: Direction) => void) | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const touch =
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detección única al montar, mismo patrón SSR-safe que AsteroidsGame (spec 12)
    setIsTouchDevice(touch);
  }, []);

  useEffect(() => {
    function checkOrientation() {
      setIsPortrait(window.innerHeight > window.innerWidth);
    }
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOUCH_HIDDEN_STORAGE_KEY);
      if (saved === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de localStorage al montar, mismo patrón SSR-safe que la lectura de skin
        setTouchOverlayHidden(true);
      }
    } catch {
      // localStorage no disponible (SSR, modo privado, etc.) — el overlay se queda visible
    }
  }, []);

  function handleToggleTouchOverlay() {
    const next = !touchOverlayHidden;
    setTouchOverlayHidden(next);
    try {
      localStorage.setItem(TOUCH_HIDDEN_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // localStorage no disponible (modo privado, etc.) — la preferencia no persiste pero el juego sigue funcionando
    }
  }

  // Un toque = un salto: la acción se dispara solo en touchstart, sin
  // repetición mientras el dedo siga apoyado (regla "una pulsación = un salto").
  function handleTouchButtonStart(action: TouchAction, touchId: number) {
    activeTouchesRef.current.set(touchId, action);
    applyDirectionRef.current?.(action);
  }

  function handleTouchButtonEnd(touchId: number) {
    activeTouchesRef.current.delete(touchId);
  }

  function touchButtonStyle(color: string): React.CSSProperties {
    return {
      width: 52,
      height: 52,
      borderRadius: "50%",
      border: `2px solid ${color}`,
      background: "rgba(0, 0, 0, 0.35)",
      color,
      fontSize: 18,
      lineHeight: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      userSelect: "none",
      touchAction: "none",
      WebkitTapHighlightColor: "transparent",
    };
  }

  useEffect(() => {
    skinRef.current = skin;
  }, [skin]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SKIN_STORAGE_KEY);
      if (saved === "clasico" || saved === "neon" || saved === "retro") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de localStorage al montar para restaurar el skin guardado, mismo patrón SSR-safe que lib/session.ts
        setSkin(saved);
      }
    } catch {
      // localStorage no disponible (SSR, modo privado, etc.) — se queda en "clasico"
    }
  }, []);

  function handleSkinChange(id: SkinId) {
    setSkin(id);
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, id);
    } catch {
      // localStorage no disponible (modo privado, etc.) — el skin no persiste pero el juego sigue funcionando
    }
  }

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx2d = canvasEl.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    let rafId = 0;
    let stopped = false;

    let score = 0;
    let lives = START_LIVES;
    let level = 1;
    let lanes: Lane[] = buildLanes(level);
    let elapsedMs = 0; // reloj del ciclo de inmersión de tortugas
    let timeLeftMs = timeLimitMs(level);
    let bestRowThisFrog = ROW_START; // fila más alta del intento actual (menor = más arriba)

    const frog: Frog = {
      x: START_COL,
      row: ROW_START,
      jumping: false,
      jumpT: 0,
      fromX: START_COL,
      fromRow: ROW_START,
      toX: START_COL,
      toRow: ROW_START,
    };
    let facing: Direction = "up";
    let pendingDir: Direction | null = null;
    const goalsFilled: boolean[] = GOAL_COLS.map(() => false);

    // ── Input ───────────────────────────────────────────────────────────
    // Ruta única de input compartida por teclado y botones táctiles: en pausa
    // (o con el modal de fin abierto) o con un salto en curso no hace nada.
    function applyDirection(dir: Direction) {
      if (pausedRef.current || frog.jumping) return;
      pendingDir = dir;
    }
    applyDirectionRef.current = applyDirection;

    function handleKeyDown(e: KeyboardEvent) {
      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      // En pausa (o con el modal de fin abierto) no se intercepta nada: las
      // flechas siguen funcionando normalmente en inputs y en la página.
      if (pausedRef.current) return;
      e.preventDefault(); // que las flechas no hagan scroll de la página
      // Una pulsación = un salto: se ignora la autorrepetición de la tecla
      // (y applyDirection ignora las pulsaciones durante un salto en curso).
      if (e.repeat) return;
      applyDirection(dir);
    }

    document.addEventListener("keydown", handleKeyDown);

    // ── Lógica ──────────────────────────────────────────────────────────
    function startJump(dir: Direction) {
      const baseX = Math.round(frog.x);
      let toX = baseX;
      let toRow = frog.row;
      if (dir === "left") toX--;
      else if (dir === "right") toX++;
      else if (dir === "up") toRow--;
      else toRow++;

      facing = dir;
      // Saltos que sacarían a la rana del tablero se ignoran
      if (toX < 0 || toX > COLS - 1) return;
      if (toRow < ROW_GOALS || toRow > ROW_START) return;

      frog.jumping = true;
      frog.jumpT = 0;
      frog.fromX = frog.x;
      frog.fromRow = frog.row;
      frog.toX = toX;
      frog.toRow = toRow;
    }

    function addScore(points: number) {
      score += points;
      onScoreChange(score);
    }

    // Nuevo intento de rana: vuelve al inicio con tiempo y avance reiniciados
    function resetFrog() {
      frog.x = START_COL;
      frog.row = ROW_START;
      frog.jumping = false;
      frog.jumpT = 0;
      facing = "up";
      pendingDir = null;
      timeLeftMs = timeLimitMs(level);
      bestRowThisFrog = ROW_START;
    }

    function killFrog() {
      if (stopped) return;
      lives--;
      onLivesChange?.(lives);
      if (lives === 0) {
        // Fin de partida: una sola llamada y el loop deja de pedir frames
        stopped = true;
        onGameOver(score);
        return;
      }
      resetFrog();
    }

    function completeRound() {
      addScore(ROUND_POINTS);
      level++;
      onLevelChange?.(level);
      goalsFilled.fill(false);
      lanes = buildLanes(level);
      resetFrog();
    }

    function scoreGoal(goalIndex: number) {
      goalsFilled[goalIndex] = true;
      addScore(ROW_POINTS); // la fila de bocas también cuenta como fila nueva
      addScore(GOAL_POINTS + Math.floor(timeLeftMs / 1000) * 10);
      if (goalsFilled.every(Boolean)) completeRound();
      else resetFrog();
    }

    // Resolución de la celda de aterrizaje. Carretera y río se evalúan en
    // cada frame en checkHazards(); aquí quedan las bocas y el +10 por fila.
    function onLanded() {
      if (frog.row === ROW_GOALS) {
        const goal = checkGoal(Math.round(frog.x), goalsFilled);
        if (goal >= 0) scoreGoal(goal);
        else killFrog(); // muro o boca ocupada
        return;
      }
      if (frog.row < bestRowThisFrog) {
        bestRowThisFrog = frog.row;
        addScore(ROW_POINTS);
      }
    }

    // Centro de la rana y fila que ocupa en este frame (interpolados en el salto)
    function frogPosition(): { centerX: number; row: number } {
      if (!frog.jumping) return { centerX: frog.x + 0.5, row: frog.row };
      const t = Math.min(frog.jumpT / JUMP_MS, 1);
      return {
        centerX: frog.fromX + (frog.toX - frog.fromX) * t + 0.5,
        row: Math.round(frog.fromRow + (frog.toRow - frog.fromRow) * t),
      };
    }

    function checkHazards(dtMs: number) {
      // Carretera: se evalúa en cada frame, también en pleno salto
      const { centerX, row } = frogPosition();
      if (checkRoadCollision(centerX, row, lanes)) {
        killFrog();
        return;
      }

      // Río: solo con la rana posada (en el aire no hay apoyo que evaluar)
      if (frog.jumping) return;
      if (frog.row < ROW_RIVER_TOP || frog.row > ROW_RIVER_BOT) return;
      const support = getSupport(frog.x + 0.5, frog.row, lanes, elapsedMs);
      if (!support) {
        killFrog(); // cayó al agua o se sumergió la tortuga
        return;
      }
      frog.x += laneDx(support.lane, dtMs);
      const cx = frog.x + 0.5;
      if (cx < 0 || cx >= COLS) killFrog(); // arrastrada fuera del borde
    }

    function updateFrog(dtMs: number) {
      if (!frog.jumping) {
        if (pendingDir) startJump(pendingDir);
        pendingDir = null;
        return;
      }
      frog.jumpT += dtMs;
      if (frog.jumpT >= JUMP_MS) {
        frog.x = frog.toX;
        frog.row = frog.toRow;
        frog.jumping = false;
        onLanded();
      }
    }

    function moveLanes(dtMs: number) {
      for (const lane of lanes) {
        const dx = laneDx(lane, dtMs);
        for (const e of lane.entities) {
          e.x += dx;
          // Al salir completamente por un borde, reaparece por el opuesto
          // conservando el espaciado del carril (span >= COLS + width).
          if (lane.dir === 1 && e.x >= COLS) e.x -= lane.span;
          else if (lane.dir === -1 && e.x + e.width <= 0) e.x += lane.span;
        }
      }
    }

    function update(dtMs: number) {
      elapsedMs += dtMs;
      moveLanes(dtMs);
      updateFrog(dtMs);
      if (stopped) return;
      checkHazards(dtMs);
      if (stopped) return;

      timeLeftMs -= dtMs;
      if (timeLeftMs <= 0) killFrog(); // muerte por tiempo
    }

    // ── Render ──────────────────────────────────────────────────────────
    function fillRows(fromRow: number, toRow: number, color: string) {
      ctx.fillStyle = color;
      ctx.fillRect(0, fromRow * CELL, W, (toRow - fromRow + 1) * CELL);
    }

    // Glow del skin activo (shadowBlur = 0 en clasico/retro: no altera nada)
    function setGlow(p: SkinPalette, color: string) {
      ctx.shadowBlur = p.glow;
      ctx.shadowColor = color;
    }

    function clearGlow() {
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    function drawBackground(p: SkinPalette) {
      fillRows(ROW_HUD, ROW_HUD, p.hudBg);

      // Fila de bocas: muro con 5 bocas de borde resaltado
      fillRows(ROW_GOALS, ROW_GOALS, p.goalRow);
      for (const col of GOAL_COLS) {
        const x = col * CELL;
        const y = ROW_GOALS * CELL;
        ctx.fillStyle = p.goal;
        ctx.fillRect(x + 2, y + 2, CELL * 2 - 4, CELL - 4);
        ctx.strokeStyle = p.goalBorder;
        ctx.lineWidth = 2;
        setGlow(p, p.goalBorder);
        ctx.strokeRect(x + 2, y + 2, CELL * 2 - 4, CELL - 4);
        clearGlow();
      }

      fillRows(ROW_RIVER_TOP, ROW_RIVER_BOT, p.river);
      fillRows(ROW_SAFE_MID, ROW_SAFE_MID, p.safe);
      fillRows(ROW_ROAD_TOP, ROW_ROAD_BOT, p.road);
      fillRows(ROW_START, ROW_START, p.safe);

      // Líneas discontinuas entre carriles de carretera
      ctx.strokeStyle = p.roadLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 16]);
      for (let row = ROW_ROAD_TOP + 1; row <= ROW_ROAD_BOT; row++) {
        ctx.beginPath();
        ctx.moveTo(0, row * CELL);
        ctx.lineTo(W, row * CELL);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    function drawCar(
      p: SkinPalette,
      px: number,
      py: number,
      w: number,
      color: string,
    ) {
      // Ruedas
      ctx.fillStyle = p.wheel;
      for (const wx of [px + 9, px + w - 9]) {
        ctx.beginPath();
        ctx.arc(wx, py + 8, 5, 0, Math.PI * 2);
        ctx.arc(wx, py + CELL - 8, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Carrocería
      ctx.fillStyle = color;
      setGlow(p, color);
      ctx.fillRect(px + 3, py + 9, w - 6, CELL - 18);
      clearGlow();
      // Parabrisas
      ctx.fillStyle = p.windshield;
      ctx.fillRect(px + w / 2 - 4, py + 12, 8, CELL - 24);
    }

    function drawTruck(
      p: SkinPalette,
      px: number,
      py: number,
      w: number,
      dir: 1 | -1,
    ) {
      // Ruedas
      ctx.fillStyle = p.wheel;
      for (let wx = px + 10; wx < px + w - 4; wx += 22) {
        ctx.beginPath();
        ctx.arc(wx, py + 7, 5, 0, Math.PI * 2);
        ctx.arc(wx, py + CELL - 7, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Remolque
      ctx.fillStyle = p.truck;
      setGlow(p, p.truck);
      ctx.fillRect(px + 2, py + 7, w - 4, CELL - 14);
      clearGlow();
      // Cabina en el frente (según la dirección de avance)
      const cabW = 22;
      const cabX = dir === 1 ? px + w - 2 - cabW : px + 2;
      ctx.fillStyle = p.truckCab;
      ctx.fillRect(cabX, py + 5, cabW, CELL - 10);
      ctx.fillStyle = p.windshield;
      ctx.fillRect(
        dir === 1 ? cabX + cabW - 7 : cabX + 2,
        py + 9,
        5,
        CELL - 18,
      );
    }

    function drawLog(p: SkinPalette, px: number, py: number, w: number) {
      ctx.fillStyle = p.log;
      setGlow(p, p.log);
      ctx.beginPath();
      ctx.roundRect(px + 1, py + 6, w - 2, CELL - 12, 10);
      ctx.fill();
      clearGlow();
      // Textura de vetas
      ctx.strokeStyle = p.logLine;
      ctx.lineWidth = 2;
      for (const fy of [py + 14, py + CELL - 14]) {
        ctx.beginPath();
        ctx.moveTo(px + 10, fy);
        ctx.lineTo(px + w - 10, fy);
        ctx.stroke();
      }
    }

    function drawTurtles(
      p: SkinPalette,
      px: number,
      py: number,
      cells: number,
      sub: boolean,
    ) {
      for (let i = 0; i < cells; i++) {
        const cx = px + i * CELL + CELL / 2;
        const cy = py + CELL / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL / 2 - 5, 0, Math.PI * 2);
        if (sub) {
          // Sumergida: solo contorno semitransparente y sin glow, no sirve
          // de apoyo — debe leerse distinta de una tortuga sólida en todo skin.
          ctx.strokeStyle = p.turtleSubmerged;
          ctx.lineWidth = 2;
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = p.turtle;
        setGlow(p, p.turtle);
        ctx.fill();
        clearGlow();
        // Escamas del caparazón
        ctx.strokeStyle = p.turtleScale;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.moveTo(cx - 14, cy);
        ctx.lineTo(cx - 7, cy);
        ctx.moveTo(cx + 7, cy);
        ctx.lineTo(cx + 14, cy);
        ctx.moveTo(cx, cy - 14);
        ctx.lineTo(cx, cy - 7);
        ctx.moveTo(cx, cy + 7);
        ctx.lineTo(cx, cy + 14);
        ctx.stroke();
      }
    }

    function drawLanes(p: SkinPalette) {
      for (const lane of lanes) {
        const py = lane.row * CELL;
        lane.entities.forEach((e, i) => {
          const px = e.x * CELL;
          const w = e.width * CELL;
          if (e.type === "car") {
            drawCar(p, px, py, w, p.cars[(lane.row + i) % p.cars.length]);
          } else if (e.type === "truck") {
            drawTruck(p, px, py, w, lane.dir);
          } else if (e.type === "log") {
            drawLog(p, px, py, w);
          } else {
            drawTurtles(p, px, py, e.width, isSubmerged(e, elapsedMs));
          }
        });
      }
    }

    function drawFrog(p: SkinPalette) {
      // Posición interpolada durante el salto de JUMP_MS
      const t = frog.jumping ? Math.min(frog.jumpT / JUMP_MS, 1) : 1;
      const x = frog.jumping
        ? frog.fromX + (frog.toX - frog.fromX) * t
        : frog.x;
      const row = frog.jumping
        ? frog.fromRow + (frog.toRow - frog.fromRow) * t
        : frog.row;
      const cx = x * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(DIR_ANGLE[facing]);

      // Patas: recogidas en reposo, extendidas durante el salto
      const reach = frog.jumping ? 17 : 12;
      setGlow(p, p.frog);
      ctx.strokeStyle = p.frogDark;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const sx of [-1, 1]) {
        ctx.moveTo(sx * 8, -6);
        ctx.lineTo(sx * reach, -reach + 2);
        ctx.moveTo(sx * 8, 7);
        ctx.lineTo(sx * reach, reach - (frog.jumping ? 0 : 4));
      }
      ctx.stroke();

      // Cuerpo: elipse de 28×24 px
      ctx.fillStyle = p.frog;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      clearGlow();

      // Ojos
      for (const sx of [-1, 1]) {
        ctx.fillStyle = p.frogEye;
        ctx.beginPath();
        ctx.arc(sx * 6, -9, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.frogPupil;
        ctx.beginPath();
        ctx.arc(sx * 6, -10, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Silueta de rana dentro de cada boca ya ocupada
    function drawFilledGoals(p: SkinPalette) {
      goalsFilled.forEach((filled, i) => {
        if (!filled) return;
        const cx = (GOAL_COLS[i] + 1) * CELL; // centro de la boca (2 columnas)
        const cy = ROW_GOALS * CELL + CELL / 2;
        ctx.fillStyle = p.frogDark;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 1, 11, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.frog;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + sx * 6, cy - 8, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    function drawHud(p: SkinPalette) {
      const top = ROW_HUD * CELL;
      ctx.font = "bold 16px monospace";
      ctx.textBaseline = "top";

      ctx.fillStyle = p.hudText;
      ctx.textAlign = "left";
      ctx.fillText("Score: " + score, 10, top + 5);

      ctx.fillStyle = p.hudAccent;
      ctx.textAlign = "center";
      ctx.fillText("Nivel " + level, W / 2, top + 5);

      // Un ícono de rana (círculo del color de la rana) por vida restante,
      // alineados a la derecha
      ctx.fillStyle = p.frog;
      for (let i = 0; i < lives; i++) {
        ctx.beginPath();
        ctx.arc(W - 16 - i * 20, top + 13, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Barra de tiempo en la parte baja de la fila 0
      const ratio = Math.max(0, Math.min(1, timeLeftMs / timeLimitMs(level)));
      const barY = top + CELL - 10;
      ctx.fillStyle = p.timeTrack;
      ctx.fillRect(10, barY, W - 20, 6);
      ctx.fillStyle =
        ratio > 0.5 ? p.timeOk : ratio > 0.25 ? p.timeWarn : p.timeDanger;
      ctx.fillRect(10, barY, (W - 20) * ratio, 6);
    }

    function draw() {
      // Paleta leída del ref en cada frame: el cambio de skin es instantáneo,
      // también en pausa o en medio de una partida.
      const palette = SKIN_PALETTES[skinRef.current];
      drawBackground(palette);
      drawFilledGoals(palette);
      drawLanes(palette);
      drawFrog(palette);
      drawHud(palette);
    }

    // ── Loop principal ──────────────────────────────────────────────────
    let lastTime: number | null = null;
    let wasPaused = pausedRef.current;

    function loop(ts: number) {
      const isPaused = pausedRef.current;
      if (wasPaused && !isPaused) lastTime = null;
      wasPaused = isPaused;

      const dtMs = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
      lastTime = ts;

      if (!isPaused) update(dtMs);
      draw();

      if (!stopped) rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
      applyDirectionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount by design; paused is read via pausedRef
  }, []);

  // Estado reactivo (no skinRef.current): el color de los botones sigue al
  // skin en el mismo render en que cambia.
  const palette = SKIN_PALETTES[skin];

  return (
    <div
      data-touch-device={isTouchDevice}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        // Contenedor de tamaño para que el <select> pueda medir el ancho de
        // la franja negra lateral (100cqw - ancho del canvas) / 2.
        containerType: "size",
      }}
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ height: "100%", width: "auto", display: "block" }}
      />
      {/* Cruz de saltos pegada a la esquina inferior izquierda: lejos del HUD
          (fila 0, arriba) y del <select> de skin (borde derecho, al medio). */}
      {isTouchDevice && !isPortrait && !touchOverlayHidden && (
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            zIndex: 5,
            display: "grid",
            gridTemplateColumns: "52px 52px 52px",
            gridTemplateRows: "52px 52px 52px",
            gap: 4,
          }}
        >
          {TOUCH_BUTTONS.map(({ action, label, glyph, col, row }) => (
            <button
              key={action}
              aria-label={label}
              onTouchStart={(e) => {
                e.preventDefault();
                for (const t of Array.from(e.changedTouches))
                  handleTouchButtonStart(action, t.identifier);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                for (const t of Array.from(e.changedTouches))
                  handleTouchButtonEnd(t.identifier);
              }}
              onTouchCancel={(e) => {
                e.preventDefault();
                for (const t of Array.from(e.changedTouches))
                  handleTouchButtonEnd(t.identifier);
              }}
              style={{
                ...touchButtonStyle(palette.frog),
                gridColumn: col,
                gridRow: row,
              }}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}
      {isTouchDevice && !isPortrait && (
        <button
          onClick={handleToggleTouchOverlay}
          aria-label={
            touchOverlayHidden ? "Mostrar controles" : "Ocultar controles"
          }
          style={{
            position: "absolute",
            left: 16,
            // Apilado arriba de la cruz: 16 + 3×52 + 2×4 + 8
            bottom: 188,
            zIndex: 6,
            background: "#111",
            color: palette.hudText,
            border: `1px solid ${palette.hudText}`,
            borderRadius: 4,
            font: "11px monospace",
            padding: "4px 8px",
          }}
        >
          {touchOverlayHidden ? "Mostrar controles" : "Ocultar controles"}
        </button>
      )}
      {/* Canvas 640×560 (apaisado): en portrait se pide girar. El aviso se
          superpone; el canvas sigue montado para que el loop arranque igual. */}
      {isTouchDevice && isPortrait && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 24,
            background: "#000",
            color: "#fff",
            font: "16px monospace",
          }}
        >
          Girá tu dispositivo a horizontal para jugar
        </div>
      )}
      {/* Selector de skin en la franja negra lateral derecha, a la altura de
          la mediana: nunca tapa el HUD (fila 0) ni la base de inicio (fila
          13). Su ancho máximo es la franja libre (canvas 8:7 de alto 100%). */}
      <select
        value={skin}
        onChange={(e) => handleSkinChange(e.target.value as SkinId)}
        aria-label="Skin de Ranaria"
        style={{
          position: "absolute",
          right: 4,
          top: "50%",
          transform: "translateY(-50%)",
          maxWidth: "calc((100cqw - 100cqh * 8 / 7) / 2 - 8px)",
          zIndex: 4,
          background: "#111",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 4,
          font: "10px monospace",
          padding: "1px 2px",
        }}
      >
        {(Object.keys(SKIN_PALETTES) as SkinId[]).map((id) => (
          <option key={id} value={id}>
            {id.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
