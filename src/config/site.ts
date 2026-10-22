/* 站点唯一事实来源:导航、页脚、状态条、首页节点全部由本文件生成。
   新增分区 = 在 CATEGORY 加一条(路由/列表页/导航自动出现),再到 src/scene/scene3d.js 的星座组加对应域。 */

export const SITE = {
  name: "ASTRA",
  nameSub: ".ARCHIVE",
  title: "Ginko Astra",
  description: "开源项目进展 · 技术分享 · 数学笔记 — 知识汇入 ASTRA",
  tagline: "一切终将坠入记忆，而明天总会到来。",
  hint: "// CLICK A CONSTELLATION TO ENTER",
  homeAria: "黑洞星图 · 记忆归档场景",
  github: "https://github.com/GinkoAstra",
  githubShare: "https://github.com/ideameshdyx",
  email: "ginkoastra@gmail.com",
  emailShare: "ideameshdyx@gmail.com",
  icp: "",
  statusLive: "SYSTEM ONLINE",
  uplink: "UPLINK: github.io",
  powered: "POWERED BY ASTRO · HOSTED ON GITHUB PAGES",
};

export type Domain = "project" | "tech" | "math";

export interface Category {
  label: string;
  route: string;
  code: string;
  glyph: string;
  idx: string;
}

export const CATEGORY: Record<Domain, Category> = {
  project: { label: "开源项目", route: "projects", code: "OSS-LOG", glyph: "✦", idx: "02" },
  tech: { label: "技术分享", route: "tech", code: "TECH-NOTE", glyph: "</>", idx: "03" },
  math: { label: "数学笔记", route: "math", code: "MATH-NOTE", glyph: "∑", idx: "04" },
};

export const NAV = [
  { key: "home", route: "", label: "首页", idx: "01" },
  ...Object.entries(CATEGORY).map(([key, c]) => ({ key, route: c.route, label: c.label, idx: c.idx })),
  { key: "about", route: "about", label: "关于", idx: "05" },
];
