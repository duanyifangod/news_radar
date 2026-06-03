import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { Lang } from "../shared/i18n.ts";

export type NewsSection = "economy" | "society" | "military" | "tech" | "sports" | "entertainment";

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  section: NewsSection;
  subcategory: string;
  region: string;
  lang?: string;
  limit?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceId: string;
  section: NewsSection;
  sectionLabel: string;
  subcategory: string;
  region: string;
  lang?: string;
  publishedAt?: string;
  summary?: string;
  image?: string;
  tags: string[];
  score: number;
}

function extractImage(block: string): string | undefined {
  // media:thumbnail / media:content url=""
  const media = block.match(/<media:(?:thumbnail|content)\b[^>]*url=["']([^"']+)["']/i)?.[1];
  if (media) return media;
  // <enclosure url="" type="image/...">
  const enc = block.match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["']/i)?.[1];
  if (enc) return enc;
  // <image><url>...</url></image>
  const img = block.match(/<image\b[^>]*>[\s\S]*?<url>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i)?.[1];
  if (img) return cleanText(img);
  // first <img src=""> in description / content
  const inline = block.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1];
  if (inline) return decodeEntities(inline);
  return undefined;
}

export interface NewsData {
  generatedAt: string;
  date: string;
  windowHours: number;
  items: NewsItem[];
  sections: Record<NewsSection, { label: string; count: number; subcategories: Record<string, NewsItem[]> }>;
  sectionSummaries?: Record<NewsSection, Record<Lang, string>>;
  subcategorySummaries?: Record<NewsSection, Record<string, Record<Lang, string>>>;
  highlights?: { zh: Record<string, string[]>; en: Record<string, string[]> };
  sources: Array<{ source: NewsSource; count: number }>;
  failures: Array<{ source: NewsSource; error: string }>;
}

interface RawConfig {
  news_sources?: NewsSource[];
}

const DEFAULT_WINDOW_HOURS = 24;
const FEED_TIMEOUT_MS = 20_000;
const FETCH_CONCURRENCY = 12;

async function pMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export const SECTION_LABELS: Record<NewsSection, string> = {
  economy: "经济新闻",
  society: "社会新闻",
  military: "军事新闻",
  tech: "科技新闻",
  sports: "体育新闻",
  entertainment: "娱乐新闻",
};

const SECTION_ORDER: NewsSection[] = ["economy", "society", "military", "tech", "sports", "entertainment"];

const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: "市场", keywords: ["stock", "stocks", "nasdaq", "s&p", "dow", "market", "markets", "美股", "股市", "A股", "港股"] },
  { tag: "央行", keywords: ["fed", "federal reserve", "ecb", "central bank", "rate", "inflation", "央行", "利率", "通胀"] },
  { tag: "中国", keywords: ["china", "chinese", "hong kong", "beijing", "中国", "香港", "北京"] },
  { tag: "冲突", keywords: ["war", "missile", "conflict", "ukraine", "gaza", "military", "战争", "导弹", "冲突", "台海", "南海"] },
  { tag: "AI", keywords: ["ai", "artificial intelligence", "openai", "anthropic", "llm", "人工智能", "大模型"] },
  { tag: "汽车", keywords: ["ev", "tesla", "byd", "automotive", "汽车", "电动车", "自动驾驶"] },
  { tag: "社区", keywords: ["知乎", "微博", "虎扑", "同花顺", "hacker news", "hn", "community"] },
  { tag: "娱乐", keywords: ["movie", "film", "music", "celebrity", "k-pop", "娱乐", "明星", "影视", "电影"] },
  { tag: "体育", keywords: ["nba", "football", "soccer", "badminton", "basketball", "足球", "篮球", "羽毛球"] },
];

