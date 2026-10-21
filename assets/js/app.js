/* TECH ARCHIVE — static blog engine (no build, GitHub Pages ready) */
"use strict";

/* ============ 站点配置（部署前改这里） ============ */
const SITE = {
  name: "YIXIN.ARCHIVE",
  owner: "yixin",
  github: "https://github.com/yixin",        // 改成你的 GitHub 主页
  email: "yixin@example.com",                // 改成你的邮箱
  motto: "记录开源项目的每一次迭代，写下技术实践中的真实坑与解法，推导数学里那些漂亮的结构。",
  icp: "",                                    // 如有备案号可填
};

const CATEGORY = {
  project: { label: "开源项目", cls: "project", route: "projects", code: "OSS-LOG" },
  tech:    { label: "技术分享", cls: "tech",    route: "tech",    code: "TECH-NOTE" },
  math:    { label: "数学笔记", cls: "math",    route: "math",    code: "MATH-NOTE" },
};

/* ============ 工具 ============ */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.json();
}
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.text();
}

/* ============ Markdown + KaTeX 渲染 ============ */
// 先把数学公式抽成占位符，避免 marked 误解析 $ 内的下划线等字符
function extractMath(src) {
  const stash = [];
  const put = (tex, display) => {
    stash.push({ tex, display });
    return `@@MATH_${stash.length - 1}@@`;
  };
  src = src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => put(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => put(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => put(t, false))
    .replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (_, t) => put(t, false));
  return { src, stash };
}

function restoreMath(html, stash) {
  return html.replace(/@@MATH_(\d+)@@/g, (_, i) => {
    const { tex, display } = stash[+i];
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch {
      return `<code>${esc(tex)}</code>`;
    }
  });
}

marked.setOptions({ gfm: true, breaks: false });

const renderer = new marked.Renderer();
renderer.code = function (code, lang) {
  const valid = lang && hljs.getLanguage(lang);
  const highlighted = valid
    ? hljs.highlight(code, { language: lang }).value
    : hljs.highlightAuto(code).value;
  return `<pre data-lang="${esc(lang || "text")}"><code class="hljs">${highlighted}</code></pre>`;
};

function renderMarkdown(md) {
  const { src, stash } = extractMath(md);
  const html = marked.parse(src, { renderer });
  return restoreMath(html, stash);
}

/* ============ 数据 ============ */
let POSTS = [];

function postsBy(cat) {
  return POSTS.filter((p) => p.category === cat).sort((a, b) => b.date.localeCompare(a.date));
}

function cardHTML(p) {
  const c = CATEGORY[p.category];
  const tags = (p.tags || []).map((t) => `<span class="tag" data-tag="${esc(t)}">#${esc(t)}</span>`).join("");
  return `
    <a class="card reveal" href="#/post/${p.slug}">
      <div class="meta">
        <span class="cat ${c.cls}">${c.label}</span>
        <span>${p.date}</span>
        <span>${p.reading || ""}</span>
      </div>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.summary)}</p>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </a>`;
}

/* ============ 视图 ============ */
function viewHome() {
  const total = POSTS.length;
  const latest = [...POSTS].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const sections = Object.entries(CATEGORY).map(([key, c]) => {
    const list = postsBy(key);
    if (!list.length) return "";
    return `
      <div class="section-head reveal">
        <span class="code">${c.code}</span>
        <h2>${c.label}</h2>
        <span class="count">${list.length} ENTRIES → <a href="#/${c.route}">全部</a></span>
      </div>
      <div class="cards">${list.slice(0, 3).map(cardHTML).join("")}</div>`;
  }).join("");

  return `
    <section class="hero frame reveal"><span class="cb"></span>
      <div class="sys">SIGNAL ACQUIRED · PERSONAL TECH ARCHIVE</div>
      <h1>你好，我是 <span class="glow">${esc(SITE.owner)}</span><br>这是我的<span class="glow">技术档案库</span><span class="cursor"></span></h1>
      <p class="tagline" id="typewriter" data-text="${esc(SITE.motto)}"></p>
      <div class="quick">
        <a class="primary" href="#/projects">▸ 开源项目进展</a>
        <a href="#/tech">▸ 技术分享</a>
        <a href="#/math">▸ 数学笔记</a>
        <a href="${esc(SITE.github)}" target="_blank" rel="noopener">▸ GITHUB ↗</a>
      </div>
    </section>
    <div class="section-head reveal">
      <span class="code">LATEST</span>
      <h2>最新发布</h2>
      <span class="count">${total} ENTRIES TOTAL</span>
    </div>
    <div class="cards">${latest.map(cardHTML).join("")}</div>
    ${sections}`;
}

