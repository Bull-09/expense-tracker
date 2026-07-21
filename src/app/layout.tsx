import type { Metadata, Viewport } from "next";
import { Sora, Spline_Sans_Mono } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const splineSansMono = Spline_Sans_Mono({
  variable: "--font-spline-sans-mono",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "C-137 Capital",
  description: "Track income, expenses, investments, and shared costs with friends.",
  appleWebApp: {
    capable: true,
    title: "C-137 Capital",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E0F0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sora.variable} ${splineSansMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ink text-paper">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
