/**
 * @fileoverview ChronoClip設定管理ライブラリ
 * Chrome Storage での永続化、バリデーション、ブロードキャスト機能を提供
 */

/**
 * 設定のデフォルト値
 */
const DEFAULT_SETTINGS = {
  version: 1,
  autoDetect: true, // 常時スキャン（自動検出）ON/OFF
  highlightDates: true, // ハイライト表示ON/OFF
  defaultDuration: 180, // デフォルトイベント時間（分）
  defaultCalendar: "primary", // 追加先カレンダーID
  timezone: "Asia/Tokyo", // 既定タイムゾーン
  includeURL: true, // 抽出時にURLを説明へ付与
  dateFormats: ["JP", "ISO", "US"], // 対応日付形式の優先順位
  rulesEnabled: false, // サイト別ルールの有効無効
  siteRules: {}, // サイト別ルール設定

  // エラーハンドリングとログ関連設定（新規追加）
  debugMode: false, // デバッグモード（詳細ログ表示）
  errorReportConsent: false, // エラーレポート送信同意
};

/**
 * 日付形式の許可値
 */
const ALLOWED_DATE_FORMATS = ["JP", "US", "ISO", "EU"];

/**
 * タイムゾーンの主要候補
 */
const COMMON_TIMEZONES = [
  "Asia/Tokyo",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Australia/Sydney",
];

/**
 * サイトルールのデフォルト値
 */
const DEFAULT_SITE_RULE = {
  enabled: true,
  inheritSubdomains: false,
  date: {
    anchorSelector: "", // 日付を見つけるためのセレクター
    withinBlockSelector: "article, .card, li, section", // ブロック境界を定義
  },
  title: {
    fromSameBlockSelector: "h1, h2, h3, .title, .headline", // タイトル抽出セレクター
    fallbackFromPrevHeading: true, // 見出しからのフォールバック
  },
  description: {
    fromSameBlockSelectors: ["p", ".description", ".content", ".summary"], // 説明抽出セレクター
    maxBlocks: 3, // 最大ブロック数
    includeURL: "inherit", // URL含有設定（inherit/true/false）
  },
  location: {
    selector: ".location, .venue, [itemprop=location]", // 場所抽出セレクター
  },
  time: {
    startSelector: ".start-time, .time-start", // 開始時刻セレクター
    endSelector: ".end-time, .time-end", // 終了時刻セレクター
    preferDateTimeAttr: true, // datetime属性を優先
  },
  filters: {
    removeSelectors: [], // ノイズ除去セレクター
    stopwords: [], // ドメイン固有のストップワード
  },
  advanced: {
    customJoiner: " / ", // カスタム結合文字
    trimBrackets: false, // 括弧の圧縮
  },
};

/**
 * 設定バリデーション結果
 */
class ValidationResult {
  constructor(isValid = true, errors = []) {
    this.isValid = isValid;
    this.errors = errors;
  }

  addError(field, message) {
    this.isValid = false;
    this.errors.push({ field, message });
  }
}

/**
 * 設定管理クラス
 */
class SettingsManager {
  constructor() {
    this.cache = null;
    this.listeners = new Set();
    this.debounceTimer = null;
    this.DEBOUNCE_MS = 100;
  }

  /**
   * 設定を取得（キャッシュまたはストレージから）
   * @returns {Promise<Object>} 設定オブジェクト
   */
  async getSettings() {
    if (this.cache) {
      return this.cache;
    }

    try {
      const result = await chrome.storage.sync.get(null);
      let settings = result.chronoClipSettings || {};

      // マイグレーション実行
      settings = await this.migrateIfNeeded(settings);

      this.cache = settings;
      return settings;
    } catch (error) {
      console.error("ChronoClip: Failed to load settings:", error);
      // エラー時はデフォルト設定を返す
      this.cache = { ...DEFAULT_SETTINGS };
      return this.cache;
    }
  }

