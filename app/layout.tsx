import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeScript } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Fluffy · escrow for freelance developers",
  description: "Escrow agent for freelance developers. Verified work gets paid.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Dark is the server-rendered default; ThemeScript switches to a remembered "light" before first paint.
    <html lang="en" data-theme="dark" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
