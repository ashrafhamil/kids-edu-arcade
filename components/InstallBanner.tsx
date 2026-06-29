"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed as standalone — don't show
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Already dismissed this session
    if (sessionStorage.getItem("pwa-banner-dismissed")) return;

    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window.navigator as unknown as { standalone?: boolean }).standalone;
    setIsIos(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-banner-dismissed", "1");
    setDismissed(true);
    setShowIosHint(false);
  };

  if (dismissed) return null;

  // Android: native install prompt available
  if (prompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-violet-900/95 px-4 py-3 backdrop-blur-sm shadow-2xl border-t border-violet-700">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl shrink-0">📲</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Play offline</p>
            <p className="text-xs text-white/70 leading-tight">Install the app — no internet needed</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstall}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-black text-violet-800 active:scale-95 transition"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="text-white/50 hover:text-white text-xl leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // iOS: no beforeinstallprompt — show manual hint
  if (isIos) {
    if (showIosHint) {
      return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-violet-900/95 px-4 py-4 backdrop-blur-sm shadow-2xl border-t border-violet-700">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm font-bold text-white">Add to Home Screen</p>
            <button onClick={handleDismiss} className="text-white/50 hover:text-white text-xl leading-none">×</button>
          </div>
          <ol className="text-xs text-white/80 space-y-1 list-decimal list-inside">
            <li>Tap the <strong className="text-white">Share</strong> button <span className="text-base">⬆️</span> at the bottom</li>
            <li>Scroll and tap <strong className="text-white">"Add to Home Screen"</strong></li>
            <li>Tap <strong className="text-white">Add</strong></li>
          </ol>
          <div className="mt-2 flex justify-center">
            <div className="w-6 h-1 rounded-full bg-white/30" />
          </div>
        </div>
      );
    }

    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-violet-900/95 px-4 py-3 backdrop-blur-sm shadow-2xl border-t border-violet-700">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl shrink-0">📲</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Play offline</p>
            <p className="text-xs text-white/70 leading-tight">Install the app — no internet needed</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowIosHint(true)}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-black text-violet-800 active:scale-95 transition"
          >
            How?
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="text-white/50 hover:text-white text-xl leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return null;
}
