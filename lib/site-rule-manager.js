// lib/site-rule-manager.js
/**
 * @fileoverview サイト別カスタムルール管理システム
 * ドメインごとのルールをモジュール化して管理し、
 * UIとコードの両方からルールを追加・管理できるシステム
 */

/**
 * サイトルール管理クラス
 */
class SiteRuleManager {
  constructor() {
    this.rules = new Map(); // domain -> rule のマップ
    this.codeRules = new Map(); // コードで追加されたルール
    this.uiRules = new Map(); // UIで追加されたルール
    this.initialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    if (this.initialized) return;

    // ビルトインルールの登録
    this.registerBuiltinRules();

    // UIルールの読み込み
    await this.loadUIRules();

    this.initialized = true;
    console.log("ChronoClip: SiteRuleManager initialized");
  }

  /**
   * ビルトインルールの登録
   */
  registerBuiltinRules() {
    // EventBrite
    this.addCodeRule("eventbrite.com", {
      priority: 10,
      titleSelector:
        '.event-title, .event-card__title, h1[data-automation-id="event-title"]',
      descriptionSelector:
        ".event-description, .event-card__description, .structured-content",
      dateSelector:
        '.event-details__data, .date-info, [data-automation-id="event-start-date"]',
      locationSelector: ".venue-info, .event-details__data--location",
      priceSelector: ".event-card__price, .conversion-bar__panel-info",
      ignoreSelector: ".advertisement, .ads, .footer, .header-nav",
      extractorModule: "eventbrite",
    });

    // Amazon
    this.addCodeRule("amazon.co.jp", {
      priority: 8,
      titleSelector: "#productTitle, .product-title",
      descriptionSelector:
        "#feature-bullets ul, .a-unordered-list .a-list-item",
      dateSelector: "#availability .a-color-success, #delivery-block",
      priceSelector: ".a-price-whole, .a-offscreen",
      ignoreSelector:
        ".nav-search-bar, .nav-footer, .a-popover, .a-declarative",
      extractorModule: "amazon",
    });

    // 楽天
    this.addCodeRule("rakuten.co.jp", {
      priority: 8,
      titleSelector: ".item-name, .event-title, h1",
      descriptionSelector: ".item-desc, .event-description",
      dateSelector: ".delivery-date, .event-date, .date-info",
      priceSelector: ".price, .event-price",
      ignoreSelector: ".header, .footer, .side-navi, .advertisement",
      extractorModule: "rakuten",
    });

    // YouTube
    this.addCodeRule("youtube.com", {
      priority: 7,
      titleSelector: "#title h1, .ytd-video-primary-info-renderer h1",
      descriptionSelector:
        "#description-text, .ytd-video-secondary-info-renderer #description",
      dateSelector:
        "#info-text span, .ytd-video-primary-info-renderer #info-text",
      ignoreSelector:
        ".ytd-comments, .ytd-watch-next-secondary-results-renderer",
      extractorModule: "youtube",
    });

    // Twitter/X
    this.addCodeRule("twitter.com", {
      priority: 7,
      titleSelector: '[data-testid="tweetText"]',
      descriptionSelector: '[data-testid="tweetText"]',
      dateSelector: "time",
      ignoreSelector:
        '[data-testid="sidebarColumn"], [data-testid="bottomBar"]',
      extractorModule: "twitter",
    });

    // 一般的なパターン（フォールバック）
    this.addCodeRule("*", {
      priority: 1,
      titleSelector:
        "h1, h2, .title, .event-title, .product-title, article h1, article h2",
      descriptionSelector:
        ".description, .content, .event-description, .summary, article p",
      dateSelector:
        ".date, .datetime, .event-date, .delivery-date, time, .schedule-date",
      locationSelector: ".location, .venue, .address, .place",
      priceSelector: ".price, .cost, .fee, .amount",
      ignoreSelector:
        "nav, footer, aside, .sidebar, .advertisement, .ads, .header",
      extractorModule: "general",
    });
  }

  /**
   * コードからルールを追加
   * @param {string} domain - ドメイン名
   * @param {Object} rule - ルール定義
   */
  addCodeRule(domain, rule) {
    const normalizedDomain = this.normalizeDomain(domain);
    const ruleWithMeta = {
      ...rule,
      domain: normalizedDomain,
      source: "code",
      enabled: true,
      id: `code_${normalizedDomain}_${Date.now()}`,
    };

    this.codeRules.set(normalizedDomain, ruleWithMeta);
    this.updateMergedRules();

    console.log(`ChronoClip: Code rule added for ${normalizedDomain}`);
  }

  /**
   * UIからルールを追加
   * @param {string} domain - ドメイン名
   * @param {Object} rule - ルール定義
   */
  async addUIRule(domain, rule) {
    const normalizedDomain = this.normalizeDomain(domain);
    const ruleWithMeta = {
      ...rule,
      domain: normalizedDomain,
      source: "ui",
      enabled: rule.enabled !== false,
      id: rule.id || `ui_${normalizedDomain}_${Date.now()}`,
    };

    this.uiRules.set(normalizedDomain, ruleWithMeta);
    await this.saveUIRules();
    this.updateMergedRules();

    console.log(`ChronoClip: UI rule added for ${normalizedDomain}`);
  }

