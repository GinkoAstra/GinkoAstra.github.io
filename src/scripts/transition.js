/* 解密转场:#wipe 在 HTML 中以遮盖态静态渲染,脚本就绪后播"展开"。
   bfcache 恢复时同样重播,保持档案解密的一致观感。 */
function reveal() {
  const el = document.getElementById("wipe");
  if (!el) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.classList.add("reveal");
      setTimeout(() => el.classList.remove("on", "reveal"), 650);
    })
  );
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", reveal, { once: true });
} else {
  reveal();
}
window.addEventListener("pageshow", (e) => { if (e.persisted) reveal(); });
