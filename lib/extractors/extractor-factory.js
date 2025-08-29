// lib/extractors/extractor-factory.js
/**
 * @fileoverview 抽出エンジンファクトリー
 * ドメインに応じて適切な抽出エンジンを返す
 */

class ExtractorFactory {
  constructor() {
    this.extractors = new Map();
    this.initialized = false;
  }

  /**
   * 初期化
   */
  initialize() {
    if (this.initialized) return;

    // 抽出エンジンの登録
    this.registerExtractors();
    this.initialized = true;
    console.log("ChronoClip: ExtractorFactory initialized");
  }

  /**
   * 抽出エンジンの登録
   */
  registerExtractors() {
    // EventBrite
    this.extractors.set("eventbrite", window.ChronoClipEventbriteExtractor);

    // Amazon
    this.extractors.set("amazon", window.ChronoClipAmazonExtractor);

    // 一般的なエンジン（フォールバック）
    this.extractors.set("general", window.ChronoClipGeneralExtractor);
  }

  /**
   * ドメインに適した抽出エンジンを取得
   * @param {string} domain - ドメイン名
   * @param {Object} rule - サイトルール
   * @returns {BaseExtractor} 抽出エンジンインスタンス
   */
  getExtractor(domain, rule) {
    let ExtractorClass;

    // ルールで指定された抽出エンジンを使用
    if (rule && rule.extractorModule) {
      ExtractorClass = this.extractors.get(rule.extractorModule);
    }

    // ドメインベースのフォールバック
    if (!ExtractorClass) {
      if (domain.includes("eventbrite")) {
        ExtractorClass = this.extractors.get("eventbrite");
      } else if (domain.includes("amazon")) {
        ExtractorClass = this.extractors.get("amazon");
      } else {
        ExtractorClass = this.extractors.get("general");
      }
    }

    // 最終フォールバック
    if (!ExtractorClass) {
      ExtractorClass = this.extractors.get("general");
    }

    return new ExtractorClass(rule);
  }

  /**
   * カスタム抽出エンジンを登録
   * @param {string} name - エンジン名
   * @param {Class} ExtractorClass - 抽出エンジンクラス
   */
  registerCustomExtractor(name, ExtractorClass) {
    this.extractors.set(name, ExtractorClass);
    console.log(`ChronoClip: Custom extractor '${name}' registered`);
  }

  /**
   * 利用可能な抽出エンジン一覧を取得
   * @returns {Array<string>} エンジン名の配列
   */
  getAvailableExtractors() {
    return Array.from(this.extractors.keys());
  }

  /**
   * 統合抽出メソッド
   * @param {HTMLElement} context - コンテキスト要素
   * @param {string} domain - ドメイン名
   * @returns {Promise<Object>} 抽出結果
   */
  async extract(context, domain) {
    if (!this.initialized) {
      this.initialize();
    }

    try {
      // サイトルール管理から適切なルールを取得
      const siteRuleManager =
        window.ChronoClipSiteRuleManager.getSiteRuleManager();
      await siteRuleManager.initialize();

      const rule = siteRuleManager.getRuleForDomain(domain);

      if (!rule) {
        console.log(
          `ChronoClip: No rule found for domain: ${domain}, using general extractor`
        );
        const generalRule = {
          domain: domain,
          extractorModule: "general",
          priority: 1,
        };
        const extractor = this.getExtractor(domain, generalRule);
        return await extractor.extractAll(context);
      }

      console.log(`ChronoClip: Using rule for domain: ${domain}`, rule);
      const extractor = this.getExtractor(domain, rule);
      const result = await extractor.extractAll(context);

      // ルール情報を結果に追加
      result.ruleUsed = {
        domain: rule.domain,
        source: rule.source,
        priority: rule.priority,
      };

      return result;
    } catch (error) {
      console.error("ChronoClip: Extraction failed:", error);

      // エラー時のフォールバック
      const fallbackRule = {
        domain: domain,
        extractorModule: "general",
        priority: 0,
      };
      const extractor = this.getExtractor(domain, fallbackRule);
      const result = await extractor.extractAll(context);
      result.error = error.message;
      result.fallback = true;

      return result;
    }
  }
}

// シングルトンインスタンス
let extractorFactoryInstance = null;

/**
 * ExtractorFactoryのシングルトンインスタンスを取得
 * @returns {ExtractorFactory} ExtractorFactoryインスタンス
 */
function getExtractorFactory() {
  if (!extractorFactoryInstance) {
    extractorFactoryInstance = new ExtractorFactory();
  }
  return extractorFactoryInstance;
}

// グローバルエクスポート
if (typeof window !== "undefined") {
  window.ChronoClipExtractorFactory = {
    getExtractorFactory,
    ExtractorFactory,
  };
}

// Node.js エクスポート (テスト用)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getExtractorFactory,
    ExtractorFactory,
  };
}