  /**
   * 設定を更新（バリデーション→保存→ブロードキャスト）
   * @param {Object} patch 更新する設定項目
   * @returns {Promise<Object>} 更新後の設定
   */
  async setSettings(patch) {
    const currentSettings = await this.getSettings();
    const newSettings = { ...currentSettings, ...patch };

    // バリデーション実行
    const validation = this.validateSettings(newSettings);
    if (!validation.isValid) {
      throw new Error(
        `設定バリデーションエラー: ${validation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(", ")}`
      );
    }

    try {
      // Chrome Storage に保存
      await chrome.storage.sync.set({
        chronoClipSettings: newSettings,
      });

      // キャッシュ更新
      this.cache = newSettings;

      // 変更をブロードキャスト
      this.broadcastSettings(newSettings);

      return newSettings;
    } catch (error) {
      console.error("ChronoClip: Failed to save settings:", error);
      throw new Error("設定の保存に失敗しました");
    }
  }

  /**
   * 設定をデフォルトにリセット
   * @returns {Promise<Object>} リセット後の設定
   */
  async resetToDefault() {
    return await this.setSettings(DEFAULT_SETTINGS);
  }

  /**
   * 設定変更リスナーを登録
   * @param {Function} listener コールバック関数
   */
  onSettingsChanged(listener) {
    this.listeners.add(listener);
  }

