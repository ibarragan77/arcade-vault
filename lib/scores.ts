import type { SupabaseClient } from "@supabase/supabase-js";

export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
  date: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${mon}/${d.getFullYear()}`;
}

export async function saveScore(
  supabase: SupabaseClient,
  entry: { game: string; score: number; name: string },
): Promise<void> {
  const { error } = await supabase
    .from("scores")
    .insert({ game_id: entry.game, score: entry.score, name: entry.name });

  if (error) throw error;
}

export async function getTopScores(
  supabase: SupabaseClient,
  gameId: string,
  limit: number,
): Promise<ScoreRow[]> {
  const { data, error } = await supabase
    .from("scores")
    .select("name, score, created_at")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row, i) => ({
    rank: i + 1,
    name: row.name,
    score: row.score,
    date: formatDate(row.created_at),
  }));
}

export async function getGameStats(
  supabase: SupabaseClient,
  gameId: string,
): Promise<{ best: number; plays: number }> {
  const [{ count }, { data: topRow }] = await Promise.all([
    supabase
      .from("scores")
      .select("*", { count: "exact", head: true })
      .eq("game_id", gameId),
    supabase
      .from("scores")
      .select("score")
      .eq("game_id", gameId)
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    best: topRow?.score ?? 0,
    plays: count ?? 0,
  };
}
