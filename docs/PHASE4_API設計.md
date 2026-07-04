# Phase 4：API設計書
# オンライン診療支援・問診サポートシステム（仮称：MediBridge）

- 版数：v0.1（ドラフト）
- 作成日：2026-07-02
- 前提：Next.js App Router（Route Handlers）＋ Supabase Auth ＋ Prisma。AIプロンプトの本文は `AI_PROMPTS.md` v1 を正とする

---

## 1. 共通仕様

### 1.1 ベース
- パス：`/api/v1/...`（将来のBreaking Change用にバージョン付与）
- 認証：Supabase Auth のセッション（Cookie）。Route Handler 冒頭で `getSession()` → `users` 行を取得し `{ userId, role, clinicId, patientId? , doctorId? }` の **AuthContext** を構築
- 認可：後述の認可マトリクス（§3）を `requireRole()` / `requireTenant()` ミドルウェアで強制。**全DBアクセスは AuthContext を受け取るリポジトリ層経由**（Phase 3 §5 tenant guard）
- バリデーション：全リクエストボディを zod でパース（`safeParse` 失敗→400）

### 1.2 エラー形式（統一）
```json
{ "error": { "code": "QUESTIONNAIRE_NOT_FOUND", "message": "問診が見つかりません" } }
```
| HTTP | code例 | 備考 |
|---|---|---|
| 400 | VALIDATION_ERROR | zod詳細は `error.details` |
| 401 | UNAUTHENTICATED | |
| 403 | FORBIDDEN / MFA_REQUIRED | テナント不一致も404でなく403にせず**404を返す**（存在推測防止、下記） |
| 404 | NOT_FOUND | 他テナントのリソースIDを踏んだ場合も404 |
| 409 | SLOT_ALREADY_BOOKED / INVALID_STATUS_TRANSITION | |
| 422 | AI_OUTPUT_INVALID | 内部でリトライ後も不合格（クライアントにはフォールバック結果を返すため通常露出しない） |
| 429 | RATE_LIMITED | |
| 503 | AI_UNAVAILABLE | フォールバック不能時のみ |

### 1.3 監査ログ
医療情報に触れる全ハンドラは終了時に `audit_logs` へ記録（ミドルウェアで共通化）。特に `questionnaire.view`（医師の閲覧）、`pdf.export`、`soap.confirm` は必須。

### 1.4 レート制限
- 患者API：60 req/min/user。AI呼び出しを伴うもの（interview系）：12 req/min/user
- 未認証（登録・ログイン）：IPベース 10 req/min

### 1.5 冪等性
- `POST /questionnaires/:id/submit` と `/finalize` は状態遷移ガード（現statusが期待値でなければ409）＋同一リクエスト再送は現在の結果を200で返す（安全な再試行）

---

## 2. エンドポイント一覧

### 2.1 認証・アカウント
| メソッド/パス | 説明 | ロール |
|---|---|---|
| POST `/api/v1/auth/register` | 患者登録（Supabase signUp＋patients作成、clinic slugから紐付け） | 公開 |
| POST `/api/v1/consents` | 同意の記録（項目別・バージョン付き） | patient |
| GET `/api/v1/me` | AuthContext相当＋マイページ集約（次回予約・問診履歴件数） | 全ロール |
| POST `/api/v1/account/deletion-requests` | 削除申請 | patient |

※ログイン・MFA・パスワードリセットは Supabase Auth のクライアントSDKを直接使用（自前APIを作らない）。医師/管理者ロールは **MFA未登録ならAPI全体を403 MFA_REQUIRED**（ミドルウェア）。

### 2.2 問診（患者）
| メソッド/パス | 説明 |
|---|---|
| POST `/api/v1/questionnaires` | draft作成（template_type指定）。既存draftがあればそれを返す |
| GET `/api/v1/questionnaires/:id` | 自分の問診取得（再開用） |
| PATCH `/api/v1/questionnaires/:id` | ステップ回答の保存（部分更新、draft/ai_interview中のみ）。**保存時に毎回ルールベース危険判定を同期実行**し、ヒット時はレスポンスに `emergency: {...}` を含める（→S-07Eへ） |
| POST `/api/v1/questionnaires/:id/submit` | 基本7ステップ完了 → status=ai_interview。AI①初回解析＋⑥危険検知を実行 |
| POST `/api/v1/questionnaires/:id/interview/next` | AI②で次の追加質問を取得。`{done:true}` なら質問フェーズ終了 |
| POST `/api/v1/questionnaires/:id/interview/answers` | 追加質問への回答保存（＋ルール危険判定） |
| POST `/api/v1/questionnaires/:id/finalize` | AI③緊急度＋④SOAP＋⑤科目提案を実行 → status=triaged |
| GET `/api/v1/questionnaires/:id/result` | 患者向け結果（final_level・患者向け文言・科目候補のみ。**AI根拠やSOAPは返さない**） |
| POST `/api/v1/uploads/sign` | 画像アップロード用署名URL発行（mime/サイズ検査、パスは`{clinic}/{questionnaire}/`固定） |
| POST `/api/v1/questionnaires/:id/images` | アップロード完了登録（EXIF除去はサーバー側処理で実施後に確定） |

