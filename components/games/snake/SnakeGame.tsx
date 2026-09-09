"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEngineProps } from "@/lib/game-engines";

type SnakeGameProps = GameEngineProps;

const GRID_COLS = 40;
const GRID_ROWS = 30;
const CELL = 20;
const W = GRID_COLS * CELL;
const H = GRID_ROWS * CELL;

const INITIAL_TICK_MS = 150;
const TICK_STEP_MS = 10;
const MIN_TICK_MS = 60;
const FRUITS_PER_LEVEL = 5;

type Cell = { col: number; row: number };
type Direction = "up" | "down" | "left" | "right";
type SpriteRect = { x: number; y: number; w: number; h: number };

// ── Skins ─────────────────────────────────────────────────────────────────────
type SkinId = "clasico" | "neon" | "retro";

type SkinPalette = {
  bg: string;
  snakeHead: string;
  snakeBody: string;
  hudText: string; // "Score"
  hudAccent: string; // "Nivel"
};

const SKIN_STORAGE_KEY = "snake-skin";

// Los sprites de fruta (FRUIT_SPRITES / fruits.png) son imágenes fijas y se
// mantienen idénticas en los 3 skins — no hay colores de fruta que repaletizar.
const SKIN_PALETTES: Record<SkinId, SkinPalette> = {
  clasico: {
    bg: "#000",
    snakeHead: "#8dffc2",
    snakeBody: "#3ddc84",
    hudText: "#fff",
    hudAccent: "#fff",
  },
  neon: {
    bg: "#000",
    snakeHead: "#00ff88", // var(--green), ancla en games.color = "green"
    snakeBody: "#00cc6f",
    hudText: "#00ff88",
    hudAccent: "#ff006e", // var(--magenta)
  },
  retro: {
    bg: "#000",
    snakeHead: "#ffb000", // ámbar, mismo fósforo retro usado en Asteroids
    snakeBody: "#b37c00",
    hudText: "#ffb000",
    hudAccent: "#ffb000",
  },
};

// Portado de references/source-assets/snake-assets/sprites.js (fila de frutas,
// hoja fruits.png 3790x442px).
const FRUIT_SPRITES = {
  banana: { x: 34, y: 136, w: 110, h: 160 },
  orange: { x: 186, y: 136, w: 150, h: 160 },
  grape: { x: 378, y: 136, w: 110, h: 160 },
  garlic: { x: 540, y: 136, w: 130, h: 160 },
  eggplant: { x: 712, y: 136, w: 130, h: 160 },
  strawberry: { x: 894, y: 136, w: 110, h: 160 },
  cherry: { x: 1066, y: 136, w: 110, h: 160 },
  carrot: { x: 1228, y: 136, w: 130, h: 160 },
  mushroom: { x: 1400, y: 136, w: 130, h: 160 },
  broccoli: { x: 1582, y: 136, w: 110, h: 160 },
  watermelon: { x: 1734, y: 136, w: 150, h: 160 },
  pepper: { x: 1906, y: 136, w: 150, h: 160 },
  kiwi: { x: 2068, y: 136, w: 170, h: 160 },
  lemon: { x: 2250, y: 136, w: 140, h: 160 },
  peach: { x: 2432, y: 136, w: 130, h: 160 },
  peanut: { x: 2604, y: 136, w: 130, h: 160 },
  apple: { x: 2786, y: 136, w: 110, h: 160 },
  tomato: { x: 2948, y: 136, w: 130, h: 160 },
  berries: { x: 3110, y: 136, w: 150, h: 160 },
  grapes2: { x: 3302, y: 136, w: 110, h: 160 },
  pineapple: { x: 3454, y: 136, w: 150, h: 160 },
  melon: { x: 3637, y: 136, w: 130, h: 160 },
} satisfies Record<string, SpriteRect>;

type FruitName = keyof typeof FRUIT_SPRITES;
const FRUIT_NAMES = Object.keys(FRUIT_SPRITES) as FruitName[];

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const DELTA: Record<Direction, Cell> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

const FRUITS_SRC = "/games/snake/fruits.png";

