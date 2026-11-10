(() => {
  const $ = (selector) => document.querySelector(selector);
  const grid = $("#article-grid");
  const featured = $("#featured");
  const empty = $("#empty");
  const search = $("#search");
  const filters = $("#filters");
  const menuToggle = $(".menu-toggle");
  const nav = $(".nav");
  let articles = [];
  let activeCategory = "All";

  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));

  function articleCard(article) {
    return `<article class="article-card">
      <div class="article-card-top"><span class="article-label">${escapeHTML(article.category)}</span><span class="article-meta">${escapeHTML(article.readTime)}</span></div>
      <h3>${escapeHTML(article.title)}</h3>
      <p>${escapeHTML(article.excerpt)}</p>
      <div class="article-card-bottom"><span class="article-meta">${escapeHTML(article.date)}</span><button class="read-link" type="button" data-open-article="${escapeHTML(article.id)}">Read article <span>↗</span></button></div>
    </article>`;
  }

  function render() {
    const term = (search?.value || "").trim().toLowerCase();
    const visible = articles.filter(a => (activeCategory === "All" || a.category === activeCategory) &&
      [a.title, a.excerpt, a.category, ...(a.content || [])].join(" ").toLowerCase().includes(term));
    if (grid) grid.innerHTML = visible.slice(1).map(articleCard).join("");
    if (featured) {
      const first = visible[0];
      featured.innerHTML = first ? `<article class="featured-card">
        <div class="featured-copy"><span class="article-label">FEATURED · ${escapeHTML(first.category)}</span>
        <div class="article-meta">${escapeHTML(first.date)} · ${escapeHTML(first.readTime)}</div>
        <h3>${escapeHTML(first.title)}</h3><p>${escapeHTML(first.excerpt)}</p>
        <button class="read-link" type="button" data-open-article="${escapeHTML(first.id)}">Read the insight <span>↗</span></button></div>
        <div class="featured-visual"><div class="visual-ring"></div><div class="visual-orb">✳</div></div>
      </article>` : "";
    }
    if (empty) empty.hidden = visible.length !== 0;
  }

  function openArticle(id) {
    const article = articles.find(a => a.id === id);
    if (!article) return;
    const body = (article.content || []).map(p => `<p>${escapeHTML(p)}</p>`).join("");
    const overlay = document.createElement("div");
    overlay.className = "article-modal";
    overlay.innerHTML = `<div class="article-modal-backdrop" data-close></div><article class="article-modal-panel" role="dialog" aria-modal="true" aria-label="Article">
      <button class="article-modal-close" type="button" aria-label="Close" data-close>×</button>
      <span class="article-label">${escapeHTML(article.category)}</span><div class="article-meta">${escapeHTML(article.date)} · ${escapeHTML(article.readTime)}</div>
      <h2>${escapeHTML(article.title)}</h2><p class="article-intro">${escapeHTML(article.excerpt)}</p>${body}
      <button class="read-link" type="button" data-share>Share this article ↗</button></article>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    overlay.addEventListener("click", async event => {
      if (event.target.closest("[data-close]")) { overlay.remove(); document.body.classList.remove("modal-open"); }
      if (event.target.closest("[data-share]")) {
        const shareData = {title: article.title, text: article.excerpt, url: location.href.split("#")[0] + "#articles"};
        if (navigator.share) { try { await navigator.share(shareData); } catch (_) {} }
        else if (navigator.clipboard) { try { await navigator.clipboard.writeText(shareData.url); alert("Article link copied."); } catch (_) {} }
      }
    });
  }

  filters?.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category || "All";
    filters.querySelectorAll(".filter").forEach(el => el.classList.toggle("active", el === button));
    render();
  });
  search?.addEventListener("input", render);
  document.addEventListener("click", event => {
    const open = event.target.closest("[data-open-article]");
    if (open) openArticle(open.dataset.openArticle);
    const jump = event.target.closest("[data-jump]");
    if (jump) {
      activeCategory = jump.dataset.jump;
      filters?.querySelectorAll(".filter").forEach(el => el.classList.toggle("active", el.dataset.category === activeCategory));
      render();
    }
    const navLink = event.target.closest(".nav a");
    if (navLink) { nav?.classList.remove("open"); menuToggle?.setAttribute("aria-expanded", "false"); }
  });

  menuToggle?.addEventListener("click", () => {
    const isOpen = nav?.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
  });

  $("#newsletter-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const email = $("#email")?.value?.trim();
    if (!email) return;
    const subject = encodeURIComponent("Please subscribe me to Blink Growth Notes");
    const body = encodeURIComponent("Please add this email address to the newsletter: " + email);
    location.href = "mailto:info@yourdomain.com?subject=" + subject + "&body=" + body;
  });

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  fetch("assets/articles.json")
    .then(response => { if (!response.ok) throw new Error("Could not load articles"); return response.json(); })
    .then(data => { articles = Array.isArray(data) ? data : []; render(); })
    .catch(error => { console.error(error); if (empty) { empty.hidden = false; empty.textContent = "Articles could not be loaded. Please refresh the page."; } });
})();