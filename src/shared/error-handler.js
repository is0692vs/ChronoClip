/**
 * ChronoClip エラー分類とメッセージ管理システム
 * 要件：既存機能を損なわず、失敗時の挙動のみ改善
 */

/**
 * エラー分類の定義
 */
const ERROR_CATEGORIES = {
  // 認証関連
  AUTH_REQUIRED: "auth_required",
  AUTH_FAILED: "auth_failed",
  AUTH_EXPIRED: "auth_expired",

  // 権限関連
  PERMISSION_DENIED: "permission_denied",
  PERMISSION_INSUFFICIENT: "permission_insufficient",

  // ネットワーク関連
  NETWORK_ERROR: "network_error",
  NETWORK_TIMEOUT: "network_timeout",
  RATE_LIMITED: "rate_limited",

  // API関連
  API_ERROR: "api_error",
  API_QUOTA_EXCEEDED: "api_quota_exceeded",
  API_INVALID_REQUEST: "api_invalid_request",

  // 解析関連
  PARSE_FAILED: "parse_failed",
  EXTRACTION_FAILED: "extraction_failed",
  DATE_INVALID: "date_invalid",

  // 処理関連
  PROCESSING_FAILED: "processing_failed",
  VALIDATION_FAILED: "validation_failed",

  // ユーザー操作関連
  USER_CANCELLED: "user_cancelled",
  USER_INPUT_INVALID: "user_input_invalid",

  // システム関連
  INITIALIZATION_FAILED: "initialization_failed",
  CONFIGURATION_ERROR: "configuration_error",

  // 予期しないエラー
  UNEXPECTED_ERROR: "unexpected_error",
};

/**
 * ユーザー向け日本語メッセージ
 */
