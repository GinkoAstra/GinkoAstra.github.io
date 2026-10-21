## 问题现场

想让博客同时支持 Markdown 和数学公式，最直觉的写法是：

```js
const html = marked.parse(md);        // 先 markdown
renderMathInElement(el);              // 再 KaTeX 自动渲染
```

然后你会在 `$x_1 + x_2$` 这类公式上踩坑：marked 把 `_1 + x_` 之间的内容解析成了斜体，KaTeX 拿到的公式已经被撕碎了。

根因是**两套语法争抢同一批字符**：`_`、`*`、`[]()` 在 Markdown 和 TeX 里都有含义，串联解析必然冲突。

## 解法：占位符抽取

正确的顺序是"先抢数学、再解析 Markdown、最后回填"：

```js
function extractMath(src) {
  const stash = [];
  const put = (tex, display) => {
    stash.push({ tex, display });
    return `@@MATH_${stash.length - 1}@@`;   // 不会被 markdown 碰的占位符
  };
  src = src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => put(t, true))   // 块级优先
    .replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (_, t) => put(t, false));
  return { src, stash };
}

function render(md) {
  const { src, stash } = extractMath(md);
  const html = marked.parse(src);
  return html.replace(/@@MATH_(\d+)@@/g, (_, i) =>
    katex.renderToString(stash[i].tex, {
      displayMode: stash[i].display,
      throwOnError: false,
    }));
}
```

整个管线不到 40 行。关键点有三个：

1. **块级 `$$...$$` 必须先抽**，否则两个相邻的行内 `$...$` 会被错配成一对
2. 占位符用 `@` 和数字——Markdown 的所有语法字符都不在这个字符集里
3. `throwOnError: false`：公式写错了渲染成红色错误提示，而不是炸掉整篇文章

## 注入面：能不能塞 `<script>`？

这是自建管线必须直面的问题。Markdown 默认允许内联 HTML，marked 不做消毒，所以 `$<img onerror=...>$` 这类输入会原样进 DOM。

对**个人博客**（唯一内容作者是站点主人）风险可接受；但只要有第二个内容来源（评论、投稿），就必须加 DOMPurify：

```js
import DOMPurify from "dompurify";
const safe = DOMPurify.sanitize(render(md), { ADD_TAGS: ["semantics", "annotation"] });
```

注意 KaTeX 输出里含 MathML 标签，要在白名单里放行——这是消毒配置里最容易漏的一项。

## 顺手的收获

占位符方案还有个意外好处：**KaTeX 渲染从 DOM 阶段提前到了字符串阶段**。不依赖 `renderMathInElement` 遍历 DOM，长文渲染快了约 30%，而且可以在 Web Worker 里跑。

本站的文章渲染用的就是这套管线，源码在 `assets/js/app.js`。
