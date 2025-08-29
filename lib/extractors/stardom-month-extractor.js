/**
 * STARDOM月間スケジュールページ専用抽出エンジン
 * https://wwr-stardom.com/schedule/?ym= または https://wwr-stardom.com/schedule/ 用
 */

/**
 * STARDOM月間スケジュールページ専用のイベント抽出クラス
 * 女子プロレス団体STARDOMの月間スケジュールページからイベント情報を抽出
 */
class ChronoClipStardomMonthExtractor extends window.ChronoClipBaseExtractor {
  constructor(rule) {
    super(rule);
    this.domain = "wwr-stardom.com";
    this.name = "stardom-month";
    console.log("ChronoClip: StardomMonthExtractor initialized");
  }

  /**
   * BaseExtractorのextractAllメソッドをオーバーライド
   * STARDOM月間スケジュールページ専用のイベント抽出ロジックを使用
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<Object>} 抽出結果
   */
  async extractAll(context) {
    console.log(
      "ChronoClip: StardomMonthExtractor extracting from domain:",
      this.domain
    );

    try {
      const doc = context.ownerDocument || document;
      const currentUrl = doc.location
        ? doc.location.href
        : window.location.href;

      // URL パターンチェック: https://wwr-stardom.com/schedule/?ym= または https://wwr-stardom.com/schedule/
      const urlPattern1 = /https:\/\/wwr-stardom\.com\/schedule\/\?ym=/;
      const urlPattern2 = /https:\/\/wwr-stardom\.com\/schedule\/$/;
      if (!urlPattern1.test(currentUrl) && !urlPattern2.test(currentUrl)) {
        console.log(
          "ChronoClip: URL does not match STARDOM month pattern:",
          currentUrl
        );
        return null;
      }

      const extractedEvent = this.extractStardomMonthEvent(context, doc);

      if (!extractedEvent) {
        console.log("ChronoClip: No event extracted from STARDOM month page");
        return null;
      }

      console.log(
        "ChronoClip: StardomMonthExtractor extracted event:",
        extractedEvent
      );

      return {
        title: extractedEvent.title,
        description: extractedEvent.description,
        date: extractedEvent.date,
        location: extractedEvent.location,
        price: null,
        url: extractedEvent.url,
        confidence: 0.8,
        sources: ["stardom-month-extractor"],
      };
    } catch (error) {
      console.error(
        "ChronoClip: Error in StardomMonthExtractor.extractAll:",
        error
      );
      return null;
    }
  }

  /**
   * STARDOM月間スケジュールページからイベント情報を抽出
   * @param {HTMLElement} context - クリックされたコンテキスト要素
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {Object|null} 抽出されたイベント情報
   */
  extractStardomMonthEvent(context, doc) {
    console.log("ChronoClip: extractStardomMonthEvent - context:", context);

    // クリックされた日付要素を特定
    const dateElement = this.findDateElement(context);
    if (!dateElement) {
      console.log("ChronoClip: No date element found");
      return null;
    }

    // 日付を抽出
    const dateInfo = this.extractDateFromElement(dateElement, doc);
    if (!dateInfo) {
      console.log("ChronoClip: Failed to extract date");
      return null;
    }

    // スケジュールリストからイベント情報を抽出
    const scheduleEvent = this.extractFromScheduleList(dateInfo, doc);

    // カレンダーグリッドからイベント情報を抽出
    const calendarEvent = this.extractFromCalendarGrid(context, dateElement);

    // スケジュールリストを優先し、カレンダーグリッドの詳細リンクで補完
    let eventInfo = null;

    if (scheduleEvent) {
      // スケジュールリストから詳細情報を取得
      eventInfo = {
        title: scheduleEvent.title,
        location: scheduleEvent.location,
        url: scheduleEvent.url || (calendarEvent ? calendarEvent.url : ""),
        description: this.buildDescription(
          scheduleEvent.location,
          scheduleEvent.url || (calendarEvent ? calendarEvent.url : "")
        ),
      };
      console.log("ChronoClip: Using schedule list event info");
    } else if (calendarEvent && calendarEvent.url) {
      // フォールバック: カレンダーグリッドのみ（URLがある場合）
      eventInfo = {
        title: "イベント", // デフォルトタイトル
        location: "",
        url: calendarEvent.url,
        description: this.buildDescription("", calendarEvent.url),
      };
      console.log("ChronoClip: Using calendar grid event info");
    }

    if (!eventInfo) {
      console.log("ChronoClip: No event info found for the clicked date");
      return null;
    }

    console.log("ChronoClip: Extracted event info:", eventInfo);

    return {
      title: eventInfo.title,
      description: eventInfo.description,
      date: dateInfo.date,
      location: eventInfo.location || "",
      url:
        eventInfo.url ||
        (doc.location ? doc.location.href : window.location.href),
    };
  }

