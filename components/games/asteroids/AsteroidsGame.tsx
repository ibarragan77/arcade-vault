"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEngineProps } from "@/lib/game-engines";

type AsteroidsGameProps = GameEngineProps;

const W = 800;
const H = 600;

const POWERUP_DROP_CHANCE = 0.15;
const POWERUP_DURATION = 5;
const POWERUP_TTL = 12;
const TRIPLE_SPREAD = 0.18;

const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20]; // puntos por tamaño

// ── Skins ─────────────────────────────────────────────────────────────────────
type SkinId = "clasico" | "neon" | "retro";

type SkinPalette = {
  bg: string;
  ship: string;
  asteroid: string;
  bullet: string;
  powerup: string;
  thruster: string; // rgba() completo, para la llama del propulsor
  particleRGB: string; // "r,g,b" para interpolar el alpha de las partículas
  hudText: string;
  hudAccent: string; // indicador "3x" del power-up activo
};

const SKIN_STORAGE_KEY = "asteroids-skin";

// ── Controles táctiles ────────────────────────────────────────────────────────
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

const SKIN_PALETTES: Record<SkinId, SkinPalette> = {
  clasico: {
    bg: "#000",
    ship: "#fff",
    asteroid: "#fff",
    bullet: "#fff",
    powerup: "#0ff",
    thruster: "rgba(255, 130, 0, 0.85)",
    particleRGB: "255,255,255",
    hudText: "#fff",
    hudAccent: "#0ff",
  },
  neon: {
    bg: "#000",
    ship: "#f5ff00", // var(--yellow), ancla en games.color = "yellow"
    asteroid: "#ff006e", // var(--magenta)
    bullet: "#00f5ff", // var(--cyan)
    powerup: "#00ff88", // var(--green)
    thruster: "rgba(255, 140, 0, 0.9)",
    particleRGB: "0,245,255",
    hudText: "#f5ff00",
    hudAccent: "#00ff88",
  },
  retro: {
    bg: "#000",
    ship: "#ffb000", // ámbar, fósforo de monitor vectorial clásico
    asteroid: "#ffb000",
    bullet: "#ffb000",
    powerup: "#ffb000",
    thruster: "rgba(255, 176, 0, 0.85)",
    particleRGB: "255,176,0",
    hudText: "#ffb000",
    hudAccent: "#ffb000",
  },
};