const USER_MESSAGES = {
  // 成功メッセージ
  SUCCESS_ADDED: "カレンダーに追加しました",
  SUCCESS_PARTIAL: "一部のイベントを追加できませんでした",

  // 認証関連
  [ERROR_CATEGORIES.AUTH_REQUIRED]: {
    message: "Googleへのサインインが必要です。［サインイン］を押してください",
    action: "サインイン",
    actionType: "auth",
  },
  [ERROR_CATEGORIES.AUTH_FAILED]: {
    message: "Googleへのサインインに失敗しました。再度お試しください",
    action: "再試行",
    actionType: "retry",
  },
  [ERROR_CATEGORIES.AUTH_EXPIRED]: {
    message: "サインインの有効期限が切れました。再度サインインしてください",
    action: "再サインイン",
    actionType: "auth",
  },

  // 権限関連
  [ERROR_CATEGORIES.PERMISSION_DENIED]: {
    message:
      "カレンダーへのアクセス権限がありません。拡張機能の権限を確認してください",
    action: "権限を確認",
    actionType: "settings",
  },
  [ERROR_CATEGORIES.PERMISSION_INSUFFICIENT]: {
    message:
      "カレンダーへの書き込み権限が不足しています。権限設定を確認してください",
    action: "権限を確認",
    actionType: "settings",
  },

  // ネットワーク関連
  [ERROR_CATEGORIES.NETWORK_ERROR]: {
    message:
      "ネットワークエラーが発生しました。インターネット接続を確認してください",
    action: "再試行",
    actionType: "retry",
  },
  [ERROR_CATEGORIES.NETWORK_TIMEOUT]: {
    message:
      "ネットワークがタイムアウトしました。しばらく待ってから再度お試しください",
    action: "再試行",
    actionType: "retry",
  },
  [ERROR_CATEGORIES.RATE_LIMITED]: {
    message:
      "アクセス頻度の制限に達しました。しばらく待ってから再度お試しください",
    action: "少し待つ",
    actionType: "wait",
  },

  // API関連
  [ERROR_CATEGORIES.API_ERROR]: {
    message:
      "Googleカレンダーサービスでエラーが発生しました。しばらく待ってから再度お試しください",
    action: "再試行",
    actionType: "retry",
  },
  [ERROR_CATEGORIES.API_QUOTA_EXCEEDED]: {
    message: "API利用制限に達しました。しばらく待ってから再度お試しください",
    action: "後で再試行",
    actionType: "wait",
  },

  // 解析関連
  [ERROR_CATEGORIES.PARSE_FAILED]: {
    message:
      "日付の読み取りに失敗しました。テキストを選択して再度お試しください",
    action: "テキストを選択",
    actionType: "user_action",
  },
  [ERROR_CATEGORIES.EXTRACTION_FAILED]: {
    message:
      "イベント情報の抽出に失敗しました。別の箇所をクリックして再度お試しください",
    action: "別の箇所をクリック",
    actionType: "user_action",
  },
  [ERROR_CATEGORIES.DATE_INVALID]: {
    message:
      "有効な日付が見つかりませんでした。日付を含むテキストを選択してください",
    action: "日付を選択",
    actionType: "user_action",
  },

  // 処理関連
  [ERROR_CATEGORIES.PROCESSING_FAILED]: {
    message: "処理中にエラーが発生しました。再度お試しください",
    action: "再試行",
    actionType: "retry",
  },
  [ERROR_CATEGORIES.VALIDATION_FAILED]: {
    message: "入力内容に問題があります。内容を確認して再度お試しください",
    action: "内容を確認",
    actionType: "user_action",
  },

  // ユーザー操作関連
  [ERROR_CATEGORIES.USER_CANCELLED]: {
    message: "キャンセルされました",
    action: null,
    actionType: "none",
  },
  [ERROR_CATEGORIES.USER_INPUT_INVALID]: {
    message: "入力内容が正しくありません。内容を確認してください",
    action: "内容を確認",
    actionType: "user_action",
  },

  // システム関連
  [ERROR_CATEGORIES.INITIALIZATION_FAILED]: {
    message:
      "拡張機能の初期化に失敗しました。ページを更新して再度お試しください",
    action: "ページを更新",
    actionType: "refresh",
  },
  [ERROR_CATEGORIES.CONFIGURATION_ERROR]: {
    message: "設定に問題があります。拡張機能の設定を確認してください",
    action: "設定を確認",
    actionType: "settings",
  },

  // 予期しないエラー
  [ERROR_CATEGORIES.UNEXPECTED_ERROR]: {
    message: "予期しないエラーが発生しました。再度お試しください",
    action: "再試行",
    actionType: "retry",
  },
};

/**
 * エラー分類システム
 */
class ChronoClipErrorHandler {
  constructor() {
    // Loggerのインスタンスを作成（ブラウザ環境とService Worker環境の両方に対応）
    const globalScope = typeof window !== "undefined" ? window : self;

    if (globalScope.ChronoClipLogger) {
      this.logger = new globalScope.ChronoClipLogger();
    } else {
      // フォールバック: コンソールログ
      this.logger = {
        fatal: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
      };
    }
  }

  /**
   * エラーを分類する
   */
  categorizeError(error, context = {}) {
    if (!error) {
      return ERROR_CATEGORIES.UNEXPECTED_ERROR;
    }

    // HTTP ステータスコードによる分類
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode;

      if (status === 401) {
        return ERROR_CATEGORIES.AUTH_REQUIRED;
      } else if (status === 403) {
        return ERROR_CATEGORIES.PERMISSION_DENIED;
      } else if (status === 429) {
        return ERROR_CATEGORIES.RATE_LIMITED;
      } else if (status >= 400 && status < 500) {
        return ERROR_CATEGORIES.API_INVALID_REQUEST;
      } else if (status >= 500) {
        return ERROR_CATEGORIES.API_ERROR;
      }
    }

    // エラーメッセージによる分類
    const message = (error.message || "").toLowerCase();

