import "dotenv/config";

import { type Lang } from "../shared/i18n.ts";
import {
  buildSectionBundlePrompt,
  fetchNewsData,
  SECTION_LABELS,
  type NewsData,
  type NewsSection,
} from "../collectors/news.ts";
import { buildHighlightsPrompt, type ReportHighlights } from "../reports/prompts-data.ts";
import { callLlm, saveFile, autoGenFooter } from "../reports/report.ts";
import { toCstDateStr, toUtcStr } from "../shared/date.ts";

const SECTION_ORDER: NewsSection[] = ["economy", "society", "military", "tech", "sports", "entertainment"];

interface SectionBundle {
  section_brief: string;
  desk_briefs: Record<string, string>;
}

function stripFences(text: string): string {
  return text.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
}

function safeParseBundle(raw: string, fallbackKeys: string[]): SectionBundle {
  try {
    const parsed = JSON.parse(stripFences(raw)) as Partial<SectionBundle>;
    return {
      section_brief: typeof parsed.section_brief === "string" ? parsed.section_brief : "",
      desk_briefs: parsed.desk_briefs && typeof parsed.desk_briefs === "object"
        ? Object.fromEntries(fallbackKeys.map((k) => [k, parsed.desk_briefs![k] ?? ""]))
        : Object.fromEntries(fallbackKeys.map((k) => [k, ""])),
    };
  } catch {
    return { section_brief: "", desk_briefs: Object.fromEntries(fallbackKeys.map((k) => [k, ""])) };
  }
}

