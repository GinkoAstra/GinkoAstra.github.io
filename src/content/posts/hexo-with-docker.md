---
title: "Docker 环境下配置 Hexo 博客"
date: "2024-04-11"
category: "tech"
tags: ["Hexo", "Docker", "博客"]
summary: "Docker 里搭 Hexo 博客的完整流程:技术选型、Butterfly 主题、独立编译环境,以及 GitHub Actions 自动部署到 Pages。"
reading: "2 min"
---
## Hexo Blog

> 记录博客搭建管理的技术栈和流程
>
> 博客的技术方案选择： [Hexo+github.io](https://hexo.io/zh-cn/)
>
> 博客模板选择： [Butterfly](https://butterfly.js.org/)
>
> 博客文件管理模式： 
> * 使用 docker环境管理：[独立使用 docker 编译环境](https://github.com/IdeaMeshDyx/dev-enviroment/tree/main/hexo)

首先是选择一个合适的博客管理技术栈，实际上借用已有的博客平台比如[掘金](https://juejin.cn/),[开源中国](https://www.oschina.net/),[CSDN](https://www.csdn.net/) 等可以节省自己部署成本，但是这些平台太过于复杂且页面风格等方面难以符合自己的需求，最重要的是太过于复杂和笨重。

使用静态博客需要花费更多的精力，但是也可以更贴近开发方式，也可以作为部分技术点的试验方式，故选用这个需要折腾的方式。目前最为著名的两个技术栈是：

- Jekyll：42.6k [Github地址](https://link.zhihu.com/?target=https%3A//github.com/jekyll/jekyll)/[官网地址](https://link.zhihu.com/?target=https%3A//jekyllrb.com/)
- Hexo：32.6k [Github地址](https://link.zhihu.com/?target=https%3A//github.com/hexojs/hexo)/[官网地址](https://link.zhihu.com/?target=https%3A//hexo.io/)

其中 Jekyll 有github支持，可以直接在github网页上编辑，但是技术要求较高，后期等到博客管理维护的方法论和技术流程成熟了就切换成这个试试。Hexo基于node.js 实现，有非常多的教程和资料，许多操作都做了封装和优化，可以在本地进行调试，作为学习和测试的方式来说非常适合。其他博客技术对比资料参考[静态博客搭建工具汇总](https://www.cnblogs.com/FLY_DREAM/p/16527100.html),[Top ten popular static site generators (SSG) in 2023](https://medium.com/@ezinneanne/top-ten-popular-static-site-generators-ssg-in-2023-e1894fca6925),[Jekyll / Hugo / Hexo Comparison](https://lexcao.io/posts/jekyll-hugo-hexo/),[Gatsby, Ghost, Hugo, Jekyll or another static site generator?](https://www.reddit.com/r/webdev/comments/10qpeu9/gatsby_ghost_hugo_jekyll_or_another_static_site/)

###  Docker 管理环境

不论选用哪一类技术，当切换设备和环境的时候，以往部署的 ruby，nodejs 环境就需要重新部署，而这往往是成本最高的地方，容易受到操作系统、设备硬件、网络状态的影响，所以采用 Docker 镜像做统一的管理。 

Docker 管理的方式是 Docker 内配置博客需要的所有的环境依赖，包括nodejs、ruby、github sshkey等等，然后通过挂载本地博客项目文件的方式来获取源文件，这样就可以使用本地 IDE 编辑文件，然后利用 Docker 环境编译生成和部署。

Docker 环境部署参考：https://github.com/IdeaMeshDyx/dev-enviroment/tree/main/hexo

也可以直接使用本博客目录下面的`docker-compose.yml`来启动

### Markdown文章内容

简单的模板, 配置在`/scafffolds/post.md` 中

```markdown
---
title: {{ title }}
date: {{ date }}
author: 
img: 
coverImg: 
top: false
cover: false
toc: true
mathjax: false
password:
summary:
tags:
categories:
---

```

然后每次使用 `hexo new` 创建新的博客时候就会采用这个格式

### github + hexo 部署流程

当完成了博客的内容编写之后，需要编译静态文件同时发布的github上，遵循以下流程：

```
# 所有的修改都在 blog 分支上进行
git checkout blog

# 先保存已有的修改
git status
git add .  # 或者是 add 修改地文件
git commit -m ""  --signoff

# 然后生成文件
hexo c # 清理之前的 cache
hexo g
hexo s

# 此后可以直接访问 localhost:4000 查看博客的具体样式，依据样式修改

# status 应该显示没有修改，是update
git status
git push origin/blog
```

然后在github上需要通过配置 workflow 流程来编译文件
具体操作是：
1. 建立 <你的 GitHub 使用者名称>.github.io 的仓库，username 是你在 GitHub 上的使用者名称，若之前已將 Hexo 上传至其他仓库，那就改个名字。
2. 將本地的 Hexo 项目 push 到仓库的预设分支，预设分支通常名為 main，旧一點的仓库可能名為 master。
將 main 分支 push 到 GitHub：
```
$ git push -u origin main
```
为了保障 `hexo s` 生成的文件不会上传到远程仓库，预设情況下 public/文件目录 不会被上传(也不该被上传)，保证 .gitignore 中有一行 public/就可以实现了。
可以直接参考本博客的目录结构来看是否配置正确。
3. 使用 node --version 指令检查Docker上的 Node.js 版本（目前我用的是 20）。之后到github 网页的仓库中 Settings > Pages > Source，並将 Source 改为 GitHub Actions。

然后在仓库中创建 .github/workflows/pages.yml，並填入以下內容 (將 20 替换为上述步驟中记下的版本)：
```yaml
name: Pages

on:
  push:
    branches:
      - main # default branch

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          # If your repository depends on submodule, please see: https://github.com/actions/checkout
          submodules: recursive
      - name: Use Node.js 20.x
        uses: actions/setup-node@v2
        with:
          node-version: '20'
      - name: Cache NPM dependencies
        uses: actions/cache@v2
        with:
          path: node_modules
          key: ${{ runner.OS }}-npm-cache
          restore-keys: |
            ${{ runner.OS }}-npm-cache
      - name: Install Dependencies
        run: npm install
      - name: Build
        run: npm run build
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: ./public
  deploy:
    needs: build
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

这个也是学习 github workflow  的一个好机会。
部署完成之后，每一次提交pr都会触发github编译这个环境，就不需要使用 hexo d 来完成推送了。