### 2.3 予約（患者）
| メソッド/パス | 説明 |
|---|---|
| GET `/api/v1/slots?from=&to=&doctorId=` | 空き枠一覧（L2問診に紐づく場合は本日枠を先頭に） |
| POST `/api/v1/appointments` | 予約作成（slot_id＋questionnaire_id任意）。部分UNIQUE違反→409。成功時に確認メール送信をキュー |
| POST `/api/v1/appointments/:id/cancel` | キャンセル（前日まで。当日は409＋電話案内文言） |
| GET `/api/v1/appointments/:id/video` | 開始15分前〜終了までビデオURL返却（それ以外403） |

### 2.4 医師
| メソッド/パス | 説明 |
|---|---|
| GET `/api/v1/doctor/questionnaires?level=&unconfirmed=&date=` | ダッシュボード一覧（L1/L2は常に先頭。ページネーション：cursor） |
| GET `/api/v1/doctor/questionnaires/:id` | 問診詳細（SOAP・原文・AI質問ログ・画像署名URL・triage根拠） |
| PATCH `/api/v1/doctor/summaries/:id` | SOAP編集（編集前値をrevisionsへ） |
| POST `/api/v1/doctor/summaries/:id/confirm` | 医師確認（status=confirmed、問診status=doctor_reviewed） |
| POST `/api/v1/doctor/notes` | 診療メモ/処方メモ/患者向けコメント作成（編集は新規行＋revision_of） |
| GET `/api/v1/doctor/questionnaires/:id/pdf` | 問診レポートPDF（生成はサーバー側、audit必須） |
| POST `/api/v1/doctor/appointments/:id/video-room` | Daily.coルーム作成（診療開始時） |
| POST `/api/v1/doctor/appointments/:id/complete` | 診療完了（問診status=consulted） |

### 2.5 クリニック管理者
| メソッド/パス | 説明 |
|---|---|
| GET/POST/PATCH `/api/v1/admin/slots` | 診療枠CRUD（一括生成：曜日×時間帯パターン） |
| GET/POST/PATCH `/api/v1/admin/doctors` | 医師アカウント管理（招待メール方式） |
| PATCH `/api/v1/admin/clinic` | クリニック設定（テンプレート有効化・保持期間） |
| GET `/api/v1/admin/audit-logs?patientId=&from=` | 監査ログ閲覧（自clinicのみ） |

### 2.6 システム管理者（最小限）
| GET/POST `/api/v1/sysadmin/clinics` | テナント作成・停止 |
| GET `/api/v1/sysadmin/deletion-requests` | 削除申請の処理キュー |

### 2.7 Webhook / 内部
| POST `/api/v1/webhooks/resend` | メール配信結果 → notifications.status更新 |
| POST `/api/v1/internal/jobs/reminders` | リマインド送信バッチ（Vercel Cron、`CRON_SECRET`検証） |

---

## 3. 認可マトリクス（抜粋）

| リソース/操作 | patient | doctor | clinic_admin | super_admin |
|---|---|---|---|---|
| 問診 作成/回答 | 本人のみ | ✗ | ✗ | ✗ |
| 問診 閲覧 | 本人（患者向けビューのみ） | 自clinic全件（医師ビュー） | 自clinic全件 | 全件 |
| SOAP 閲覧/編集/確認 | ✗（確認済みでも直接は見せない） | 自clinic ○ | 閲覧のみ | 全件 |
| triage根拠・ai_logs | ✗ | 自clinic 閲覧 | 自clinic 閲覧 | 全件 |
| 診療メモ/処方メモ | patient_commentのみ閲覧 | 自分の担当分 作成/改訂 | 閲覧のみ | 全件 |
| 予約 | 本人分 CRUD | 自分の担当分 閲覧/完了 | 自clinic全件 | 全件 |
| 枠管理/医師管理/設定 | ✗ | ✗ | 自clinic | 全件 |
| 監査ログ | ✗ | ✗ | 自clinic 閲覧 | 全件 |
| テナント管理 | ✗ | ✗ | ✗ | ○ |

