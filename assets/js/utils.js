export const $ = (id) => document.getElementById(id);

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export const escapeAttr = escapeHtml;

export function fmtDate(iso) {
  return iso ? iso.slice(5, 16).replace("T", " ") : "";
}

export function renderMarkdown(raw = "") {
  if (!window.marked || !window.DOMPurify) {
    return `<p>${escapeHtml(raw)}</p>`;
  }
  return window.DOMPurify.sanitize(window.marked.parse(raw || ""));
}

export function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be disabled by browser policy; rendering should still work.
  }
}

export function normalizeJsonError(label, url, res) {
  return new Error(`${label} 加载失败：HTTP ${res.status} ${res.statusText || ""} (${url})`.trim());
}
