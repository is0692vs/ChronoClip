/**
 * NJPW(新日本プロレス)スケジュールページ専用抽出エンジン
 * https://www.njpw.co.jp/schedule 用
 */

/**
 * NJPW(新日本プロレス)スケジュールページ専用のイベント抽出クラス
 * 新日本プロレスの公式サイトスケジュールページからイベント情報を抽出
 */
class ChronoClipNjpwScheduleExtractor extends window.ChronoClipBaseExtractor {
  constructor(rule) {
    super(rule);
    this.domain = "www.njpw.co.jp";
    this.name = "njpw-schedule";
    console.log("ChronoClip: NjpwScheduleExtractor initialized");
  }

  /**
   * BaseExtractorのextractAllメソッドをオーバーライド
   * NJPWスケジュールページ専用のイベント抽出ロジックを使用
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<Object>} 抽出結果
   */
  async extractAll(context) {
    console.log(
      "ChronoClip: NjpwScheduleExtractor extracting from domain:",
      this.domain
    );

    try {
      const doc = context.ownerDocument || document;
      const currentUrl = doc.location
        ? doc.location.href
        : window.location.href;

      // URL パターンチェック: https://www.njpw.co.jp/schedule/*
      const urlPattern = /https:\/\/www\.njpw\.co\.jp\/schedule/;
      if (!urlPattern.test(currentUrl)) {
        console.log(
          "ChronoClip: URL does not match NJPW schedule pattern:",
          currentUrl
        );
        return null;
      }

      // コンテキストから特定のイベント情報を抽出
      const targetEvent = this.extractTargetEventFromContext(context, doc);

      if (!targetEvent) {
        console.log("ChronoClip: No event extracted from NJPW schedule page");
        return null;
      }

      console.log(
        "ChronoClip: NjpwScheduleExtractor extracted event:",
        targetEvent
      );

      return {
        title: targetEvent.title,
        description: targetEvent.description,
        date: targetEvent.date,
        location: targetEvent.location,
        price: null,
        url: targetEvent.url,
        confidence: 0.9,
        sources: ["njpw-schedule-extractor"],
      };
    } catch (error) {
      console.error(
        "ChronoClip: Error in NjpwScheduleExtractor.extractAll:",
        error
      );
      return null;
    }
  }

  /**
   * コンテキストから特定のイベント情報を抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @param {Document} doc - ドキュメントオブジェクト
   * @returns {Object|null} 抽出されたイベント情報
   */
  extractTargetEventFromContext(context, doc) {
    const currentUrl = doc.location ? doc.location.href : window.location.href;

    // コンテキストから最も近いイベント要素を探す
    let eventElement = context.closest(".card");
    if (!eventElement) {
      eventElement = context.closest(".schedule-item");
    }
    if (!eventElement) {
      eventElement = context.closest("article");
    }
    if (!eventElement) {
      eventElement = context.closest("li");
    }

    if (!eventElement) {
      console.log(
        "ChronoClip: No event element found in context for NJPW schedule"
      );
      return null;
    }

    // イベント情報を抽出
    const title = this.extractTitle(eventElement);
    const dateInfo = this.extractDateInfo(eventElement);
    const location = this.extractLocation(eventElement);
    const eventUrl = this.extractEventUrl(eventElement) || currentUrl;

    if (!title) {
      console.log("ChronoClip: Failed to extract title from NJPW event");
      return null;
    }

    // 詳細説明の構築
    let description = "";
    if (location) {
      description += `会場: ${location}\n`;
    }
    description += `詳細情報: ${eventUrl}`;

    // 日付オブジェクトを作成
    const eventDate = this.createDateFromInfo(dateInfo);

    return {
      title: title,
      description: description.trim(),
      date: eventDate,
      location: location || "",
      url: eventUrl,
    };
  }

