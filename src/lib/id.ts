/**
 * ID生成（Node/ブラウザ両対応）。
 * 静的デモ（GitHub Pages）では engine が __mbIdFactory を差し込み、
 * 事前書き出し済みのプールID（q1〜q20）を割り当てる。
 */
export function newId(kind?: string): string {
  const g = globalThis as unknown as {
    __mbIdFactory?: (kind?: string) => string | null;
  };
  const custom = g.__mbIdFactory?.(kind);
  if (custom) return custom;
  return globalThis.crypto.randomUUID();
}