    if (message.includes("network") || message.includes("fetch")) {
      return ERROR_CATEGORIES.NETWORK_ERROR;
    } else if (message.includes("timeout")) {
      return ERROR_CATEGORIES.NETWORK_TIMEOUT;
    } else if (message.includes("auth") || message.includes("unauthorized")) {
      return ERROR_CATEGORIES.AUTH_FAILED;
    } else if (
      message.includes("permission") ||
      message.includes("forbidden")
    ) {
      return ERROR_CATEGORIES.PERMISSION_DENIED;
    } else if (message.includes("parse") || message.includes("invalid date")) {
      return ERROR_CATEGORIES.PARSE_FAILED;
    } else if (message.includes("quota") || message.includes("limit")) {
      return ERROR_CATEGORIES.API_QUOTA_EXCEEDED;
    }

    // コンテキストによる分類
    if (context.type === "extraction") {
      return ERROR_CATEGORIES.EXTRACTION_FAILED;
    } else if (context.type === "initialization") {
      return ERROR_CATEGORIES.INITIALIZATION_FAILED;
    } else if (context.type === "user_cancelled") {
      return ERROR_CATEGORIES.USER_CANCELLED;
    }

    return ERROR_CATEGORIES.UNEXPECTED_ERROR;
  }

  /**
   * ユーザー向けメッセージを取得
   */
  getUserMessage(category) {
    return (
      USER_MESSAGES[category] ||
      USER_MESSAGES[ERROR_CATEGORIES.UNEXPECTED_ERROR]
    );
  }

  /**
   * エラーを処理してログに記録
   */
  handleError(error, context = {}) {
    const category = this.categorizeError(error, context);
    const userMessage = this.getUserMessage(category);

    // ログレベルの決定
    let logLevel = "warn";
    if (category === ERROR_CATEGORIES.USER_CANCELLED) {
      logLevel = "info";
    } else if (
      [
        ERROR_CATEGORIES.AUTH_REQUIRED,
        ERROR_CATEGORIES.PERMISSION_DENIED,
        ERROR_CATEGORIES.INITIALIZATION_FAILED,
      ].includes(category)
    ) {
      logLevel = "fatal";
    }

    // ログに記録
    const logDetails = {
      category,
      originalError: error,
      context,
      userMessage: userMessage.message,
    };

    if (logLevel === "fatal") {
      this.logger.fatal(`Error: ${category}`, logDetails);
    } else if (logLevel === "warn") {
      this.logger.warn(`Error: ${category}`, logDetails);
    } else {
      this.logger.info(`Error: ${category}`, logDetails);
    }

    return {
      category,
      userMessage,
      logLevel,
      details: logDetails,
    };
  }

  /**
   * 一括処理の結果を処理
   */
  handleBatchResult(results) {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    let message;
    let details = {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
    };

    if (failed.length === 0) {
      // 全成功
      message = USER_MESSAGES.SUCCESS_ADDED;
      this.logger.info("Batch processing completed successfully", details);
    } else if (successful.length === 0) {
      // 全失敗
      message = "全てのイベントの追加に失敗しました";
      this.logger.warn("Batch processing failed completely", details);
    } else {
      // 部分成功
      message = USER_MESSAGES.SUCCESS_PARTIAL;
      this.logger.warn("Batch processing partially successful", details);
    }

    return {
      message,
      successful: successful.length,
      failed: failed.length,
      total: results.length,
      details,
    };
  }
}

// グローバルクラスとして登録（ブラウザ環境 - content scripts/popup/options）
if (typeof window !== "undefined") {
  window.ChronoClipErrorHandler = ChronoClipErrorHandler;
  window.chronoClipErrorHandler = new ChronoClipErrorHandler();
  window.ChronoClipErrorCategories = ERROR_CATEGORIES;
  window.ChronoClipUserMessages = USER_MESSAGES;
}

// Service Worker環境では self を使用
if (typeof self !== "undefined" && typeof window === "undefined") {
  self.ChronoClipErrorHandler = ChronoClipErrorHandler;
  self.chronoClipErrorHandler = new ChronoClipErrorHandler();
  self.ChronoClipErrorCategories = ERROR_CATEGORIES;
  self.ChronoClipUserMessages = USER_MESSAGES;
}

// モジュールとしてエクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ChronoClipErrorHandler,
    ERROR_CATEGORIES,
    USER_MESSAGES,
  };
}
