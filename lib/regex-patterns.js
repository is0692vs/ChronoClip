// lib/regex-patterns.js

/**
 * @fileoverview 日付検出用の正規表現パターンを定義します。
 */

// グローバル汚染を避けるために、アプリ用のグローバルオブジェクトを作成します
var ChronoClip = ChronoClip || {};

// YYYY/MM/DD または YYYY-MM-DD 形式の日付に一致します。
ChronoClip.DATE_PATTERN = /\b(\d{4})([-/])(0[1-9]|1[0-2])\2(0[1-9]|[12]\d|3[01])\b/g;