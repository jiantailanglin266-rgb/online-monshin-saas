// NOTE: 静的デモ(GitHub Pages)のブラウザ内エンジンからも利用するため "server-only" は付けない。
// サーバー専用の秘匿情報はこのモジュールには置かないこと。

/** 実プロバイダ呼び出し（fetch直、SDK不使用）。タイムアウトはAbortController。 */

export interface ProviderResponse {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
}

export type ProviderName = "anthropic" | "openai";

/** purpose別モデル（PHASE4 §4.2）。envで上書き可能。 */
export function modelFor(provider: ProviderName, tier: "smart" | "fast"): string {
  if (provider === "anthropic") {
    return tier === "smart"
      ? (process.env.ANTHROPIC_MODEL_SMART ?? "claude-sonnet-5")
      : (process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001");
  }
  return tier === "smart"
    ? (process.env.OPENAI_MODEL_SMART ?? "gpt-5.1")
    : (process.env.OPENAI_MODEL_FAST ?? "gpt-5-mini");
}

export function availableProviders(): ProviderName[] {
  const order: ProviderName[] =
    process.env.AI_PRIMARY_PROVIDER === "openai"
      ? ["openai", "anthropic"]
      : ["anthropic", "openai"];
  return order.filter((p) =>
    p === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY
  );
}

export async function callProvider(
  provider: ProviderName,
  model: string,
  system: string,
  user: string,
  opts: { timeoutMs: number; temperature: number }
): Promise<ProviderResponse> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          temperature: opts.temperature,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const body = await res.json();
      const text = (body.content ?? [])
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text: string }) => c.text)
        .join("");
      return {
        text,
        tokensIn: body.usage?.input_tokens,
        tokensOut: body.usage?.output_tokens,
      };
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const body = await res.json();
    return {
      text: body.choices?.[0]?.message?.content ?? "",
      tokensIn: body.usage?.prompt_tokens,
      tokensOut: body.usage?.completion_tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}
