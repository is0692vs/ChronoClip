/**
 * STARDOM詳細ページ専用抽出エンジン
 * https://wwr-stardom.com/schedule/(数字8桁) 用
 */

/**
 * STARDOM詳細ページ専用のイベント抽出クラス
 * 女子プロレス団体STARDOMの詳細ページからイベント情報を抽出
 */
class ChronoClipStardomDetailExtractor extends window.ChronoClipBaseExtractor {
  constructor(rule) {
    super(rule);
    this.domain = "wwr-stardom.com";
    this.name = "stardom-detail";
    console.log("ChronoClip: StardomDetailExtractor initialized");
  }

  /**
   * BaseExtractorのextractAllメソッドをオーバーライド
   * STARDOM詳細ページ専用のイベント抽出ロジックを使用
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<Object>} 抽出結果
   */
  async extractAll(context) {
    console.log(
      "ChronoClip: StardomDetailExtractor extracting from domain:",
      this.domain
    );

    try {
      const doc = context.ownerDocument || document;
      const currentUrl = doc.location
        ? doc.location.href
        : window.location.href;

      // URL パターンチェック: https://wwr-stardom.com/schedule/(数字8桁)
      const urlPattern = /https:\/\/wwr-stardom\.com\/schedule\/\d{8}/;
      if (!urlPattern.test(currentUrl)) {
        console.log(
          "ChronoClip: URL does not match STARDOM detail pattern:",
          currentUrl
        );
        return null;
      }

      const extractedEvent = this.extractStardomDetailEvent(doc);

      if (!extractedEvent) {
        console.log("ChronoClip: No event extracted from STARDOM detail page");
        return null;
      }

      console.log(
        "ChronoClip: StardomDetailExtractor extracted event:",
        extractedEvent
      );

      return {
        title: extractedEvent.title,
        description: extractedEvent.description,
        date: extractedEvent.date,
        location: extractedEvent.location,
        price: null,
        url: extractedEvent.url,
        confidence: 0.9,
        sources: ["stardom-detail-extractor"],
      };
    } catch (error) {
      console.error(
        "ChronoClip: Error in StardomDetailExtractor.extractAll:",
        error
      );
      return null;
    }
  }

  /**
   * STARDOM詳細ページからイベント情報を抽出
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {Object|null} 抽出されたイベント情報
   */
  extractStardomDetailEvent(doc) {
    const currentUrl = doc.location ? doc.location.href : window.location.href;

    // タイトル抽出: <h2 class="tickets_title">
    const title = this.extractTitle(doc);
    if (!title) {
      console.log(
        "ChronoClip: Failed to extract title from STARDOM detail page"
      );
      return null;
    }

    // 日付抽出: 日時セクションから
    const dateInfo = this.extractDateInfo(doc);
    if (!dateInfo) {
      console.log(
        "ChronoClip: Failed to extract date from STARDOM detail page"
      );
      return null;
    }

    // 開始時刻抽出: 本戦開始時間セクションから
    const startTime = this.extractStartTime(doc);

    // 会場抽出: 会場セクションから
    const venue = this.extractVenue(doc);

    // 対戦カードリンク抽出
    const matchCardUrl = this.extractMatchCardUrl(doc);

    // 詳細説明の構築
    let description = "";
    if (venue) {
      description += `会場: ${venue}\n`;
    }
    description += `詳細情報: ${currentUrl}\n`;
    if (matchCardUrl) {
      description += `対戦カード: ${matchCardUrl}`;
    }

    // 日付と時刻を組み合わせてDateオブジェクトを作成
    const eventDate = this.combineDateAndTime(dateInfo, startTime);

    return {
      title: title,
      description: description.trim(),
      date: eventDate,
      location: venue || "",
      url: currentUrl,
    };
  }

  /**
   * タイトルを抽出
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {string|null} タイトル
   */
  extractTitle(doc) {
    try {
      const titleElement = doc.querySelector("h2.tickets_title");
      if (titleElement) {
        return titleElement.textContent.trim();
      }
      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting title:", error);
      return null;
    }
  }

