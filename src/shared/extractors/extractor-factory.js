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

    // 東京ドームシティホール
    this.extractors.set(
      "tokyo-dome-hall",
      window.ChronoClipTokyoDomeHallExtractor
    );

    // STARDOM詳細ページ
    this.extractors.set(
      "stardom-detail",
      window.ChronoClipStardomDetailExtractor
    );

    // STARDOM月間スケジュールページ
    this.extractors.set(
      "stardom-month",
      window.ChronoClipStardomMonthExtractor
    );

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
      if (ExtractorClass) {
        console.log(
          `ChronoClip: Using rule-specified extractor: ${rule.extractorModule} for ${domain}`
        );
      }
    }

    // ドメインベースのフォールバック
    if (!ExtractorClass) {
      if (domain.includes("eventbrite")) {
        ExtractorClass = this.extractors.get("eventbrite");
        console.log(
          `ChronoClip: Auto-detected eventbrite extractor for ${domain}`
        );
      } else if (domain.includes("amazon")) {
        ExtractorClass = this.extractors.get("amazon");
        console.log(`ChronoClip: Auto-detected amazon extractor for ${domain}`);
      } else if (domain.includes("tokyo-dome.co.jp")) {
        ExtractorClass = this.extractors.get("tokyo-dome-hall");
        console.log(
          `ChronoClip: Auto-detected tokyo-dome-hall extractor for ${domain}`
        );
      } else {
        ExtractorClass = this.extractors.get("general");
        console.log(`ChronoClip: Using general extractor for ${domain}`);
      }
    }

    // 最終フォールバック
    if (!ExtractorClass) {
      ExtractorClass = this.extractors.get("general");
      console.log(`ChronoClip: Fallback to general extractor for ${domain}`);
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

      // 現在のURLを取得
      const currentUrl =
        (context.ownerDocument || document).location?.href ||
        window.location.href;
      const rule = siteRuleManager.getRuleForDomain(domain, currentUrl);

      if (!rule) {
        console.log(
          `ChronoClip: No specific rule found for domain: ${domain}, using general extractor`
        );
        const generalRule = {
          domain: domain,
          extractorModule: "general",
          priority: 1,
        };
        const extractor = this.getExtractor(domain, generalRule);
        return await extractor.extractAll(context);
      }

      console.log(`ChronoClip: ✅ Applying rule for domain: ${domain}`);
      console.log(`ChronoClip: Rule details:`, {
        domain: rule.domain,
        source: rule.source,
        priority: rule.priority,
        extractorModule: rule.extractorModule || "auto-detected",
      });

      const extractor = this.getExtractor(domain, rule);

      // エクストラクターの選択をログ出力
      console.log(
        `ChronoClip: Using extractor: ${extractor.constructor.name} for ${domain}`
      );

      const result = await extractor.extractAll(context);

      // ルール情報を結果に追加（resultがnullでない場合のみ）
      if (result) {
        result.ruleUsed = {
          domain: rule.domain,
          source: rule.source,
          priority: rule.priority,
          extractorUsed: extractor.constructor.name,
        };
      }

      return result;
    } catch (error) {
      console.error("ChronoClip: Extraction failed:", error);

      // エラー時のフォールバック
      console.log(
        `ChronoClip: ⚠️ Falling back to general extractor for ${domain} due to error`
      );
      const fallbackRule = {
        domain: domain,
        extractorModule: "general",
        priority: 0,
      };
      const extractor = this.getExtractor(domain, fallbackRule);
      const result = await extractor.extractAll(context);

      // フォールバック情報を結果に追加（resultがnullでない場合のみ）
      if (result) {
        result.error = error.message;
        result.fallback = true;
      }
      if (result) {
        result.error = error.message;
        result.fallback = true;
      }

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
