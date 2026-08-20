import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bebas_Neue } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const displayFont = Bebas_Neue({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mog Off",
  description:
    "A retro 2D anime fighting game. Eighteen friends, twelve elemental powers, one arena that remembers everything.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} antialiased dark`}
    >
      {/* No height/overflow lock here — most screens are normal scrollable
       * pages. Only the live fight view locks the viewport, and it does
       * that itself (see app/page.tsx) rather than constraining every page. */}
      <body className="flex min-h-dvh flex-col bg-black text-white">{children}</body>
    </html>
  );
}
