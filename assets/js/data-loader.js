import { normalizeJsonError } from "./utils.js";

function resourceUrl(path) {
  return new URL(path, document.baseURI).href;
}

async function fetchJson(path, label) {
  const url = resourceUrl(path);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw normalizeJsonError(label, url, res);

  try {
    return await res.json();
  } catch (err) {
    throw new Error(`${label} 不是有效 JSON：${url} (${err.message})`);
  }
}

export async function loadManifest() {
  const manifest = await fetchJson("manifest.json", "manifest.json");
  const dates = Array.isArray(manifest.dates) ? manifest.dates : [];
  return dates.filter((entry) => (entry.reports || []).some((report) => report.startsWith("news-")));
}

export async function loadNewsData(date) {
  return fetchJson(`digests/${date}/news-data.json`, `${date} news-data.json`);
}
