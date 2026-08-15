// ===== lib/scores.ts — simulated score persistence (localStorage-backed) =====

const STORAGE_KEY = "av_scores";

export type SavedScore = { game: string; score: number; name: string; at: number };

export function saveScore(entry: Omit<SavedScore, "at">): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: SavedScore[] = raw ? JSON.parse(raw) : [];
    all.push({ ...entry, at: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage no disponible (SSR, modo privado, etc.)
  }
}
