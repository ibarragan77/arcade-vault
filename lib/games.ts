import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game } from "@/lib/data";

export type GameWithStats = Game & { best: number; plays: number };

export async function getGames(
  supabase: SupabaseClient,
): Promise<GameWithStats[]> {
  const [
    { data: games, error: gamesError },
    { data: scores, error: scoresError },
  ] = await Promise.all([
    supabase.from("games").select("*"),
    supabase.from("scores").select("game_id, score"),
  ]);

  if (gamesError) throw gamesError;
  if (scoresError) throw scoresError;

  const statsByGame = new Map<string, { best: number; plays: number }>();
  for (const row of scores ?? []) {
    const current = statsByGame.get(row.game_id) ?? { best: 0, plays: 0 };
    current.plays += 1;
    current.best = Math.max(current.best, row.score);
    statsByGame.set(row.game_id, current);
  }

  return (games ?? []).map((game) => ({
    ...(game as Game),
    ...(statsByGame.get(game.id) ?? { best: 0, plays: 0 }),
  }));
}

export async function getGame(
  supabase: SupabaseClient,
  id: string,
): Promise<Game | null> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as Game | null;
}
