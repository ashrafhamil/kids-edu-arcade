import type { Metadata } from "next";
import Game from "./Game";

export const metadata: Metadata = { title: "Fraction Feast — Kids Edu Arcade" };

export default function Page() {
  return <Game />;
}
