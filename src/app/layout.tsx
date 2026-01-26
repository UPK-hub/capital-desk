import "./globals.css";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Manrope, Sora } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Capital Desk",
  description: "Mesa de ayuda y mantenimiento - Capital Bus",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} ${sora.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