  /**
   * タイトルを抽出
   * @param {HTMLElement} element - イベント要素
   * @returns {string|null} タイトル
   */
  extractTitle(element) {
    try {
      // 一般的なタイトルセレクタを試す
      const selectors = [
        "h2",
        "h3",
        ".title",
        ".event-title",
        ".card-title",
        ".schedule-title",
        "a[href*='/tornament/']",
        "a[href*='/event/']",
      ];

      for (const selector of selectors) {
        const titleElement = element.querySelector(selector);
        if (titleElement) {
          const titleText = titleElement.textContent.trim();
          if (titleText) {
            console.log(`ChronoClip: Extracted title using ${selector}:`, titleText);
            return titleText;
          }
        }
      }

      // フォールバック: 最初の強調テキストを探す
      const strongElement = element.querySelector("strong");
      if (strongElement) {
        const titleText = strongElement.textContent.trim();
        if (titleText) {
          console.log("ChronoClip: Extracted title from strong:", titleText);
          return titleText;
        }
      }

      console.log("ChronoClip: No title found in NJPW event element");
      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting title:", error);
      return null;
    }
  }

  /**
   * 日付情報を抽出
   * @param {HTMLElement} element - イベント要素
   * @returns {Object|null} 日付情報 {year, month, day, time}
   */
  extractDateInfo(element) {
    try {
      // 日付を含む要素を探す
      const selectors = [
        ".date",
        ".event-date",
        ".schedule-date",
        "time",
        "[datetime]",
        ".card-date",
      ];

      let dateText = "";
      let dateTimeAttr = null;

      for (const selector of selectors) {
        const dateElement = element.querySelector(selector);
        if (dateElement) {
          dateText = dateElement.textContent.trim();
          dateTimeAttr = dateElement.getAttribute("datetime");
          if (dateText || dateTimeAttr) {
            break;
          }
        }
      }

      // datetime属性がある場合はそれを使用
      if (dateTimeAttr) {
        const date = new Date(dateTimeAttr);
        if (!isNaN(date.getTime())) {
          return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
            time: `${String(date.getHours()).padStart(2, "0")}:${String(
              date.getMinutes()
            ).padStart(2, "0")}`,
          };
        }
      }

      // テキストから日付を抽出: 2025年1月4日、2025/1/4、1月4日など
      if (dateText) {
        // パターン1: YYYY年MM月DD日
        let match = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (match) {
          const timeMatch = dateText.match(/(\d{1,2}):(\d{2})/);
          return {
            year: parseInt(match[1]),
            month: parseInt(match[2]),
            day: parseInt(match[3]),
            time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
          };
        }

        // パターン2: YYYY/MM/DD
        match = dateText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (match) {
          const timeMatch = dateText.match(/(\d{1,2}):(\d{2})/);
          return {
            year: parseInt(match[1]),
            month: parseInt(match[2]),
            day: parseInt(match[3]),
            time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
          };
        }

        // パターン3: MM月DD日（年なし、現在年を使用）
        match = dateText.match(/(\d{1,2})月(\d{1,2})日/);
        if (match) {
          const currentYear = new Date().getFullYear();
          const timeMatch = dateText.match(/(\d{1,2}):(\d{2})/);
          return {
            year: currentYear,
            month: parseInt(match[1]),
            day: parseInt(match[2]),
            time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
          };
        }
      }

      console.log("ChronoClip: Failed to extract date from NJPW event");
      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting date:", error);
      return null;
    }
  }

  /**
   * 会場を抽出
   * @param {HTMLElement} element - イベント要素
   * @returns {string|null} 会場名
   */
  extractLocation(element) {
    try {
      const selectors = [
        ".venue",
        ".location",
        ".event-venue",
        ".place",
        ".arena",
      ];

      for (const selector of selectors) {
        const locationElement = element.querySelector(selector);
        if (locationElement) {
          const locationText = locationElement.textContent.trim();
          if (locationText) {
            console.log(`ChronoClip: Extracted location using ${selector}:`, locationText);
            return locationText;
          }
        }
      }

      // フォールバック: テキストから会場名を抽出
      const text = element.textContent;
      const venuePatterns = [
        /会場[：:]\s*([^\n]+)/,
        /場所[：:]\s*([^\n]+)/,
        /(東京ドーム|両国国技館|大阪城ホール|後楽園ホール|横浜アリーナ)/,
      ];

      for (const pattern of venuePatterns) {
        const match = text.match(pattern);
        if (match) {
          const venue = match[1] || match[0];
          console.log("ChronoClip: Extracted location from text:", venue);
          return venue.trim();
        }
      }

      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting location:", error);
      return null;
    }
  }

  /**
   * イベントURLを抽出
   * @param {HTMLElement} element - イベント要素
   * @returns {string|null} イベントURL
   */
  extractEventUrl(element) {
    try {
      // イベント詳細へのリンクを探す
      const link = element.querySelector("a[href*='/tornament/']") ||
                   element.querySelector("a[href*='/event/']") ||
                   element.querySelector("a[href]");

      if (link) {
        const href = link.getAttribute("href");
        if (href) {
          // 相対URLの場合は絶対URLに変換
          if (href.startsWith("/")) {
            return `https://www.njpw.co.jp${href}`;
          }
          return href;
        }
      }

      return null;
    } catch (error) {
      console.error("ChronoClip: Error extracting event URL:", error);
      return null;
    }
  }

  /**
   * 日付情報からDateオブジェクトを作成
   * @param {Object} dateInfo - 日付情報 {year, month, day, time}
   * @returns {Date|null} Dateオブジェクト
   */
  createDateFromInfo(dateInfo) {
    try {
      if (!dateInfo) {
        return null;
      }

      let hour = 0;
      let minute = 0;

      if (dateInfo.time) {
        const timeMatch = dateInfo.time.match(/(\d{1,2}):(\d{2})/);
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
      console.log("ChronoClip: Created date:", eventDate);
      return eventDate;
    } catch (error) {
      console.error("ChronoClip: Error creating date:", error);
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
    const urlPattern = /https:\/\/www\.njpw\.co\.jp\/schedule/;
    return urlPattern.test(url);
  }

  /**
   * BaseExtractorのextractをオーバーライド
   * @param {Document} document
   * @param {Object} options
   * @returns {Array} イベント配列
   */
  extract(document, options = {}) {
    console.log("ChronoClip: NjpwScheduleExtractor extract called");

    try {
      const events = [];

      // すべてのイベント要素を取得
      const selectors = [
        ".card",
        ".schedule-item",
        "article",
        ".event-item",
      ];

      let eventElements = [];
      for (const selector of selectors) {
        eventElements = document.querySelectorAll(selector);
        if (eventElements.length > 0) {
          console.log(`ChronoClip: Found ${eventElements.length} events using ${selector}`);
          break;
        }
      }

      for (const element of eventElements) {
        try {
          const title = this.extractTitle(element);
          const dateInfo = this.extractDateInfo(element);
          const location = this.extractLocation(element);
          const eventUrl = this.extractEventUrl(element);

          if (!title || !dateInfo) {
            continue;
          }

          const eventDate = this.createDateFromInfo(dateInfo);

          let description = "";
          if (location) {
            description += `会場: ${location}\n`;
          }
          if (eventUrl) {
            description += `詳細情報: ${eventUrl}`;
          }

          events.push({
            title: title,
            description: description.trim(),
            date: eventDate,
            location: location || "",
            url: eventUrl || window.location.href,
          });
        } catch (error) {
          console.warn("ChronoClip: Error processing event element:", error);
        }
      }

      console.log(
        `ChronoClip: NjpwScheduleExtractor extracted ${events.length} events`
      );
      return events;
    } catch (error) {
      console.error("ChronoClip: NjpwScheduleExtractor extraction failed:", error);
      return [];
    }
  }
}

// グローバルスコープに登録
if (typeof window !== "undefined") {
  window.ChronoClipNjpwScheduleExtractor = ChronoClipNjpwScheduleExtractor;
}
