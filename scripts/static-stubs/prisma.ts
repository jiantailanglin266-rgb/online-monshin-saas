// 静的書き出しビルド専用スタブ：デモエンジンは prisma に到達しない
export function prisma(): never {
  throw new Error("prisma is not available in static demo build");
}
