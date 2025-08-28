// content/content-script.js

/**
 * @fileoverview ChronoClipのメインコンテンツスクリプト。
 * このスクリプトは、Webページのコンテンツをスキャンして日付を検索し、
 * それらを検証して結果をバックグラウンドスクリプトに送信する責任があります。
 */

(function() {
  // --- 依存関係のチェック ---
  if (typeof ChronoClip === 'undefined' || !ChronoClip.DATE_PATTERN || !ChronoClip.isValidDate || typeof chrono === 'undefined') {
    console.error("ChronoClip: 依存関係が正しく読み込まれていません。");
    return;
  }
  console.log("ChronoClip content script loaded and running.");

  // --- ユーティリティ関数のエイリアス ---
  const {
    isValidDate,
    convertWarekiToGregorianYear,
    resolveYearForMonthDay,
    DATE_PATTERN,
    WAREKI_DATE_PATTERN,
    MONTH_DAY_DATE_PATTERN,
    JA_YYYY_MM_DD_PATTERN
  } = ChronoClip;

  // --- 日付検出器の定義 ---

  const detectors = [
    {
      name: "日本語の相対日付 (JA Relative)",
      pattern: /(今日|明日|昨日|来週|先週|今月末|来月|先月)/gi,
      handler: (match) => {
          const text = match[0];
          const refDate = new Date();
          refDate.setHours(0, 0, 0, 0);
          let startDate = new Date(refDate);

          switch (text) {
              case '今日':
                  break;
              case '明日':
                  startDate.setDate(startDate.getDate() + 1);
                  break;
              case '昨日':
                  startDate.setDate(startDate.getDate() - 1);
                  break;
              case '来週':
                  startDate.setDate(startDate.getDate() + 7);
                  break;
              case '先週':
                  startDate.setDate(startDate.getDate() - 7);
                  break;
              case '今月末':
                  startDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
                  break;
              case '来月':
                  startDate.setMonth(startDate.getMonth() + 1, 1);
                  break;
              case '先月':
                  startDate.setMonth(startDate.getMonth() - 1, 1);
                  break;
          }
          
          const year = startDate.getFullYear();
          const month = startDate.getMonth() + 1;
          const day = startDate.getDate();

          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
      }
    },
    {
      name: "YYYY-MM-DD or YYYY/MM/DD",
      pattern: DATE_PATTERN,
      handler: (match) => {
        const [, year, , month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    },
    {
      name: "YYYY年M月D日 (JA)",
      pattern: JA_YYYY_MM_DD_PATTERN,
      handler: (match) => {
        const [, year, month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    },
    {
      name: "和暦 (Wareki)",
      pattern: WAREKI_DATE_PATTERN,
      handler: (match) => {
        const [, era, eraYearStr, month, day] = match;
        const year = convertWarekiToGregorianYear(era, eraYearStr);
        if (year && isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    },
    {
      name: "月日 (Month-Day)",
      pattern: MONTH_DAY_DATE_PATTERN,
      handler: (match) => {
        const [, month, day] = match;
        const resolvedDate = resolveYearForMonthDay(month, day);
        if (isValidDate(resolvedDate.getFullYear(), resolvedDate.getMonth() + 1, resolvedDate.getDate())) {
          const year = resolvedDate.getFullYear();
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    }
  ];

  /**
   * ページコンテンツからすべての日付を検出し、バックグラウンドに送信します。
   */
  function findAndSendDates() {
    const text = document.body.innerText;
    if (!text) {
      return;
    }

    let allMatches = [];
    const now = new Date();

    // 1. chrono-nodeによる主要な解析
    const chronoResults = chrono.parse(text, now);
    chronoResults.forEach(result => {
      const date = result.start.date();
      const normalizedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      allMatches.push({
        date: normalizedDate,
        original: result.text,
        index: result.index,
        detector: 'chrono-node',
        endIndex: result.index + result.text.length
      });
    });

    // 2. カスタム正規表現検出器によるフォールバック解析
    detectors.forEach(detector => {
      let match;
      detector.pattern.lastIndex = 0;
      while ((match = detector.pattern.exec(text)) !== null) {
        const result = detector.handler(match);
        if (result) {
          allMatches.push({
            date: result.normalizedDate,
            original: result.original,
            index: match.index,
            detector: detector.name,
            endIndex: match.index + result.original.length
          });
        }
      }
    });

    // 3. 重複を解決し、最終的な日付リストを作成
    allMatches.sort((a, b) => a.index - b.index);

    const finalDates = [];
    let lastEndIndex = -1;

    allMatches.forEach(match => {
      if (match.index >= lastEndIndex) {
        finalDates.push(match);
        lastEndIndex = match.endIndex;
      }
    });

    if (finalDates.length > 0) {
      console.log("ChronoClip: Detected dates on page:", finalDates);

      chrome.runtime.sendMessage({
        type: "dates_found",
        payload: {
          url: window.location.href,
          dates: finalDates,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("ChronoClip: Error sending dates to background script.", chrome.runtime.lastError);
        } else if (response) {
          console.log("ChronoClip: Background script acknowledged receipt of dates.", response);
        }
      });
    } else {
      console.log("ChronoClip: No dates found on this page.");
    }
  }

  // 検出ロジックを実行
  findAndSendDates();

})();