  /**
   * ルールを削除
   * @param {string} domain - ドメイン名
   * @param {string} source - 'code' または 'ui'
   */
  async removeRule(domain, source = "ui") {
    const normalizedDomain = this.normalizeDomain(domain);

    if (source === "ui") {
      this.uiRules.delete(normalizedDomain);
      await this.saveUIRules();
    } else if (source === "code") {
      this.codeRules.delete(normalizedDomain);
    }

    this.updateMergedRules();
    console.log(
      `ChronoClip: Rule removed for ${normalizedDomain} (source: ${source})`
    );
  }

  /**
   * ドメインのルールを取得
   * @param {string} domain - ドメイン名
   * @returns {Object|null} ルール定義
   */
  getRuleForDomain(domain) {
    const normalizedDomain = this.normalizeDomain(domain);

    // 完全一致を優先
    let rule = this.rules.get(normalizedDomain);
    if (rule && rule.enabled) {
      return rule;
    }

    // サブドメイン継承チェック
    const domainParts = normalizedDomain.split(".");
    for (let i = 1; i < domainParts.length; i++) {
      const parentDomain = domainParts.slice(i).join(".");
      rule = this.rules.get(parentDomain);
      if (rule && rule.enabled && rule.inheritSubdomains !== false) {
        return rule;
      }
    }

    // ワイルドカードルール
    rule = this.rules.get("*");
    if (rule && rule.enabled) {
      return rule;
    }

    return null;
  }

  /**
   * 全てのルールを取得
   * @returns {Array} ルール配列
   */
  getAllRules() {
    return Array.from(this.rules.values()).sort((a, b) => {
      // 優先度順でソート
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  /**
   * UIで管理されるルールのみを取得
   * @returns {Array} UIルール配列
   */
  getUIRules() {
    return Array.from(this.uiRules.values());
  }

  /**
   * ルールが存在するかチェック
   * @param {string} domain - ドメイン名
   * @returns {boolean} ルールの存在フラグ
   */
  hasRule(domain) {
    return this.getRuleForDomain(domain) !== null;
  }

  /**
   * ドメインの正規化
   * @param {string} domain - ドメイン名
   * @returns {string} 正規化されたドメイン名
   */
  normalizeDomain(domain) {
    if (!domain || domain === "*") return domain;
    return domain.toLowerCase().replace(/^www\./, "");
  }

  /**
   * UIルールをストレージから読み込み
   */
  async loadUIRules() {
    try {
      const settings = await window.ChronoClipSettings.getSettings();
      if (settings.siteRules && Array.isArray(settings.siteRules)) {
        this.uiRules.clear();
        settings.siteRules.forEach((rule) => {
          if (rule.domain) {
            this.uiRules.set(rule.domain, {
              ...rule,
              source: "ui",
            });
          }
        });
      }
    } catch (error) {
      console.warn("ChronoClip: Failed to load UI rules:", error);
    }
  }

  /**
   * UIルールをストレージに保存
   */
  async saveUIRules() {
    try {
      const settings = await window.ChronoClipSettings.getSettings();
      settings.siteRules = Array.from(this.uiRules.values()).map((rule) => {
        const { source, ...ruleWithoutSource } = rule;
        return ruleWithoutSource;
      });
      await window.ChronoClipSettings.setSettings(settings);
    } catch (error) {
      console.error("ChronoClip: Failed to save UI rules:", error);
      throw error;
    }
  }

  /**
   * コードルールとUIルールをマージ
   */
  updateMergedRules() {
    this.rules.clear();

    // コードルールを追加（優先度低）
    for (const [domain, rule] of this.codeRules) {
      this.rules.set(domain, rule);
    }

    // UIルールを追加（優先度高、上書き）
    for (const [domain, rule] of this.uiRules) {
      this.rules.set(domain, rule);
    }
  }

  /**
   * ルールの統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      total: this.rules.size,
      codeRules: this.codeRules.size,
      uiRules: this.uiRules.size,
      enabled: Array.from(this.rules.values()).filter((r) => r.enabled).length,
      disabled: Array.from(this.rules.values()).filter((r) => !r.enabled)
        .length,
    };
  }
}

// シングルトンインスタンス
let siteRuleManagerInstance = null;

/**
 * SiteRuleManagerのシングルトンインスタンスを取得
 * @returns {SiteRuleManager} SiteRuleManagerインスタンス
 */
function getSiteRuleManager() {
  if (!siteRuleManagerInstance) {
    siteRuleManagerInstance = new SiteRuleManager();
  }
  return siteRuleManagerInstance;
}

// グローバルエクスポート
if (typeof window !== "undefined") {
  window.ChronoClipSiteRuleManager = {
    getSiteRuleManager,
    SiteRuleManager,
  };
}

// Node.js エクスポート (テスト用)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getSiteRuleManager,
    SiteRuleManager,
  };
}