---

## 4. AIパイプライン設計

### 4.1 全体フロー
```
[submit]
  ├─ (同期) ルール危険判定 ……… 常時・全回答保存時にも実行（<10ms、DBのtriage_rules）
  ├─ AI⑥ danger_check ─┐ どちらかヒット → emergency_flagged=true, 即時通知, S-07E
  └─ AI① initial_analysis → interview_plan 保存
[interview loop]  (最大8問)
  └─ AI② question_gen(文脈+残り枠) → 患者回答 → ルール危険判定 → (3問ごと) AI⑥
[finalize]
  ├─ AI③ triage ──→ final_level = max(ai_level, rule_level)   ※maxは重症側
  ├─ AI④ soap
  └─ AI⑤ department
  → status = triaged、L1/L2はクリニック通知
```

### 4.2 プロバイダ戦略
| 用途 | 第一候補 | フォールバック | 理由 |
|---|---|---|---|
| ①④（解析・SOAP：品質重視） | Anthropic claude-sonnet-5 | OpenAI gpt-5.1 | 長文整理・指示追従 |
| ②⑤（質問生成・科目：速度重視） | Anthropic claude-haiku-4-5 | OpenAI gpt-5-mini | 8秒以内の応答要件 |
| ③⑥（緊急度・危険検知：安全重視） | claude-sonnet-5 **temperature=0** | gpt-5.1 | ぶれ最小化。さらにルール並走 |

- 実装は `AiGateway` インターフェースで抽象化（provider/model/prompt_versionはenvと`clinics.settings`で差替え可能）
- 全呼び出しを `ai_logs` に記録（request/response/latency/tokens/validation結果）
- タイムアウト：8秒（②）／20秒（①③④⑤⑥はバックグラウンド寄りのため緩め）

### 4.3 入力コンテキストの構築（PII最小化）
AIへ渡すのは以下のみ（**ビルダー関数 `buildAiContext()` が唯一の組立点。氏名・カナ・連絡先・生年月日は構造上含められない型定義にする**）：
```ts
type AiPatientContext = {
  age: number;              // birth_dateから算出（生年月日そのものは渡さない）
  sex: 'male'|'female'|'other'|'no_answer';
  pregnancyStatus?: string;
  questionnaire: {...};     // スナップショット済み回答一式
  qa: Array<{q: string; a: string}>; // AI追加質問の履歴
}
```

### 4.4 出力契約（zodで強制）
各purposeの出力はJSONのみ。`AI_PROMPTS.md` §各節のスキーマと1:1対応の zod schema でパースする。

### 4.5 出力バリデーション（SAFE-1 二重ガード）
1. **構造検査**：zod parse（失敗→同一プロンプトで1回リトライ→失敗でフォールバック）
2. **禁止表現検査**（患者向けに露出しうるフィールドのみ：質問文・患者向け文言）：
   - 禁止パターン（正規表現リスト、`banned_phrases.ts`でバージョン管理）：
     `/(です|でしょう)。?$/ と組み合わさる疾患名断定/、/大丈夫/、/心配(いり|あり)ません/、/問題ありません/、/〜と診断/、/(飲んで|服用して)ください/、/市販薬/` など
   - 検知時：`ai_logs.status='blocked'` → リトライ1回 → 失敗でフォールバック
3. **整合検査**（③のみ）：ai_level が rule_level より2段階以上軽い場合は `ai_reasons` を要再確認としてフラグ（医師画面に表示）

### 4.6 フォールバック（AI障害時のグレースフルデグラデーション：SAFE-7）
| 機能 | フォールバック |
|---|---|
| ① 初回解析 | スキップ（interview_planなし→②は定型プランで動く） |
| ② 追加質問 | テンプレート別の**定型追加質問セット**（`fallback_questions.ts`、source='fallback'） |
| ③ 緊急度 | `final_level = rule_level`（ai_level=NULL）。医師画面に「AI判定なし・ルールのみ」表示 |
| ④ SOAP | S/Oのみ機械生成（回答の構造化転記）、A/Pは「AI要約なし。原文をご確認ください」 |
| ⑤ 科目 | 主訴カテゴリ→科目の静的マッピング |
| ⑥ 危険検知 | ルールベースは常時稼働しているため機能低下なし（AI⑥は上乗せ） |

