import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import "./globals.css";
import PwaInit from "@/components/PwaInit";
import InstallBanner from "@/components/InstallBanner";

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
  metadataBase: new URL("https://kids-edu-arcade.vercel.app"),
  openGraph: {
    title: "Kids Edu Arcade — Learn & Play, No Ads",
    description:
      "Five fast, fun learning games for kids under 12. Math, coding, memory, spelling and focus. No ads, no sign-up, no tracking.",
    url: "https://kids-edu-arcade.vercel.app",
    siteName: "Kids Edu Arcade",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Kids Edu Arcade" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kids Edu Arcade — Learn & Play, No Ads",
    description:
      "Five fast, fun learning games for kids under 12. Math, coding, memory, spelling and focus. No ads, no sign-up, no tracking.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  themeColor: "#6d28d9",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom left enabled for low-vision accessibility (Lighthouse a11y).
  // Games already block accidental zoom via touch-action on their own surfaces.
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fredoka.variable} h-full`}>
      <body className="min-h-full antialiased">
        <PwaInit />
        <InstallBanner />
        {children}
      </body>
    </html>
  );
}
