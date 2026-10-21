import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// 部署目标由环境变量决定:
//  - 用户页  <user>.github.io      → 默认即可(SITE_URL 可改)
//  - 项目页  <user>.github.io/repo → BASE_PATH=/repo npm run build
export default defineConfig({
  site: process.env.SITE_URL || "https://ginkoastra.github.io",
  base: process.env.BASE_PATH || "/",
  trailingSlash: "ignore",
  markdown: {
    processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }),
    shikiConfig: { theme: "github-dark-default" },
  },
  vite: {
    build: {
      // 最大单 chunk 即 three(548K,仅首页加载),属刻意保留
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          // three 单独成 chunk:场景代码迭代时命中长效缓存
          codeSplitting: { groups: [{ name: "three", test: /node_modules\/three/ }] },
        },
      },
    },
  },
});
