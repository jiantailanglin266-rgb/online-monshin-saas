"use client";

/**
 * 静的書き出しデモ（GitHub Pages）専用の fetch ブリッジ。
 * NEXT_PUBLIC_STATIC_DEMO=1 のビルドでのみ、/api/v1/* への fetch を
 * ブラウザ内デモエンジン（lib/staticdemo/engine）へ横取りする。
 *
 * モジュール評価時（＝どのコンポーネントの effect よりも先）にパッチを当てるため、
 * 子コンポーネントの初回 fetch も確実に横取りできる。
 * 通常ビルドではフラグが立たないため何もしない（engine は noop スタブに alias される）。
 */
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_STATIC_DEMO === "1") {
  const w = window as unknown as { __mbFetchPatched?: boolean };
  if (!w.__mbFetchPatched) {
    w.__mbFetchPatched = true;
    const orig = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const path = raw.startsWith("http") ? new URL(raw).pathname : raw.split("?")[0];
      const idx = path.indexOf("/api/v1/");
      if (idx === -1) return orig(input as RequestInfo, init);
      const { handleDemoApi } = await import("@/lib/staticdemo/engine");
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const body = typeof init?.body === "string" ? init.body : null;
      return handleDemoApi(path.slice(idx + "/api/v1/".length), method, body);
    }) as typeof window.fetch;
  }
}

export function StaticDemoBridge() {
  return null;
}
