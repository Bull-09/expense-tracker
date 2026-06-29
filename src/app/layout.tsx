import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mithu Chit Fund Tracker",
  description: "Track income, expenses, investments, and shared costs with friends.",
  appleWebApp: {
    capable: true,
    title: "Mithu Chit Fund Tracker",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F1115",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-ink text-paper">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
