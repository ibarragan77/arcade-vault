"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEngineProps } from "@/lib/game-engines";

type TetrisGameProps = GameEngineProps;

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const NEXT_BLOCK = 30;
const GRID_LINE = "#22222e";

const COLORS = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - yellow
  "#ba68c8", // T - purple
  "#81c784", // S - green
  "#e57373", // Z - red
  "#90caf9", // J - pale blue
  "#ffb74d", // L - orange
  "#9e9e9e", // N - tuerca (gris metálico)
];

const PIECES: (number[][] | null)[] = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  [
    [8, 8, 8],
    [8, 0, 8],
    [8, 8, 8],
  ], // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

type Piece = { type: number; shape: number[][]; x: number; y: number };
type Board = number[][];

export default function TetrisGame({
  paused,
  onScoreChange,
  onLevelChange,
  onGameOver,
}: TetrisGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const nextCanvasEl = nextCanvasRef.current;
    if (!canvasEl || !nextCanvasEl) return;
    const ctx2d = canvasEl.getContext("2d");
    const nextCtx2d = nextCanvasEl.getContext("2d");
    if (!ctx2d || !nextCtx2d) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const nextCanvas: HTMLCanvasElement = nextCanvasEl;
    const ctx: CanvasRenderingContext2D = ctx2d;
    const nextCtx: CanvasRenderingContext2D = nextCtx2d;

    // ── Estado del motor ─────────────────────────────────────────────────
    const board: Board = createBoard();
    let current: Piece;
    let next: Piece;
    let scoreVal = 0;
    let linesVal = 0;
    let levelVal = 1;
    let dropInterval = 1000;
    let dropAccum = 0;
    let stopped = false;

    function createBoard(): Board {
      return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    }

    function randomPiece(): Piece {
      const type = Math.floor(Math.random() * 8) + 1;
      const shape = PIECES[type]!.map((row) => [...row]);
      return {
        type,
        shape,
        x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
        y: 0,
      };
    }

    function collide(shape: number[][], ox: number, oy: number) {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const nx = ox + c;
          const ny = oy + r;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && board[ny][nx]) return true;
        }
      }
      return false;
    }

    function rotateCW(shape: number[][]) {
      const rows = shape.length,
        cols = shape[0].length;
      const result = Array.from({ length: cols }, () =>
        new Array(rows).fill(0),
      );
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
      return result;
    }

    function tryRotate() {
      const rotated = rotateCW(current.shape);
      const kicks = [0, -1, 1, -2, 2];
      for (const kick of kicks) {
        if (!collide(rotated, current.x + kick, current.y)) {
          current.shape = rotated;
          current.x += kick;
          return;
        }
      }
    }

    function merge() {
      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          if (current.shape[r][c])
            board[current.y + r][current.x + c] = current.shape[r][c];
    }

    function clearLines() {
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every((v) => v !== 0)) {
          board.splice(r, 1);
          board.unshift(new Array(COLS).fill(0));
          cleared++;
          r++;
        }
      }
      if (cleared) {
        linesVal += cleared;
        scoreVal += (LINE_SCORES[cleared] || 0) * levelVal;
        levelVal = Math.floor(linesVal / 10) + 1;
        dropInterval = Math.max(100, 1000 - (levelVal - 1) * 90);
        updateHUD();
      }
    }

    function ghostY() {
      let gy = current.y;
      while (!collide(current.shape, current.x, gy + 1)) gy++;
      return gy;
    }

    function hardDrop() {
      const gy = ghostY();
      scoreVal += (gy - current.y) * 2;
      current.y = gy;
      lockPiece();
      updateHUD();
    }

    function softDrop() {
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        scoreVal += 1;
        updateHUD();
      } else {
        lockPiece();
      }
    }

    function lockPiece() {
      merge();
      clearLines();
      spawn();
    }

    function spawn() {
      current = next;
      next = randomPiece();
      if (collide(current.shape, current.x, current.y)) {
        stopped = true;
        cancelAnimationFrame(rafId);
        onGameOver(scoreVal);
      }
      drawNext();
    }

    function updateHUD() {
      setScore(scoreVal);
      setLines(linesVal);
      setLevel(levelVal);
      onScoreChange(scoreVal);
      onLevelChange?.(levelVal);
    }

    function drawBlock(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      colorIndex: number,
      size: number,
      alpha?: number,
    ) {
      if (!colorIndex) return;
      const color = COLORS[colorIndex]!;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = "rgba(255,255,255,0.12)";
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    }

    function drawGrid() {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 0.5;
      for (let c = 1; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * BLOCK, 0);
        ctx.lineTo(c * BLOCK, ROWS * BLOCK);
        ctx.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * BLOCK);
        ctx.lineTo(COLS * BLOCK, r * BLOCK);
        ctx.stroke();
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();

      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) drawBlock(ctx, c, r, board[r][c], BLOCK);

      const gy = ghostY();
      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          if (current.shape[r][c])
            drawBlock(
              ctx,
              current.x + c,
              gy + r,
              current.shape[r][c],
              BLOCK,
              0.2,
            );

      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          drawBlock(
            ctx,
            current.x + c,
            current.y + r,
            current.shape[r][c],
            BLOCK,
          );
    }

    function drawNext() {
      nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      const shape = next.shape;
      const offX = Math.floor((4 - shape[0].length) / 2);
      const offY = Math.floor((4 - shape.length) / 2);
      for (let r = 0; r < shape.length; r++)
        for (let c = 0; c < shape[r].length; c++)
          drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NEXT_BLOCK);
    }

    // ── Input ─────────────────────────────────────────────────────────────
    function handleKeyDown(e: KeyboardEvent) {
      if (pausedRef.current || stopped) return;
      switch (e.code) {
        case "ArrowLeft":
          e.preventDefault();
          if (!collide(current.shape, current.x - 1, current.y)) current.x--;
          break;
        case "ArrowRight":
          e.preventDefault();
          if (!collide(current.shape, current.x + 1, current.y)) current.x++;
          break;
        case "ArrowDown":
          e.preventDefault();
          softDrop();
          break;
        case "ArrowUp":
        case "KeyX":
          e.preventDefault();
          tryRotate();
          break;
        case "Space":
          e.preventDefault();
          hardDrop();
          break;
        default:
          return;
      }
      updateHUD();
    }
    window.addEventListener("keydown", handleKeyDown);

    // ── Loop principal ──────────────────────────────────────────────────
    let lastTime: number | null = null;
    let wasPaused = pausedRef.current;
    let rafId: number;

    function loop(ts: number) {
      const isPaused = pausedRef.current;
      if (wasPaused && !isPaused) lastTime = null;
      wasPaused = isPaused;

      const dt = lastTime === null ? 0 : ts - lastTime;
      lastTime = ts;

      if (!isPaused && !stopped) {
        dropAccum += dt;
        if (dropAccum >= dropInterval) {
          dropAccum = 0;
          if (!collide(current.shape, current.x, current.y + 1)) {
            current.y++;
          } else {
            lockPiece();
          }
        }
      }

      draw();
      if (!stopped) rafId = requestAnimationFrame(loop);
    }

    next = randomPiece();
    spawn();
    updateHUD();
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once por montaje; paused se lee vía pausedRef
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: "#000",
      }}
    >
      <canvas
        ref={canvasRef}
        width={300}
        height={600}
        style={{ height: "92%", width: "auto" }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          color: "#fff",
        }}
      >
        <div>
          <div
            className="pixel"
            style={{ fontSize: 10, color: "var(--ink-faint)" }}
          >
            SCORE
          </div>
          <div className="mono" style={{ fontSize: 15 }}>
            {score.toLocaleString("es-ES")}
          </div>
        </div>
        <div>
          <div
            className="pixel"
            style={{ fontSize: 10, color: "var(--ink-faint)" }}
          >
            LINES
          </div>
          <div className="mono" style={{ fontSize: 15 }}>
            {lines}
          </div>
        </div>
        <div>
          <div
            className="pixel"
            style={{ fontSize: 10, color: "var(--ink-faint)" }}
          >
            LEVEL
          </div>
          <div className="mono" style={{ fontSize: 15 }}>
            {level}
          </div>
        </div>
        <div>
          <div
            className="pixel"
            style={{ fontSize: 10, color: "var(--ink-faint)" }}
          >
            NEXT
          </div>
          <canvas
            ref={nextCanvasRef}
            width={120}
            height={120}
            style={{ width: 72, height: 72 }}
          />
        </div>
      </div>
    </div>
  );
}
