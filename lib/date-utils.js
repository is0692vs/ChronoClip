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

  // 0以下の月や日は無効
  if (monthNum <= 0 || dayNum <= 0) {
    return false;
  }

  const date = new Date(yearNum, monthNum - 1, dayNum);

  return (
    date.getFullYear() === yearNum &&
    date.getMonth() === monthNum - 1 &&
    date.getDate() === dayNum
  );
};

/**
 * 和暦の元号の開始年。
 * 元号の開始年 - 1 を保持します。
 */
ChronoClip.ERA_START_YEARS = {
  "令和": 2018, // 令和元年は2019年
  "平成": 1988, // 平成元年は1989年
  "昭和": 1925, // 昭和元年は1926年
  "大正": 1911, // 大正元年は1912年
};

/**
 * 和暦を西暦の年に変換します。
 * @param {string} era 元号 (例: "令和")。
 * @param {string|number} eraYearStr 元号の年 (例: "6" or "元")。
 * @returns {number|null} 西暦の年。変換できない場合はnull。
 */
ChronoClip.convertWarekiToGregorianYear = function(era, eraYearStr) {
  const baseYear = ChronoClip.ERA_START_YEARS[era];
  if (baseYear === undefined) {
    return null;
  }

  const eraYear = (eraYearStr === "元") ? 1 : parseInt(eraYearStr, 10);
  if (isNaN(eraYear)) {
    return null;
  }

  return baseYear + eraYear;
};

/**
 * 年が省略された月日から、適切な年を推測してDateオブジェクトを返します。
 * - 候補日が今日より未来の場合、今年の年月日を返します。
 * - 候補日が今日より過去の場合、来年の年月日を返します。
 * @param {number|string} month 月。
 * @param {number|string} day 日。
 * @returns {Date} 推測された年月日を持つDateオブジェクト。
 */
ChronoClip.resolveYearForMonthDay = function(month, day) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);

  let candidateDate = new Date(currentYear, monthNum - 1, dayNum);

  // 時刻情報をクリアして日付のみで比較
  now.setHours(0, 0, 0, 0);

  if (candidateDate < now) {
    // 候補日が過去なら来年の日付とみなす
    candidateDate.setFullYear(currentYear + 1);
  }

  return candidateDate;
};
