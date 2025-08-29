// lib/extractors/eventbrite-extractor.js
/**
 * @fileoverview EventBrite専用抽出エンジン
 */

class EventbriteExtractor extends window.ChronoClipBaseExtractor {
  async extractTitle(context) {
    // EventBrite特有のタイトル抽出ロジック
    const selectors = [
      'h1[data-automation-id="event-title"]',
      ".event-title",
      ".event-card__title",
      "h1",
    ];

    for (const selector of selectors) {
      const elements = context.querySelectorAll(selector);
      for (const element of elements) {
        const text = this.cleanText(element.textContent);
        if (this.isValidTitle(text)) {
          return text;
        }
      }
    }

    return await super.extractTitle(context);
  }

  async extractDate(context) {
    // EventBrite特有の日付抽出
    const selectors = [
      '[data-automation-id="event-start-date"]',
      ".event-details__data time",
      ".date-info",
      "time[datetime]",
    ];

    for (const selector of selectors) {
      const elements = context.querySelectorAll(selector);
      for (const element of elements) {
        const datetime = element.getAttribute("datetime");
        if (datetime) {
          const date = new Date(datetime);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }

        const text = this.cleanText(element.textContent);
        if (text) {
          const date = this.parseDate(text);
          if (date) return date;
        }
      }
    }

    return await super.extractDate(context);
  }

  async extractLocation(context) {
    // EventBrite特有の場所抽出
    const selectors = [
      ".venue-info",
      ".event-details__data--location",
      '[data-automation-id="event-venue"]',
    ];

    for (const selector of selectors) {
      const elements = context.querySelectorAll(selector);
      for (const element of elements) {
        const text = this.cleanText(element.textContent);
        if (this.isValidLocation(text)) {
          return text;
        }
      }
    }

    return await super.extractLocation(context);
  }
}

// エクスポート
if (typeof window !== "undefined") {
  window.ChronoClipEventbriteExtractor = EventbriteExtractor;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = EventbriteExtractor;
}
