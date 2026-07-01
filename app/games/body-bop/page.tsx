import type { Metadata } from "next";
import Game from "./Game";

export const metadata: Metadata = { title: "Body Bop — Kids Edu Arcade" };

export default function Page() {
  return <Game />;
}
