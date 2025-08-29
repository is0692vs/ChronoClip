/**
 * @fileoverview 選択テキストからの日付抽出モジュール
 * Issue #11: chrono-node + 正規表現フォールバックによる日付解析
 */

/**
 * 日付解析のメイン関数
 * @param {string} text - 解析対象のテキスト
 * @returns {object|null} 解析結果
 */
function parseDate(text) {
  if (!text || typeof text !== "string") return null;

  // 1. chrono-nodeによる解析を試行
  const chronoResult = parseWithChrono(text);
  if (chronoResult) {
    return chronoResult;
  }

  // 2. 正規表現フォールバック
  const regexResult = parseWithRegex(text);
  if (regexResult) {
    return regexResult;
  }

  return null;
}

/**
 * chrono-nodeによる日付解析
 * @param {string} text - 解析対象のテキスト
 * @returns {object|null} 解析結果
 */
function parseWithChrono(text) {
  if (typeof chrono === "undefined") {
    console.warn(
      "ChronoClip: chrono-node not available, falling back to regex"
    );
    return null;
  }

  try {
    // 日本語のカジュアルパーサを使用
    const results = chrono.casual.parse(text, new Date(), {
      forwardDate: true,
    });

    if (results && results.length > 0) {
      const result = results[0]; // 最初の結果を使用
      const startDate = result.start.date();
      const endDate = result.end?.date() || startDate;

      // 時刻が含まれているかチェック
      const hasTime = result.start.get("hour") !== undefined;

      if (hasTime) {
        // 時刻付きイベント
        return {
          type: "datetime",
          start: {
            dateTime: startDate.toISOString(),
            timeZone: getDefaultTimeZone(),
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone: getDefaultTimeZone(),
          },
          confidence: 0.9,
          source: "chrono",
        };
      } else {
        // 終日イベント
        return {
          type: "date",
          start: {
            date: formatDate(startDate),
          },
          end: {
            date: formatDate(endDate),
          },
          confidence: 0.8,
          source: "chrono",
        };
      }
    }
  } catch (error) {
    console.warn("ChronoClip: chrono parsing error:", error);
  }

  return null;
}

/**
 * 正規表現による日付解析
 * @param {string} text - 解析対象のテキスト
 * @returns {object|null} 解析結果
 */
