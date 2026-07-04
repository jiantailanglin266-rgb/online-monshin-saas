# Phase 3：DB設計書
# オンライン診療支援・問診サポートシステム（仮称：MediBridge）

- 版数：v0.1（ドラフト）
- 作成日：2026-07-02
- 前提：Supabase（PostgreSQL 15, ap-northeast-1）＋ Prisma。認証は Supabase Auth（auth.users）

---

## 1. 設計方針

1. **マルチテナント**：`clinics` をテナント境界とし、医療情報を持つ全テーブルに `clinic_id` を持たせる（JOIN経由でなく直接カラムで持ち、RLSを単純化する）
2. **スナップショット主義**：問診レポートは医療記録に準ずるため、既往歴・服薬等は `patients` のマスタ値を**問診時点のコピー（JSONB）**として `medical_questionnaires` に保存する。後からプロフィールを変えても過去の問診は変わらない
3. **追記専用（append-only）**：`audit_logs` / `ai_logs` / `triage_results` は UPDATE/DELETE を禁止（権限剥奪＋トリガー）。訂正は新規行の追加で表現
4. **AI出力と医師確定の分離**：AI生成物（SOAP・緊急度）は専用テーブルに保存し、医師の確認・編集は別レコード／ステータスで管理。「どれがAI原文で、医師が何を直したか」を常に再現できる
5. **二層防御**：Prisma（サーバー側）は service role で RLS をバイパスするため、①アプリ層の tenant guard（全クエリに clinic_id 強制）②Supabase クライアント直アクセス（Storage・Realtime）には RLS、の二層で守る
6. **個人識別情報の分離**：氏名・連絡先は `patients` に集約し、AI連携時は参照しない（Phase 1 §4 送信最小化）

---

## 2. ER図（概要）

```
clinics ──┬─< users（role: doctor/clinic_admin は clinic_id 必須）
          │      └─ 1:1 ─ patients（role: patient）
          │      └─ 1:1 ─ doctors
          ├─< appointment_slots >── doctors
          ├─< appointments ──── patients / doctors / medical_questionnaires(0..1)
          ├─< medical_questionnaires ──┬─< ai_questions
          │        （patient_id）      ├─< uploaded_images
          │                           ├─< triage_results（append-only, 最新が有効）
          │                           ├─ 1:0..1 ─ ai_summaries（SOAP）
          │                           ├─< doctor_notes
          │                           └─< ai_logs
          ├─< audit_logs（全操作横断）
          └─< notifications >── users
consents >── users（テナント横断・ユーザー単位）
deletion_requests >── users
triage_rules（グローバルマスタ：危険症状ルール）
```

---

## 3. テーブル定義

凡例：`PK`=主キー(uuid, default gen_random_uuid())、`FK`=外部キー、共通カラム `created_at timestamptz default now()` / `updated_at timestamptz`（追記専用テーブルは created_at のみ）。

### 3.1 clinics（テナント）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| name | text | NOT NULL | クリニック名 |
| slug | text | UNIQUE NOT NULL | サブドメイン/URL識別子 |
| departments | text[] | NOT NULL default '{}' | 標榜科（internal, dermatology, ...） |
| settings | jsonb | default '{}' | テンプレート有効化・保持期間等 |
| status | text | CHECK (active/suspended) | |

### 3.2 users（全ロール共通プロフィール）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, FK→auth.users(id) | Supabase Auth と 1:1 |
| role | text | CHECK (patient/doctor/clinic_admin/super_admin) NOT NULL | |
| clinic_id | uuid | FK→clinics, **patient以外はNOT NULLをアプリ層で強制** | patientも所属クリニックを持つ（登録導線のテナント） |
| email | text | NOT NULL | auth と同期 |
| mfa_enrolled | boolean | default false | doctor/clinic_admin/super_admin は true 必須（アプリ層強制） |
| last_login_at | timestamptz | | |

### 3.3 patients（患者詳細・PII集約）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK→users UNIQUE NOT NULL | |
| clinic_id | uuid | FK→clinics NOT NULL | |
| name / name_kana | text | NOT NULL | |
| birth_date | date | NOT NULL | |
| sex | text | CHECK (male/female/other/no_answer) | 妊娠質問の表示制御に使用 |
| phone | text | | SMS用（Post-MVP） |
| baseline_history | jsonb | default '[]' | 既往歴マスタ（次回問診の初期値） |
| baseline_medications | jsonb | default '[]' | 服薬マスタ |
| baseline_allergies | jsonb | default '[]' | アレルギーマスタ |
| anonymized_at | timestamptz | | 削除申請処理後にセット（§7） |

