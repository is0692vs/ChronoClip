// lib/extractors/amazon-extractor.js
/**
 * @fileoverview Amazon専用抽出エンジン
 */

class AmazonExtractor extends window.ChronoClipBaseExtractor {
  async extractTitle(context) {
    // Amazon特有のタイトル抽出
    const selectors = ["#productTitle", ".product-title", "h1.a-size-large"];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = this.cleanText(element.textContent);
        if (this.isValidTitle(text)) {
          return text;
        }
      }
    }

    return await super.extractTitle(context);
  }

  async extractDescription(context) {
    // Amazon特有の詳細抽出
    const selectors = [
      "#feature-bullets ul li",
      ".a-unordered-list .a-list-item",
      "#bookDescription_feature_div",
      "#productDescription",
    ];

    const descriptions = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = this.cleanText(element.textContent);
        if (this.isValidDescription(text)) {
          descriptions.push(text);
        }
      }
      if (descriptions.length >= 3) break;
    }

    return descriptions.length > 0
      ? descriptions.join("\n\n")
      : await super.extractDescription(context);
  }

  async extractDate(context) {
    // Amazon特有の日付抽出（配送日など）
    const selectors = [
      "#availability .a-color-success",
      "#delivery-block",
      "#mir-layout-DELIVERY_BLOCK",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = this.cleanText(element.textContent);
        const date = this.parseAmazonDate(text);
        if (date) return date;
      }
    }

    return await super.extractDate(context);
  }

  /**
   * Amazon特有の日付解析
   * @param {string} text - 日付テキスト
   * @returns {Date|null} 解析された日付
   */
  parseAmazonDate(text) {
    // "明日までにお届け" -> 明日の日付
    if (text.includes("明日")) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    // "○月○日 までにお届け"
    const monthDayMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (monthDayMatch) {
      const now = new Date();
      const month = parseInt(monthDayMatch[1], 10) - 1;
      const day = parseInt(monthDayMatch[2], 10);
      const date = new Date(now.getFullYear(), month, day);

      // 過去の日付の場合は来年とする
      if (date < now) {
        date.setFullYear(now.getFullYear() + 1);
      }

      return date;
    }

    return this.parseDate(text);
  }

  async extractPrice(context) {
    // Amazon特有の価格抽出
    const selectors = [
      ".a-price-whole",
      ".a-offscreen",
      "#priceblock_dealprice",
      "#priceblock_ourprice",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = this.cleanText(element.textContent);
        if (this.isValidPrice(text)) {
          return text;
        }
      }
    }

    return await super.extractPrice(context);
  }
}

// エクスポート
if (typeof window !== "undefined") {
  window.ChronoClipAmazonExtractor = AmazonExtractor;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = AmazonExtractor;
}