const SUBCATEGORY_RULES: Array<{ section: NewsSection; subcategory: string; keywords: string[] }> = [
  { section: "economy", subcategory: "美股", keywords: ["nasdaq", "s&p", "dow", "wall street", "fed", "美股", "标普", "纳斯达克"] },
  { section: "economy", subcategory: "中国经济", keywords: ["china economy", "a-shares", "hong kong markets", "中国经济", "A股", "港股", "人民币"] },
  { section: "economy", subcategory: "欧洲经济", keywords: ["eurozone", "ecb", "europe economy", "欧洲", "欧元区"] },
  { section: "economy", subcategory: "同花顺社区动态", keywords: ["同花顺", "股吧", "A股热议"] },
  { section: "society", subcategory: "中国", keywords: ["中国", "民生", "教育", "医疗"] },
  { section: "society", subcategory: "欧美", keywords: ["us", "u.s.", "europe", "uk", "america", "欧美"] },
  { section: "society", subcategory: "日韩", keywords: ["japan", "korea", "tokyo", "seoul", "日本", "韩国"] },
  { section: "society", subcategory: "知乎社区动态", keywords: ["知乎"] },
  { section: "tech", subcategory: "AI", keywords: ["ai", "openai", "anthropic", "llm", "人工智能", "大模型"] },
  { section: "tech", subcategory: "汽车", keywords: ["ev", "tesla", "byd", "automotive", "汽车", "电动车", "自动驾驶"] },
  { section: "tech", subcategory: "HackNews社区动态", keywords: ["hacker news", "hnrss", "show hn", "ask hn"] },
  { section: "sports", subcategory: "羽毛球", keywords: ["badminton", "bwf", "羽毛球"] },
  { section: "sports", subcategory: "篮球", keywords: ["nba", "cba", "basketball", "篮球"] },
  { section: "sports", subcategory: "足球", keywords: ["football", "soccer", "uefa", "premier league", "足球"] },
  { section: "sports", subcategory: "虎扑社区动态", keywords: ["虎扑"] },
  { section: "entertainment", subcategory: "中国", keywords: ["中国娱乐", "内娱", "影视", "明星"] },
  { section: "entertainment", subcategory: "欧美", keywords: ["hollywood", "movie", "film", "music", "欧美"] },
  { section: "entertainment", subcategory: "日韩", keywords: ["k-pop", "j-pop", "anime", "korean drama", "日韩"] },
  { section: "entertainment", subcategory: "微博社区动态", keywords: ["微博", "热搜"] },
];

function cleanText(value = ""): string {
  return decodeEntities(value)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(text: string, keyword: string): boolean {
  const lowerKeyword = keyword.toLowerCase();
  if ([...lowerKeyword].some((char) => char.charCodeAt(0) > 127)) return text.includes(lowerKeyword);
  const pattern = lowerKeyword.split(/\s+/).map(escapeRegex).join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(text);
}

function extractTag(block: string, tag: string): string | undefined {
  const escaped = escapeRegex(tag);
  return block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1];
}