### 3.4 doctors
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK→users UNIQUE NOT NULL | |
| clinic_id | uuid | FK→clinics NOT NULL | |
| name | text | NOT NULL | 表示名（Dr.〇〇） |
| specialties | text[] | NOT NULL | 担当科 |
| photo_path | text | | Storage参照 |
| license_registered | boolean | default false | 医籍確認済みフラグ（運用で確認） |
| active | boolean | default true | |

### 3.5 medical_questionnaires（問診本体）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| clinic_id | uuid | FK NOT NULL | |
| patient_id | uuid | FK→patients NOT NULL | |
| template_type | text | CHECK (internal/dermatology) | MVPは2種 |
| status | text | CHECK (draft/ai_interview/triaged/doctor_reviewed/consulted/abandoned) NOT NULL default 'draft' | §Phase2 3.3 の状態遷移 |
| emergency_flagged | boolean | default false | L1検知（statusと直交） |
| chief_complaint_category | text | | 主訴カテゴリ |
| chief_complaint_text | text | | 主訴自由入力 |
| onset | text | CHECK (today/few_days/one_week/over_month/unknown) | |
| pain_scale | smallint | CHECK (0..10) NULL可 | NRS |
| body_temp | numeric(3,1) | CHECK (30.0..45.0) NULL可 | NULL=未計測 |
| history_snapshot | jsonb | default '[]' | 問診時点の既往歴（方針2） |
| medications_snapshot | jsonb | default '[]' | |
| allergies_snapshot | jsonb | default '[]' | |
| pregnancy_status | text | CHECK (pregnant/possible/no/not_applicable/no_answer) | |
| lifestyle | jsonb | default '{}' | {smoking, alcohol, sleep} |
| free_text | text | | 伝えたいこと |
| current_step | smallint | default 1 | 途中再開用 |
| submitted_at | timestamptz | | 患者送信完了時刻 |
| suggested_departments | text[] | | 科目候補（最大2、AI出力を医師確認前でも保存） |
| proxy_input | jsonb | | 代理入力者情報（Post-MVP、カラムだけ先行定義） |

### 3.6 ai_questions（AI追加質問と回答）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| questionnaire_id | uuid | FK NOT NULL | |
| clinic_id | uuid | FK NOT NULL | RLS用に非正規化 |
| seq | smallint | NOT NULL | 表示順（UNIQUE(questionnaire_id, seq)） |
| question_text | text | NOT NULL | |
| question_type | text | CHECK (single_choice/multi_choice/free_text) | |
| options | jsonb | | 選択肢 |
| answer | jsonb | | 回答（選択値 or テキスト） |
| answered_at | timestamptz | | NULL=未回答（スキップ含む） |
| source | text | CHECK (ai/fallback) NOT NULL | AI障害時の定型質問を区別 |
| ai_log_id | uuid | FK→ai_logs | 生成元ログへの参照 |

### 3.7 triage_results（緊急度判定・追記専用）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| questionnaire_id | uuid | FK NOT NULL | |
| clinic_id | uuid | FK NOT NULL | |
| final_level | text | CHECK (L1/L2/L3/L4) NOT NULL | **max(ai_level, rule_level)＝保守側** |
| ai_level | text | CHECK (L1..L4) NULL可 | AI判定（障害時NULL） |
| rule_level | text | CHECK (L1..L4) NOT NULL | ルールベース判定（常に動く） |
| ai_reasons | jsonb | | AIの根拠（どの回答が効いたか） |
| rule_hits | jsonb | | ヒットしたルールID一覧 |
| ai_log_id | uuid | FK→ai_logs | |
| prompt_version | text | | |
| superseded_by | uuid | FK→triage_results | 再判定時に旧行へセット（最新行が有効） |

### 3.8 ai_summaries（SOAP要約）＋ ai_summary_revisions
**ai_summaries**
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| questionnaire_id | uuid | FK UNIQUE NOT NULL | 1問診に1要約（改訂はrevisionsへ） |
| clinic_id | uuid | FK NOT NULL | |
| s_text / o_text / a_text / p_text | text | NOT NULL | 現在の表示内容（医師編集後を反映） |
| source_refs | jsonb | | SOAP各文→元回答（step or ai_question id）の参照マップ（原文対照ハイライト用） |
| status | text | CHECK (unconfirmed/confirmed) default 'unconfirmed' | AiBadge制御 |
| confirmed_by | uuid | FK→doctors | |
| confirmed_at | timestamptz | | |
| ai_log_id | uuid | FK→ai_logs | AI原文はai_logsに不変保存 |

