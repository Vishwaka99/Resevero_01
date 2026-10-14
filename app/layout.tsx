import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";

import "./globals.css";

/**
 * Source Sans 3 for the interface, per the design system, and JetBrains Mono
 * for times, durations and reservation codes, so columns of times line up. They are loaded through
 * `next/font` and bound to the `--font-sans` / `--font-mono` design tokens.
 */
const sans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-source-sans",
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
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d111c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script below writes to <html>, which the server did not render.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Runs before the first paint, so a stored choice is applied without
          the page flashing the other theme first. It sets nothing when there
          is no stored choice: the stylesheet's prefers-color-scheme rule is
          already right, and writing an attribute here would override it.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("rv-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${sans.variable} ${mono.variable}`}
        style={{
          // Point the design tokens at the fonts next/font just loaded.
          ["--font-sans" as string]: `var(--font-source-sans), "Source Sans 3", ui-sans-serif, system-ui, sans-serif`,
          ["--font-mono" as string]: `var(--font-jetbrains), ui-monospace, Menlo, monospace`,
        }}
      >
        {children}
      </body>
    </html>
  );
}
