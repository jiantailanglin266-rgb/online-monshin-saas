// =============================================================
// 静的書き出し（GitHub Pages）専用の Next 設定
//   scripts/build-static.sh から一時的に next.config.ts と差し替えて使う。
//   ・output: "export"  … 静的HTMLとして書き出す
//   ・basePath          … https://<user>.github.io/online-monshin-saas/
//   ・module置換        … サーバー専用モジュール（server-only / prisma / supabase）
//                         をスタブへ差し替え、デモエンジンは実物を使う
// =============================================================
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const stub = (f) => path.resolve(dir, "scripts/static-stubs", f);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/online-monshin-saas",
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_STATIC_DEMO: "1",
  },
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^server-only$/, stub("empty.ts")),
      new webpack.NormalModuleReplacementPlugin(
        /lib[\\/]db[\\/]prisma$/,
        stub("prisma.ts")
      ),
      new webpack.NormalModuleReplacementPlugin(
        /lib[\\/]supabase[\\/](server|admin)$/,
        stub("supabase.ts")
      )
    );
    return config;
  },
};

export default nextConfig;
