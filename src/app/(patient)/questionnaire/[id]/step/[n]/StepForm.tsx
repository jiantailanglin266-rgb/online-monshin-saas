"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  CATEGORIES,
  ONSET_OPTIONS,
  PREGNANCY_OPTIONS,
  TOTAL_STEPS,
  type Questionnaire,
  type QuestionnairePatch,
} from "@/lib/types/questionnaire";

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`min-h-14 w-full rounded-xl border px-4 text-left text-[17px] font-medium transition-colors ${
        selected
          ? "border-primary bg-primary-soft text-primary"
          : "border-line bg-surface hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

const painFace = (v: number) =>
  v <= 1 ? "🙂" : v <= 3 ? "😐" : v <= 5 ? "😕" : v <= 7 ? "😣" : "😖";

const inputCls = "min-h-12 w-full rounded-xl border border-line bg-surface px-4";
const textareaCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 min-h-24 text-[16px]";

export function StepForm({
  q,
  step,
  patientSex,
}: {
  q: Questionnaire;
  step: number;
  patientSex: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- 各ステップのローカル状態（qから初期化） ---
  const [category, setCategory] = useState(q.chiefComplaintCategory);
  const [complaintText, setComplaintText] = useState(q.chiefComplaintText ?? "");
  const [onset, setOnset] = useState(q.onset);
  const [pain, setPain] = useState<number | null>(q.painScale);
  const [painUnknown, setPainUnknown] = useState(false);
  const [temp, setTemp] = useState(q.bodyTemp?.toString() ?? "");
  const [tempNotMeasured, setTempNotMeasured] = useState(
    q.currentStep > 4 && q.bodyTemp == null
  );
  const [history, setHistory] = useState(q.historySnapshot.join("\n"));
  const [meds, setMeds] = useState(q.medicationsSnapshot.join("\n"));
  const [allergies, setAllergies] = useState(q.allergiesSnapshot.join("\n"));
  const [pregnancy, setPregnancy] = useState(q.pregnancyStatus);
  const [smoking, setSmoking] = useState(q.lifestyle.smoking);
  const [alcohol, setAlcohol] = useState(q.lifestyle.alcohol);
  const [sleep, setSleep] = useState(q.lifestyle.sleep);
  const [freeText, setFreeText] = useState(q.freeText ?? "");
  const [imageCount, setImageCount] = useState(q.imageCount);
  const [uploading, setUploading] = useState(false);

  const askPregnancy = patientSex === "female" || patientSex === "no_answer";

  async function save(patch: QuestionnairePatch): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/questionnaires/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setBusy(false);
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "保存できませんでした");
      return false;
    }
    const body = await res.json();
    if (body.emergency?.flagged) {
      router.push(`/questionnaire/${q.id}/emergency?t=${body.emergency.kind}&from=${step}`);
      return false; // 遷移するのでこの先へ進まない
    }
    return true;
  }

  async function next(patch: QuestionnairePatch) {
    const nextStep = Math.min(step + 1, TOTAL_STEPS);
    const ok = await save({ ...patch, currentStep: nextStep });
    if (!ok) return;
    setBusy(false);
    router.push(`/questionnaire/${q.id}/step/${nextStep}`);
  }

  async function submitAll() {
    const ok = await save({ freeText, currentStep: TOTAL_STEPS });
    if (!ok) return;
    const res = await fetch(`/api/v1/questionnaires/${q.id}/submit`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("送信できませんでした。時間をおいてお試しください。");
      return;
    }
    const body = await res.json().catch(() => null);
    if (body?.emergency?.flagged) {
      // AI危険検知（⑥）が送信時にヒットした場合も S-07E へ
      router.push(`/questionnaire/${q.id}/emergency?t=${body.emergency.kind}&from=${TOTAL_STEPS}`);
      return;
    }
    router.push(`/questionnaire/${q.id}/interview`);
  }

  async function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // canvas 再エンコード：EXIF（位置情報等）除去＋圧縮（PHASE6メモ §2）
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const res = await fetch(`/api/v1/questionnaires/${q.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "アップロードできませんでした");
      } else {
        const body = await res.json();
        setImageCount(body.imageCount);
      }
    } catch {
      setError("この画像形式は読み込めませんでした。別の写真をお試しください。");
    }
    setUploading(false);
  }

  const Back = () =>
    step > 1 ? (
      <Button variant="ghost" type="button" disabled={busy}
        onClick={() => router.push(`/questionnaire/${q.id}/step/${step - 1}`)}>
        もどる
      </Button>
    ) : (
      <span />
    );

  const Footer = ({ onNext, nextLabel = "次へ", disabled = false }: {
    onNext: () => void; nextLabel?: string; disabled?: boolean;
  }) => (
    <div className="mt-2 grid gap-2">
      {error && <p className="text-l1 text-[15px]">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <Back />
        <Button type="button" disabled={busy || disabled} onClick={onNext} className="flex-1">
          {busy ? "保存しています…" : nextLabel}
        </Button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------- steps

  if (step === 1) {
    return (
      <section className="grid gap-4">
        <h1 className="text-[22px] font-bold">どのような症状がありますか？</h1>
        <div className="grid gap-2" role="radiogroup" aria-label="症状のカテゴリ">
          {CATEGORIES.map((c) => (
            <Chip key={c.key} selected={category === c.key} onClick={() => setCategory(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <label className="grid gap-1.5">
          <span className="text-[15px] font-bold">くわしく教えてください（任意）</span>
          <textarea className={textareaCls} value={complaintText}
            onChange={(e) => setComplaintText(e.target.value)}
            placeholder="例：昨日の夜から、のどが痛い" />
        </label>
        <Footer disabled={!category}
          onNext={() => next({ chiefComplaintCategory: category!, chiefComplaintText: complaintText })} />
      </section>
    );
  }

  if (step === 2) {
    return (
      <section className="grid gap-4">
        <h1 className="text-[22px] font-bold">その症状は、いつからありますか？</h1>
        <div className="grid gap-2" role="radiogroup">
          {ONSET_OPTIONS.map((o) => (
            <Chip key={o.key} selected={onset === o.key} onClick={() => setOnset(o.key)}>
              {o.label}
            </Chip>
          ))}
        </div>
        <Footer disabled={!onset} onNext={() => next({ onset: onset! as never })} />
      </section>
    );
  }

  if (step === 3) {
    return (
      <section className="grid gap-4">
        <h1 className="text-[22px] font-bold">痛みやつらさは、どのくらいですか？</h1>
        <p className="text-[15px] text-ink-sub">0＝まったくない 〜 10＝これまでで最悪</p>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 11 }, (_, v) => (
            <button key={v} type="button" role="radio"
              aria-checked={!painUnknown && pain === v}
              onClick={() => { setPain(v); setPainUnknown(false); }}
              className={`min-h-14 rounded-xl border text-[17px] font-bold ${
                !painUnknown && pain === v
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line bg-surface"
              }`}>
              <span aria-hidden>{painFace(v)}</span> {v}
            </button>
          ))}
        </div>
        <Chip selected={painUnknown} onClick={() => { setPainUnknown(true); setPain(null); }}>
          わからない・答えにくい
        </Chip>
        <Footer disabled={pain === null && !painUnknown}
          onNext={() => next({ painScale: painUnknown ? null : pain })} />
      </section>
    );
  }

  if (step === 4) {
    const tempNum = temp === "" ? null : Number(temp);
    const tempValid =
      tempNotMeasured || (tempNum !== null && tempNum >= 30 && tempNum <= 45);
    return (
      <section className="grid gap-4">
        <h1 className="text-[22px] font-bold">体温は何度ですか？</h1>
        <label className="grid gap-1.5">
          <input type="number" inputMode="decimal" step="0.1" min={30} max={45}
            className={`${inputCls} text-center text-[24px] font-bold`}
            value={temp} disabled={tempNotMeasured}
            onChange={(e) => setTemp(e.target.value)} placeholder="36.5" />
          <span className="text-center text-[14px] text-ink-sub">℃</span>
        </label>
        <Chip selected={tempNotMeasured}
          onClick={() => { setTempNotMeasured(!tempNotMeasured); setTemp(""); }}>
          測っていない
        </Chip>
        {!tempValid && temp !== "" && !tempNotMeasured && (
          <p className="text-l1 text-[15px]">30〜45の範囲で入力してください</p>
        )}
        <Footer disabled={!tempValid}
          onNext={() => next({ bodyTemp: tempNotMeasured ? null : tempNum })} />
      </section>
    );
  }

  if (step === 5) {
    const toArr = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    return (
      <section className="grid gap-4">
        <h1 className="text-[22px] font-bold">これまでの病気やお薬について</h1>
        <p className="text-[14px] text-ink-sub">前回の内容が入っています。変わりがなければそのまま進めてください。</p>
        <label className="grid gap-1.5">
          <span className="text-[15px] font-bold">これまでにかかった病気（1行に1つ）</span>
          <textarea className={textareaCls} value={history} onChange={(e) => setHistory(e.target.value)}
            placeholder="特になければ空欄のままで大丈夫です" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[15px] font-bold">いま飲んでいるお薬</span>
          <textarea className={textareaCls} value={meds} onChange={(e) => setMeds(e.target.value)}
            placeholder="例：血圧のお薬" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[15px] font-bold">アレルギー（薬・食べ物）</span>
          <textarea className={textareaCls} value={allergies} onChange={(e) => setAllergies(e.target.value)}
            placeholder="特になければ空欄のままで大丈夫です" />
        </label>
        <Footer onNext={() => next({
          historySnapshot: toArr(history),
          medicationsSnapshot: toArr(meds),
          allergiesSnapshot: toArr(allergies),
        })} />
      </section>
    );
  }

  if (step === 6) {
    const lifestyleChip = (
      label: string, value: string | undefined,
      set: (v: string) => void, options: string[]
    ) => (
      <div className="grid gap-1.5">
        <span className="text-[15px] font-bold">{label}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
          {options.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value === o}
              onClick={() => set(o)}
              className={`min-h-12 rounded-xl border px-4 text-[15px] font-medium ${
                value === o ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface"
              }`}>
              {o}
            </button>
          ))}
        </div>
      </div>
    );
    return (
      <section className="grid gap-5">
        <h1 className="text-[22px] font-bold">生活について教えてください</h1>
        {askPregnancy && (
          <div className="grid gap-2">
            <span className="text-[15px] font-bold">妊娠について</span>
            <div className="grid gap-2" role="radiogroup">
              {PREGNANCY_OPTIONS.map((o) => (
                <Chip key={o.key} selected={pregnancy === o.key} onClick={() => setPregnancy(o.key)}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {lifestyleChip("たばこ", smoking, setSmoking, ["吸わない", "吸う", "以前吸っていた"])}
        {lifestyleChip("お酒", alcohol, setAlcohol, ["飲まない", "ときどき", "ほぼ毎日"])}
        {lifestyleChip("睡眠", sleep, setSleep, ["足りている", "やや不足", "足りていない"])}
        <Footer disabled={askPregnancy && !pregnancy}
          onNext={() => next({
            pregnancyStatus: (askPregnancy ? pregnancy! : "not_applicable") as never,
            lifestyle: { smoking, alcohol, sleep },
          })} />
      </section>
    );
  }

  // step 7
  return (
    <section className="grid gap-4">
      <h1 className="text-[22px] font-bold">最後に、写真や伝えたいことがあれば</h1>
      <div className="grid gap-2">
        <span className="text-[15px] font-bold">
          症状の写真（任意・5枚まで）
          {q.templateType === "dermatology" && " ※皮膚の症状は写真があると医師に伝わりやすくなります"}
        </span>
        <label className={`grid min-h-14 cursor-pointer place-items-center rounded-xl border-2 border-dashed ${
          uploading ? "border-l4 bg-l4-soft" : "border-primary/40 bg-primary-soft"
        }`}>
          <span className="text-[15px] font-bold text-primary">
            {uploading ? "アップロード中…" : `＋ 写真を追加（${imageCount}/5）`}
          </span>
          <input type="file" accept="image/*" className="hidden"
            disabled={uploading || imageCount >= 5} onChange={onSelectImage} />
        </label>
        <p className="text-[13px] text-ink-sub">
          写真の位置情報（撮影場所）は自動的に取り除かれます。
        </p>
      </div>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">医師に伝えたいこと（任意）</span>
        <textarea className={textareaCls} value={freeText} onChange={(e) => setFreeText(e.target.value)}
          placeholder="心配なこと、聞きたいことなど、なんでもどうぞ" />
      </label>
      <div className="rounded-xl bg-primary-soft p-4 text-[14px] text-ink-sub">
        送信後、内容にあわせて短い追加の質問をさせていただくことがあります。
      </div>
      <Footer nextLabel="この内容で送信する" onNext={submitAll} />
    </section>
  );
}
