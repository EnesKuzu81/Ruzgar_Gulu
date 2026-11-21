import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Rüzgar Fizibilite",
  description: "Bir konum için rüzgar santralinin teknik ve ekonomik fizibilitesini hesaplayan ve Türkçe rapor üreten araç.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f1f3f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
