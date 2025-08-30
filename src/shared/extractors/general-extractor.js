// lib/extractors/general-extractor.js
/**
 * @fileoverview 一般的なサイト用抽出エンジン（フォールバック）
 */

class GeneralExtractor extends window.ChronoClipBaseExtractor {
  async extractTitle(context) {
    // 一般的なタイトル抽出戦略
    const strategies = [
      // セマンティック要素優先
      () => this.findBestTitle(context, "h1, h2"),
      // 構造的な検索
      () => this.findBestTitle(context, ".title, .event-title, .product-title"),
      // article内のヘッダー
      () =>
        this.findBestTitle(context, "article h1, article h2, article .title"),
      // メタデータフォールバック
      () => this.getTitleFromMeta(),
    ];

    for (const strategy of strategies) {
      const title = await strategy();
      if (title) return title;
    }

    return await super.extractTitle(context);
  }

  async extractDescription(context) {
    // 一般的な詳細抽出戦略
    const strategies = [
      // セマンティック要素
      () =>
        this.findBestDescription(context, ".description, .summary, .content"),
      // article内のコンテンツ
      () => this.findBestDescription(context, "article p, article .content"),
      // 近接する段落
      () => this.findNearbyParagraphs(context),
      // メタデータフォールバック
      () => this.getDescriptionFromMeta(),
    ];

    for (const strategy of strategies) {
      const description = await strategy();
      if (description) return description;
    }

    return await super.extractDescription(context);
  }

  async extractDate(context) {
    // 一般的な日付抽出戦略
    const strategies = [
      // time要素優先
      () => this.findBestDate(context, "time[datetime]"),
      // 構造的な検索
      () => this.findBestDate(context, ".date, .datetime, .event-date"),
      // microdata検索
      () => this.findMicrodataDate(context),
      // JSON-LD構造化データ
      () => this.findStructuredDataDate(),
    ];

    for (const strategy of strategies) {
      const date = await strategy();
      if (date) return date;
    }

    return await super.extractDate(context);
  }

  // 特化した検索メソッド

  /**
   * 最適なタイトルを検索
   * @param {HTMLElement} context - コンテキスト要素
   * @param {string} selector - セレクター
   * @returns {string|null} タイトル
   */
  findBestTitle(context, selector) {
    const elements = this.findElements(context, selector);
    const candidates = [];

    for (const element of elements) {
      const text = this.cleanText(element.textContent);
      if (this.isValidTitle(text)) {
        candidates.push({
          text,
          score: this.scoreTitleCandidate(text, element),
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.length > 0 ? candidates[0].text : null;
  }

  /**
   * 最適な詳細を検索
   * @param {HTMLElement} context - コンテキスト要素
   * @param {string} selector - セレクター
   * @returns {string|null} 詳細
   */
  findBestDescription(context, selector) {
    const elements = this.findElements(context, selector);
    const descriptions = [];

    for (const element of elements.slice(0, 3)) {
      const text = this.cleanText(element.textContent);
      if (this.isValidDescription(text)) {
        descriptions.push(text);
      }
    }

    return descriptions.length > 0 ? descriptions.join("\n\n") : null;
  }

  /**
   * 近接する段落を検索
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {string|null} 詳細
   */
  findNearbyParagraphs(context) {
    const parent = context.parentElement;
    if (!parent) return null;

    const siblings = Array.from(parent.children);
    const contextIndex = siblings.indexOf(context);
    const nearbyElements = [];

    // 前後の要素を収集
    for (
      let i = Math.max(0, contextIndex - 2);
      i <= Math.min(siblings.length - 1, contextIndex + 2);
      i++
    ) {
      if (i !== contextIndex) {
        nearbyElements.push(siblings[i]);
      }
    }

    const paragraphs = [];
    for (const element of nearbyElements) {
      if (
        element.tagName === "P" ||
        element.classList.contains("description")
      ) {
        const text = this.cleanText(element.textContent);
        if (this.isValidDescription(text)) {
          paragraphs.push(text);
        }
      }
    }

    return paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
  }

  /**
   * 最適な日付を検索
   * @param {HTMLElement} context - コンテキスト要素
   * @param {string} selector - セレクター
   * @returns {Date|null} 日付
   */
  findBestDate(context, selector) {
    const elements = this.findElements(context, selector);

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

    return null;
  }

  /**
   * Microdataから日付を検索
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Date|null} 日付
   */
  findMicrodataDate(context) {
    const elements = context.querySelectorAll(
      '[itemprop="startDate"], [itemprop="dateTime"], [itemprop="date"]'
    );

    for (const element of elements) {
      const datetime =
        element.getAttribute("datetime") || element.getAttribute("content");
      if (datetime) {
        const date = new Date(datetime);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  }

  /**
   * JSON-LD構造化データから日付を検索
   * @returns {Date|null} 日付
   */
  findStructuredDataDate() {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const date = this.extractDateFromStructuredData(data);
        if (date) return date;
      } catch (error) {
        // JSON解析エラーは無視
      }
    }

    return null;
  }

  /**
   * 構造化データから日付抽出
   * @param {Object} data - 構造化データ
   * @returns {Date|null} 日付
   */
  extractDateFromStructuredData(data) {
    if (!data) return null;

    // 配列の場合は最初の要素
    if (Array.isArray(data)) {
      data = data[0];
    }

    // Event型の場合
    if (data["@type"] === "Event") {
      const startDate = data.startDate;
      if (startDate) {
        const date = new Date(startDate);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // 再帰的に検索
    for (const key in data) {
      if (typeof data[key] === "object") {
        const date = this.extractDateFromStructuredData(data[key]);
        if (date) return date;
      }
    }

    return null;
  }

  /**
   * メタデータからタイトル取得
   * @returns {string|null} タイトル
   */
  getTitleFromMeta() {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      const content = ogTitle.getAttribute("content");
      if (content && this.isValidTitle(content)) {
        return content;
      }
    }

    const title = document.title;
    if (title && this.isValidTitle(title)) {
      // サイト名部分を除去
      const cleanTitle = title.split(/[-|｜]/)[0].trim();
      return cleanTitle;
    }

    return null;
  }

  /**
   * メタデータから詳細取得
   * @returns {string|null} 詳細
   */
  getDescriptionFromMeta() {
    const ogDescription = document.querySelector(
      'meta[property="og:description"]'
    );
    if (ogDescription) {
      const content = ogDescription.getAttribute("content");
      if (content && this.isValidDescription(content)) {
        return content;
      }
    }

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      const content = metaDescription.getAttribute("content");
      if (content && this.isValidDescription(content)) {
        return content;
      }
    }

    return null;
  }

  /**
   * タイトル候補のスコアリング
   * @param {string} text - テキスト
   * @param {HTMLElement} element - 要素
   * @returns {number} スコア
   */
  scoreTitleCandidate(text, element) {
    let score = 0.5;

    // 要素タイプによるスコア
    if (element.tagName === "H1") score += 0.3;
    else if (element.tagName === "H2") score += 0.2;

    // クラス名によるスコア
    const className = element.className.toLowerCase();
    if (className.includes("title")) score += 0.2;
    if (className.includes("event")) score += 0.1;

    // テキスト長によるスコア調整
    if (text.length >= 10 && text.length <= 60) score += 0.1;
    else if (text.length > 100) score -= 0.2;

    return Math.min(1, Math.max(0, score));
  }
}

// エクスポート
if (typeof window !== "undefined") {
  window.ChronoClipGeneralExtractor = GeneralExtractor;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = GeneralExtractor;
}