### 4.7 プロンプト管理
- プロンプトはコード内定数ではなく `src/ai/prompts/{purpose}/v{n}.ts` で**バージョン番号付き管理**。ai_logs.prompt_version に記録
- 変更時はPhase 13のトリアージ回帰テストセット（危険シナリオ集）を必ず通す

---

## 5. 主要リクエスト/レスポンス定義(抜粋)

### POST /questionnaires/:id/interview/next → 200
```json
{
  "done": false,
  "question": {
    "id": "uuid", "seq": 3,
    "text": "息苦しさはありますか？",
    "type": "single_choice",
    "options": ["はい", "いいえ", "わからない"],
    "source": "ai"
  }
}
```

### PATCH /questionnaires/:id（危険検知時）→ 200
```json
{
  "saved": true,
  "emergency": {
    "flagged": true,
    "screen": "S-07E",
    "actions": [{"label": "119に電話する", "tel": "119"}, {"label": "#7119（救急相談）", "tel": "#7119"}]
  }
}
```

### GET /questionnaires/:id/result → 200（患者向け・情報最小）
```json
{
  "level": "L2",
  "headline": "本日中の受診をおすすめします",
  "body": "ご入力内容から、早めに医師に相談されることをおすすめします。",
  "departments": ["内科"],
  "disclaimer": "この表示は受診の目安であり、診断ではありません。最終的な判断は医師が行います。",
  "cta": { "type": "book_today", "url": "/appointments/new?questionnaire=..." }
}
```

### GET /doctor/questionnaires/:id → 200（医師向け・全量）
```json
{
  "patient": { "name": "佐藤花子", "age": 34, "sex": "female" },
  "questionnaire": { "...": "回答一式" },
  "triage": { "finalLevel": "L1", "aiLevel": "L1", "ruleLevel": "L2",
              "aiReasons": [...], "ruleHits": [...], "aiRuleGap": false },
  "soap": { "s": "...", "o": "...", "a": "...", "p": "...",
            "sourceRefs": [...], "status": "unconfirmed" },
  "aiQuestions": [...], "images": [{ "signedUrl": "...(60s)" }],
  "notes": [...]
}
```

---

## 6. 自己レビュー（Phase 4時点の問題点と対応）

| 指摘 | 対応 |
|---|---|
| 危険検知をAIだけに任せると応答遅延中（数秒）に患者が離脱しうる | ルール判定は**回答保存APIの同期処理**（<10ms）とし、AI⑥は上乗せの非同期。保存レスポンスに emergency を同梱し即時に S-07E へ遷移 |
| 患者向け result API にSOAPやAI根拠を含めると診断提示に見える（薬機法） | 患者向けと医師向けでエンドポイントを分離し、患者向けは文言・科目候補のみ（§5） |
| 他テナントのリソースIDを叩くと403だと「存在すること」が漏れる | テナント不一致は一律404で返す |
| interview/next を連打するとAI呼び出しが多重実行される | 質問生成はDBの未回答行があればそれを返す（生成は未回答ゼロのときだけ）＋レート制限12/min |
| finalize が二重実行されるとtriage_resultsが重複する | 状態遷移ガード（ai_interview→triagedのみ許可）＋再送は既存結果を返す冪等設計 |
| ai_level が rule_level より大幅に軽いケースは AI の見落とし兆候 | 整合検査（§4.5-3）で医師画面に警告表示。final は常に重症側なので患者影響なし |
| 画像アップロードのEXIF（位置情報）が残ると漏えいリスク | サーバー側でEXIF除去処理後に images 登録を確定（exif_stripped=false の行は医師画面に出さない） |
| ビデオURLをいつでも取得できると第三者共有・誤入室のリスク | 開始15分前〜終了時刻のみ返却（Phase 2の仕様をAPI側でも強制）。Daily.coルームは exp 付きトークン |
| Cronエンドポイントが公開URLになる | CRON_SECRET ヘッダ検証＋Vercel Cron以外拒否 |

---

## 7. 未決事項
1. gpt系フォールバックモデルの最終選定（コスト実測後）
2. 医師向け一覧のリアルタイム更新（Supabase Realtime か ポーリング30秒か）→ MVPはポーリング
3. PDF生成ライブラリ（Phase 11 で `@react-pdf/renderer` を第一候補として評価）

---

## 8. 次フェーズ
**Phase 5：認証機能の実装** — Next.jsプロジェクト初期化、Supabase Auth連携（患者登録・ログイン・医療従事者MFA）、AuthContext/tenant guardミドルウェア、ロール別レイアウト。**ここからコードを書く。**
