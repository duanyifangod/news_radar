import type { Lang } from "../shared/i18n.ts";

export interface ReportHighlights {
  [reportId: string]: string[];
}

export function buildHighlightsPrompt(
  reportContents: Record<string, string>,
  lang: Lang = "zh",
  itemsPerReport: number = 6,
): string {
  const sections = Object.entries(reportContents)
    .map(([id, content]) => `## [${id}]\n\n${content.slice(0, 2000)}`)
    .join("\n\n---\n\n");

  if (lang === "en") {
    return `You are a concise news editor. The following are today's local news report excerpts, each labeled with a report ID.

${sections}

---

For each report, extract ${itemsPerReport} of the most noteworthy highlights. Each highlight should be a single short sentence under 60 characters.

Return ONLY valid JSON, no markdown fences, no explanation. Format:
{"news-economy":["highlight 1","highlight 2",...],"news-tech":["highlight 1","highlight 2",...]}

Rules:
- Use the exact report IDs from the brackets above as keys
- Only include reports that have meaningful content
- ${itemsPerReport} highlights per report, each under 60 characters
- Focus on concrete events, impacts, market moves, policy changes, and public-interest signals`;
  }

  return `你是一位简洁的新闻编辑。以下是今日本地新闻雷达各报告摘要，每个报告用 ID 标注。

${sections}

---

为每份报告提取 ${itemsPerReport} 条最值得关注的亮点。每条亮点用一句简短的话，不超过 30 个字。

只返回合法 JSON，不要 markdown 代码块，不要解释。格式：
{"news-economy":["亮点1","亮点2",...],"news-tech":["亮点1","亮点2",...]}

规则：
- 用上面方括号中的报告 ID 作为 key
- 只包含有实际内容的报告
- 每个报告 ${itemsPerReport} 条亮点，每条不超过 30 个字
- 重点关注具体事件、影响、市场变化、政策信号和公共利益`;
}
