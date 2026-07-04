# Phase 5：認証機能 実装メモ（実装前設計＋自己レビュー）

- 作成日：2026-07-02

## 1. 実装スコープ
1. Next.js 15 プロジェクト初期化（TypeScript / Tailwind v4 / ポート3120）＋ Phase 2 デザイントークン
2. Prisma スキーマ全文（Phase 3 の確定版）
3. 認証二系統：
   - **本番系**：Supabase Auth（@supabase/ssr、メール+パスワード、医師/管理者はTOTP MFA）
   - **デモ系**：env未設定時に自動有効。ロール別ワンクリックログイン＋インメモリストア（Supabase不要でフル動作）
4. AuthContext（`{userId, role, clinicId, patientId?, doctorId?, mfaVerified}`）と認可ガード（`requireRole` / MFA強制）
5. ロール別シェル：`/mypage`（患者）・`/doctor`（医師）・`/admin`（クリニック管理者）＋ ログイン/登録/MFA画面
6. リポジトリ層の骨格（interface＋Prisma実装＋Demo実装、tenant guard 引数必須の型）

## 2. 設計判断
| 論点 | 判断 | 理由 |
|---|---|---|
| デモモード | `NEXT_PUBLIC_SUPABASE_URL` 未設定で自動有効。画面に常時「デモモード」バナー。demo-login APIは本番envでは404 | ユーザーの過去プロジェクト方針（env無しでフル動作）に合わせ、即時に動作確認できる状態を維持 |
| middleware の役割 | 「セッション有無のチェック＋リダイレクト」のみ。**ロール/MFA判定はサーバーコンポーネント層とAPI層で実施** | middlewareでのDB参照は高コスト。JWTのロール改ざんに依存しない（DBのusers行が正） |
| ロールの持ち方 | DBの `users.role` が唯一の正。JWTクレームは使わない（RLS用クレームは Phase 12 で追加） | 二重管理の不整合防止 |
| MFA | 医師・管理者は `mfa_enrolled=false` の間、`/doctor` `/admin` とAPIを全ブロックし `/auth/mfa` へ誘導。TOTP（supabase.auth.mfa） | Phase 1 SAFE要件 |
| リポジトリ層 | 全メソッドが `ctx: AuthContext` を第一引数に取る。clinic横断が必要なもののみ `systemRepo` に隔離 | Phase 3 §5 tenant guard を型で強制 |

## 3. 自己レビュー（実装前）
| 指摘 | 対応 |
|---|---|
| デモモードのコードが本番に混入して認証バイパスになる危険 | demo系は `lib/demo/` に隔離し、全入口で `isDemoMode` ガード＋本番env時は404。Phase 12 でデプロイ前チェックリストに「demoルート無効の確認」を追加 |
| middlewareだけでロール制御すると、APIを直叩きされたとき素通り | API Route Handler側で必ず `getAuthContext()`→`requireRole()` を通す構造にし、middlewareはUX用と割り切る |
| 登録APIを認証前に叩けるため、他人のauthユーザーにプロフィールを紐付けられる恐れ | プロフィール作成は「サインアップ後のセッション保持者本人」のみ（auth.uid()とuser_id一致を強制） |
| OneDrive配下で node_modules が同期対象になり激重になる | 既存プロジェクトと同様に許容（.gitignore済み）。README に「OneDrive同期一時停止推奨」を記載 |
| prisma generate はDB接続不要だが、migrate はSupabase実環境が必要 | Phase 5 では schema定義＋generateまで。migrate SQL適用は実環境接続時（Phase 14）の手順書に記載 |

## 4. 受け入れ確認（このフェーズの完了条件）
- [x] `npm run build` が通る（2026-07-02 確認）
- [x] デモモードで：患者ログイン→/mypage、医師ログイン→/doctor、管理者→MFA設定→/admin に到達
- [x] 未ログインで /mypage にアクセス→/login?next=/mypage へリダイレクト
- [x] 患者ロールで /doctor にアクセス→404
- [x] デモバナー表示

※すべてブラウザ実機（ポート3120）で動作確認済み。
