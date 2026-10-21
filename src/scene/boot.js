/* 黑洞场景与 DOM 的桥接:DOM 标签(可选中/可聚焦)每帧由场景同步位置。
   场景引擎本体在同目录 scene3d.js(纯 three,不依赖 Astro)。 */
import "./scene3d.js";
import { CATEGORY } from "../config/site";

export function mountBlackHole() {
  const mount = document.querySelector("#sceneMount");
  if (!mount) return;

  const fail = () => mount.parentElement.classList.add("scene-fallback");
  if (!window.AstraScene) { fail(); return; }

  const counter = document.querySelector("#absorbCount");
  const nodes = [...document.querySelectorAll(".scene-node")].map((el) => ({
    el,
    domain: el.dataset.domain,
    glyph: CATEGORY[el.dataset.domain].glyph,
    idx: CATEGORY[el.dataset.domain].idx,
  }));

  const ok = window.AstraScene.mount(mount, {
    nodes,
    onAbsorb: (n) => { if (counter) counter.textContent = n; },
  });
  if (!ok) { fail(); return; }

  nodes.forEach((n) => {
    n.el.addEventListener("mouseenter", () => window.AstraScene.hover(n.domain));
    n.el.addEventListener("mouseleave", () => window.AstraScene.hover(null));
    n.el.addEventListener("click", (e) => {
      e.preventDefault();
      window.AstraScene.select(n.domain, () => { location.href = n.el.href; });
    });
  });
}
