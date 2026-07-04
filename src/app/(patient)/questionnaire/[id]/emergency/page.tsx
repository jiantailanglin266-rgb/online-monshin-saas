import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { questionnaireRepo } from "@/lib/repo/questionnaires";

/**
 * S-07E 緊急アラート全画面（Phase 2 §4）。
 * 文言は命令形にしない・感嘆符を使わない。ただし行動ボタンは動詞直結。
 */
export default async function EmergencyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; from?: string }>;
}) {
  const { id } = await params;
  const { t, from } = await searchParams;
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "patient") notFound();
  const q = await questionnaireRepo().findOwn(ctx, id);
  if (!q) notFound();

  const isSuicide = t === "suicide";
  const backStep = Number(from) || q.currentStep || 1;

  const telBtn = (label: string, tel: string) => (
    <a
      href={`tel:${tel}`}
      className="block min-h-16 rounded-xl bg-l1 px-5 py-4 text-center text-[18px] font-bold text-white"
    >
      📞 {label}
    </a>
  );

  return (
    <main className="grid gap-5 rounded-2xl bg-l1-soft p-5">
      {isSuicide ? (
        <>
          <h1 className="text-[22px] font-bold leading-snug">
            おつらい状況をお知らせいただき、ありがとうございます
          </h1>
          <p className="text-[16px]">
            おひとりで抱え込む必要はありません。話を聴いてくれる相談先があります。
          </p>
          <div className="grid gap-3">
            {telBtn("よりそいホットライン（24時間・無料）", "0120279338")}
            {telBtn("こころの健康相談統一ダイヤル", "0570064556")}
            {telBtn("いのちが危ないときは 119", "119")}
          </div>
        </>
      ) : (
        <>
          <h1 className="text-[22px] font-bold leading-snug">
            ⚠ すぐに医療機関の受診をご検討ください
          </h1>
          <p className="text-[16px]">
            ご入力の内容には、早急な対応が必要な可能性のある症状が含まれています。
          </p>
          <div className="grid gap-3">
            {telBtn("119 に電話する（救急）", "119")}
            {telBtn("#7119（救急安心センター）", "%237119")}
          </div>
        </>
      )}

      <p className="text-[14px] text-ink-sub">
        ご入力いただいた内容は保存され、クリニックにも共有されます。
      </p>

      <Link
        href={`/questionnaire/${id}/step/${backStep}`}
        className="text-center text-[15px] text-ink-sub underline"
      >
        症状は落ち着いている・このまま問診を続ける
      </Link>

      <p className="border-t border-l1/20 pt-3 text-[13px] text-ink-sub">
        ⓘ この表示は受診の目安であり、診断ではありません。最終的な判断は医師が行います。
      </p>
    </main>
  );
}