const wrap = (v: number, max: number) => ((v % max) + max) % max;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl = 1.1;
  radius = 2;
  dead = false;

  constructor(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
  }

  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D, palette: SkinPalette) {
    ctx.fillStyle = palette.bullet;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
class Asteroid {
  x: number;
  y: number;
  size: number;
  radius: number;
  dead = false;
  vx: number;
  vy: number;
  rotSpeed: number;
  rot: number;
  verts: [number, number][] = [];

  constructor(x: number, y: number, size = 3) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.radius = RADII[size];

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split(): Asteroid[] {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw(ctx: CanvasRenderingContext2D, palette: SkinPalette) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = palette.asteroid;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── PowerUp ───────────────────────────────────────────────────────────────────
class PowerUp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius = 12;
  ttl = POWERUP_TTL;
  dead = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(20, 40);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D, palette: SkinPalette) {
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = palette.powerup;
    ctx.lineWidth = 2;
    const r = this.radius * pulse;
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    ctx.fillStyle = palette.powerup;
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("3x", this.x, this.y);
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  tripleShot = 0;
  x = 0;
  y = 0;
  angle = 0;
  vx = 0;
  vy = 0;
  radius = 12;
  thrusting = false;
  invincible = 0;
  shootCooldown = 0;
  dead = false;

  constructor() {
    this.reset();
  }

  reset() {
    this.x = W / 2;
    this.y = H / 2;
    this.angle = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12;
    this.thrusting = false;
    this.invincible = 3;
    this.shootCooldown = 0;
    this.dead = false;
  }

  update(dt: number, keys: Record<string, boolean>) {
    if (this.dead) return;
    if (this.invincible > 0) this.invincible -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleShot > 0) this.tripleShot -= dt;

    const ROT = 3.5; // rad/s
    const THRUST = 260; // px/s²
    const DRAG = 0.987;

    if (keys["ArrowLeft"]) this.angle -= ROT * dt;
    if (keys["ArrowRight"]) this.angle += ROT * dt;

    this.thrusting = !!keys["ArrowUp"];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot(): Bullet[] {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleShot > 0) {
      return [
        new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
        new Bullet(ox, oy, this.angle),
        new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
      ];
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw(ctx: CanvasRenderingContext2D, palette: SkinPalette) {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0)
      return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = palette.ship;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo(20, 0); // nariz
    ctx.lineTo(-12, -9); // ala izquierda
    ctx.lineTo(-7, 0); // muesca trasera
    ctx.lineTo(-12, 9); // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8, 4);
      ctx.strokeStyle = palette.thruster;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  dead = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl = this.life;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D, palette: SkinPalette) {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(${palette.particleRGB},${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

type GameState = "playing" | "dead";

export default function AsteroidsGame({
  paused,
  onScoreChange,
  onLivesChange,
  onLevelChange,
  onGameOver,
}: AsteroidsGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const [skin, setSkin] = useState<SkinId>("clasico");
  const skinRef = useRef<SkinId>(skin);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [touchOverlayHidden, setTouchOverlayHidden] = useState(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const justPressedRef = useRef<Record<string, boolean>>({});
  const activeTouchesRef = useRef<Map<number, TouchAction>>(new Map());

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const touch =
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detección única al montar, mismo patrón SSR-safe que la lectura de skin de spec 11
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
    try {
      const saved = localStorage.getItem(TOUCH_HIDDEN_STORAGE_KEY);
      if (saved === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de localStorage al montar, mismo patrón SSR-safe que la lectura de skin de spec 11
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

  function handleTouchButtonStart(action: TouchAction, touchId: number) {
    activeTouchesRef.current.set(touchId, action);
    const code = TOUCH_ACTION_KEYS[action];
    if (!keysRef.current[code]) justPressedRef.current[code] = true;
    keysRef.current[code] = true;
  }

  function handleTouchButtonEnd(touchId: number) {
    const action = activeTouchesRef.current.get(touchId);
    if (!action) return;
    activeTouchesRef.current.delete(touchId);
    keysRef.current[TOUCH_ACTION_KEYS[action]] = false;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    // ── Input ─────────────────────────────────────────────────────────────
    // Mismos objetos que usan los botones táctiles (handleTouchButtonStart/End),
    // vía keysRef/justPressedRef, para no duplicar lógica de input.
    const keys = keysRef.current;
    const justPressed = justPressedRef.current;
    const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "Space"]);

    function handleKeyDown(e: KeyboardEvent) {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!keys[e.code]) justPressed[e.code] = true;
      keys[e.code] = true;
    }
    function handleKeyUp(e: KeyboardEvent) {
      keys[e.code] = false;
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    function pressed(code: string) {
      const val = justPressed[code];
      justPressed[code] = false;
      return val;
    }

    // ── Estado del juego ─────────────────────────────────────────────────
    let ship: Ship;
    let bullets: Bullet[];
    let asteroids: Asteroid[];
    let particles: Particle[];
    let powerUps: PowerUp[];
    let score: number;
    let lives: number;
    let level: number;
    let state: GameState;
    let deadTimer = 0;
    let powerUpSpawned = false;
    let killsSinceSpawn = 0;
    let stopped = false;

    function spawnAsteroids(count: number) {
      const SAFE_DIST = 130;
      for (let i = 0; i < count; i++) {
        let x: number, y: number;
        do {
          x = rand(0, W);
          y = rand(0, H);
        } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
        asteroids.push(new Asteroid(x, y, 3));
      }
    }

    function initGame() {
      ship = new Ship();
      bullets = [];
      asteroids = [];
      particles = [];
      powerUps = [];
      powerUpSpawned = false;
      killsSinceSpawn = 0;
      score = 0;
      lives = 3;
      level = 1;
      state = "playing";
      spawnAsteroids(4);
    }

    function nextLevel() {
      level++;
      onLevelChange?.(level);
      bullets = [];
      particles = [];
      powerUps = [];
      powerUpSpawned = false;
      killsSinceSpawn = 0;
      ship.reset();
      spawnAsteroids(3 + level);
    }

    function explode(x: number, y: number, count = 8) {
      for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
    }

    function killShip() {
      explode(ship.x, ship.y, 14);
      ship.dead = true;
      lives--;
      onLivesChange?.(lives);
      if (lives <= 0) {
        onGameOver(score);
        stopped = true;
      } else {
        state = "dead";
        deadTimer = 2;
      }
    }

    // ── Update ───────────────────────────────────────────────────────────
    function update(dt: number) {
      if (state === "dead") {
        deadTimer -= dt;
        particles.forEach((p) => p.update(dt));
        particles = particles.filter((p) => !p.dead);
        asteroids.forEach((a) => a.update(dt));
        if (deadTimer <= 0) {
          state = "playing";
          ship.reset();
        }
        return;
      }

      // Disparar
      if (pressed("Space")) {
        bullets.push(...ship.tryShoot());
      }

      ship.update(dt, keys);
      bullets.forEach((b) => b.update(dt));
      asteroids.forEach((a) => a.update(dt));
      particles.forEach((p) => p.update(dt));
      powerUps.forEach((p) => p.update(dt));

      bullets = bullets.filter((b) => !b.dead);
      particles = particles.filter((p) => !p.dead);
      powerUps = powerUps.filter((p) => !p.dead);

      for (const p of powerUps) {
        if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
          p.dead = true;
          ship.tripleShot = POWERUP_DURATION;
        }
      }

      // Bala vs asteroide
      const newAsteroids: Asteroid[] = [];
      for (const b of bullets) {
        for (const a of asteroids) {
          if (!a.dead && !b.dead && dist(b, a) < a.radius) {
            b.dead = true;
            a.dead = true;
            score += POINTS[a.size];
            onScoreChange(score);
            explode(a.x, a.y, a.size * 5);
            newAsteroids.push(...a.split());
            if (!powerUpSpawned) {
              killsSinceSpawn++;
              const guaranteed = killsSinceSpawn >= 5;
              if (guaranteed || Math.random() < POWERUP_DROP_CHANCE) {
                powerUps.push(new PowerUp(a.x, a.y));
                powerUpSpawned = true;
              }
            }
          }
        }
      }
      asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
      bullets = bullets.filter((b) => !b.dead);

      // Nave vs asteroide
      if (ship.invincible <= 0) {
        for (const a of asteroids) {
          if (dist(ship, a) < ship.radius + a.radius * 0.82) {
            killShip();
            break;
          }
        }
      }

      // Nivel completado
      if (!stopped && asteroids.length === 0) nextLevel();
    }

    // ── Draw ─────────────────────────────────────────────────────────────
    function drawLifeIcon(x: number, y: number, palette: SkinPalette) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 2);
      ctx.strokeStyle = palette.hudText;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, -5);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    function drawHUD(palette: SkinPalette) {
      ctx.fillStyle = palette.hudText;
      ctx.font = "15px monospace";

      ctx.textAlign = "left";
      ctx.fillText(`SCORE  ${score}`, 14, 26);

      ctx.textAlign = "center";
      ctx.fillText(`NIVEL ${level}`, W / 2, 26);

      for (let i = 0; i < lives; i++)
        drawLifeIcon(W - 16 - i * 22, 18, palette);

      if (ship.tripleShot > 0) {
        ctx.textAlign = "left";
        ctx.fillStyle = palette.hudAccent;
        ctx.fillText(`3x  ${ship.tripleShot.toFixed(1)}s`, 14, 46);
      }
    }

    function draw() {
      const palette = SKIN_PALETTES[skinRef.current];

      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      particles.forEach((p) => p.draw(ctx, palette));
      asteroids.forEach((a) => a.draw(ctx, palette));
      powerUps.forEach((p) => p.draw(ctx, palette));
      bullets.forEach((b) => b.draw(ctx, palette));
      ship.draw(ctx, palette);

      drawHUD(palette);
    }

    // ── Loop principal ──────────────────────────────────────────────────
    let lastTime: number | null = null;
    let wasPaused = pausedRef.current;
    let rafId: number;

    function loop(ts: number) {
      const isPaused = pausedRef.current;
      if (wasPaused && !isPaused) lastTime = null;
      wasPaused = isPaused;

      const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      if (!isPaused) update(dt);
      draw();

      if (!stopped) rafId = requestAnimationFrame(loop);
    }

    initGame();
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount by design; paused is read via pausedRef
  }, []);

  const palette = SKIN_PALETTES[skin];

  return (
    <div
      data-touch-device={isTouchDevice}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {isTouchDevice && !isPortrait && !touchOverlayHidden && (
        <>
          <div
            style={{
              position: "absolute",
              left: 16,
              bottom: 16,
              zIndex: 5,
              display: "grid",
              gridTemplateColumns: "52px 52px 52px",
              gridTemplateRows: "52px 52px",
              gap: 4,
            }}
          >
            <button
              aria-label="Empuje"
              onTouchStart={(e) => {
                e.preventDefault();
                for (const t of Array.from(e.changedTouches))
                  handleTouchButtonStart("thrust", t.identifier);
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
                ...touchButtonStyle(palette.ship),
                gridColumn: 2,
                gridRow: 1,
              }}
            >
              ▲
            </button>
            <button
              aria-label="Rotar izquierda"
              onTouchStart={(e) => {
                e.preventDefault();
                for (const t of Array.from(e.changedTouches))
                  handleTouchButtonStart("rotateLeft", t.identifier);
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
                ...touchButtonStyle(palette.ship),
                gridColumn: 1,
                gridRow: 2,
              }}
            >
              ◄
            </button>
            <button
              aria-label="Rotar derecha"
              onTouchStart={(e) => {
                e.preventDefault();
                for (const t of Array.from(e.changedTouches))
                  handleTouchButtonStart("rotateRight", t.identifier);
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
                ...touchButtonStyle(palette.ship),
                gridColumn: 3,
                gridRow: 2,
              }}
            >
              ►
            </button>
          </div>
          <button
            aria-label="Disparo"
            onTouchStart={(e) => {
              e.preventDefault();
              for (const t of Array.from(e.changedTouches))
                handleTouchButtonStart("fire", t.identifier);
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
              ...touchButtonStyle(palette.bullet),
              position: "absolute",
              right: 16,
              bottom: 44,
              zIndex: 5,
            }}
          >
            ●
          </button>
        </>
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
            bottom: 132,
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
      <select
        value={skin}
        onChange={(e) => handleSkinChange(e.target.value as SkinId)}
        aria-label="Skin de Asteroids"
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
