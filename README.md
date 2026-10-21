# YIXIN.ARCHIVE — 个人科技博客

科幻终端档案风格的纯静态博客：**零构建、零后端、零 CDN 依赖**（所有库已本地化），推送即部署到 GitHub Pages。

内容分区：开源项目进展 / 技术分享 / 数学笔记。支持 Markdown 写作、KaTeX 数学公式、代码高亮、标签筛选、全文搜索、明暗双主题、移动端自适应。

## 目录结构

```
├── index.html              # 唯一页面（hash 路由 SPA）
├── assets/
│   ├── css/style.css       # 主题（暗色默认，CSS 变量控制双主题）
│   ├── js/app.js           # 路由 + 渲染引擎 + 站点配置
│   └── vendor/             # marked / highlight.js / KaTeX（本地，无外部请求）
├── content/
│   ├── posts.json          # 文章清单（元数据）
│   ├── about.md            # 关于页
│   └── posts/*.md          # 文章正文
└── .nojekyll               # 关闭 Pages 的 Jekyll 处理
```

## 部署到 GitHub Pages（github.io）

1. 在 GitHub 创建仓库，**仓库名必须严格等于 `你的用户名.github.io`**（含小写）。
2. 推送本目录：

```bash
git init
git add .
git commit -m "init: tech archive blog"
git branch -M main
git remote add origin git@github.com:你的用户名/你的用户名.github.io.git
git push -u origin main
```

3. 仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` / `/ (root)`，保存。
4. 约 1 分钟后访问 `https://你的用户名.github.io`。

> 若改为项目页（仓库名任意，URL 带 `/仓库名/` 前缀）也能直接用——所有资源均为相对路径。

## 写新文章（两步）

1. 在 `content/posts/` 新建 Markdown，如 `my-new-post.md`。数学公式用 `$...$`（行内）/ `$$...$$`（块级），代码块标语言（```rust）。
2. 在 `content/posts.json` 数组里加一条：

```json
{
  "slug": "my-new-post",
  "file": "my-new-post.md",
  "title": "文章标题",
  "date": "2026-10-20",
  "category": "tech",
  "tags": ["标签A", "标签B"],
  "summary": "一两句摘要，会显示在卡片上。",
  "reading": "5 min"
}
```

`category` 只能是：`project`（开源项目）/ `tech`（技术分享）/ `math`（数学笔记）。推送后自动上线，无需任何构建。

## 本地预览

浏览器直接双击 `index.html` 会因 fetch 跨域限制而无法加载文章，必须起本地服务器：

```bash
cd 本目录
python3 -m http.server 8321
# 打开 http://127.0.0.1:8321
```

## 个性化

打开 `assets/js/app.js` 顶部的 `SITE` 对象，修改站点名、GitHub 地址、邮箱、首页座右铭。`index.html` 的 `<title>` 与页脚同理。

示例文章（logkit 系列等）为占位内容，替换成你自己的文章即可；删除时在 `posts.json` 里同步移除条目。

## 安全说明

文章正文默认信任作者本人（Markdown 可内联 HTML）。若未来开放第三方投稿或评论渲染，请为渲染管线接入 DOMPurify（详见站内文章《手写 Markdown 渲染管线》的注入面一节）。