**ai_summary_revisions**（追記専用：編集履歴）
| id PK | summary_id FK | editor_doctor_id FK | s_text/o_text/a_text/p_text（編集前の値） | created_at |

### 3.9 doctor_notes（診療メモ・処方メモ・患者向けコメント）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| questionnaire_id | uuid | FK NOT NULL | |
| clinic_id | uuid | FK NOT NULL | |
| doctor_id | uuid | FK→doctors NOT NULL | |
| note_type | text | CHECK (clinical/prescription/patient_comment) NOT NULL | prescription はAI非関与のフリーテキスト |
| body | text | NOT NULL | |
| visible_to_patient | boolean | default false | patient_comment のみ true 可（CHECK制約） |
| revision_of | uuid | FK→doctor_notes | 編集は新規行＋旧行参照（履歴保持） |

### 3.10 uploaded_images
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| questionnaire_id | uuid | FK NOT NULL | |
| clinic_id | uuid | FK NOT NULL | |
| storage_path | text | NOT NULL | private bucket `medical-images/{clinic_id}/{questionnaire_id}/...` |
| mime_type | text | CHECK (image/jpeg, image/png, image/webp, image/heic) | |
| byte_size | integer | CHECK (≤ 10MB) | |
| exif_stripped | boolean | NOT NULL default false | アップロード処理で必ずtrueにする |

### 3.11 appointment_slots / appointments
**appointment_slots**
| id PK | clinic_id FK | doctor_id FK | start_at / end_at timestamptz | status CHECK(open/closed) | UNIQUE(doctor_id, start_at) |

**appointments**
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| clinic_id / patient_id / doctor_id | uuid | FK NOT NULL | |
| slot_id | uuid | FK→appointment_slots UNIQUE NOT NULL | 1枠1予約（ダブルブッキングをDB制約で防止） |
| questionnaire_id | uuid | FK NULL可 | 問診なし予約も許容 |
| status | text | CHECK (booked/canceled/completed/no_show) default 'booked' | |
| video_room_url | text | | Daily.co ルームURL |
| video_room_name | text | | API側ID |
| canceled_at / canceled_by | timestamptz / uuid | | |

※「1枠1予約」の UNIQUE は status='canceled' を除外する必要があるため、実装は部分UNIQUEインデックス：`CREATE UNIQUE INDEX ON appointments(slot_id) WHERE status <> 'canceled'`

### 3.12 ai_logs（AI入出力の完全ログ・追記専用）SAFE-4
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| clinic_id | uuid | FK NOT NULL | |
| questionnaire_id | uuid | FK NULL可 | |
| purpose | text | CHECK (initial_analysis/question_gen/triage/soap/department/danger_check) | 6プロンプトに対応 |
| provider | text | CHECK (openai/anthropic) | |
| model | text | NOT NULL | 例: claude-sonnet-5 |
| prompt_version | text | NOT NULL | プロンプト管理（Phase 4で定義） |
| request_payload | jsonb | NOT NULL | **氏名・連絡先を含めないことをビルダー層で保証** |
| response_payload | jsonb | | |
| output_validation | jsonb | | 禁止パターン検知の結果（SAFE-1後段ガード） |
| status | text | CHECK (ok/error/timeout/blocked) | blocked=出力バリデーション不合格 |
| latency_ms | integer | | |
| tokens_in / tokens_out | integer | | |

### 3.13 audit_logs（監査ログ・追記専用）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | bigint | PK (identity) | 時系列大量書込のためbigint |
| actor_user_id | uuid | NULL可（system操作はNULL） | |
| actor_role | text | | |
| clinic_id | uuid | | |
| action | text | NOT NULL | 例: questionnaire.view / soap.confirm / pdf.export / login.mfa_fail |
| resource_type / resource_id | text / uuid | | |
| patient_id | uuid | | 「誰の医療情報か」を直接検索可能に |
| ip / user_agent | inet / text | | |
| metadata | jsonb | | |

