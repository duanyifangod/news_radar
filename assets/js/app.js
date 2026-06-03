import { SECTION_ORDER, STORAGE_KEYS } from "./config.js";
import { loadManifest, loadNewsData } from "./data-loader.js";
import { createRenderer } from "./renderer.js";
import { $, readStorage, writeStorage } from "./utils.js";

const state = {
  lang: "zh",
  dates: [],
  date: "",
  data: null,
  section: "all",
  query: "",
  open: new Set(),
};

const renderer = createRenderer(state, { loadDate, setSection });

function getHash() {
  const [date, section] = location.hash.slice(1).split("/");
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    section: section && (section === "all" || SECTION_ORDER.includes(section)) ? section : null,
  };
}

function pushHash() {
  history.replaceState(null, "", `#${state.date}/${state.section}`);
}

function setLanguage(lang) {
  state.lang = lang;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  $("zhBtn").classList.toggle("active", lang === "zh");
  $("enBtn").classList.toggle("active", lang === "en");
  writeStorage(STORAGE_KEYS.lang, lang);
  renderer.renderAll();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writeStorage(STORAGE_KEYS.theme, theme);
}

function setSection(section) {
  state.section = section;
  pushHash();
  renderer.renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadDate(date) {
  state.date = date;
  state.open.clear();
  pushHash();
  renderer.renderLoading();

  try {
    state.data = await loadNewsData(date);
    renderer.renderAll();
  } catch (err) {
    renderer.renderError(err);
  }
}

function expandAll() {
  if (!state.data || state.section === "all") return;
  const subs = state.data.sections[state.section]?.subcategories || {};
  for (const sub of Object.keys(subs)) state.open.add(renderer.subKey(state.section, sub));
  renderer.renderMain();
}

function collapseAll() {
  state.open.clear();
  renderer.renderMain();
}

function bindControls() {
  $("zhBtn").onclick = () => setLanguage("zh");
  $("enBtn").onclick = () => setLanguage("en");
  $("themeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("expandBtn").onclick = expandAll;
  $("collapseBtn").onclick = collapseAll;
  $("searchInput").oninput = (event) => {
    state.query = event.target.value;
    if (state.section !== "all") renderer.renderMain();
  };

  window.addEventListener("hashchange", () => {
    const { date, section } = getHash();
    if (section) {
      state.section = section;
      renderer.renderAll();
    }
    if (date && date !== state.date) loadDate(date);
  });
}

async function init() {
  bindControls();
  setTheme(readStorage(STORAGE_KEYS.theme, "light"));
  state.lang = readStorage(STORAGE_KEYS.lang, "zh");

  try {
    state.dates = await loadManifest();
    if (!state.dates.length) throw new Error("manifest.json 中没有 news-* 报告，请先运行 pnpm daily 或 pnpm manifest");

    const { date: hashDate, section: hashSection } = getHash();
    state.section = hashSection || "all";
    state.date = hashDate || state.dates[0].date;
    history.replaceState(null, "", `#${state.date}/${state.section}`);
    setLanguage(state.lang);
    await loadDate(state.date);
  } catch (err) {
    renderer.renderError(err);
  }
}

init();
