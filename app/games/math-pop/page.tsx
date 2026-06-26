import type { Metadata } from "next";
import Game from "./Game";

export const metadata: Metadata = { title: "Math Pop — Kids Edu Arcade" };

export default function Page() {
  return <Game />;
}