### 3.14 notifications
| id PK | user_id FK | clinic_id FK | type CHECK(appointment_confirmed/appointment_reminder/emergency_alert/doctor_comment) | channel CHECK(email/sms/inapp) | title/body text | status CHECK(queued/sent/failed/read) | sent_at / read_at |

### 3.15 consents（同意ログ）
| id PK | user_id FK | consent_type CHECK(terms/sensitive_data/ai_processing_offshore) | version text | granted boolean | created_at |
※撤回も新規行（granted=false）。項目別チェック（Phase 2 S-04）に対応。

### 3.16 deletion_requests（削除申請）
| id PK | user_id FK | status CHECK(requested/reviewing/completed/rejected) | reason text | requested_at | processed_at | processed_by |

### 3.17 triage_rules（危険症状ルールマスタ・グローバル）
| id PK | rule_key text UNIQUE | description | target CHECK(keyword/vital/answer) | pattern jsonb（例: {"field":"body_temp","op":">=","value":41.0} / {"keywords":["胸が痛い","呼吸が苦しい"]}） | level CHECK(L1/L2) | active boolean | version |

---

## 4. インデックス設計（主要）

```sql
-- 医師ダッシュボード（本日×緊急度×未確認）
CREATE INDEX idx_mq_clinic_status ON medical_questionnaires (clinic_id, status, submitted_at DESC);
CREATE INDEX idx_mq_emergency ON medical_questionnaires (clinic_id, submitted_at DESC) WHERE emergency_flagged;
CREATE INDEX idx_appt_clinic_date ON appointments (clinic_id, status);
CREATE INDEX idx_slots_lookup ON appointment_slots (clinic_id, doctor_id, start_at) WHERE status = 'open';
-- 監査・履歴
CREATE INDEX idx_audit_patient ON audit_logs (patient_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_ailogs_q ON ai_logs (questionnaire_id, created_at);
-- 患者マイページ
CREATE INDEX idx_mq_patient ON medical_questionnaires (patient_id, created_at DESC);
```

---

## 5. RLS（Row Level Security）方針

前提：Next.js サーバー（Prisma, service role）が主経路。RLSは **患者・医師がSupabaseクライアントで直接触る経路（Storage・Realtime・将来のクライアント直クエリ）** の防波堤 ＋ 実装バグ時の最終防衛線。

ヘルパー（JWT カスタムクレームに `role` と `clinic_id` を格納）：
```sql
CREATE FUNCTION auth_clinic_id() RETURNS uuid AS $$
  SELECT (auth.jwt()->>'clinic_id')::uuid $$ LANGUAGE sql STABLE;
CREATE FUNCTION auth_role() RETURNS text AS $$
  SELECT auth.jwt()->>'role' $$ LANGUAGE sql STABLE;
```

| テーブル | patient | doctor / clinic_admin | super_admin |
|---|---|---|---|
| patients | 自分の行のみ SELECT/UPDATE（user_id = auth.uid()） | 同一clinic SELECT | 全件 |
| medical_questionnaires ほか問診系 | patient_id が自分 の SELECT／draft中のみ UPDATE | 同一clinic SELECT／doctor_notes等は INSERT/UPDATE | 全件 |
| ai_summaries | **status='confirmed' かつ patient_comment 経由の内容のみ**（実際は患者に直接見せないため SELECT 不可） | 同一clinic | 全件 |
| triage_results / ai_logs | SELECT不可（患者向け表示はAPI経由で加工） | 同一clinic SELECT | 全件 |
| audit_logs | 不可 | clinic_admin のみ同一clinic SELECT | 全件 |
| Storage: medical-images | 自分の問診の画像のみ（パスにquestionnaire_id） | 同一clinicパス | 全件 |
| 追記専用テーブル | — | — | **全ロールで UPDATE/DELETE ポリシーを定義しない**＋`REVOKE UPDATE, DELETE` |

ポリシー例（問診）：
```sql
ALTER TABLE medical_questionnaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY mq_patient_select ON medical_questionnaires FOR SELECT
  USING (patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid()));
CREATE POLICY mq_clinic_select ON medical_questionnaires FOR SELECT
  USING (auth_role() IN ('doctor','clinic_admin') AND clinic_id = auth_clinic_id());
```

アプリ層 tenant guard（Prisma 側の第一層）：
- 全リポジトリ関数はセッション由来の `clinicId` / `patientId` を必須引数とし、`where` に必ず含める共通ラッパー経由でのみDBアクセス（生 `prisma.*` の直接呼び出しを lint ルールで禁止）

