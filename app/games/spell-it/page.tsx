import type { Metadata } from "next";
import Game from "./Game";

export const metadata: Metadata = { title: "Spell It — Kids Edu Arcade" };

export default function Page() {
  return <Game />;
}
