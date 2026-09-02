import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGame } from "@/lib/games";
import GamePlayer from "./GamePlayer";

export default async function GamePlayerPage({
  params,
}: PageProps<"/juegos/[id]/jugar">) {
  const { id } = await params;
  const supabase = await createClient();
  const game = await getGame(supabase, id);
  if (!game) notFound();

  return <GamePlayer game={game} />;
}