function extractAtomLink(block: string): string | undefined {
  const alternate = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  const first = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return alternate?.[1] ?? first?.[1];
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(decodeEntities(url.trim()));
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["oc", "cmpid", "source", "ref"].includes(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return decodeEntities(url.trim());
  }
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(cleanText(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function makeId(url: string, title: string): string {
  let hash = 0;
  const value = `${url}|${title}`;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function findTags(text: string): string[] {
  const lower = text.toLowerCase();
  return TAG_RULES.filter((rule) => rule.keywords.some((k) => keywordMatches(lower, k))).map((rule) => rule.tag);
}

function refineSubcategory(source: NewsSource, text: string): string {
  const lower = text.toLowerCase();
  const matched = SUBCATEGORY_RULES.find(
    (rule) => rule.section === source.section && rule.keywords.some((k) => keywordMatches(lower, k)),
  );
  return matched?.subcategory ?? source.subcategory;
}

function scoreItem(source: NewsSource, item: { title: string; summary?: string; publishedAt?: string; tags: string[] }): number {
  let score = 50;
  if (["Federal Reserve", "European Central Bank", "SEC", "BBC World", "CNBC Markets"].includes(source.name)) score += 10;
  if (item.tags.includes("央行") || item.tags.includes("冲突") || item.tags.includes("市场")) score += 10;
  if (item.summary && item.summary.length > 80) score += 4;
  if (item.publishedAt) {
    const hours = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
    if (hours < 8) score += 8;
    else if (hours < 24) score += 4;
  }
  return score;
}

function parseFeed(xml: string, source: NewsSource): NewsItem[] {
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const atomBlocks = itemBlocks.length ? [] : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const blocks = itemBlocks.length ? itemBlocks : atomBlocks;

  return blocks
    .map((block) => {
      const title = cleanText(extractTag(block, "title"));
      const rawLink = extractTag(block, "link") ?? extractAtomLink(block) ?? extractTag(block, "guid");
      if (!title || !rawLink) return undefined;
      const url = normalizeUrl(cleanText(rawLink));
      const publishedAt = parseDate(
        extractTag(block, "pubDate") ?? extractTag(block, "published") ?? extractTag(block, "updated") ?? extractTag(block, "dc:date"),
      );
      const summary = cleanText(
        extractTag(block, "description") ?? extractTag(block, "summary") ?? extractTag(block, "content:encoded") ?? "",
      ).slice(0, 420);
      const image = extractImage(block);
      const tagText = `${title} ${summary} ${source.name} ${source.subcategory}`;
      const tags = findTags(tagText);
      const subcategory = refineSubcategory(source, tagText);
      const base = { title, summary, publishedAt, tags };

      return {
        id: makeId(url, title),
        title,
        url,
        source: source.name,
        sourceId: source.id,
        section: source.section,
        sectionLabel: SECTION_LABELS[source.section],
        subcategory,
        region: source.region,
        ...(source.lang ? { lang: source.lang } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(summary ? { summary } : {}),
        ...(image ? { image } : {}),
        tags,
        score: scoreItem(source, base),
      } satisfies NewsItem;
    })
    .filter((item): item is NewsItem => Boolean(item));
}

export function loadNewsSources(configPath = "config.yml"): NewsSource[] {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) throw new Error(`${configPath} not found`);
  const raw = yaml.load(fs.readFileSync(resolved, "utf-8")) as RawConfig | undefined;
  const sources = raw?.news_sources;
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("No news_sources configured in config.yml");
  return sources.filter((s) => s?.id && s.name && s.url && s.section && s.subcategory && s.region);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "news-radar/1.0 (local)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSource(source: NewsSource, since: Date): Promise<{ source: NewsSource; items: NewsItem[]; error?: string }> {
  try {
    const xml = await fetchText(source.url);
    const limit = source.limit ?? 10;
    const parsed = parseFeed(xml, source).slice(0, Math.max(limit * 2, limit));
    const recent = parsed.filter((item) => !item.publishedAt || new Date(item.publishedAt) >= since).slice(0, limit);
    const items = recent.length > 0 ? recent : parsed.slice(0, Math.min(4, limit));
    console.log(`  [news/${source.id}] ${items.length} items`);
    return { source, items };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`  [news/${source.id}] fetch failed: ${error}`);
    return { source, items: [], error };
  }
}

function buildSections(items: NewsItem[]): NewsData["sections"] {
  const sections = {} as NewsData["sections"];
  for (const section of SECTION_ORDER) {
    const sectionItems = items.filter((item) => item.section === section);
    const subcategories: Record<string, NewsItem[]> = {};
    for (const item of sectionItems) {
      if (!subcategories[item.subcategory]) subcategories[item.subcategory] = [];
      subcategories[item.subcategory]!.push(item);
    }
    for (const subItems of Object.values(subcategories)) {
      subItems.sort((a, b) => b.score - a.score);
    }
    sections[section] = { label: SECTION_LABELS[section], count: sectionItems.length, subcategories };
  }
  return sections;
}

export async function fetchNewsData(date: string, since: Date, windowHours = DEFAULT_WINDOW_HOURS): Promise<NewsData> {
  const sources = loadNewsSources();
  console.log(`  Tracking ${sources.length} news sources`);
  const results = await pMap(sources, FETCH_CONCURRENCY, (source) => fetchSource(source, since));
  const seen = new Set<string>();
  const items: NewsItem[] = [];

  for (const result of results) {
    for (const item of result.items) {
      const key = `${item.url.toLowerCase()}|${item.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  items.sort((a, b) => b.score - a.score || new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime());
  return {
    generatedAt: new Date().toISOString(),
    date,
    windowHours,
    items,
    sections: buildSections(items),
    sources: results.map((r) => ({ source: r.source, count: r.items.length })),
    failures: results.flatMap((r) => (r.error ? [{ source: r.source, error: r.error }] : [])),
  };
}

function itemPromptLine(item: NewsItem): string {
  const date = item.publishedAt ? item.publishedAt.slice(0, 16).replace("T", " ") + " UTC" : "time unknown";
  const summary = item.summary ? `\n  ${item.summary}` : "";
  return `- [${item.title}](${item.url}) — ${item.source} | ${item.sectionLabel}/${item.subcategory} | ${item.region} | ${date} | tags: ${item.tags.join(", ") || "none"}${summary}`;
}

export function buildSectionBundlePrompt(data: NewsData, section: NewsSection, lang: Lang = "zh"): string {
  const sectionData = data.sections[section];
  const subcategories = sectionData ? Object.entries(sectionData.subcategories) : [];
  const itemsText = subcategories
    .map(([sub, items]) => `### ${sub} (${items.length})\n${items.slice(0, 16).map(itemPromptLine).join("\n")}`)
    .join("\n\n") || "No items";
  const sectionLabel = SECTION_LABELS[section];
  const subKeys = subcategories.map(([s]) => s);

  if (lang === "en") {
    return `You are the section editor of "${sectionLabel}" for a premium daily news intelligence brief. Your job is to turn raw headlines into a useful editorial report, not a terse notification.

Date: ${data.date}
Window: last ${data.windowHours} hours
Section: ${sectionLabel}
Desks (subcategories): ${subKeys.join(", ")}

News across all desks:
${itemsText}

Return ONLY one valid JSON object. No markdown fences, no explanation, no greetings.

Schema:
{
  "section_brief": "markdown report for the whole section: 1 short opening paragraph, then 5-8 substantial bullets, then a short 'Watch next' paragraph; 320-520 words total; use [Title](URL) links",
  "desk_briefs": {
    ${subKeys.map((s) => `"${s}": "markdown mini-report: 2-3 sentence overview, 3-5 bullets with source links, and one closing signal sentence; 180-300 words"`).join(",\n    ")}
  }
}

Rules:
- Output English only. No Chinese characters.
- Every desk listed in "desk_briefs" must appear, even with empty content (use "" if no items).
- Prioritize judgment: explain what changed, who is affected, and why the reader should care.
- Compare related items across outlets when the data supports it; call out conflicting signals or second-order effects.
- Do not merely restate headlines. Add context, causality, implications, and uncertainty where appropriate.
- Be specific: numbers, names, dates, places, institutions, market moves, policy levers, event timing.
- Every key claim must be anchored by one or more source links in markdown form.
- Do not include any text outside the JSON object.`;
  }

  return `你是一份高质量日度新闻情报简报的「${sectionLabel}」板块主编。你的任务不是写通知式短摘要，而是把原始标题整理成有判断、有背景、有取舍的日报专栏稿。

日期：${data.date}
窗口：最近 ${data.windowHours} 小时
板块：${sectionLabel}
子专栏：${subKeys.join("、")}

跨子专栏新闻：
${itemsText}

请只返回一个合法 JSON 对象，不要 markdown 代码栅栏，不要寒暄、不要解释。

Schema：
{
  "section_brief": "整个板块的 markdown 报告：1 段短导语 + 5-8 条较完整 bullet + 1 段'后续观察'，总长 500-800 汉字，嵌入 [标题](URL) 链接",
  "desk_briefs": {
    ${subKeys.map((s) => `"${s}": "markdown 小专栏稿：2-3 句概览 + 3-5 条带链接 bullet + 1 句收束判断，180-320 汉字"`).join(",\n    ")}
  }
}

规则：
- 只输出中文。
- "desk_briefs" 中必须包含上面列出的每一个子专栏键，即使内容为空（使用 ""）。
- 要有编辑判断：说明发生了什么变化、影响谁、为什么值得读者关注。
- 资料支持时要做跨信源对照，点出相互印证、分歧、连锁影响或二阶影响。
- 不要只是改写标题，要补足背景、因果、影响和不确定性。
- 具体到数字、人名、日期、地点、机构、市场变化、政策工具和事件节点。
- 关键判断必须用 markdown 链接锚定到一个或多个原文来源。
- 不要在 JSON 对象之外输出任何文字。`;
}

export function buildSectionBriefPrompt(data: NewsData, section: NewsSection, lang: Lang = "zh"): string {
  const sectionData = data.sections[section];
  const subcategories = sectionData ? Object.entries(sectionData.subcategories) : [];
  const itemsText = subcategories
    .map(([sub, items]) => `### ${sub} (${items.length})\n${items.slice(0, 8).map(itemPromptLine).join("\n")}`)
    .join("\n\n") || "No items";
  const sectionLabel = SECTION_LABELS[section];

  if (lang === "en") {
    return `You are the section editor of "${sectionLabel}" for a daily newspaper-style intelligence brief.

Date: ${data.date}
Window: last ${data.windowHours} hours
Section: ${sectionLabel} (with ${subcategories.length} desks: ${subcategories.map(([s]) => s).join(", ")})

News across all desks of this section:
${itemsText}

Write the SECTION-LEVEL AI Brief that will appear on the front page when the user views "All sections".
Rules:
- Output English only. No Chinese characters.
- Start directly. No greetings. No "Here is..." preambles.
- 4-6 bullets max.
- Each bullet must synthesize across MULTIPLE desks within this section, identify a signal, and explain why it matters.
- Every bullet should embed at least one source link in markdown form: [Title](URL).
- Avoid generic statements; be specific with numbers, names, dates.
- Tight: 140-220 words total.
`;
  }

  return `你是一份每日报纸风格情报简报的「${sectionLabel}」板块主编。

日期：${data.date}
窗口：最近 ${data.windowHours} 小时
板块：${sectionLabel}（共 ${subcategories.length} 个子专栏：${subcategories.map(([s]) => s).join("、")}）

本板块跨子专栏的新闻：
${itemsText}

请撰写**板块级 AI Brief**，将出现在"全部"视图的头版位置。
规则：
- 只输出中文。
- 直接输出正文，不要寒暄、不要"以下是…"等元说明。
- 最多 4-6 条 bullet。
- 每条必须**跨多个子专栏综合**，识别一个信号，并说明为什么重要。
- 每条至少嵌入一个 markdown 链接：[标题](URL)。
- 避免空话，要具体到数字、人名、日期。
- 控制篇幅：140-220 个汉字。
`;
}

export function buildSubcategorySummaryPrompt(
  data: NewsData,
  section: NewsSection,
  subcategory: string,
  lang: Lang = "zh",
): string {
  const items = data.sections[section]?.subcategories[subcategory] ?? [];
  const itemsText = items.slice(0, 18).map(itemPromptLine).join("\n") || "No items";
  const sectionLabel = SECTION_LABELS[section];

  if (lang === "en") {
    return `You are an editor for the "${sectionLabel} / ${subcategory}" desk of a daily news intelligence product.

Date: ${data.date}
Window: last ${data.windowHours} hours
Desk: ${sectionLabel} -> ${subcategory}

News items in this desk only:
${itemsText}

Write a compact English AI Summary for this desk only.
Rules:
- Output English only. Do not write Chinese.
- Start directly with content. No greetings, no meta talk.
- 3-5 bullets maximum.
- Each bullet must synthesize one signal across multiple items and explain why it matters.
- Include source URLs in markdown link form for the most important headlines.
- Do not list every item. Prioritize, group, and connect.
- Keep it tight: 90-160 words total.
`;
  }

  return `你是一份日度新闻情报产品的「${sectionLabel} / ${subcategory}」专栏编辑。

日期：${data.date}
窗口：最近 ${data.windowHours} 小时
专栏：${sectionLabel} → ${subcategory}

仅本专栏新闻条目：
${itemsText}

请只为该专栏撰写中文 AI Summary。
规则：
- 只输出中文。
- 直接输出正文，不要寒暄、不要元说明。
- 最多 3-5 条 bullet。
- 每条必须综合多条信息形成一个信号，并说明为什么重要。
- 重要标题必须以 markdown 链接形式带上原文 URL。
- 不要逐条罗列，要做取舍、归纳和连接。
- 控制篇幅：90-160 个汉字总长。
`;
}

export function buildSectionSummaryPrompt(data: NewsData, section: NewsSection, lang: Lang = "zh"): string {
  const sectionData = data.sections[section];
  const itemsText = Object.entries(sectionData.subcategories)
    .map(([subcategory, items]) => `## ${subcategory}\n${items.slice(0, 18).map(itemPromptLine).join("\n")}`)
    .join("\n\n");

  if (lang === "en") {
    return `You are an editor responsible for the ${SECTION_LABELS[section]} section of a premium news intelligence product.

Date: ${data.date}
Section: ${SECTION_LABELS[section]}

News items:
${itemsText || "No items"}

Write a detailed English AI Summary for this section only.
Rules:
- Output English only. Do not write Chinese.
- Start directly with content. No greetings.
- Start with a 2-3 sentence editorial overview, then 5-8 substantial bullets.
- Each bullet must synthesize one signal and mention why it matters.
- Include markdown source links for the most important headlines.
- Do not list every item; prioritize, connect, and compare across subcategories.
- Add concrete context: numbers, actors, timing, affected groups, and second-order effects.
- Target 350-550 words total.
`;
  }

  return `你是一个高级新闻情报产品的 ${SECTION_LABELS[section]} 板块编辑。

日期：${data.date}
板块：${SECTION_LABELS[section]}

新闻条目：
${itemsText || "无条目"}

请只为该板块撰写中文 AI Summary。
规则：
- 只输出中文。
- 直接输出内容，不要寒暄。
- 先写 2-3 句编辑导语，再写 5-8 条较完整 bullet。
- 每条必须综合一个信号，并说明为什么重要。
- 重要标题必须使用 markdown 链接带原文 URL。
- 不要逐条罗列全部新闻，要做取舍、归纳、连接和对照。
- 补足具体背景：数字、机构、人物、时间、影响对象和二阶影响。
- 总长控制在 500-800 汉字。
`;
}

export function buildNewsPrompt(data: NewsData, lang: Lang = "zh"): string {
  const sourceStats = data.sources.map(({ source, count }) => `- ${source.name}: ${count} (${SECTION_LABELS[source.section]}/${source.subcategory})`).join("\n");
  const failures = data.failures.length
    ? data.failures.map(({ source, error }) => `- ${source.name}: ${error}`).join("\n")
    : "- none";
  const itemsText = SECTION_ORDER.map((section) => {
    const sectionData = data.sections[section];
    const lines = Object.entries(sectionData.subcategories)
      .map(([subcategory, items]) => `### ${subcategory}\n${items.slice(0, 14).map(itemPromptLine).join("\n")}`)
      .join("\n\n");
    return `## ${sectionData.label}\n${lines || "No items"}`;
  }).join("\n\n---\n\n");

  if (lang === "en") {
    return `You are an editor-in-chief building a multi-section daily intelligence briefing. Summarize the structured news dataset for ${data.date}.

Editorial rules:
- Output English only. Do not write Chinese.
- Start directly with the report content. Do not include greetings, acknowledgements, or meta commentary.
- Use the configured sections and subcategories; do not merge them away.
- Every key headline must include its original URL.
- Prefer factual synthesis and cross-source comparison; avoid investment advice and avoid unsupported claims.
- Highlight why each item matters, not just what happened.

Source coverage:
${sourceStats}

Fetch failures:
${failures}

Structured news:
${itemsText}

Write a detailed multi-section News Radar daily report in English:

1. **Executive Brief** — 8-12 cross-category headlines. Each item should contain the event, source link, and why it matters.
2. **Economy** — US stocks, China economy, Europe economy, Tonghuashun/community if available. Include market/policy context and transmission paths.
3. **Society** — China, Europe/US, Japan/Korea, Zhihu/community if available. Explain affected groups and social implications.
4. **Military** — Defense, security, conflict, procurement, diplomatic signaling. Distinguish confirmed events from claims.
5. **Technology** — AI, autos, products, Hacker News/community. Identify product, research, platform, and developer signals.
6. **Sports** — Badminton, basketball, football, Hupu/community. Cover competitions, clubs, athletes, and fan/community signals.
7. **Entertainment** — China, Europe/US, Japan/Korea, Weibo/community. Cover releases, artists, platforms, and audience reactions.
8. **Cross-Section Signal Analysis** — 300-500 words connecting the day's most important patterns across sections.
9. **Watch Next** — 5-8 concrete follow-ups to monitor, each grounded in the source data.
10. **Classification Notes** — briefly explain source-driven classification plus keyword refinement.

Style: professional, analytical, and sufficiently detailed for a reader who wants context rather than headlines. Use markdown links for all key items.
`;
  }

  return `你是一位多频道新闻主编，请基于 ${data.date} 的结构化新闻数据生成综合日报。

编辑规则：
- 只输出中文。
- 直接输出报告正文，不要写“好的”、寒暄或元说明。
- 必须保留“板块 + 细分类”的结构，不要混并。
- 关键标题必须附原文 URL。
- 注重事实归纳和跨信源对照，不要编造源文本没有的信息。
- 不只是复述，要说明为什么值得关注。

信源覆盖：
${sourceStats}

抓取失败：
${failures}

结构化新闻：
${itemsText}

请用中文输出一份详实的《多频道新闻雷达日报》：

1. **总编辑摘要** — 8-12 条跨板块最重要新闻，每条包含事件、原文链接和重要性判断。
2. **经济新闻** — 美股、中国经济、欧洲经济、同花顺社区动态。要说明市场/政策背景和传导路径。
3. **社会新闻** — 中国、欧美、日韩、知乎社区动态。要说明受影响群体、社会含义和后续风险。
4. **军事新闻** — 防务、安全、冲突局势、采购、外交信号。区分已确认事实和各方说法。
5. **科技新闻** — AI、汽车、科技产品、HackNews 社区动态。提炼产品、研究、平台和开发者信号。
6. **体育新闻** — 羽毛球、篮球、足球、虎扑社区动态。覆盖赛事、俱乐部、运动员和球迷社区反应。
7. **娱乐新闻** — 中国、欧美、日韩、微博社区动态。覆盖作品、艺人、平台和受众反应。
8. **跨板块信号分析** — 400-700 字，连接当天最重要的共同趋势、冲突点和连锁影响。
9. **后续观察** — 5-8 条值得继续跟踪的具体事项，每条都要能回扣到源数据。
10. **分类说明** — 简述“信源配置分类 + 关键词校正 + 标签”的分类举措。

写作风格：中文，专业、具体、有分析深度。不要只堆标题；要补足背景、因果、影响和不确定性。关键条目必须附 markdown 原文链接。
`;
}