  /**
   * 詳細説明文を構築
   * @param {string} place - 会場情報
   * @param {string} detailUrl - 詳細URL
   * @returns {string} 構築された説明文
   */
  buildDescription(place, detailUrl) {
    let description = "";

    if (place && place.trim()) {
      description += `会場: ${place.trim()}`;
    }

    if (detailUrl && detailUrl.trim()) {
      if (description) {
        description += "\n";
      }
      description += `詳細情報: ${detailUrl.trim()}`;
    }

    return description;
  }

  /**
   * クリックされたコンテキストから日付要素を特定
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {HTMLElement|null} 日付要素
   */
  findDateElement(context) {
    console.log("ChronoClip: findDateElement - context:", context);

    // ChronoClipの日付要素の場合、data-normalized-dateから日付を取得
    if (
      context.classList.contains("chronoclip-date") &&
      context.dataset.normalizedDate
    ) {
      console.log(
        "ChronoClip: Found chronoclip-date element with data:",
        context.dataset.normalizedDate
      );
      return context;
    }

    // 直接日付要素の場合
    if (context.classList.contains("date")) {
      return context;
    }

    // 親要素を遡って日付要素を探す
    let current = context;
    while (current && current.parentElement) {
      // ChronoClipの日付要素をチェック
      if (
        current.classList.contains("chronoclip-date") &&
        current.dataset.normalizedDate
      ) {
        console.log(
          "ChronoClip: Found chronoclip-date in parent:",
          current.dataset.normalizedDate
        );
        return current;
      }

      const dateEl = current.querySelector(".date");
      if (dateEl) {
        return dateEl;
      }
      current = current.parentElement;

      // カレンダーグリッドのli要素に到達した場合
      if (current.tagName === "LI" && current.querySelector(".date")) {
        return current.querySelector(".date");
      }
    }

    return null;
  }

