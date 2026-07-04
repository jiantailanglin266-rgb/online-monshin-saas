"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AiQuestionItem } from "@/lib/types/questionnaire";

type Phase = "loading" | "asking" | "finalizing" | "done" | "error";

export function InterviewChat({
  questionnaireId,
  active,
}: {
  questionnaireId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<AiQuestionItem[]>([]);
  const [phase, setPhase] = useState<Phase>(active ? "loading" : "done");
  const [busy, setBusy] = useState(false);
  const [freeInput, setFreeInput] = useState("");
  const [otherMode, setOtherMode] = useState(false);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const current = questions.find((q) => !q.answeredAt) ?? null;

  const finishInterview = useCallback(async () => {
    // 質問終了・スキップいずれも finalize（③④⑤実行）してから結果画面へ
    setPhase("finalizing");
    const res = await fetch(`/api/v1/questionnaires/${questionnaireId}/finalize`, {
      method: "POST",
    });
    if (res.ok) {
      router.push(`/questionnaire/${questionnaireId}/result`);
      return;
    }
    setPhase("done");
  }, [questionnaireId, router]);

  const fetchNext = useCallback(async () => {
    setPhase("loading");
    const res = await fetch(`/api/v1/questionnaires/${questionnaireId}/interview/next`, {
      method: "POST",
    });
    if (!res.ok) {
      setPhase("error");
      return;
    }
    const body = await res.json();
    if (body.done) {
      await finishInterview();
      return;
    }
    setQuestions((prev) =>
      prev.some((x) => x.id === body.question.id) ? prev : [...prev, body.question]
    );
    setPhase("asking");
  }, [questionnaireId, finishInterview]);

  useEffect(() => {
    if (!active) return;
    (async () => {
      const res = await fetch(`/api/v1/questionnaires/${questionnaireId}/interview`);
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const body = await res.json();
      setQuestions(body.questions);
      if (body.status !== "ai_interview") {
        setPhase("done");
        return;
      }
      const unanswered = (body.questions as AiQuestionItem[]).some((x) => !x.answeredAt);
      if (unanswered) setPhase("asking");
      else await fetchNext();
    })();
  }, [active, questionnaireId, fetchNext]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [questions, phase]);

  async function answer(value: string | string[]) {
    if (!current || busy) return;
    setBusy(true);
    const res = await fetch(
      `/api/v1/questionnaires/${questionnaireId}/interview/answers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, answer: value }),
      }
    );
    setBusy(false);
    if (!res.ok) {
      setPhase("error");
      return;
    }
    const body = await res.json();
    setQuestions((prev) =>
      prev.map((x) =>
        x.id === current.id
          ? { ...x, answer: value, answeredAt: new Date().toISOString() }
          : x
      )
    );
    setOtherMode(false);
    setFreeInput("");
    setMultiSel([]);
    if (body.emergency?.flagged) {
      router.push(
        `/questionnaire/${questionnaireId}/emergency?t=${body.emergency.kind}&from=7`
      );
      return;
    }
    await fetchNext();
  }

  const bubbleAi = "max-w-[85%] rounded-2xl rounded-tl-sm bg-surface border border-line px-4 py-3";
  const bubbleMe = "max-w-[85%] justify-self-end rounded-2xl rounded-tr-sm bg-primary text-white px-4 py-3";

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 rounded-2xl bg-l4-soft/60 p-4">
        <div className={bubbleAi}>
          <p className="text-[13px] font-bold text-primary">🩺 AIアシスタント</p>
          <p className="mt-1">
            ご回答ありがとうございました。医師に正確に伝えるため、いくつか質問させてください。
          </p>
        </div>

        {questions.map((q) => (
          <div key={q.id} className="grid gap-3">
            <div className={bubbleAi}>
              <p className="text-[13px] font-bold text-primary">🩺 AIアシスタント</p>
              <p className="mt-1">{q.questionText}</p>
            </div>
            {q.answeredAt && (
              <div className={bubbleMe}>
                {Array.isArray(q.answer) ? q.answer.join("、") : q.answer}
              </div>
            )}
          </div>
        ))}

        {phase === "loading" && (
          <div className={bubbleAi}>
            <p className="text-ink-sub text-[15px]">入力内容を確認しています…</p>
          </div>
        )}

        {phase === "finalizing" && (
          <div className={bubbleAi}>
            <p className="text-[13px] font-bold text-primary">🩺 AIアシスタント</p>
            <p className="mt-1">
              追加の質問は以上です。ご協力ありがとうございました。受診の目安をご案内します…
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className={bubbleAi}>
            <p className="text-[13px] font-bold text-primary">🩺 AIアシスタント</p>
            <p className="mt-1">
              ご協力ありがとうございました。内容は医師に共有されます。
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className={bubbleAi}>
            <p className="text-[15px]">
              自動の追加質問は省略されました。医師が診療時におうかがいします。
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {phase === "asking" && current && (
        <div className="grid gap-2">
          {current.questionType === "single_choice" && !otherMode && (
            <>
              {(current.options ?? []).map((o) => (
                <button key={o} type="button" disabled={busy} onClick={() => answer(o)}
                  className="min-h-13 rounded-xl border border-primary/40 bg-surface px-4 py-3 text-left text-[16px] font-medium hover:bg-primary-soft disabled:opacity-60">
                  {o}
                </button>
              ))}
              <button type="button" disabled={busy} onClick={() => setOtherMode(true)}
                className="min-h-13 rounded-xl border border-line bg-surface px-4 py-3 text-left text-[16px] text-ink-sub hover:bg-l4-soft">
                その他（入力する）
              </button>
            </>
          )}

          {current.questionType === "multi_choice" && (
            <>
              {(current.options ?? []).map((o) => (
                <label key={o} className="flex min-h-13 items-center gap-3 rounded-xl border border-line bg-surface px-4">
                  <input type="checkbox" className="size-5" checked={multiSel.includes(o)}
                    onChange={(e) =>
                      setMultiSel((prev) => e.target.checked ? [...prev, o] : prev.filter((x) => x !== o))
                    } />
                  <span className="text-[16px]">{o}</span>
                </label>
              ))}
              <button type="button" disabled={busy || multiSel.length === 0} onClick={() => answer(multiSel)}
                className="min-h-13 rounded-xl bg-primary px-4 font-bold text-white disabled:opacity-50">
                決定
              </button>
            </>
          )}

          {(current.questionType === "free_text" || otherMode) && (
            <form className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); if (freeInput.trim()) answer(freeInput.trim()); }}>
              <input value={freeInput} onChange={(e) => setFreeInput(e.target.value)}
                className="min-h-13 flex-1 rounded-xl border border-line bg-surface px-4"
                placeholder="ご自由にご入力ください" />
              <button type="submit" disabled={busy || !freeInput.trim()}
                className="min-h-13 rounded-xl bg-primary px-5 font-bold text-white disabled:opacity-50">
                送信
              </button>
            </form>
          )}

          <button type="button" disabled={busy} onClick={finishInterview}
            className="mt-1 text-[14px] text-ink-sub underline">
            ここまでの内容で終わる ▸
          </button>
        </div>
      )}

      {(phase === "done" || phase === "error") && (
        <Link href="/mypage" className="text-center font-bold text-primary underline">
          マイページへもどる
        </Link>
      )}
    </div>
  );
}