async function generateSectionBundles(data: NewsData): Promise<void> {
  const sectionResult: Record<string, Record<Lang, string>> = {};
  const subResult: Record<string, Record<string, Record<Lang, string>>> = {};
  const tasks: Array<Promise<void>> = [];

  const t0 = Date.now();
  for (const section of SECTION_ORDER) {
    const sectionData = data.sections[section];
    if (!sectionData || sectionData.count === 0) continue;
    const subKeys = Object.keys(sectionData.subcategories).filter((k) => sectionData.subcategories[k]!.length > 0);
    sectionResult[section] = { zh: "", en: "" };
    subResult[section] = Object.fromEntries(subKeys.map((k) => [k, { zh: "", en: "" } as Record<Lang, string>]));

    for (const lang of ["zh", "en"] as const) {
      console.log(`  [${section}/${lang}] queueing section bundle`);
      tasks.push(
        (async () => {
          const t1 = Date.now();
          const raw = await callLlm(buildSectionBundlePrompt(data, section, lang), 8192);
          const bundle = safeParseBundle(raw, subKeys);
          sectionResult[section]![lang] = bundle.section_brief.trim();
          for (const key of subKeys) {
            subResult[section]![key]![lang] = (bundle.desk_briefs[key] ?? "").trim();
          }
          console.log(`  [${section}/${lang}] done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
        })(),
      );
    }
  }

  await Promise.all(tasks);
  console.log(`  All section bundles ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  data.sectionSummaries = sectionResult as NewsData["sectionSummaries"];
  data.subcategorySummaries = subResult as NewsData["subcategorySummaries"];
}

function buildSectionMarkdown(data: NewsData, section: NewsSection, utcStr: string, lang: Lang): string {
  const sectionData = data.sections[section];
  if (!sectionData || sectionData.count === 0) return "";
  const labels = lang === "en"
    ? { brief: "Editor's Brief", item: "items", source: "Source", noSummary: "No AI summary." }
    : { brief: "板块速览", item: "条", source: "信源", noSummary: "暂无摘要。" };
  const sectionLabel = SECTION_LABELS[section];
  const title = lang === "en" ? `News Radar — ${sectionLabel}` : `多频道新闻雷达 — ${sectionLabel}`;
  const meta = lang === "en"
    ? `> ${data.date} · Window: ${data.windowHours}h · Items: ${sectionData.count} · Generated: ${utcStr} UTC`
    : `> ${data.date} · 窗口: ${data.windowHours}h · 条目: ${sectionData.count} · 生成时间: ${utcStr} UTC`;

  const parts: string[] = [`# ${title}\n`, `${meta}\n`, `---\n`];

  const sectionBrief = data.sectionSummaries?.[section]?.[lang]?.trim() || labels.noSummary;
  parts.push(`## ${labels.brief}\n`, `${sectionBrief}\n`, `---\n`);

  for (const [subcategory, items] of Object.entries(sectionData.subcategories)) {
    if (!items.length) continue;
    parts.push(`## ${subcategory} · ${items.length} ${labels.item}\n`);
    const subBrief = data.subcategorySummaries?.[section]?.[subcategory]?.[lang]?.trim() || labels.noSummary;
    parts.push(`${subBrief}\n`);
    parts.push(`<details><summary>${labels.source} (${items.length})</summary>\n`);
    for (const item of items.slice(0, 14)) {
      const date = item.publishedAt ? item.publishedAt.slice(0, 16).replace("T", " ") + " UTC" : "";
      parts.push(`- [${item.title}](${item.url}) — ${item.source}${date ? ` · ${date}` : ""}`);
    }
    parts.push(`\n</details>\n`);
  }

  parts.push(autoGenFooter(lang));
  return parts.join("\n");
}

async function generateHighlights(perSection: Record<string, { zh: string; en: string }>): Promise<{ zh: ReportHighlights; en: ReportHighlights }> {
  const zhInputs: Record<string, string> = {};
  const enInputs: Record<string, string> = {};
  for (const [section, both] of Object.entries(perSection)) {
    if (both.zh) zhInputs[`news-${section}`] = both.zh;
    if (both.en) enInputs[`news-${section}-en`] = both.en;
  }
  const t0 = Date.now();
  const [zhRaw, enRaw] = await Promise.all([
    callLlm(buildHighlightsPrompt(zhInputs, "zh", 5), 1024),
    callLlm(buildHighlightsPrompt(enInputs, "en", 5), 1024),
  ]);
  console.log(`  Highlights generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const zh = JSON.parse(stripFences(zhRaw)) as ReportHighlights;
  const en = JSON.parse(stripFences(enRaw)) as ReportHighlights;
  return { zh, en };
}

async function main(): Promise<void> {
  const now = new Date();
  const windowHours = Number(process.env["NEWS_WINDOW_HOURS"] ?? 24);
  const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const dateStr = toCstDateStr(now);
  const utcStr = toUtcStr(now);

  console.log(`[${now.toISOString()}] Local news pipeline · window=${windowHours}h`);
  const tFetch = Date.now();
  const data = await fetchNewsData(dateStr, since, windowHours);
  console.log(`  Fetched ${data.items.length} items from ${data.sources.filter((s) => s.count > 0).length}/${data.sources.length} sources in ${((Date.now() - tFetch) / 1000).toFixed(1)}s`);
  if (data.items.length === 0) throw new Error("No news items fetched.");

  await generateSectionBundles(data);

  // Per-section markdown files (no combined news-daily.md)
  const perSection: Record<string, { zh: string; en: string }> = {};
  for (const section of SECTION_ORDER) {
    const zh = buildSectionMarkdown(data, section, utcStr, "zh");
    const en = buildSectionMarkdown(data, section, utcStr, "en");
    if (!zh && !en) continue;
    perSection[section] = { zh, en };
    if (zh) console.log(`  Saved ${saveFile(zh, dateStr, `news-${section}.md`)}`);
    if (en) console.log(`  Saved ${saveFile(en, dateStr, `news-${section}-en.md`)}`);
  }

  // Highlights via existing mechanism
  try {
    const highlights = await generateHighlights(perSection);
    console.log(`  Saved ${saveFile(JSON.stringify(highlights, null, 2), dateStr, "highlights.json")}`);
    data.highlights = highlights;
  } catch (err) {
    console.error(`  [highlights] failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`  Saved ${saveFile(JSON.stringify(data, null, 2), dateStr, "news-data.json")}`);
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