function parseWithRegex(text) {
  // 日付パターンの定義（優先度順）
  const patterns = [
    // ISO形式: 2025-08-27T18:00, 2025-08-27 18:00
    {
      regex: /(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/g,
      type: "iso",
      hasTime: (match) => match[4] !== undefined,
    },
    // 年付き日本語形式: 2025年8月27日(水) 18:00、2025年10月11日 (土) 15:00 開場16:00 開始
    {
      regex:
        /(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*\([^)]+\))?\s*(?:(\d{1,2}):(\d{2}))?/g,
      type: "japanese-with-year",
      hasTime: (match) => match[4] !== undefined,
    },
    // 年付き日本語形式（時刻なし）: 2025年8月27日(水)
    {
      regex: /(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*\([^)]+\))?(?!\s*\d{1,2}:)/g,
      type: "japanese-with-year-dateonly",
      hasTime: (match) => false,
    },
    // 日本語形式: 8月27日(水) 18:00, 8月27日 18時
    {
      regex:
        /(\d{1,2})月(\d{1,2})日(?:\([^)]+\))?(?:\s*(\d{1,2}):(\d{2})|(\d{1,2})時(?:(\d{2})分)?)?/g,
      type: "japanese",
      hasTime: (match) => match[3] !== undefined || match[5] !== undefined,
    },
    // スラッシュ形式: 2025/08/27 18:00, 8/27 18:00
    {
      regex: /(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/g,
      type: "slash",
      hasTime: (match) => match[4] !== undefined,
    },
    // 和暦: 令和7年8月27日
    {
      regex: /令和(\d+)年(\d{1,2})月(\d{1,2})日/g,
      type: "wareki",
      hasTime: () => false,
    },
    // 英語形式: Aug 27, 2025 6pm, August 27 2025
    {
      regex:
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2})(?:pm|am)?)?/gi,
      type: "english",
      hasTime: (match) => match[4] !== undefined,
    },
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern.regex));
    if (matches.length > 0) {
      const match = matches[0]; // 最初のマッチを使用
      console.log(
        `ChronoClip DEBUG: Pattern matched (${pattern.type}):`,
        match
      );
      const parsed = parseMatch(match, pattern);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * マッチした結果を日付オブジェクトに変換
 * @param {Array} match - 正規表現のマッチ結果
 * @param {object} pattern - パターン情報
 * @returns {object|null} 解析結果
 */
function parseMatch(match, pattern) {
  try {
    console.log(`ChronoClip DEBUG: parseMatch called with:`, {
      match,
      pattern: pattern.type,
    });

    let year,
      month,
      day,
      hour = 0,
      minute = 0;
    const currentYear = new Date().getFullYear();

    switch (pattern.type) {
      case "iso":
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
        if (match[4]) hour = parseInt(match[4]);
        if (match[5]) minute = parseInt(match[5]);
        break;

      case "japanese-with-year":
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
        if (match[4] && match[5]) {
          hour = parseInt(match[4]);
          minute = parseInt(match[5]);
        }
        break;

      case "japanese-with-year-dateonly":
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
        break;

      case "japanese":
        year = currentYear; // 年省略は現在年を使用
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        if (match[3] && match[4]) {
          hour = parseInt(match[3]);
          minute = parseInt(match[4]);
        } else if (match[5]) {
          hour = parseInt(match[5]);
          minute = match[6] ? parseInt(match[6]) : 0;
        }
        break;

      case "slash":
        year = match[1] ? parseInt(match[1]) : currentYear;
        month = parseInt(match[2]);
        day = parseInt(match[3]);
        if (match[4]) hour = parseInt(match[4]);
        if (match[5]) minute = parseInt(match[5]);
        break;

      case "wareki":
        const reiwaYear = parseInt(match[1]);
        year = 2018 + reiwaYear; // 令和元年 = 2019年
        month = parseInt(match[2]);
        day = parseInt(match[3]);
        break;

      case "english":
        const monthNames = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ];
        const monthName = match[1].toLowerCase().substring(0, 3);
        month = monthNames.indexOf(monthName) + 1;
        day = parseInt(match[2]);
        year = parseInt(match[3]);
        if (match[4]) {
          hour = parseInt(match[4]);
          // pm判定
          if (match[0].toLowerCase().includes("pm") && hour < 12) {
            hour += 12;
          }
        }
        break;

      default:
        return null;
    }

    // 日付の妥当性チェック
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      console.log(
        `ChronoClip DEBUG: Invalid date values: year=${year}, month=${month}, day=${day}, hour=${hour}, minute=${minute}`
      );
      return null;
    }

    const date = new Date(year, month - 1, day, hour, minute);
    if (isNaN(date.getTime())) return null;

    const hasTime = pattern.hasTime(match);
    console.log(
      `ChronoClip DEBUG: Parsed values: year=${year}, month=${month}, day=${day}, hour=${hour}, minute=${minute}, hasTime=${hasTime}`
    );

    if (hasTime) {
      // 時刻付きイベント（デフォルト3時間）
      const endDate = new Date(
        date.getTime() +
          (window.ChronoClipConfig?.EVENT?.DEFAULT_DURATION_MS ||
            3 * 60 * 60 * 1000)
      );
      return {
        type: "datetime",
        start: {
          dateTime: date.toISOString(),
          timeZone: getDefaultTimeZone(),
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: getDefaultTimeZone(),
        },
        confidence: 0.7,
        source: `regex-${pattern.type}`,
      };
    } else {
      // 終日イベント
      return {
        type: "date",
        start: {
          date: formatDate(date),
        },
        end: {
          date: formatDate(date),
        },
        confidence: 0.6,
        source: `regex-${pattern.type}`,
      };
    }
  } catch (error) {
    console.warn("ChronoClip: Error parsing match:", error);
    return null;
  }
}

/**
 * 日付をYYYY-MM-DD形式でフォーマット
 * @param {Date} date - フォーマットする日付
 * @returns {string} フォーマットされた日付文字列
 */
function formatDate(date) {
  if (!date || isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * デフォルトのタイムゾーンを取得
 * @returns {string} タイムゾーン文字列
 */
function getDefaultTimeZone() {
  return (
    window.ChronoClipConfig?.DATE?.DEFAULT_TIMEZONE ||
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

// グローバルに公開
window.ChronoClipDateParser = {
  parseDate,
  parseWithChrono,
  parseWithRegex,
  formatDate,
  getDefaultTimeZone,
};
