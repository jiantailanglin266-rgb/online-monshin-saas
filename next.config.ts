import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // 通常ビルドでは静的デモエンジンを noop スタブに差し替え、
    // "server-only" を含むモジュール群がクライアントバンドルへ混入しないようにする。
    // （静的書き出しでは next.config.static.mjs が逆にサーバー専用モジュールをスタブ化する）
    // ※ "@/..." は tsconfig paths が alias より先に解決するため、
    //    NormalModuleReplacementPlugin で request 自体を書き換える。
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /lib[\\/]staticdemo[\\/]engine$/,
        path.resolve(__dirname, "scripts/static-stubs/engine-noop.ts")
      )
    );
    return config;
  },
};

export default nextConfig;
