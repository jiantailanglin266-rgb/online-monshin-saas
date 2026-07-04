import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { DemoBanner } from "@/components/DemoBanner";
import { StaticDemoBridge } from "@/components/StaticDemoBridge";

const noto = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MediBridge｜オンライン診療 問診サポート",
  description:
    "スマホで問診に答えると、医師に伝わる形に整理されます。診断は行いません。最終的な判断は医師が行います。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // アクセシビリティ：ピンチズームを禁止しない（Phase 2 §6）
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={noto.className}>
        <StaticDemoBridge />
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