function loadImage(
  src: string,
  onCreated: (img: HTMLImageElement) => void,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    onCreated(img);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function keyToDirection(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

export default function SnakeGame({
  paused,
  onScoreChange,
  onLevelChange,
  onGameOver,
}: SnakeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const [skin, setSkin] = useState<SkinId>("clasico");
  const skinRef = useRef<SkinId>(skin);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    let cancelled = false;
    let rafId: number;
    let stopped = false;
    const pendingImages: HTMLImageElement[] = [];

    // ── Estado del juego ─────────────────────────────────────────────────
    const snake: Cell[] = [
      { col: 10, row: 15 },
      { col: 9, row: 15 },
      { col: 8, row: 15 },
    ];
    let direction: Direction = "right";
    let nextDirection: Direction = "right";
    let score = 0;
    let level = 1;
    let fruitsEaten = 0;
    let tickIntervalMs = INITIAL_TICK_MS;
    let accumulatorMs = 0;

    let fruitsImg: HTMLImageElement | null = null;

    function isFreeCell(cell: Cell): boolean {
      return !snake.some((s) => s.col === cell.col && s.row === cell.row);
    }

    function spawnFruit(): { cell: Cell; sprite: FruitName } {
      let cell: Cell;
      do {
        cell = {
          col: Math.floor(Math.random() * GRID_COLS),
          row: Math.floor(Math.random() * GRID_ROWS),
        };
      } while (!isFreeCell(cell));
      const sprite =
        FRUIT_NAMES[Math.floor(Math.random() * FRUIT_NAMES.length)];
      return { cell, sprite };
    }

    let fruit: { cell: Cell; sprite: FruitName } = spawnFruit();

    // ── Input ─────────────────────────────────────────────────────────────
    function handleKeyDown(e: KeyboardEvent) {
      const dir = keyToDirection(e.key);
      if (!dir) return;
      if (snake.length > 1 && dir === OPPOSITE[direction]) return;
      nextDirection = dir;
    }

    window.addEventListener("keydown", handleKeyDown);

    function endGame() {
      onGameOver(score);
      stopped = true;
    }

    // ── Update ───────────────────────────────────────────────────────────
    function tick() {
      direction = nextDirection;
      const delta = DELTA[direction];
      const head = snake[0];
      const newHead: Cell = {
        col: head.col + delta.col,
        row: head.row + delta.row,
      };

      if (
        newHead.col < 0 ||
        newHead.col >= GRID_COLS ||
        newHead.row < 0 ||
        newHead.row >= GRID_ROWS
      ) {
        endGame();
        return;
      }

      const ateFruit =
        newHead.col === fruit.cell.col && newHead.row === fruit.cell.row;

      const bodyToCheck = ateFruit ? snake : snake.slice(0, -1);
      const hitSelf = bodyToCheck.some(
        (s) => s.col === newHead.col && s.row === newHead.row,
      );
      if (hitSelf) {
        endGame();
        return;
      }

      snake.unshift(newHead);
      if (ateFruit) {
        score += 10;
        onScoreChange(score);
        fruitsEaten++;
        const newLevel = 1 + Math.floor(fruitsEaten / FRUITS_PER_LEVEL);
        if (newLevel !== level) {
          level = newLevel;
          onLevelChange?.(level);
          tickIntervalMs = Math.max(
            MIN_TICK_MS,
            INITIAL_TICK_MS - (level - 1) * TICK_STEP_MS,
          );
        }
        fruit = spawnFruit();
      } else {
        snake.pop();
      }
    }

    function update(dtMs: number) {
      if (stopped) return;
      accumulatorMs += dtMs;
      if (accumulatorMs >= tickIntervalMs) {
        accumulatorMs -= tickIntervalMs;
        tick();
      }
    }

    // ── Draw ─────────────────────────────────────────────────────────────
    function draw() {
      const palette = SKIN_PALETTES[skinRef.current];

      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      if (!fruitsImg) return;

      const sprite = FRUIT_SPRITES[fruit.sprite];
      ctx.drawImage(
        fruitsImg,
        sprite.x,
        sprite.y,
        sprite.w,
        sprite.h,
        fruit.cell.col * CELL,
        fruit.cell.row * CELL,
        CELL,
        CELL,
      );

      const margin = 1;
      snake.forEach((seg, i) => {
        ctx.fillStyle = i === 0 ? palette.snakeHead : palette.snakeBody;
        ctx.fillRect(
          seg.col * CELL + margin,
          seg.row * CELL + margin,
          CELL - margin * 2,
          CELL - margin * 2,
        );
      });

      if (!stopped) {
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = palette.hudText;
        ctx.fillText("Score: " + score, 10, 10);
        ctx.textAlign = "center";
        ctx.fillStyle = palette.hudAccent;
        ctx.fillText("Nivel: " + level, W / 2, 10);
      }
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

    loadImage(FRUITS_SRC, (img) => pendingImages.push(img))
      .then((img) => {
        if (cancelled) return;
        fruitsImg = img;
        rafId = requestAnimationFrame(loop);
      })
      .catch(() => {
        // si falla la precarga, no arrancamos el loop; el canvas queda en negro
      });

    return () => {
      cancelled = true;
      stopped = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      // Aborta cualquier descarga de assets en curso (evita que el doble
      // montaje de mount/cleanup/mount de React StrictMode en desarrollo
      // deje dos requests concurrentes por la misma imagen).
      for (const img of pendingImages) {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount by design; paused is read via pausedRef
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <select
        value={skin}
        onChange={(e) => handleSkinChange(e.target.value as SkinId)}
        aria-label="Skin de Snake"
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          zIndex: 4,
          background: "#111",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 4,
          font: "12px monospace",
          padding: "2px 6px",
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