---

## 6. Prisma スキーマ草案（抜粋・主要モデル）

```prisma
// schema.prisma（草案。全文は Phase 5 実装時に確定）
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }

enum Role { patient doctor clinic_admin super_admin }
enum QStatus { draft ai_interview triaged doctor_reviewed consulted abandoned }
enum TriageLevel { L1 L2 L3 L4 }
enum NoteType { clinical prescription patient_comment }
enum AiPurpose { initial_analysis question_gen triage soap department danger_check }

model Clinic {
  id          String  @id @default(uuid()) @db.Uuid
  name        String
  slug        String  @unique
  departments String[]
  settings    Json    @default("{}")
  status      String  @default("active")
  users       User[]
  patients    Patient[]
  doctors     Doctor[]
  questionnaires MedicalQuestionnaire[]
  createdAt   DateTime @default(now()) @map("created_at")
  @@map("clinics")
}

model User {
  id        String  @id @db.Uuid            // = auth.users.id
  role      Role
  clinicId  String? @map("clinic_id") @db.Uuid
  email     String
  mfaEnrolled Boolean @default(false) @map("mfa_enrolled")
  clinic    Clinic? @relation(fields: [clinicId], references: [id])
  patient   Patient?
  doctor    Doctor?
  @@map("users")
}

model Patient {
  id        String @id @default(uuid()) @db.Uuid
  userId    String @unique @map("user_id") @db.Uuid
  clinicId  String @map("clinic_id") @db.Uuid
  name      String
  nameKana  String @map("name_kana")
  birthDate DateTime @map("birth_date") @db.Date
  sex       String
  phone     String?
  baselineHistory     Json @default("[]") @map("baseline_history")
  baselineMedications Json @default("[]") @map("baseline_medications")
  baselineAllergies   Json @default("[]") @map("baseline_allergies")
  anonymizedAt DateTime? @map("anonymized_at")
  user      User   @relation(fields: [userId], references: [id])
  clinic    Clinic @relation(fields: [clinicId], references: [id])
  questionnaires MedicalQuestionnaire[]
  @@index([clinicId])
  @@map("patients")
}

model MedicalQuestionnaire {
  id           String  @id @default(uuid()) @db.Uuid
  clinicId     String  @map("clinic_id") @db.Uuid
  patientId    String  @map("patient_id") @db.Uuid
  templateType String  @map("template_type")
  status       QStatus @default(draft)
  emergencyFlagged Boolean @default(false) @map("emergency_flagged")
  chiefComplaintCategory String? @map("chief_complaint_category")
  chiefComplaintText     String? @map("chief_complaint_text")
  onset        String?
  painScale    Int?    @map("pain_scale") @db.SmallInt
  bodyTemp     Decimal? @map("body_temp") @db.Decimal(3, 1)
  historySnapshot     Json @default("[]") @map("history_snapshot")
  medicationsSnapshot Json @default("[]") @map("medications_snapshot")
  allergiesSnapshot   Json @default("[]") @map("allergies_snapshot")
  pregnancyStatus String? @map("pregnancy_status")
  lifestyle    Json    @default("{}")
  freeText     String? @map("free_text")
  currentStep  Int     @default(1) @map("current_step") @db.SmallInt
  submittedAt  DateTime? @map("submitted_at")
  suggestedDepartments String[] @map("suggested_departments")
  clinic   Clinic  @relation(fields: [clinicId], references: [id])
  patient  Patient @relation(fields: [patientId], references: [id])
  aiQuestions   AiQuestion[]
  triageResults TriageResult[]
  aiSummary     AiSummary?
  doctorNotes   DoctorNote[]
  images        UploadedImage[]
  @@index([clinicId, status, submittedAt(sort: Desc)])
  @@index([patientId, createdAt(sort: Desc)])
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("medical_questionnaires")
}

model TriageResult {
  id         String @id @default(uuid()) @db.Uuid
  questionnaireId String @map("questionnaire_id") @db.Uuid
  clinicId   String @map("clinic_id") @db.Uuid
  finalLevel TriageLevel @map("final_level")
  aiLevel    TriageLevel? @map("ai_level")
  ruleLevel  TriageLevel @map("rule_level")
  aiReasons  Json?  @map("ai_reasons")
  ruleHits   Json?  @map("rule_hits")
  aiLogId    String? @map("ai_log_id") @db.Uuid
  promptVersion String? @map("prompt_version")
  supersededById String? @map("superseded_by") @db.Uuid
  questionnaire MedicalQuestionnaire @relation(fields: [questionnaireId], references: [id])
  createdAt  DateTime @default(now()) @map("created_at")
  @@map("triage_results")
}

// AiQuestion / AiSummary / AiSummaryRevision / DoctorNote / UploadedImage /
// AppointmentSlot / Appointment / AiLog / AuditLog / Notification / Consent /
// DeletionRequest / TriageRule … §3 の定義どおり（実装フェーズで全文化）
```

