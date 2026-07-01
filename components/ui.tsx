"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Big, friendly tap target. Defaults to a solid white pill on the game accent. */
export function BigButton({
  children,
  className = "",
  variant = "solid",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost";
}) {
  const base =
    "select-none rounded-2xl px-7 py-3.5 text-xl font-black tracking-tight transition active:scale-95 disabled:opacity-50 disabled:active:scale-100";
  const styles =
    variant === "solid"
      ? "bg-white text-slate-900 shadow-lg shadow-black/20 hover:brightness-105"
      : "bg-white/30 text-white hover:bg-white/30";
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Row of up to 3 stars, filled left-to-right. */
export function StarRow({ value, size = "text-3xl" }: { value: number; size?: string }) {
  return (
    <div className={`flex gap-1 ${size}`} aria-label={`${value} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < value ? "" : "opacity-25 grayscale"}>
          ⭐
        </span>
      ))}
    </div>
  );
}

/** Centered card used for start screens and game-over panels. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-3xl bg-white/95 p-6 text-center text-slate-900 shadow-2xl shadow-black/30">
      {children}
    </div>
  );
}

/** Floating "+N" score popup. Position with wrapper; fades up via CSS. */
export function FloatScore({ children }: { children: ReactNode }) {
  return (
    <span className="float-score pointer-events-none absolute text-2xl font-black text-white drop-shadow">
      {children}
    </span>
  );
}
