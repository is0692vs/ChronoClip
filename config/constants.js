/**
 * ChronoClip 設定定数
 * アプリケーション全体で使用される定数値を定義
 */

// グローバル名前空間に設定を定義
window.ChronoClipConfig = {
  // イベント関連の設定
  EVENT: {
    // デフォルトのイベント継続時間（時間）
    DEFAULT_DURATION_HOURS: 3,

    // デフォルトのイベント継続時間（ミリ秒）
    DEFAULT_DURATION_MS: 3 * 60 * 60 * 1000, // 3時間

    // 最小イベント継続時間（分）
    MIN_DURATION_MINUTES: 15,

    // 最大イベント継続時間（時間）
    MAX_DURATION_HOURS: 24,
  },

  // UI関連の設定
  UI: {
    // ポップアップのz-index
    POPUP_Z_INDEX: 99999,

    // ポップアップの表示オフセット（ピクセル）
    POPUP_OFFSET: 10,

    // アニメーションの持続時間（ミリ秒）
    ANIMATION_DURATION: 200,

    // トーストの表示時間（ミリ秒）
    TOAST_DURATION: 3000,
  },

  // パフォーマンス関連の設定
  PERFORMANCE: {
    // MutationObserverのデバウンス時間（ミリ秒）
    MUTATION_DEBOUNCE_MS: 500,

    // バッチ処理のサイズ
    BATCH_SIZE: 100,

    // 処理対象の最大ノード数
    MAX_NODES: 1000,

    // パフォーマンス監視の間隔（ミリ秒）
    PERFORMANCE_CHECK_INTERVAL: 5000,
  },

  // 抽出関連の設定
  EXTRACTION: {
    // タイトル抽出の最大文字数
    MAX_TITLE_LENGTH: 100,

    // 詳細抽出の最大文字数
    MAX_DESCRIPTION_LENGTH: 500,

    // 近傍検索の範囲（ピクセル）
    NEARBY_SEARCH_RADIUS: 200,

    // スコアリングの閾値
    MIN_SCORE_THRESHOLD: 0.3,
  },

  // 日付・時刻関連の設定
  DATE: {
    // サポートする日付形式
    SUPPORTED_DATE_FORMATS: [
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "MM/DD/YYYY",
      "DD/MM/YYYY",
      "YYYY年MM月DD日",
    ],

    // サポートする時刻形式
    SUPPORTED_TIME_FORMATS: ["HH:mm", "HH:mm:ss", "h:mm a", "h:mm:ss a"],

    // デフォルトのタイムゾーン
    DEFAULT_TIMEZONE: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },

  // Chrome拡張関連の設定
  EXTENSION: {
    // storage syncの最大アイテム数
    MAX_STORAGE_ITEMS: 512,

    // storage syncの最大バイト数
    MAX_STORAGE_BYTES: 102400,

    // リトライの最大回数
    MAX_RETRIES: 3,

    // リトライの間隔（ミリ秒）
    RETRY_DELAY: 1000,
  },

  // デバッグ関連の設定
  DEBUG: {
    // ログレベル（'error', 'warn', 'info', 'debug'）
    LOG_LEVEL: "info",

    // パフォーマンス監視を有効にするか
    ENABLE_PERFORMANCE_MONITORING: true,

    // 詳細ログを有効にするか
    ENABLE_VERBOSE_LOGGING: false,
  },
};
