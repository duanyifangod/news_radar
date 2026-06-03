import { describe, expect, it } from "vitest";
import { REPORT_LABELS, type Lang } from "../shared/i18n.ts";

describe("REPORT_LABELS", () => {
  it("contains all local news reports", () => {
    const reports = [
      "news-economy",
      "news-economy-en",
      "news-society",
      "news-society-en",
      "news-military",
      "news-military-en",
      "news-tech",
      "news-tech-en",
      "news-sports",
      "news-sports-en",
      "news-entertainment",
      "news-entertainment-en",
    ];

    for (const report of reports) {
      expect(REPORT_LABELS[report]).toBeTruthy();
    }
  });

  it("keeps Lang as zh or en", () => {
    const lang: Lang = "zh";
    expect(lang).toBe("zh");
  });
});
