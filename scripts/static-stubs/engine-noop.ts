// 通常ビルド用スタブ：静的デモエンジンをバンドルから排除する
// （NEXT_PUBLIC_STATIC_DEMO が立たない限り呼ばれることはない）
export async function handleDemoApi(): Promise<Response> {
  throw new Error("static demo engine is not available in this build");
}
