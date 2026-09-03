import type { ComponentType } from "react";
import AsteroidsGame from "@/components/games/asteroids/AsteroidsGame";
import TetrisGame from "@/components/games/tetris/TetrisGame";
import ArkanoidGame from "@/components/games/arkanoid/ArkanoidGame";
import SnakeGame from "@/components/games/snake/SnakeGame";

export type GameEngineProps = {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange?: (lives: number) => void;
  onLevelChange?: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};

export type GameEngineEntry = {
  Component: ComponentType<GameEngineProps>;
  hasLives: boolean;
};

export const GAME_ENGINES: Record<string, GameEngineEntry> = {
  asteroides: { Component: AsteroidsGame, hasLives: true },
  caida: { Component: TetrisGame, hasLives: false },
  "bloque-buster": { Component: ArkanoidGame, hasLives: true },
  serpentina: { Component: SnakeGame, hasLives: false },
};
