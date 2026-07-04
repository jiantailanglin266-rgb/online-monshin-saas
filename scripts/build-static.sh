#!/usr/bin/env bash
# =============================================================
# 静的書き出しデモ（GitHub Pages用）をビルドする。
#   一時的に next.config.ts を静的版へ差し替え、
#   middleware / APIルート（static export非対応）を退避して
#   `next build` → out/ を生成する。ビルド後は必ず元の構成へ戻す。
# =============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

restore() {
  rm -f next.config.mjs
  [ -f next.config.ts.bak ] && mv -f next.config.ts.bak next.config.ts || true
  [ -f src/middleware.ts.bak ] && mv -f src/middleware.ts.bak src/middleware.ts || true
  [ -d src/_api.bak ] && mv -f src/_api.bak src/app/api || true
}
trap restore EXIT

# 1) 設定を静的版に差し替え
mv -f next.config.ts next.config.ts.bak
cp -f next.config.static.mjs next.config.mjs

# 2) middleware / APIルートは static export 非対応なので退避
[ -f src/middleware.ts ] && mv -f src/middleware.ts src/middleware.ts.bak || true
[ -d src/app/api ] && mv -f src/app/api src/_api.bak || true

# 3) ビルド（Supabase等のenvは未設定＝デモモード）
rm -rf out .next
npx next build

# 4) GitHub Pages が _next/ を配信できるよう Jekyll を無効化
touch out/.nojekyll

echo "OK: static demo written to out/"
