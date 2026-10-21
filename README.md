# ASTRA — 黑洞星图个人博客

科幻终端档案风格的静态博客:**Astro SSG + Three.js**,构建期全量预渲染,GitHub Actions 推送即部署到 Pages。

首页即场景:黑洞视界 = 永恒归档核心(落入的信息永不丢失),三座黄道星座(射手座=开源项目 / 天秤座=数学笔记 / 白羊座=技术分享)相位锁定公转,符号流逐颗点亮新星。点击星座 → 全场螺旋坠入视界 → 进入分区。

## 常用命令

```bash
pnpm install        # 安装依赖
pnpm dev        # 本地开发(热更新)
pnpm build      # 构建到 dist/
pnpm preview    # 预览构建产物
```

## 目录结构

```
├── src/
│   ├── config/site.ts        # 站点唯一事实来源:站名/标语/页脚/状态条/分区定义
│   ├── content.config.ts     # posts 内容集合(zod 校验 frontmatter)
│   ├── content/posts/*.md    # 文章(带 frontmatter)
│   ├── data/about.md         # 关于页
│   ├── layouts/BaseLayout.astro
│   ├── components/           # PostCard / SectionHead / BlackHoleScene
│   ├── pages/                # index / [section] / post/[slug] / about
│   ├── scene/scene3d.js      # 黑洞场景引擎(纯 three,与框架无关)
│   ├── scripts/              # 主题切换 / 转场 / 列表过滤
│   └── styles/global.css
├── public/                   # 原样复制的静态文件(.nojekyll)
├── astro.config.mjs          # SITE_URL / BASE_PATH 环境变量控制部署目标
└── .github/workflows/        # push main → 自动构建部署 Pages
```

## 写作与维护

- **新文章**:在 `src/content/posts/` 加 `.md`,frontmatter 必填 `title / date / category / tags / summary`(category ∈ project | tech | math),公式用 `$...$` / `$$...$$`,代码高亮构建期完成。
- **插图**:图片与文章同目录存放(命名带 slug 前缀,如 `my-post-chart.png`),正文用相对路径 `![说明](./my-post-chart.png)`。构建时自动转 WebP、内容哈希、注入宽高(无布局抖动)与懒加载。**不要**放 `public/` 或用绝对路径(项目页部署有 base 前缀会失效);`public/` 只放不需要处理的全站资产。
- **改站点信息**:只改 `src/config/site.ts`(导航、页脚、状态条、首页节点全部由它生成)。
- **新分区**:`site.ts` 的 `CATEGORY` 加一条 → 导航/路由/列表页自动生成;再到 `src/scene/scene3d.js` 加对应星座组与符号列表(文件内有维护注释)。

## 部署

1. 仓库 **Settings → Pages**:Source 选 **GitHub Actions**。
2. push 到 `main`,工作流自动构建部署。
3. 用户页(`<user>.github.io`)零配置;项目页仓库由 `withastro/action` 自动注入 `base` 路径。
