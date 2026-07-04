import { TemplateChoice } from "./TemplateChoice";

export default function NewQuestionnairePage() {
  return (
    <main className="grid gap-4">
      <h1 className="text-[22px] font-bold">問診をはじめる</h1>
      <p className="text-ink-sub text-[15px]">
        どのようなご相談ですか？あてはまる方を選んでください。
      </p>
      <TemplateChoice />
      <p className="text-[13px] text-ink-sub">
        所要時間は5〜7分ほどです。途中で閉じても、続きから再開できます。
      </p>
    </main>
  );
}
