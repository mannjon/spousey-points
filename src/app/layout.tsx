import type { Metadata } from "next";
import { Great_Vibes, Inter } from "next/font/google";
import "./globals.css";

const script = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-script",
});

const sans = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spousey Points",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${script.variable} ${sans.className}`}>{children}</body>
    </html>
  );
}
