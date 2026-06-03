import { I18N, SECTION_ORDER } from "./config.js";
import { $, escapeAttr, escapeHtml, fmtDate, renderMarkdown } from "./utils.js";

export function createRenderer(state, actions) {
  const t = () => I18N[state.lang];
  const allItems = () => state.data?.items || [];
  const sectionItems = (section) => allItems().filter((item) => item.section === section);
  const subKey = (section, sub) => `${section}::${sub}`;

  function deskItems(section, sub) {
    const q = state.query.trim().toLowerCase();
    return allItems().filter((item) => {
      if (item.section !== section || item.subcategory !== sub) return false;
      if (!q) return true;
      return [item.title, item.summary, item.source, item.region, ...(item.tags || [])].join(" ").toLowerCase().includes(q);
    });
  }

  function renderMasthead() {
    const L = t();
    $("tagline").textContent = L.tagline;
    $("searchInput").placeholder = L.search;
    $("footer").textContent = L.footer;
    $("sideArchiveLabel").textContent = L.archive;
    $("sideFoot").textContent = L.sideFoot;
    $("sideCount").textContent = `${state.dates.length} ${L.editions}`;

    const issueIdx = state.dates.findIndex((entry) => entry.date === state.date);
    const ordinal = issueIdx >= 0 ? String(state.dates.length - issueIdx).padStart(2, "0") : "00";
    $("sideVol").textContent = `VOL. I — №${ordinal}`;
    $("volLine").textContent = `${L.vol} · №${ordinal} · ${state.date || "—"}`;

    const d = state.date ? new Date(`${state.date}T00:00:00Z`) : null;
    $("dateLine").textContent = d
      ? d.toLocaleDateString(state.lang === "zh" ? "zh-CN" : "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "—";

    if (state.data) {
      const active = state.data.sources.filter((source) => source.count > 0).length;
      $("statLine").textContent = `${allItems().length} ${L.items} · ${active}/${state.data.sources.length} ${L.sources}`;
    } else {
      $("statLine").textContent = "—";
    }
  }

  function renderSidebar() {
    const L = t();
    $("dateList").innerHTML = state.dates.map((entry) => {
      const d = new Date(`${entry.date}T00:00:00Z`);
      const day = entry.date.slice(8);
      const monthStr = L.month[Number(entry.date.slice(5, 7)) - 1];
      return `<li><button class="side-date ${entry.date === state.date ? "active" : ""}" data-date="${entry.date}">
        <span class="num">${day}</span><span class="month">${monthStr}</span><span class="wd">${L.weekday[d.getUTCDay()]}</span>
      </button></li>`;
    }).join("");

    $("dateList").querySelectorAll(".side-date").forEach((button) => {
      button.onclick = () => actions.loadDate(button.dataset.date);
    });
  }

  function renderNav() {
    const L = t();
    const counts = { all: allItems().length };
    SECTION_ORDER.forEach((section) => counts[section] = sectionItems(section).length);
    $("secnav").innerHTML = ["all", ...SECTION_ORDER].map((section) => `
      <button class="${state.section === section ? "active" : ""}" data-section="${section}">${L.secLabels[section]}<span class="count">${counts[section] || 0}</span></button>
    `).join("");

    $("secnav").querySelectorAll("button").forEach((button) => {
      button.onclick = () => actions.setSection(button.dataset.section);
    });
  }

  function renderStats() {
    const L = t();
    if (!state.data) {
      $("stats").innerHTML = "";
      return;
    }
    const active = state.data.sources.filter((source) => source.count > 0).length;
    $("stats").innerHTML = `
      <div class="stat"><b>${allItems().length}</b><span>${L.items}</span></div>
      <div class="stat"><b>${active}</b><span>${L.sources}</span></div>
      <div class="stat"><b>${state.data.failures.length}</b><span>${L.failures}</span></div>
      <div class="stat"><b>${state.data.windowHours}${L.windowH}</b><span>${L.window}</span></div>
    `;
  }

  function thumb(item) {
    if (item.image) {
      return `<img class="article-img" src="${escapeAttr(item.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'article-img placeholder',textContent:'§'}))">`;
    }
    return `<div class="article-img placeholder">§</div>`;
  }

  function renderAllView() {
    const L = t();
    const items = allItems();
    const top = items[0];
    const sideTop = items.slice(1, 5);
    const moreTop = items.slice(5, 10);
    let html = "";

    if (top) {
      html += `<section class="front-lede">
        <div class="front-col">
          <div class="front-col-title"><b>● ${L.topStory}</b></div>
          <ul class="lede-list">
            ${sideTop.map((item) => `<li>
              <div class="byline"><span class="acc">${escapeHtml(item.source)}</span></div>
              <h4><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h4>
              <div class="meta">${escapeHtml(item.subcategory)}<span class="sep">/</span>${fmtDate(item.publishedAt)}</div>
            </li>`).join("")}
          </ul>
        </div>
        <div class="front-col lede-hero">
          <div class="front-col-title">${escapeHtml(L.secLabels[top.section] || "")} <b>· ${L.topStory}</b></div>
          ${top.image ? `<img src="${escapeAttr(top.image)}" alt="" onerror="this.style.display='none'">` : ""}
          <div class="byline"><span class="acc">${escapeHtml(top.source)}</span> &nbsp;·&nbsp; ${fmtDate(top.publishedAt)}</div>
          <h2><a href="${escapeAttr(top.url)}" target="_blank" rel="noopener">${escapeHtml(top.title)}</a></h2>
          <p class="deck">${escapeHtml(top.summary || "")}</p>
          <div class="byline">${escapeHtml(top.subcategory)} &nbsp;·&nbsp; ${escapeHtml(top.region || "")}</div>
        </div>
        <div class="front-col">
          <div class="front-col-title"><b>${L.moreStories}</b></div>
          <ul class="lede-list">
            ${moreTop.map((item) => `<li>
              <div class="byline"><span class="acc">${escapeHtml(item.source)}</span></div>
              <h4><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h4>
              <div class="meta">${escapeHtml(L.secLabels[item.section] || "")}<span class="sep">/</span>${fmtDate(item.publishedAt)}</div>
            </li>`).join("")}
          </ul>
        </div>
      </section>`;
    }

    const cards = SECTION_ORDER.map((section, idx) => {
      const sectionData = state.data.sections[section];
      if (!sectionData || sectionData.count === 0) return "";
      const brief = state.data.sectionSummaries?.[section]?.[state.lang]?.trim() || L.noSummary;
      const num = String(idx + 1).padStart(2, "0");
      return `<article class="overview-card">
        <header class="overview-head">
          <h2><span class="num">№ ${num}</span>${L.secLabels[section]}</h2>
          <button class="more" data-section="${section}">${L.viewSection}</button>
        </header>
        <div class="overview-meta">${escapeHtml(sectionData.label)} · ${sectionData.count} ${L.items} · ${Object.keys(sectionData.subcategories).length} desks</div>
        <div class="md">${renderMarkdown(brief)}</div>
      </article>`;
    }).filter(Boolean).join("");

    $("mount").innerHTML = `${html}<section class="overview">${cards}</section>`;
    $("mount").querySelectorAll(".overview-head .more").forEach((button) => {
      button.onclick = () => actions.setSection(button.dataset.section);
    });
  }

  function renderSectionView(section) {
    const L = t();
    const sectionData = state.data.sections[section];
    if (!sectionData || sectionData.count === 0) {
      $("mount").innerHTML = `<div class="empty">${L.noItems}</div>`;
      return;
    }

    const sectionBrief = state.data.sectionSummaries?.[section]?.[state.lang]?.trim() || L.noSummary;
    const num = String(SECTION_ORDER.indexOf(section) + 1).padStart(2, "0");
    const subs = Object.entries(sectionData.subcategories).filter(([sub]) => deskItems(section, sub).length);

    $("mount").innerHTML = `<section class="section">
      <header class="section-head">
        <h2><span class="num">№ ${num}</span>${L.secLabels[section]}</h2>
        <span class="meta">${escapeHtml(sectionData.label)} · ${subs.length} desks · ${sectionData.count} ${L.items}</span>
      </header>
      <div class="section-brief">
        <div class="brief-label">${L.briefLabel}<span class="small">${L.briefSub}</span></div>
        <div class="md">${renderMarkdown(sectionBrief)}</div>
      </div>
      ${subs.map(([sub], idx) => renderDesk(section, sub, idx)).join("")}
    </section>`;

    $("mount").querySelectorAll(".sub-head").forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.key;
        const subEl = button.parentElement;
        if (state.open.has(key)) {
          state.open.delete(key);
          subEl.classList.remove("open");
        } else {
          state.open.add(key);
          subEl.classList.add("open");
        }
      };
    });
  }

  function renderDesk(section, sub, idx) {
    const L = t();
    const items = deskItems(section, sub);
    const key = subKey(section, sub);
    const deskBrief = state.data.subcategorySummaries?.[section]?.[sub]?.[state.lang]?.trim() || L.noSummary;
    const subNum = String(idx + 1).padStart(2, "0");
    return `<div class="sub ${state.open.has(key) ? "open" : ""}">
      <button class="sub-head" type="button" data-key="${escapeAttr(key)}">
        <span class="sub-num">№ ${subNum}</span>
        <h3>${escapeHtml(sub)}</h3>
        <span class="ct">${items.length} ${L.items}</span>
        <span class="toggle">+</span>
      </button>
      <div class="sub-body">
        <div class="desk-brief">
          <div class="desk-brief-label">${L.deskLabel}<span class="small">${L.deskSub}</span></div>
          <div class="md">${renderMarkdown(deskBrief)}</div>
        </div>
        <div class="articles">${items.map(renderArticle).join("")}</div>
      </div>
    </div>`;
  }

  function renderArticle(item) {
    return `<article class="article">
      ${thumb(item)}
      <div>
        <h4><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h4>
        ${item.summary ? `<div class="desc">${escapeHtml(item.summary)}</div>` : ""}
        <div class="article-meta">
          <span class="src">${escapeHtml(item.source)}</span><span class="sep">/</span>${escapeHtml(item.region || "")}<span class="sep">/</span>${fmtDate(item.publishedAt)}
        </div>
      </div>
    </article>`;
  }

  function renderMain() {
    if (!state.data) return;
    if (state.section === "all") renderAllView();
    else renderSectionView(state.section);
  }

  function renderAll() {
    renderMasthead();
    renderSidebar();
    if (!state.data) return;
    renderNav();
    renderStats();
    renderMain();
  }

  function renderLoading() {
    $("mount").innerHTML = `<div class="empty">${t().loading}</div>`;
    renderMasthead();
    renderSidebar();
  }

  function renderError(err) {
    $("mount").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }

  return { renderAll, renderMain, renderLoading, renderError, subKey };
}
