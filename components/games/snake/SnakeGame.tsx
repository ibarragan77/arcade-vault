"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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
      ctx.fillStyle = "#000";
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
        ctx.fillStyle = i === 0 ? "#8dffc2" : "#3ddc84";
        ctx.fillRect(
          seg.col * CELL + margin,
          seg.row * CELL + margin,
          CELL - margin * 2,
          CELL - margin * 2,
        );
      });

      if (!stopped) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("Score: " + score, 10, 10);
        ctx.textAlign = "center";
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
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