  /**
   * 日付要素から日付情報を抽出
   * @param {HTMLElement} dateElement - 日付要素
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {Object|null} 日付情報
   */
  extractDateFromElement(dateElement, doc) {
    try {
      let year, month, day;

      // ChronoClipの日付要素の場合
      if (
        dateElement.classList.contains("chronoclip-date") &&
        dateElement.dataset.normalizedDate
      ) {
        const dateStr = dateElement.dataset.normalizedDate; // "2025-08-30"
        const dateParts = dateStr.split("-");
        if (dateParts.length === 3) {
          year = parseInt(dateParts[0]);
          month = parseInt(dateParts[1]);
          day = parseInt(dateParts[2]);

          console.log("ChronoClip: Extracted date from chronoclip-date:", {
            year,
            month,
            day,
          });
        } else {
          console.log("ChronoClip: Invalid chronoclip-date format:", dateStr);
          return null;
        }
      } else {
        // 通常のSTARDOM日付要素の場合
        const dayText = dateElement.textContent.trim();
        day = parseInt(dayText);

        if (isNaN(day)) {
          console.log("ChronoClip: Invalid day:", dayText);
          return null;
        }

        // 年月情報をページから抽出
        const yearElement = doc.querySelector(".calendar_year");
        const monthElement = doc.querySelector(".calendar_month");

        year = new Date().getFullYear();
        month = new Date().getMonth() + 1;

        if (yearElement) {
          year = parseInt(yearElement.textContent.trim());
        }

        if (monthElement) {
          month = parseInt(monthElement.textContent.trim());
        }
      }

      // 値の妥当性をチェック
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        console.log("ChronoClip: Invalid date values:", { year, month, day });
        return null;
      }

      // All Day イベントとして設定（要件通り）
      const eventDate = new Date(year, month - 1, day);

      console.log("ChronoClip: Extracted date info:", {
        year,
        month,
        day,
        eventDate,
      });

      return {
        year,
        month,
        day,
        date: eventDate,
      };
    } catch (error) {
      console.error("ChronoClip: Error extracting date:", error);
      return null;
    }
  }

  /**
   * カレンダーグリッドからイベント情報を抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @param {HTMLElement} dateElement - 日付要素
   * @returns {Object|null} イベント情報
   */
  extractFromCalendarGrid(context, dateElement) {
    try {
      let liElement = null;

      // ChronoClipの日付要素の場合、その親要素から適切なli要素を探す
      if (dateElement.classList.contains("chronoclip-date")) {
        liElement = dateElement.closest("li");
        console.log(
          "ChronoClip: Found li element for chronoclip-date:",
          liElement
        );
      } else {
        // 通常のSTARDOM日付要素の場合
        liElement = dateElement.closest("li");
      }

      if (!liElement) {
        console.log("ChronoClip: No parent li element found");
        return null;
      }

      // li要素内のイベントリンクを探す
      const eventLinks = liElement.querySelectorAll(
        'a[href*="/event/"], a[href*="/schedule/"]'
      );

      if (eventLinks.length === 0) {
        console.log("ChronoClip: No event links found in calendar grid");
        return null;
      }

      // 最初のイベントリンクを使用（複数ある場合は最初のもの）
      const firstLink = eventLinks[0];
      const href = firstLink.getAttribute("href");

      console.log("ChronoClip: Calendar grid event found:", { href });

      // カレンダーグリッドからはURLのみを取得
      return {
        title: "", // タイトルはスケジュールリストから取得
        description: "",
        location: "",
        url: href,
      };
    } catch (error) {
      console.error("ChronoClip: Error extracting from calendar grid:", error);
      return null;
    }
  }

  /**
   * スケジュールリストからイベント情報を抽出
   * @param {Object} dateInfo - 日付情報
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {Object|null} イベント情報
   */
  extractFromScheduleList(dateInfo, doc) {
    try {
      // スケジュールリストのアイテムを取得
      const scheduleItems = doc.querySelectorAll(".schedule_list .info_box");

      for (const item of scheduleItems) {
        // 日付をチェック
        const dateEl = item.querySelector(".date");
        if (!dateEl) continue;

        const dateText = dateEl.textContent.trim();

        // 日付パターンをチェック（例: "2025.08.30 sat"）
        const dateMatch = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
        if (!dateMatch) continue;

        const itemYear = parseInt(dateMatch[1]);
        const itemMonth = parseInt(dateMatch[2]);
        const itemDay = parseInt(dateMatch[3]);

        // クリックされた日付と一致するかチェック
        if (
          itemYear === dateInfo.year &&
          itemMonth === dateInfo.month &&
          itemDay === dateInfo.day
        ) {
          console.log("ChronoClip: Found matching schedule item");

          // タイトル抽出
          const titleEl = item.querySelector(".title");
          const title = titleEl ? titleEl.textContent.trim() : "";

          // 会場抽出
          const placeEl = item.querySelector(".place");
          const place = placeEl ? placeEl.textContent.trim() : "";

          // 詳細リンク抽出
          const linkEl = item.querySelector(".info_btn a.btn");
          const detailUrl = linkEl ? linkEl.getAttribute("href") : "";

          console.log("ChronoClip: Schedule list event found:", {
            title,
            place,
            detailUrl,
          });

          return {
            title: title,
            description: this.buildDescription(place, detailUrl),
            location: place,
            url: detailUrl,
          };
        }
      }

      console.log("ChronoClip: No matching schedule item found");
      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting from schedule list:", error);
      return null;
    }
  }

  /**
   * BaseExtractorのcanExtractをオーバーライド
   * @param {string} url
   * @param {Document} document
   * @returns {boolean}
   */
  canExtract(url, document) {
    const urlPattern1 = /https:\/\/wwr-stardom\.com\/schedule\/\?ym=/;
    const urlPattern2 = /https:\/\/wwr-stardom\.com\/schedule\/$/;
    return urlPattern1.test(url) || urlPattern2.test(url);
  }

  /**
   * BaseExtractorのextractをオーバーライド
   * @param {Document} document
   * @param {Object} options
   * @returns {Array} イベント配列
   */
  extract(document, options = {}) {
    console.log("ChronoClip: StardomMonthExtractor extract called");

    // 月間スケジュールでは、クリックされたコンテキストが必要なので
    // このメソッドでは空配列を返す
    return [];
  }
}

// グローバルスコープに登録
if (typeof window !== "undefined") {
  window.ChronoClipStardomMonthExtractor = ChronoClipStardomMonthExtractor;
}
