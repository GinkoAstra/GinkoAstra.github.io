/* 列表页交互:搜索 + 标签过滤 + 滚动揭示。卡片已在构建期全量渲染,这里只做显隐。 */
export function initListPage() {
  const input = document.getElementById("searchInput");
  const cards = [...document.querySelectorAll("#listCards .card")];
  const tagBtns = [...document.querySelectorAll(".toolbar .tag")];
  const empty = document.getElementById("listEmpty");
  const shown = document.getElementById("shownCount");
  let tag = "";

  const apply = () => {
    const q = (input?.value || "").trim().toLowerCase();
    let n = 0;
    cards.forEach((c) => {
      const hit =
        (!q || c.dataset.search.includes(q)) &&
        (!tag || c.dataset.tags.split("|").includes(tag));
      c.style.display = hit ? "" : "none";
      if (hit) n++;
    });
    if (empty) empty.style.display = n ? "none" : "";
    if (shown) shown.textContent = n;
  };

  let timer;
  input?.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 180);
  });
  tagBtns.forEach((b) =>
    b.addEventListener("click", () => {
      tag = b.classList.contains("active") ? "" : b.dataset.tag;
      tagBtns.forEach((x) => x.classList.toggle("active", x === b && !!tag));
      apply();
    })
  );

  const io = new IntersectionObserver(
    (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { threshold: 0.06 }
  );
  cards.forEach((c) => io.observe(c));
}
