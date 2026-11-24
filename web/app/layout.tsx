import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { getBrokerageTheme, themeStyle } from "@/lib/theme";
import "./globals.css";

// Body: Geist (clean grotesk). Display: Sora (wide geometric). Chosen by Enoch over Inter + Instrument Serif, 2026-11-23.
// Self-hosted (app/fonts, SIL OFL) so builds never depend on fetching Google Fonts.
const geist = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-body", weight: "100 900", display: "swap" });
const sora = localFont({
  src: [
    { path: "./fonts/sora-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/sora-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/sora-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-display-face",
  display: "swap",
});
const geistMono = localFont({ src: "./fonts/GeistMono-Variable.woff2", variable: "--font-geist-mono", weight: "100 900" });

const theme = getBrokerageTheme();

export const metadata: Metadata = {
  title: { default: `Mara · ${theme.name}`, template: `%s · Mara` },
  description: "Transaction assistant for Cedar & Stone Realty (demo).",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} ${sora.variable} ${geistMono.variable} antialiased`}
        style={themeStyle(theme) as React.CSSProperties}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
