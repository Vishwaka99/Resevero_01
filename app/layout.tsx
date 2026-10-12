import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

/**
 * One family for the interface and one monospace for times, durations and
 * reservation codes, so columns of times line up. They are loaded through
 * `next/font` and bound to the `--font-sans` / `--font-mono` design tokens.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jakarta",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Reservo",
    template: "%s · Reservo",
  },
  description: "Reserve shared rooms, equipment and vehicles without double-booking.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d111c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${mono.variable}`}
        style={{
          // Point the design tokens at the fonts next/font just loaded.
          ["--font-sans" as string]: `var(--font-jakarta), ui-sans-serif, system-ui, sans-serif`,
          ["--font-mono" as string]: `var(--font-jetbrains), ui-monospace, Menlo, monospace`,
        }}
      >
        {children}
      </body>
    </html>
  );
}
