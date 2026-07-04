/**
 * 静的書き出し（GitHub Pages）用の問診IDプール。
 * 静的ホスティングでは動的ルートを事前列挙する必要があるため、
 * デモエンジンは q1〜q20 を巡回して問診IDを払い出す（古いものは再利用時に破棄）。
 * 通常ビルドでは空配列（動的ルートのまま）。
 */
export const STATIC_POOL_SIZE = 20;

export function staticPoolIds(): { id: string }[] {
  if (process.env.NEXT_PUBLIC_STATIC_DEMO !== "1") return [];
  return Array.from({ length: STATIC_POOL_SIZE }, (_, i) => ({ id: `q${i + 1}` }));
}
