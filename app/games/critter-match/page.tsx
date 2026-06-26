import type { Metadata } from "next";
import Game from "./Game";

export const metadata: Metadata = { title: "Critter Match — Kids Edu Arcade" };

export default function Page() {
  return <Game />;
}
