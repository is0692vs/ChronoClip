/**
 * ChronoClip 統一ログシステム
 * 要件：エラーハンドリングとログ基盤
 *
 * ログレベル:
 * - fatal: 初期化不可、認証不可、権限不足、カレンダー API の 4xx/5xx
 * - warn: 抽出失敗や一括処理の一部失敗
 * - info: ユーザーキャンセル、設定未完了などの想定内事象
 * - debug: 詳細な内部情報（デバッグモード時のみ出力）
 */

class ChronoClipLogger {
  constructor() {
    this.debugMode = false;
    this.prefix = "ChronoClip";
    this.loadSettings();
  }

  /**
   * 設定の読み込み（デバッグモード）
   */
  async loadSettings() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        const result = await chrome.storage.sync.get(["debugMode"]);
        this.debugMode = result.debugMode || false;
      }
    } catch (error) {
      // 設定読み込み失敗時はデフォルト値を使用
      this.debugMode = false;
    }
  }

  /**
   * デバッグモードの設定
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  /**
   * ログエントリの作成
   */
  createLogEntry(level, message, details = {}) {
    const timestamp = new Date().toISOString();
    const location = this.getCallerLocation();

    return {
      timestamp,
      level,
      message,
      location,
      details: this.sanitizeDetails(details),
      prefix: this.prefix,
    };
  }

  /**
   * 呼び出し元の特定（スタックトレースから）
   */
  getCallerLocation() {
    try {
      const error = new Error();
      const stack = error.stack;
      if (stack) {
        const lines = stack.split("\n");
        // 通常は3番目の行が呼び出し元
        const callerLine = lines[3] || "";
        const match = callerLine.match(/at\s+(.+?)(?:\s+\((.+?)\))?$/);
        if (match) {
          return match[1] || "unknown";
        }
      }
    } catch (e) {
      // スタックトレース取得失敗時
    }
    return "unknown";
  }

  /**
   * 詳細情報のサニタイズ（個人情報を除去）
   */
  sanitizeDetails(details) {
    if (!details || typeof details !== "object") {
      return details;
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(details)) {
      if (typeof value === "string") {
        // 文字列は長さ制限と先頭・末尾の一部のみ
        if (value.length > 100) {
          sanitized[key] = {
            length: value.length,
            preview: `${value.substring(0, 20)}...${value.substring(
              value.length - 20
            )}`,
          };
        } else {
          sanitized[key] = value;
        }
      } else if (value instanceof Element) {
        // DOM要素は非特定化情報のみ
        sanitized[key] = {
          tagName: value.tagName,
          className: value.className,
          id: value.id || null,
        };
      } else if (value instanceof Error) {
        // エラーオブジェクト
        sanitized[key] = {
          name: value.name,
          message: value.message,
          stack: this.debugMode ? value.stack : null,
        };
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * ログの出力
   */
  output(logEntry) {
    const { level, message, timestamp, location, details } = logEntry;
    const formattedMessage = `${
      this.prefix
    }: [${level.toUpperCase()}] ${message}`;

    // デバッグモード時は詳細情報も出力
    if (this.debugMode) {
      const debugInfo = { timestamp, location, details };
      console.groupCollapsed(formattedMessage);
      console.log("Details:", debugInfo);
      console.groupEnd();
    } else {
      // 通常モードは簡潔に
      if (level === "debug") {
        return; // デバッグログは非表示
      }
      console.log(formattedMessage);
    }
  }

  /**
   * Fatal レベルログ（致命的エラー）
   */
  fatal(message, details = {}) {
    const logEntry = this.createLogEntry("fatal", message, details);
    this.output(logEntry);
    return logEntry;
  }

  /**
   * Warn レベルログ（警告）
   */
  warn(message, details = {}) {
    const logEntry = this.createLogEntry("warn", message, details);
    this.output(logEntry);
    return logEntry;
  }

  /**
   * Info レベルログ（情報）
   */
  info(message, details = {}) {
    const logEntry = this.createLogEntry("info", message, details);
    this.output(logEntry);
    return logEntry;
  }

  /**
   * Debug レベルログ（デバッグ専用）
   */
  debug(message, details = {}) {
    if (!this.debugMode) {
      return null;
    }
    const logEntry = this.createLogEntry("debug", message, details);
    this.output(logEntry);
    return logEntry;
  }

  /**
   * 処理の開始をログ
   */
  startProcess(processName, details = {}) {
    return this.debug(`${processName} started`, details);
  }

  /**
   * 処理の終了をログ
   */
  endProcess(processName, details = {}) {
    return this.debug(`${processName} completed`, details);
  }

  /**
   * 外部API呼び出しをログ
   */
  apiCall(method, url, details = {}) {
    return this.debug(`API call: ${method} ${url}`, details);
  }

  /**
   * 外部API結果をログ
   */
  apiResult(method, url, status, details = {}) {
    const message = `API result: ${method} ${url} - ${status}`;
    if (status >= 400) {
      return this.warn(message, details);
    } else {
      return this.debug(message, details);
    }
  }
}

// グローバルクラスとして登録（ブラウザ環境 - content scripts/popup/options）
if (typeof window !== "undefined") {
  window.ChronoClipLogger = ChronoClipLogger;
  window.chronoClipLogger = new ChronoClipLogger();
}

// Service Worker環境では self を使用
if (typeof self !== "undefined" && typeof window === "undefined") {
  self.ChronoClipLogger = ChronoClipLogger;
  self.chronoClipLogger = new ChronoClipLogger();
}

// モジュールとしてエクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = ChronoClipLogger;
}