※ RLSポリシー・追記専用のREVOKE・部分UNIQUEインデックスは Prisma で表現できないため、`prisma/migrations` 内の**手書きSQLマイグレーション**として管理する。

---

## 7. データライフサイクル・削除申請

| データ | 保持 | 削除申請時の扱い |
|---|---|---|
| 問診・SOAP・診療メモ | テナント設定（既定5年） | **匿名化**（patients の氏名・カナ・連絡先・生年月日をマスク、anonymized_at セット）。問診本体は医療記録としてクリニックの保存義務があるため物理削除しない。この方針を利用規約・プライバシーポリシーに明記 |
| 画像 | 同上 | Storage から物理削除（匿名化後は診療上の必要性が低く、漏えいリスクが高いため） |
| audit_logs / ai_logs | 5年（追記専用） | 削除しない（匿名化後は間接識別のみ） |
| アカウント（auth） | — | 削除申請完了時に無効化→削除 |

バックアップ：Supabase PITR（7日）＋ 日次スナップショット。リストア手順は Phase 14 デプロイ手順書に記載。

---

## 8. 自己レビュー（Phase 3時点の問題点と対応）

| 指摘 | 対応 |
|---|---|
| Prisma は service role で RLS を素通りするため「RLSがあるから安全」は誤り | §5 に二層防御を明記。アプリ層 tenant guard を必須とし、生prisma呼び出しをlint禁止。Phase 13 でテナント分離テスト |
| 患者プロフィール更新で過去の問診内容が変わると記録の同一性が壊れる | スナップショット方式（history_snapshot等）を採用（方針2） |
| 削除申請で問診を物理削除すると、クリニック側の記録保存義務・医療紛争時の証拠と衝突する | 「患者PIIの匿名化＋画像のみ物理削除」方式に決定（§7）。規約に明記する前提 |
| triage_results を UPDATE で上書きすると「当時何と表示したか」が消える | 追記専用＋superseded_by 方式。患者に表示した判定は不変で残る |
| SOAPを医師が編集するとAI原文が消え、AI品質評価（SOAP修正率KPI）が測れない | AI原文は ai_logs に不変保存、編集前値は ai_summary_revisions に保存。現在値と原文を常に比較可能 |
| slot の同時予約（レースコンディション） | DB制約で防止：appointments.slot_id の部分UNIQUEインデックス（canceled除外）。アプリ層はトランザクション＋競合時リトライ |
| ai_questions に clinic_id がないと RLS が JOIN 依存になり遅く・複雑になる | 問診系の子テーブル全部に clinic_id を非正規化（方針1） |
| doctor_notes の UPDATE を許すと処方メモの改ざん検知ができない | 編集は新規行＋revision_of 参照方式（履歴が必ず残る） |
| 体温45℃・痛み11などの異常値混入 | CHECK制約をDB層に定義（アプリバリデーションと二重） |
| enum を PostgreSQL ENUM 型にすると値追加のマイグレーションが重い | text + CHECK 制約を採用（Prisma enum はクライアント型として利用） |

---

## 9. 未決事項
1. 保持期間の既定値（5年仮置き）— テナント契約条件と合わせて確定
2. Supabase の カラム暗号化（pgsodium）適用範囲 — MVPは at-rest 暗号化＋アクセス制御。Phase 12 で PII カラム（patients.name 等）への適用を再評価
3. 企業健康相談窓口テナント（診療なし）のデータモデル差分 — Post-MVP

---

## 10. 次フェーズ
**Phase 4：API設計** — ルート一覧（App Router / Route Handlers）、リクエスト/レスポンス定義、認可マトリクス、AIパイプライン設計（6プロンプトの入出力契約・バリデーション・フォールバック）、AIプロンプト一覧 v1。
