// content/content-script.js

/**
 * @fileoverview ChronoClipのメインコンテンツスクリプト。
 * このスクリプトは、Webページのコンテンツをスキャンして日付を検索し、
 * それらを検証して結果をバックグラウンドスクリプトに送信する責任があります。
 */

(function() {
  console.log("ChronoClip content script loaded and running.");

  /**
   * ページコンテンツで日付パターンをスキャンし、それらを検証してバックグラウンドスクリプトに送信します。
   */
  function findAndSendDates() {
    const text = document.body.innerText;
    if (!text) {
      return;
    }

    const detectedDates = [];
    let match;

    // グローバルに利用可能なパターンと検証関数を使用します
    const DATE_PATTERN = ChronoClip.DATE_PATTERN;
    const isValidDate = ChronoClip.isValidDate;

    if (!DATE_PATTERN || !isValidDate) {
        console.error("ChronoClip: Dependencies not loaded correctly.");
        return;
    }

    // execループのために正規表現の状態をリセット
    DATE_PATTERN.lastIndex = 0;

    while ((match = DATE_PATTERN.exec(text)) !== null) {
      const [fullMatch, year, , month, day] = match;

      if (isValidDate(year, month, day)) {
        const dateInfo = {
          date: fullMatch,
          index: match.index,
        };
        detectedDates.push(dateInfo);
      }
    }

    if (detectedDates.length > 0) {
      console.log("ChronoClip: Detected dates on page:", detectedDates);

      chrome.runtime.sendMessage({
        type: "dates_found",
        payload: {
          url: window.location.href,
          dates: detectedDates,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("ChronoClip: Error sending dates to background script.", chrome.runtime.lastError);
        } else {
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
