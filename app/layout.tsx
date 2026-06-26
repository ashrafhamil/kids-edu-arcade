import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kids Edu Arcade — Learn & Play, No Ads",
  description:
    "Five fast, fun learning games for kids under 12. Math, coding, memory, spelling and focus. No ads, no sign-up, no tracking.",
  applicationName: "Kids Edu Arcade",
  appleWebApp: { capable: true, title: "Edu Arcade", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#6d28d9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fredoka.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
