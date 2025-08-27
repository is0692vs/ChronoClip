// lib/date-utils.js

/**
 * @fileoverview 日付の検証と操作のためのユーティリティ関数を提供します。
 */

var ChronoClip = ChronoClip || {};

/**
 * 指定された年、月、日が有効な日付を形成するかどうかを検証します。
 * @param {number|string} year 完全な年 (例: 2025)。
 * @param {number|string} month 月 (1-12)。
 * @param {number|string} day 日 (1-31)。
 * @returns {boolean} 日付が有効な場合は true、それ以外の場合は false。
 */
ChronoClip.isValidDate = function(year, month, day) {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);

  const date = new Date(yearNum, monthNum - 1, dayNum);

  return (
    date.getFullYear() === yearNum &&
    date.getMonth() === monthNum - 1 &&
    date.getDate() === dayNum
  );
};