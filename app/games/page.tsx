import { createClient } from "@/lib/supabase/server";
import { getGames } from "@/lib/games";
import GamesGrid from "./GamesGrid";

export default async function Home() {
  const supabase = await createClient();
  const games = await getGames(supabase);

  return <GamesGrid games={games} />;
}
