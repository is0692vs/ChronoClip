// lib/extractors/base-extractor.js
/**
 * @fileoverview サイト別抽出エンジンの基底クラス
 */

/**
 * 抽出エンジンの基底クラス
 */
class BaseExtractor {
  constructor(rule) {
    this.rule = rule;
    this.domain = rule.domain;
  }

  /**
   * タイトルを抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<string|null>} 抽出されたタイトル
   */
  async extractTitle(context) {
    if (!this.rule.titleSelector) return null;

    try {
      const elements = this.findElements(context, this.rule.titleSelector);
      for (const element of elements) {
        const text = this.cleanText(element.textContent);
        if (this.isValidTitle(text)) {
          return text;
        }
      }
    } catch (error) {
      console.warn(
        `ChronoClip: Title extraction failed for ${this.domain}:`,
        error
      );
    }

    return null;
  }

  /**
   * 詳細を抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<string|null>} 抽出された詳細
   */
  async extractDescription(context) {
    if (!this.rule.descriptionSelector) return null;

    try {
      const elements = this.findElements(
        context,
        this.rule.descriptionSelector
      );
      const descriptions = [];

      for (const element of elements.slice(0, 3)) {
        // 最大3つまで
        const text = this.cleanText(element.textContent);
        if (this.isValidDescription(text)) {
          descriptions.push(text);
        }
      }

      return descriptions.length > 0 ? descriptions.join("\n\n") : null;
    } catch (error) {
      console.warn(
        `ChronoClip: Description extraction failed for ${this.domain}:`,
        error
      );
    }

    return null;
  }

  /**
   * 日付を抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<Date|null>} 抽出された日付
   */
  async extractDate(context) {
    if (!this.rule.dateSelector) return null;

    try {
      const elements = this.findElements(context, this.rule.dateSelector);
      for (const element of elements) {
        // datetime 属性を優先
        const datetime = element.getAttribute("datetime");
        if (datetime) {
          const date = new Date(datetime);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }

        // テキストから解析
        const text = this.cleanText(element.textContent);
        if (text) {
          const date = this.parseDate(text);
          if (date) {
            return date;
          }
        }
      }
    } catch (error) {
      console.warn(
        `ChronoClip: Date extraction failed for ${this.domain}:`,
        error
      );
    }

    return null;
  }

  /**
   * 場所を抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<string|null>} 抽出された場所
   */
  async extractLocation(context) {
    if (!this.rule.locationSelector) return null;

    try {
      const elements = this.findElements(context, this.rule.locationSelector);
      for (const element of elements) {
        const text = this.cleanText(element.textContent);
        if (this.isValidLocation(text)) {
          return text;
        }
      }
    } catch (error) {
      console.warn(
        `ChronoClip: Location extraction failed for ${this.domain}:`,
        error
      );
    }

    return null;
  }

  /**
   * 価格を抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<string|null>} 抽出された価格
   */
  async extractPrice(context) {
    if (!this.rule.priceSelector) return null;

    try {
      const elements = this.findElements(context, this.rule.priceSelector);
      for (const element of elements) {
        const text = this.cleanText(element.textContent);
        if (this.isValidPrice(text)) {
          return text;
        }
      }
    } catch (error) {
      console.warn(
        `ChronoClip: Price extraction failed for ${this.domain}:`,
        error
      );
    }

    return null;
  }

  /**
   * 統合抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<Object>} 抽出結果
   */
  async extractAll(context) {
    // 無視要素の除去
    if (this.rule.ignoreSelector) {
      this.removeIgnoredElements(context, this.rule.ignoreSelector);
    }

    const results = await Promise.allSettled([
      this.extractTitle(context),
      this.extractDescription(context),
      this.extractDate(context),
      this.extractLocation(context),
      this.extractPrice(context),
    ]);

    return {
      title: results[0].status === "fulfilled" ? results[0].value : null,
      description: results[1].status === "fulfilled" ? results[1].value : null,
      date: results[2].status === "fulfilled" ? results[2].value : null,
      location: results[3].status === "fulfilled" ? results[3].value : null,
      price: results[4].status === "fulfilled" ? results[4].value : null,
      confidence: this.calculateConfidence(results),
      extractor: this.constructor.name,
      domain: this.domain,
    };
  }

  // ユーティリティメソッド

  /**
   * 要素を検索
   * @param {HTMLElement} context - コンテキスト要素
   * @param {string} selector - CSSセレクター
   * @returns {NodeList} 要素リスト
   */
  findElements(context, selector) {
    // まず同じブロック内を検索
    const sameBlockElements = context.querySelectorAll(selector);
    if (sameBlockElements.length > 0) {
      return sameBlockElements;
    }

    // 親要素まで拡張
    const parent = context.closest("article, section, div, main, body");
    if (parent && parent !== context) {
      return parent.querySelectorAll(selector);
    }

    // 最後の手段：ドキュメント全体
    return document.querySelectorAll(selector);
  }

  /**
   * テキストをクリーンアップ
   * @param {string} text - 元のテキスト
   * @returns {string} クリーンアップされたテキスト
   */
  cleanText(text) {
    if (!text) return "";

    return text
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 無視要素を除去
   * @param {HTMLElement} context - コンテキスト要素
   * @param {string} ignoreSelector - 無視するセレクター
   */
  removeIgnoredElements(context, ignoreSelector) {
    try {
      const ignoredElements = context.querySelectorAll(ignoreSelector);
      ignoredElements.forEach((el) => el.remove());
    } catch (error) {
      console.warn(`ChronoClip: Failed to remove ignored elements:`, error);
    }
  }

  /**
   * 日付解析
   * @param {string} text - 日付テキスト
   * @returns {Date|null} 解析された日付
   */
  parseDate(text) {
    if (typeof chrono !== "undefined") {
      try {
        const results = chrono.parse(text);
        if (results.length > 0) {
          return results[0].start.date();
        }
      } catch (error) {
        console.warn("ChronoClip: Chrono date parsing failed:", error);
      }
    }

    // フォールバック: 基本的な日付形式
    const isoMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      return new Date(isoMatch[0]);
    }

    return null;
  }

  /**
   * 信頼度計算
   * @param {Array} results - 抽出結果配列
   * @returns {number} 信頼度 (0-1)
   */
  calculateConfidence(results) {
    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value
    ).length;
    const totalCount = results.length;
    return successCount / totalCount;
  }

  // バリデーションメソッド

  /**
   * タイトルの妥当性チェック
   * @param {string} text - タイトルテキスト
   * @returns {boolean} 妥当性
   */
  isValidTitle(text) {
    return text && text.length >= 3 && text.length <= 200;
  }

  /**
   * 詳細の妥当性チェック
   * @param {string} text - 詳細テキスト
   * @returns {boolean} 妥当性
   */
  isValidDescription(text) {
    return text && text.length >= 10 && text.length <= 1000;
  }

  /**
   * 場所の妥当性チェック
   * @param {string} text - 場所テキスト
   * @returns {boolean} 妥当性
   */
  isValidLocation(text) {
    return text && text.length >= 2 && text.length <= 100;
  }

  /**
   * 価格の妥当性チェック
   * @param {string} text - 価格テキスト
   * @returns {boolean} 妥当性
   */
  isValidPrice(text) {
    return text && /[\d,¥$€£]/.test(text) && text.length <= 50;
  }
}

// エクスポート
if (typeof window !== "undefined") {
  window.ChronoClipBaseExtractor = BaseExtractor;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = BaseExtractor;
}
