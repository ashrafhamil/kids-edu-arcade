import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Kids Edu Arcade — Learn & Play, No Ads";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #8b5cf6 0%, #7c3aed 45%, #4338ca 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Game emoji grid */}
        <div
          style={{
            display: "flex",
            gap: "24px",
            marginBottom: "32px",
            fontSize: "72px",
          }}
        >
          <span>🎮</span>
          <span>🧮</span>
          <span>🔤</span>
          <span>🧠</span>
          <span>⏰</span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: "72px",
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "-2px",
            textAlign: "center",
            lineHeight: 1.1,
            textShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}
        >
          Kids Edu Arcade
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: "20px",
            fontSize: "32px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            textAlign: "center",
          }}
        >
          Learn &amp; Play · No Ads · No Sign-up
        </div>

        {/* Badge row */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: "36px",
          }}
        >
          {["Math", "Coding", "Memory", "Spelling", "Focus"].map((label) => (
            <div
              key={label}
              style={{
                background: "rgba(255,255,255,0.18)",
                borderRadius: "999px",
                padding: "8px 22px",
                fontSize: "22px",
                fontWeight: 700,
                color: "#ffffff",
                border: "1.5px solid rgba(255,255,255,0.35)",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
