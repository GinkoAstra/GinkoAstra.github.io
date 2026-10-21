## 仓库命名：决定 URL 的那一步

GitHub Pages 有两类站点，命名规则不同：

| 类型 | 仓库名 | 访问地址 |
|------|--------|----------|
| 用户/组织站点 | `用户名.github.io` | `https://用户名.github.io` |
| 项目站点 | 任意，如 `blog` | `https://用户名.github.io/blog/` |

个人博客选第一类：**一个账号只有一个，仓库名必须精确匹配用户名**。

## 纯静态站点：推上去就行

如果站点是纯 HTML/CSS/JS（比如本站，无需构建），只需要：

```bash
git init
git add .
git commit -m "init: tech archive blog"
git branch -M main
git remote add origin git@github.com:用户名/用户名.github.io.git
git push -u origin main
```

然后到仓库 **Settings → Pages**，Source 选 `Deploy from a branch`，分支选 `main / (root)`。一分钟后站点上线。

> 纯静态站甚至不需要 Actions。Actions 只在有构建步骤（如 Astro/Hugo/VitePress）时才必要。

## 有构建步骤时：Actions 工作流

以 Node 构建为例，`.github/workflows/deploy.yml`：

```yaml
name: deploy
on:
  push:
    branches: [main]
permissions:
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

两个易错点：

1. `permissions` 必须显式声明 `pages: write`，否则 `deploy-pages` 报 403
2. Settings → Pages 的 Source 要切到 **GitHub Actions**，而不是 branch

## SPA 的 404 问题与自定义域名

- **404 回退**：GitHub Pages 会把 `404.html` 作为兜底。前端路由的 SPA 把 `index.html` 复制一份为 `404.html` 即可；hash 路由（`#/xxx`）则完全没这个问题——这也是本站选 hash 路由的原因之一。
- **自定义域名**：仓库根目录放一个 `CNAME` 文件，内容就是域名，如 `blog.example.com`；DNS 侧加 `CNAME` 记录指向 `用户名.github.io`，然后在 Settings 里勾选 **Enforce HTTPS**。
- **缓存**：Pages 的静态资源带有 10 分钟的 CDN 缓存，发布后看不到更新先别慌。

## 成本与限制

免费。限制是：仓库 < 1GB，月流量 < 100GB，每小时构建 < 10 次。对个人博客来说约等于无限制。