  /**
   * 設定変更リスナーを削除
   * @param {Function} listener コールバック関数
   */
  removeSettingsListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * 設定変更をブロードキャスト（デバウンス付き）
   * @param {Object} settings 設定オブジェクト
   */
  broadcastSettings(settings) {
    // デバウンス処理
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      // ローカルリスナーに通知
      this.listeners.forEach((listener) => {
        try {
          listener(settings);
        } catch (error) {
          console.error("ChronoClip: Settings listener error:", error);
        }
      });

      // Chrome Runtime メッセージでブロードキャスト
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime
          .sendMessage({
            type: "settings:updated",
            settings: settings,
          })
          .catch((error) => {
            // メッセージ送信エラーは無視（受信者がいない場合など）
            console.log("ChronoClip: Settings broadcast (no receivers)");
          });
      }
    }, this.DEBOUNCE_MS);
  }

  /**
   * 設定のバリデーション
   * @param {Object} settings 検証する設定
   * @returns {ValidationResult} バリデーション結果
   */
  validateSettings(settings) {
    const result = new ValidationResult();

    // バージョン
    if (typeof settings.version !== "number" || settings.version < 1) {
      result.addError("version", "無効なバージョン");
    }

    // autoDetect
    if (typeof settings.autoDetect !== "boolean") {
      result.addError("autoDetect", "真偽値である必要があります");
    }

    // highlightDates
    if (typeof settings.highlightDates !== "boolean") {
      result.addError("highlightDates", "真偽値である必要があります");
    }

    // defaultDuration（分）
    if (
      typeof settings.defaultDuration !== "number" ||
      settings.defaultDuration <= 0 ||
      settings.defaultDuration > 1440
    ) {
      result.addError(
        "defaultDuration",
        "1分から1440分（24時間）の範囲で指定してください"
      );
    }

    // defaultCalendar
    if (
      typeof settings.defaultCalendar !== "string" ||
      settings.defaultCalendar.trim() === ""
    ) {
      result.addError(
        "defaultCalendar",
        "カレンダーIDは空でない文字列である必要があります"
      );
    }

    // timezone
    if (!this.isValidTimezone(settings.timezone)) {
      result.addError("timezone", "有効なタイムゾーンを指定してください");
    }

    // includeURL
    if (typeof settings.includeURL !== "boolean") {
      result.addError("includeURL", "真偽値である必要があります");
    }

    // dateFormats
    if (
      !Array.isArray(settings.dateFormats) ||
      settings.dateFormats.length === 0 ||
      !settings.dateFormats.every((fmt) => ALLOWED_DATE_FORMATS.includes(fmt))
    ) {
      result.addError(
        "dateFormats",
        `日付形式は${ALLOWED_DATE_FORMATS.join(", ")}から選択してください`
      );
    }

    // rulesEnabled
    if (typeof settings.rulesEnabled !== "boolean") {
      result.addError("rulesEnabled", "真偽値である必要があります");
    }

    // siteRules
    if (settings.siteRules && typeof settings.siteRules === "object") {
      Object.entries(settings.siteRules).forEach(([domain, rule]) => {
        const ruleResult = this.validateSiteRule(rule, domain);
        if (!ruleResult.isValid) {
          ruleResult.errors.forEach((error) => {
            result.addError(
              `siteRules.${domain}.${error.field}`,
              error.message
            );
          });
        }
      });
    } else if (settings.siteRules !== undefined) {
      result.addError("siteRules", "オブジェクトである必要があります");
    }

    // siteRules
    if (typeof settings.siteRules !== "object" || settings.siteRules === null) {
      result.addError("siteRules", "オブジェクトである必要があります");
    } else {
      // サイトルールのサイズ制限
      const rulesJson = JSON.stringify(settings.siteRules);
      if (rulesJson.length > 50000) {
        // 50KB制限
        result.addError(
          "siteRules",
          "サイトルールのサイズが大きすぎます（50KB以下にしてください）"
        );
      }

      // 各サイトルールの検証
      Object.entries(settings.siteRules).forEach(([site, rule]) => {
        if (typeof rule !== "object" || rule === null) {
          result.addError(
            `siteRules.${site}`,
            "ルールはオブジェクトである必要があります"
          );
          return;
        }

        if (
          rule.selectors &&
          (!Array.isArray(rule.selectors) ||
            rule.selectors.some((s) => typeof s !== "string") ||
            rule.selectors.length > 20)
        ) {
          result.addError(
            `siteRules.${site}.selectors`,
            "セレクターは文字列配列（20個以下）である必要があります"
          );
        }

        if (rule.enabled !== undefined && typeof rule.enabled !== "boolean") {
          result.addError(
            `siteRules.${site}.enabled`,
            "真偽値である必要があります"
          );
        }
      });
    }

    return result;
  }

  /**
   * タイムゾーンの簡易検証
   * @param {string} timezone タイムゾーン文字列
   * @returns {boolean} 有効性
   */
  isValidTimezone(timezone) {
    if (typeof timezone !== "string") return false;

    // 共通タイムゾーンまたはIANA形式（大陸/都市）かチェック
    return (
      COMMON_TIMEZONES.includes(timezone) ||
      /^[A-Za-z]+\/[A-Za-z_]+$/.test(timezone) ||
      timezone === "UTC"
    );
  }

  /**
   * サイトルールの検証
   * @param {Object} rule サイトルール
   * @param {string} domain ドメイン名
   * @returns {ValidationResult} 検証結果
   */
  validateSiteRule(rule, domain) {
    const result = new ValidationResult();

    if (!rule || typeof rule !== "object") {
      result.addError("rule", "オブジェクトである必要があります");
      return result;
    }

    // enabled
    if (rule.enabled !== undefined && typeof rule.enabled !== "boolean") {
      result.addError("enabled", "真偽値である必要があります");
    }

    // inheritSubdomains
    if (
      rule.inheritSubdomains !== undefined &&
      typeof rule.inheritSubdomains !== "boolean"
    ) {
      result.addError("inheritSubdomains", "真偽値である必要があります");
    }

    // date セクション
    if (rule.date) {
      if (
        rule.date.anchorSelector &&
        !this.isValidSelector(rule.date.anchorSelector)
      ) {
        result.addError(
          "date.anchorSelector",
          "有効なCSSセレクターである必要があります"
        );
      }
      if (
        rule.date.withinBlockSelector &&
        !this.isValidSelector(rule.date.withinBlockSelector)
      ) {
        result.addError(
          "date.withinBlockSelector",
          "有効なCSSセレクターである必要があります"
        );
      }
    }

    // title セクション
    if (rule.title) {
      if (
        rule.title.fromSameBlockSelector &&
        !this.isValidSelector(rule.title.fromSameBlockSelector)
      ) {
        result.addError(
          "title.fromSameBlockSelector",
          "有効なCSSセレクターである必要があります"
        );
      }
      if (
        rule.title.fallbackFromPrevHeading !== undefined &&
        typeof rule.title.fallbackFromPrevHeading !== "boolean"
      ) {
        result.addError(
          "title.fallbackFromPrevHeading",
          "真偽値である必要があります"
        );
      }
    }

    // description セクション
    if (rule.description) {
      if (
        rule.description.fromSameBlockSelectors &&
        Array.isArray(rule.description.fromSameBlockSelectors)
      ) {
        rule.description.fromSameBlockSelectors.forEach((selector, index) => {
          if (!this.isValidSelector(selector)) {
            result.addError(
              `description.fromSameBlockSelectors[${index}]`,
              "有効なCSSセレクターである必要があります"
            );
          }
        });
      }
      if (
        rule.description.maxBlocks !== undefined &&
        (typeof rule.description.maxBlocks !== "number" ||
          rule.description.maxBlocks < 1 ||
          rule.description.maxBlocks > 10)
      ) {
        result.addError(
          "description.maxBlocks",
          "1から10の範囲の数値である必要があります"
        );
      }
      if (
        rule.description.includeURL !== undefined &&
        !["inherit", true, false].includes(rule.description.includeURL)
      ) {
        result.addError(
          "description.includeURL",
          "'inherit', true, false のいずれかである必要があります"
        );
      }
    }

    // location セクション
    if (
      rule.location &&
      rule.location.selector &&
      !this.isValidSelector(rule.location.selector)
    ) {
      result.addError(
        "location.selector",
        "有効なCSSセレクターである必要があります"
      );
    }

    // time セクション
    if (rule.time) {
      if (
        rule.time.startSelector &&
        !this.isValidSelector(rule.time.startSelector)
      ) {
        result.addError(
          "time.startSelector",
          "有効なCSSセレクターである必要があります"
        );
      }
      if (
        rule.time.endSelector &&
        !this.isValidSelector(rule.time.endSelector)
      ) {
        result.addError(
          "time.endSelector",
          "有効なCSSセレクターである必要があります"
        );
      }
      if (
        rule.time.preferDateTimeAttr !== undefined &&
        typeof rule.time.preferDateTimeAttr !== "boolean"
      ) {
        result.addError(
          "time.preferDateTimeAttr",
          "真偽値である必要があります"
        );
      }
    }

    // filters セクション
    if (rule.filters) {
      if (
        rule.filters.removeSelectors &&
        Array.isArray(rule.filters.removeSelectors)
      ) {
        rule.filters.removeSelectors.forEach((selector, index) => {
          if (!this.isValidSelector(selector)) {
            result.addError(
              `filters.removeSelectors[${index}]`,
              "有効なCSSセレクターである必要があります"
            );
          }
        });
      }
      if (rule.filters.stopwords && !Array.isArray(rule.filters.stopwords)) {
        result.addError("filters.stopwords", "配列である必要があります");
      }
    }

    // advanced セクション
    if (rule.advanced) {
      if (
        rule.advanced.customJoiner !== undefined &&
        typeof rule.advanced.customJoiner !== "string"
      ) {
        result.addError("advanced.customJoiner", "文字列である必要があります");
      }
      if (
        rule.advanced.trimBrackets !== undefined &&
        typeof rule.advanced.trimBrackets !== "boolean"
      ) {
        result.addError("advanced.trimBrackets", "真偽値である必要があります");
      }
    }

    return result;
  }

  /**
   * CSSセレクターの簡易検証
   * @param {string} selector CSSセレクター
   * @returns {boolean} 有効性
   */
  isValidSelector(selector) {
    if (typeof selector !== "string" || selector.trim() === "") return false;
    if (selector.length > 256) return false; // 長さ制限

    try {
      // DocumentFragmentで軽量検証
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * マイグレーション実行
   * @param {Object} settings 現在の設定
   * @returns {Promise<Object>} マイグレーション後の設定
   */
  async migrateIfNeeded(settings) {
    const currentVersion = settings.version || 0;

    if (currentVersion < 1) {
      // v1へのマイグレーション: デフォルト値で不足キーを補完
      const migratedSettings = { ...DEFAULT_SETTINGS, ...settings };
      migratedSettings.version = 1;

      console.log("ChronoClip: Settings migrated to v1");
      return migratedSettings;
    }

    // デフォルト値で不足キーを補完（新しいキーが追加された場合の対応）
    const filledSettings = { ...DEFAULT_SETTINGS, ...settings };

    return filledSettings;
  }

  /**
   * デフォルト設定を取得
   * @returns {Object} デフォルト設定のコピー
   */
  getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * ホストに対する実効設定を取得（サイトルール適用済み）
   * @param {string} host ホスト名（例: "example.com", "sub.example.com"）
   * @returns {Promise<Object>} 実効設定オブジェクト
   */
  async getEffectiveSettings(host) {
    const globalSettings = await this.getSettings();

    if (!globalSettings.rulesEnabled || !globalSettings.siteRules) {
      return globalSettings;
    }

    // 最適なサイトルールを見つける
    const matchedRule = this.findBestMatchingSiteRule(
      host,
      globalSettings.siteRules
    );

    if (!matchedRule || !matchedRule.enabled) {
      return globalSettings;
    }

    // グローバル設定にサイトルールを適用
    return this.applySiteRuleToSettings(globalSettings, matchedRule);
  }

  /**
   * ホストに最もマッチするサイトルールを見つける
   * @param {string} host ホスト名
   * @param {Object} siteRules サイトルール設定
   * @returns {Object|null} マッチしたルールまたはnull
   */
  findBestMatchingSiteRule(host, siteRules) {
    const candidates = [];

    // 完全一致を最優先
    if (siteRules[host]) {
      candidates.push({ domain: host, rule: siteRules[host], priority: 1000 });
    }

    // サブドメイン継承を考慮した候補を探す
    Object.entries(siteRules).forEach(([domain, rule]) => {
      if (domain === host) return; // 完全一致は既に処理済み

      if (rule.inheritSubdomains && host.endsWith("." + domain)) {
        // ドメインの深さを優先度に反映（より具体的なドメインが高優先）
        const depth = host.split(".").length - domain.split(".").length;
        candidates.push({ domain, rule, priority: 500 - depth });
      }
    });

    // 優先度が最も高いものを返す
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].rule;
  }

  /**
   * グローバル設定にサイトルールを適用する
   * @param {Object} globalSettings グローバル設定
   * @param {Object} siteRule サイトルール
   * @returns {Object} 適用済み設定
   */
  applySiteRuleToSettings(globalSettings, siteRule) {
    const effectiveSettings = { ...globalSettings };

    // description.includeURL の特別処理
    if (siteRule.description && siteRule.description.includeURL !== "inherit") {
      effectiveSettings.includeURL = siteRule.description.includeURL;
    }

    // サイトルール自体も保持（抽出処理で使用）
    effectiveSettings._appliedSiteRule = siteRule;

    return effectiveSettings;
  }

  /**
   * デフォルトサイトルールを取得
   * @returns {Object} デフォルトサイトルールのコピー
   */
  getDefaultSiteRule() {
    return { ...DEFAULT_SITE_RULE };
  }

  /**
   * 許可されている日付形式を取得
   * @returns {string[]} 日付形式配列
   */
  getAllowedDateFormats() {
    return [...ALLOWED_DATE_FORMATS];
  }

  /**
   * 共通タイムゾーンを取得
   * @returns {string[]} タイムゾーン配列
   */
  getCommonTimezones() {
    return [...COMMON_TIMEZONES];
  }
}

// グローバルインスタンス
const settingsManager = new SettingsManager();

// グローバル関数としてエクスポート（既存コードとの互換性）
window.ChronoClipSettings = {
  getSettings: () => settingsManager.getSettings(),
  setSettings: (patch) => settingsManager.setSettings(patch),
  resetToDefault: () => settingsManager.resetToDefault(),
  onSettingsChanged: (listener) => settingsManager.onSettingsChanged(listener),
  removeSettingsListener: (listener) =>
    settingsManager.removeSettingsListener(listener),
  getDefaultSettings: () => settingsManager.getDefaultSettings(),
  getAllowedDateFormats: () => settingsManager.getAllowedDateFormats(),
  getCommonTimezones: () => settingsManager.getCommonTimezones(),
  validateSettings: (settings) => settingsManager.validateSettings(settings),
};

// module環境でも利用可能にする
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SettingsManager,
    DEFAULT_SETTINGS,
    ALLOWED_DATE_FORMATS,
    COMMON_TIMEZONES,
  };
}

console.log("ChronoClip: Settings library loaded");