  /**
   * 日付情報を抽出
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {Object|null} 日付情報 {year, month, day}
   */
  extractDateInfo(doc) {
    try {
      // "日時"セクションを探す
      const dateHeaders = Array.from(doc.querySelectorAll(".data.data_bg1 p"));
      const dateHeader = dateHeaders.find((p) =>
        p.textContent.includes("日時")
      );

      if (!dateHeader) {
        console.log("ChronoClip: 日時 header not found");
        return null;
      }

      // 同じliタグ内の.itemを探す
      const liElement = dateHeader.closest("li");
      if (!liElement) {
        console.log("ChronoClip: li element not found for 日時");
        return null;
      }

      const dateElement = liElement.querySelector(".item p.date");
      if (!dateElement) {
        console.log("ChronoClip: date element not found");
        return null;
      }

      // span要素から年月日を抽出: <span>2025</span>年<span>9</span>月<span>6</span>日（土）
      const spans = dateElement.querySelectorAll("span");
      if (spans.length >= 3) {
        const year = parseInt(spans[0].textContent.trim());
        const month = parseInt(spans[1].textContent.trim());
        const day = parseInt(spans[2].textContent.trim());

        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          console.log("ChronoClip: Extracted date:", { year, month, day });
          return { year, month, day };
        }
      }

      console.log("ChronoClip: Failed to parse date from spans");
      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting date:", error);
      return null;
    }
  }

  /**
   * 開始時刻を抽出
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {string|null} 開始時刻 (HH:MM形式)
   */
  extractStartTime(doc) {
    try {
      // "本戦開始時間"セクションを探す
      const timeHeaders = Array.from(doc.querySelectorAll(".data.data_bg2 p"));
      const startTimeHeader = timeHeaders.find((p) =>
        p.textContent.includes("本戦開始時間")
      );

      if (!startTimeHeader) {
        console.log("ChronoClip: 本戦開始時間 header not found");
        return null;
      }

      // 同じliタグ内の.itemを探す
      const liElement = startTimeHeader.closest("li");
      if (!liElement) {
        console.log("ChronoClip: li element not found for 本戦開始時間");
        return null;
      }

      const timeElement = liElement.querySelector(".item .text .time");
      if (!timeElement) {
        console.log("ChronoClip: time element not found");
        return null;
      }

      const timeText = timeElement.textContent.trim();
      console.log("ChronoClip: Extracted start time:", timeText);
      return timeText;
    } catch (error) {
      console.error("ChronoClip: Error extracting start time:", error);
      return null;
    }
  }

  /**
   * 会場を抽出
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {string|null} 会場名
   */
  extractVenue(doc) {
    try {
      // "会場"セクションを探す
      const venueHeaders = Array.from(doc.querySelectorAll(".data.data_bg1 p"));
      const venueHeader = venueHeaders.find((p) =>
        p.textContent.includes("会場")
      );

      if (!venueHeader) {
        console.log("ChronoClip: 会場 header not found");
        return null;
      }

      // 同じliタグ内の.itemを探す
      const liElement = venueHeader.closest("li");
      if (!liElement) {
        console.log("ChronoClip: li element not found for 会場");
        return null;
      }

      const venueElement = liElement.querySelector(".item .text a.place");
      if (!venueElement) {
        console.log("ChronoClip: venue element not found");
        return null;
      }

      const venueText = venueElement.textContent.trim();
      console.log("ChronoClip: Extracted venue:", venueText);
      return venueText;
    } catch (error) {
      console.error("ChronoClip: Error extracting venue:", error);
      return null;
    }
  }

  /**
   * 対戦カードURLを抽出
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {string|null} 対戦カードURL
   */
  extractMatchCardUrl(doc) {
    try {
      // "対戦カードを見る"リンクを探す
      const matchCardLinks = Array.from(doc.querySelectorAll("a"));
      const matchCardLink = matchCardLinks.find((link) =>
        link.textContent.includes("対戦カードを見る")
      );

      if (!matchCardLink) {
        console.log("ChronoClip: 対戦カードを見る link not found");
        return null;
      }

      const href = matchCardLink.getAttribute("href");
      if (href) {
        console.log("ChronoClip: Extracted match card URL:", href);
        return href;
      }

      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting match card URL:", error);
      return null;
    }
  }

  /**
   * 日付と時刻を組み合わせてDateオブジェクトを作成
   * @param {Object} dateInfo - 日付情報 {year, month, day}
   * @param {string} timeStr - 時刻文字列 (HH:MM)
   * @returns {Date} Dateオブジェクト
   */
  combineDateAndTime(dateInfo, timeStr) {
    try {
      if (!dateInfo) {
        return null;
      }

      let hour = 0;
      let minute = 0;

      if (timeStr) {
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          hour = parseInt(timeMatch[1]);
          minute = parseInt(timeMatch[2]);
        }
      }

      // JSのmonthは0ベースなので1を引く
      const eventDate = new Date(
        dateInfo.year,
        dateInfo.month - 1,
        dateInfo.day,
        hour,
        minute
      );
      console.log("ChronoClip: Combined date:", eventDate);
      return eventDate;
    } catch (error) {
      console.error("ChronoClip: Error combining date and time:", error);
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
    const urlPattern = /https:\/\/wwr-stardom\.com\/schedule\/\d{8}/;
    return urlPattern.test(url);
  }

  /**
   * BaseExtractorのextractをオーバーライド
   * @param {Document} document
   * @param {Object} options
   * @returns {Array} イベント配列
   */
  extract(document, options = {}) {
    console.log("ChronoClip: StardomDetailExtractor extract called");

    const event = this.extractStardomDetailEvent(document);
    if (!event) {
      return [];
    }

    return [event];
  }
}

// グローバルスコープに登録
if (typeof window !== "undefined") {
  window.ChronoClipStardomDetailExtractor = ChronoClipStardomDetailExtractor;
}