function viewList(cat, query = "", tag = "") {
  const c = CATEGORY[cat];
  let list = postsBy(cat);
  const allTags = [...new Set(list.flatMap((p) => p.tags || []))];
  if (tag) list = list.filter((p) => (p.tags || []).includes(tag));
  if (query) {
    const q = query.toLowerCase();
    list = list.filter((p) =>
      (p.title + p.summary + (p.tags || []).join(" ")).toLowerCase().includes(q));
  }
  return `
    <div class="section-head">
      <span class="code">${c.code}</span>
      <h2>${c.label}</h2>
      <span class="count">${list.length} / ${postsBy(cat).length} ENTRIES</span>
    </div>
    <div class="toolbar">
      <div class="search"><span>⌕</span><input id="searchInput" placeholder="搜索标题 / 摘要 / 标签…" value="${esc(query)}"></div>
      ${allTags.map((t) => `<button class="tag${t === tag ? " active" : ""}" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}
    </div>
    <div class="cards" id="listCards">
      ${list.length ? list.map(cardHTML).join("") : `<div class="empty">// NO MATCHING RECORDS //</div>`}
    </div>`;
}

async function viewPost(slug) {
  const p = POSTS.find((x) => x.slug === slug);
  if (!p) return `<div class="empty">// 404 · RECORD NOT FOUND //</div>`;
  const md = await fetchText(`content/posts/${p.file}`);
  const body = renderMarkdown(md);
  const siblings = postsBy(p.category);
  const i = siblings.findIndex((x) => x.slug === slug);
  const prev = siblings[i + 1];
  const next = siblings[i - 1];
  const c = CATEGORY[p.category];
  return `
    <article>
      <div class="post-head">
        <div class="meta">
          <span class="cat ${c.cls}" style="border:1px solid;padding:1px 8px;">${c.label}</span>
          <span>DATE: ${p.date}</span>
          <span>${p.reading || ""}</span>
          <span>ID: ${p.slug}</span>
        </div>
        <h1>${esc(p.title)}</h1>
        <div class="tags">${(p.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
      </div>
      <div class="post-body frame"><span class="cb"></span>${body}</div>
      <nav class="post-nav">
        ${prev ? `<a href="#/post/${prev.slug}">◂ ${esc(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a href="#/post/${next.slug}">${esc(next.title)} ▸</a>` : "<span></span>"}
      </nav>
    </article>`;
}

async function viewAbout() {
  let md = "";
  try { md = await fetchText("content/about.md"); } catch { md = "# 关于\n\n这里还没有内容。"; }
  return `<div class="post-body frame"><span class="cb"></span>${renderMarkdown(md)}</div>`;
}

/* ============ 交互增强 ============ */
function typewriter() {
  const el = $("#typewriter");
  if (!el) return;
  const text = el.dataset.text;
  let i = 0;
  const tick = () => {
    if (i <= text.length) {
      el.textContent = text.slice(0, i++);
      setTimeout(tick, 34);
    }
  };
  tick();
}

function observeReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.06 });
  $$(".reveal").forEach((el) => io.observe(el));
}

function bindListInteractions(cat) {
  const input = $("#searchInput");
  if (input) {
    let t;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const tag = $(".tag.active")?.dataset.tag || "";
        renderList(cat, input.value.trim(), tag, false);
        const ni = $("#searchInput");
        ni.focus();
        ni.setSelectionRange(ni.value.length, ni.value.length);
      }, 200);
    });
  }
  $$(".toolbar .tag").forEach((btn) =>
    btn.addEventListener("click", () => {
      const active = btn.classList.contains("active");
      renderList(cat, input ? input.value.trim() : "", active ? "" : btn.dataset.tag, false);
    }));
}

/* ============ 路由 ============ */
async function renderList(cat, query, tag, full = true) {
  const html = viewList(cat, query, tag);
  if (full) $("#app").innerHTML = html;
  else $("#app").innerHTML = html;
  bindListInteractions(cat);
  observeReveals();
}

async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [page, arg] = hash.split("/");
  const app = $("#app");

  $$("#nav a").forEach((a) => {
    const r = a.dataset.route;
    a.classList.toggle("active",
      (r === "home" && !page) || r === page || (page === "post" && r === currentPostCategoryRoute));
  });

  window.scrollTo({ top: 0 });
  try {
    if (!page) {
      app.innerHTML = viewHome();
      typewriter();
    } else if (CATEGORY[page] || page === "projects" || page === "tech" || page === "math") {
      const cat = page === "projects" ? "project" : page === "tech" ? "tech" : "math";
      app.innerHTML = viewList(cat);
      bindListInteractions(cat);
    } else if (page === "post" && arg) {
      const p = POSTS.find((x) => x.slug === arg);
      currentPostCategoryRoute = p ? CATEGORY[p.category].route : null;
      app.innerHTML = `<div class="boot">DECRYPTING RECORD </div>`;
      app.innerHTML = await viewPost(arg);
      // 重新设置导航高亮（此时分类已知）
      $$("#nav a").forEach((a) =>
        a.classList.toggle("active", a.dataset.route === currentPostCategoryRoute));
    } else if (page === "about") {
      app.innerHTML = await viewAbout();
    } else {
      app.innerHTML = `<div class="empty">// 404 · UNKNOWN ROUTE: ${esc(page)} //</div>`;
    }
  } catch (err) {
    app.innerHTML = `<div class="empty">// ERROR · ${esc(String(err))} //</div>`;
    console.error(err);
  }
  observeReveals();
}

let currentPostCategoryRoute = null;

/* ============ 主题 ============ */
function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.dataset.theme = saved;
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
  });
}

/* ============ 启动 ============ */
(async function boot() {
  initTheme();
  $("#statusDate").textContent = new Date().toISOString().slice(0, 10);
  $("#footerYear").textContent = "© " + new Date().getFullYear();
  try {
    POSTS = await fetchJSON("content/posts.json");
    $("#statusCount").textContent = `RECORDS: ${POSTS.length}`;
  } catch (e) {
    $("#app").innerHTML = `<div class="empty">// 无法加载 content/posts.json — 请通过本地服务器访问（见 README）<br>${esc(String(e))}</div>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
})();
