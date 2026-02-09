import type { Metadata } from "next";
import "./globals.css";
import { GameLayout } from "@/components/nav/GameLayout";

export const metadata: Metadata = {
  title: "Moltfarm",
  description: "Agent Monitor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {/* 使用客户端布局包裹，实现状态持久化 */}
        <GameLayout>
          {children}
        </GameLayout>
      </body>
    </html>
  );
}