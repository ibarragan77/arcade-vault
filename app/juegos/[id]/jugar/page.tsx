import { notFound } from "next/navigation";
import { GAMES } from "@/lib/data";
import GamePlayer from "./GamePlayer";

export default async function GamePlayerPage({ params }: PageProps<"/juegos/[id]/jugar">) {
  const { id } = await params;
  const game = GAMES.find((g) => g.id === id);
  if (!game) notFound();

  return <GamePlayer game={game} />;
}
