/* 主题切换:暗色(默认) ↔ 纸墨星图(亮);首页场景同步播主题波。 */
const btn = document.getElementById("themeToggle");
btn?.addEventListener("click", (e) => {
  const next = document.documentElement.dataset.theme === "light" ? "" : "light";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch {}
  window.AstraScene?.themeWave(next === "light", e.clientX, e.clientY);
});
