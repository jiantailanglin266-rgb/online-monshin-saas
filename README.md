# MediBridge（仮称）— オンライン診療支援・問診サポートSaaS

患者がスマホから症状を入力すると、AIが追加質問で情報を補い、医師向けの問診レポート（SOAP形式）と受診の目安（緊急度4分類）を生成するマルチテナントSaaS。

**🌐 公開デモ（GitHub Pages）**：https://jiantailanglin266-rgb.github.io/online-monshin-saas/
（ブラウザ内デモエンジンで動作。データは端末のlocalStorageのみに保存され、外部送信されません）

デモの更新：`bash scripts/build-static.sh` → `out/` を gh-pages ブランチへ force push。

> **本システムは医師の診断を代替しません。**
> AIは診断名を断定せず、問診整理・緊急度の目安・医師向け要約・受診科目の候補提示のみを行います。最終判断は常に医師が行います。

## 開発状況

Phase制で開発中（全14フェーズ）。現在 **Phase 8 まで完了**。

| Phase | 内容 | 状態 |
|---|---|---|
| 1〜4 | 要件定義・画面設計・DB設計・API設計・AIプロンプト | ✅ docs/ 参照 |
| 5 | 認証（Supabase Auth + デモモード、医療従事者MFA） | ✅ |
| 6 | 問診フォーム（7ステップ・途中再開・ルール危険判定・S-07E緊急画面） | ✅ |
| 7 | AI追加質問（AiGateway・S-06チャット・危険検知） | ✅ |
| 8 | 緊急度判定（final=max(AI,ルール)）・SOAP・科目提案・S-07結果画面 | ✅ |
| 9〜14 | 医師ダッシュボード・予約・PDF・セキュリティ強化・テスト・デプロイ | 未着手 |

## クイックスタート（デモモード）

環境変数なしで全機能が動作します（インメモリのデモデータ・モックAI）。

```bash
npm install
npx prisma generate
npm run dev   # http://localhost:3120
```

ログイン画面からロール（患者/医師/クリニック管理者）を選ぶだけで体験できます。

## 本番構成

`.env.example` を参照。Supabase（Auth/Postgres/Storage）、Anthropic/OpenAI API、
Daily.co（ビデオ）、Resend（メール）を設定すると本番系の実装に自動で切り替わります。

## 技術スタック

Next.js 15 (App Router) / TypeScript / Tailwind CSS v4 / Prisma / Supabase / zod

## ドキュメント

- [docs/PHASE1_要件定義.md](docs/PHASE1_要件定義.md) — 法務・医療安全・リスク分析・MVP範囲
- [docs/PHASE2_画面設計.md](docs/PHASE2_画面設計.md) — 画面遷移・ワイヤー・UI文言ガイドライン
- [docs/PHASE3_DB設計.md](docs/PHASE3_DB設計.md) — 全19テーブル・RLS方針
- [docs/PHASE4_API設計.md](docs/PHASE4_API設計.md) — エンドポイント・認可・AIパイプライン
- [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md) — AIプロンプト一覧 v1（6種）
- docs/PHASE5〜8_実装メモ — 各フェーズの設計判断・自己レビュー・受け入れ確認
