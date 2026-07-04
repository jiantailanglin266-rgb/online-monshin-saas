import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-lg px-5 py-12">
      <p className="text-primary font-bold tracking-wide text-sm">MediBridge</p>
      <h1 className="mt-2 text-[26px] font-bold leading-snug">
        受診前の問診を、
        <br />
        スマホでかんたんに。
      </h1>
      <p className="mt-4 text-ink-sub">
        症状を入力すると、AIアシスタントが医師に伝わる形に整理します。
        受診の目安や、相談先の候補もご案内します。
      </p>

      <div className="mt-8 grid gap-3">
        <Link
          href="/register"
          className="block rounded-xl bg-primary px-5 py-3.5 text-center text-[17px] font-bold text-white hover:bg-primary-dark"
        >
          はじめての方（患者登録）
        </Link>
        <Link
          href="/login"
          className="block rounded-xl border border-primary/40 bg-surface px-5 py-3.5 text-center text-[17px] font-bold text-primary hover:bg-primary-soft"
        >
          ログイン
        </Link>
      </div>

      <div className="mt-10 rounded-xl bg-primary-soft p-4 text-[14px] text-ink-sub">
        <p className="font-bold text-ink">このサービスについて</p>
        <p className="mt-1">
          本サービスは問診のお手伝いをするものであり、診断は行いません。
          表示される内容は受診の目安であり、最終的な判断は医師が行います。
        </p>
      </div>
    </main>
  );
}
