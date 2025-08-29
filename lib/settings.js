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
