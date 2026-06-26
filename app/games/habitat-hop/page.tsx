import type { Metadata } from "next";
import Game from "./Game";

export const metadata: Metadata = { title: "Habitat Hop — Kids Edu Arcade" };

export default function Page() {
  return <Game />;
}
