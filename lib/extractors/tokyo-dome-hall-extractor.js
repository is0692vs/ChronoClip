/**
 * 東京ドームシティホール専用抽出エンジン
 * https://www.tokyo-dome.co.jp/hall/event/ 用
 */

/**
 * 東京ドームシティホール専用のイベント抽出クラス
 * 後楽園ホールの公式サイトからイベント情報を抽出
 */
class ChronoClipTokyoDomeHallExtractor extends window.ChronoClipBaseExtractor {
  constructor(rule) {
    super(rule);
    this.name = "tokyo-dome-hall";
    this.domain = rule?.domain || "www.tokyo-dome.co.jp";
    this.priority = 10; // 高優先度
    this.description = "東京ドームシティホール・後楽園ホール専用抽出エンジン";
    this.enabled = true;
    this.source = "code";
    this.urlPattern =
      "^https://www\\.tokyo-dome\\.co\\.jp/hall/event/?(?:\\?.*)?$";
    this.selectors = {
      calendarTable: ".c-mod-calender",
      eventRow: ".c-mod-calender__item",
      eventDetail: ".c-mod-calender__detail-in",
      dayElement: ".c-mod-calender__day",
      timeElement: ".c-txt-caption-01",
      linkElement: ".c-mod-calender__links a",
      tagElement: ".c-txt-tag__item",
    };
  }

  /**
   * BaseExtractorのextractAllメソッドをオーバーライド
   * 東京ドーム専用のイベント抽出ロジックを使用
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Promise<Object>} 抽出結果
   */
  async extractAll(context) {
    try {
      console.log(
        `ChronoClip: TokyoDomeHallExtractor extracting from domain: ${this.domain}`
      );

      // コンテキスト要素から特定の日付と時間情報を特定
      const targetInfo = this.extractTargetInfoFromContext(context);
      console.log(`ChronoClip: Target info extracted:`, targetInfo);

      // 東京ドーム専用抽出を実行（特定の時間とイベントに絞る）
      const events = this.extractEventsForSpecificTarget(document, targetInfo);

      // 結果を統一フォーマットに変換
      let result = {
        title: null,
        description: null,
        date: null,
        location: "後楽園ホール",
        price: null,
        events: events,
        confidence: events.length > 0 ? 0.9 : 0.1,
        extractor: this.constructor.name,
        domain: this.domain,
      };

      // 最初のイベントの情報をメインフィールドに設定
      if (events.length > 0) {
        const firstEvent = events[0];
        result.title = firstEvent.title;
        result.description = firstEvent.description; // クリーンなdescriptionを設定
        result.date = firstEvent.startTime
          ? new Date(firstEvent.startTime)
          : null;
        result.location = firstEvent.location;
        result.url = firstEvent.url; // イベント固有のURLを設定
        result.events = events; // eventsも設定
      }

      console.log(
        `ChronoClip: TokyoDomeHallExtractor extracted ${events.length} events for target:`,
        targetInfo
      );

      // デバッグ: resultオブジェクトの内容を確認
      console.log("ChronoClip: Final result object:", result);

      return result;
    } catch (error) {
      console.error(`ChronoClip: TokyoDomeHallExtractor failed:`, error);
      return {
        title: null,
        description: null,
        date: null,
        location: null,
        price: null,
        events: [],
        confidence: 0,
        extractor: this.constructor.name,
        domain: this.domain,
        error: error.message,
      };
    }
  }

  /**
   * コンテキスト要素から特定の日付と時間情報を抽出
   * @param {HTMLElement} context - コンテキスト要素
   * @returns {Object} 日付と時間情報 {day: string, timeText: string, eventBlock: HTMLElement}
   */
  extractTargetInfoFromContext(context) {
    console.log("ChronoClip: extractTargetInfoFromContext - context:", context);

    if (!context) {
      console.warn("ChronoClip: context is null or undefined");
      return { day: null, timeText: null, eventBlock: null };
    }

    // クリックされた要素から最も近いイベントブロック（.c-mod-calender__detail-in）を探す
    let eventBlock = context.closest(".c-mod-calender__detail-in");
    if (!eventBlock) {
      console.warn("ChronoClip: No eventBlock found in context");
      return { day: null, timeText: null, eventBlock: null };
    }

    // 日付の抽出（c-mod-calender__dayクラスを持つ要素から）
    // まず、イベントブロック内を確認
    let dayElement = eventBlock.querySelector(".c-mod-calender__day");

    // イベントブロック内にない場合は、親要素（th）から探す
    if (!dayElement) {
      const parentRow = eventBlock.closest("tr");
      if (parentRow) {
        dayElement = parentRow.querySelector(".c-mod-calender__day");
      }
    }

    const day = dayElement ? dayElement.textContent.trim() : null;

    // 時間テキストの抽出（時間要素から）
    const timeElement = eventBlock.querySelector(".c-txt-caption-01");
    const timeText = timeElement ? timeElement.textContent.trim() : null;

    console.log("ChronoClip: Extracted target info:", {
      day,
      timeText,
      eventBlock,
    });

    return {
      day: day,
      timeText: timeText,
      eventBlock: eventBlock,
    };
  }

  /**
   * 特定のターゲット情報に基づいてイベントを抽出
   * @param {Document} doc - ドキュメントオブジェクト
   * @param {Object} targetInfo - ターゲット情報 {day, timeText, eventBlock}
   * @returns {Array} イベント配列
   */
  extractEventsForSpecificTarget(doc, targetInfo) {
    const events = [];

    if (!targetInfo || !targetInfo.eventBlock) {
      console.warn("ChronoClip: No valid target info provided");
      return events;
    }

    // 特定のイベントブロックからイベント詳細を抽出
    const eventDetails = this.extractSingleEvent(targetInfo.eventBlock);

    if (eventDetails) {
      // 年月情報を取得（イベントブロックを渡す）
      const yearMonthInfo = this.extractYearMonth(doc, targetInfo.eventBlock);

      // 日付情報を組み合わせて完全なイベントオブジェクトを作成
      const completeEvent = this.createEventObject(
        yearMonthInfo,
        { day: parseInt(targetInfo.day), weekday: null },
        eventDetails
      );

      if (completeEvent) {
        console.log(
          "ChronoClip: Extracted specific event details:",
          completeEvent
        );
        events.push(completeEvent);
      } else {
        console.warn("ChronoClip: Failed to create complete event object");
      }
    } else {
      console.warn("ChronoClip: No event details extracted from block");
    }

    return events;
  }

  /**
   * BaseExtractorのcanExtractをオーバーライド
   * @param {string} url
   * @param {Document} document
   * @returns {boolean}
   */
  canExtract(url, document) {
    const urlMatch = /^https:\/\/www\.tokyo-dome\.co\.jp\/hall\/event\/?/.test(
      url
    );
    const hasCalendar = document.querySelector(".c-mod-calender") !== null;
    const result = urlMatch && hasCalendar;

    console.log(
      `ChronoClip: TokyoDomeHallExtractor.canExtract(${url}) = ${result}`
    );
    return result;
  }

  /**
   * BaseExtractorのextractをオーバーライド
   * @param {Document} document
   * @param {Object} options
   * @returns {Array} イベント配列
   */
  extract(document, options = {}) {
    console.log("ChronoClip: TokyoDomeHallExtractor extract called");

    try {
      const yearMonthInfo = this.extractYearMonth(document);
      console.log("ChronoClip: Year/Month info:", yearMonthInfo);

      const events = [];
      const tables = document.querySelectorAll(this.selectors.calendarTable);

      for (const table of tables) {
        const tableYearMonth = this.getTableYearMonth(table, yearMonthInfo);
        const rows = table.querySelectorAll(this.selectors.eventRow);

        for (const row of rows) {
          try {
            const dayInfo = this.extractDayInfo(row);
            if (!dayInfo.day) continue;

            const eventDetails = this.extractEventDetails(row);
            if (eventDetails.length === 0) continue;

            for (const detail of eventDetails) {
              const event = this.createEventObject(
                tableYearMonth,
                dayInfo,
                detail
              );
              if (event) {
                events.push(event);
              }
            }
          } catch (error) {
            console.warn("ChronoClip: Error processing row:", error);
          }
        }
      }

      console.log(
        `ChronoClip: TokyoDomeHallExtractor extracted ${events.length} events`
      );
      return events;
    } catch (error) {
      console.error(
        "ChronoClip: TokyoDomeHallExtractor extraction failed:",
        error
      );
      return [];
    }
  }

  /**
   * 年月情報を抽出
   * @param {Document} document
   * @param {HTMLElement} eventBlock - 現在のイベントブロック
   * @returns {Object}
   */
  extractYearMonth(document, eventBlock = null) {
    try {
      let yearMonthElement = null;

      // イベントブロックが提供されている場合、そのブロックに最も近い年月情報を探す
      if (eventBlock) {
        // イベントブロックから最も近いテーブルコンテナを探す
        const tabBody = eventBlock.closest(".c-mod-tab__body");
        if (tabBody) {
          yearMonthElement = tabBody.querySelector(".c-ttl-set-calender");
        }
      }

      // 見つからない場合は、ページ全体から探す
      if (!yearMonthElement) {
        yearMonthElement = document.querySelector(".c-ttl-set-calender");
      }

      if (!yearMonthElement) {
        const currentDate = new Date();
        return {
          year: currentDate.getFullYear(),
          month: currentDate.getMonth() + 1,
        };
      }

      const text = yearMonthElement.textContent.trim();
      const match = text.match(/(\d{4})年(\d{1,2})月/);

      if (match) {
        console.log("ChronoClip: Extracted year/month from:", text, "->", {
          year: parseInt(match[1], 10),
          month: parseInt(match[2], 10),
        });
        return {
          year: parseInt(match[1], 10),
          month: parseInt(match[2], 10),
        };
      }

      // フォールバック: 現在の日付を使用
      const currentDate = new Date();
      return {
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
      };
    } catch (error) {
      console.warn("ChronoClip: Failed to extract year/month:", error);
      const currentDate = new Date();
      return {
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
      };
    }
  }

  /**
   * テーブルの年月情報を取得
   * @param {HTMLElement} table
   * @param {Object} defaultYearMonth
   * @returns {Object}
   */
  getTableYearMonth(table, defaultYearMonth) {
    // テーブル固有の年月情報がある場合はそれを使用
    const tableYearMonth = table.querySelector(".c-ttl-set-calender");
    if (tableYearMonth) {
      const text = tableYearMonth.textContent.trim();
      const match = text.match(/(\d{4})年(\d{1,2})月/);
      if (match) {
        return {
          year: parseInt(match[1], 10),
          month: parseInt(match[2], 10),
        };
      }
    }

    return defaultYearMonth;
  }

  /**
   * 日付情報を抽出
   * @param {HTMLElement} row
   * @returns {Object}
   */
  extractDayInfo(row) {
    try {
      const dayElement = row.querySelector(this.selectors.dayElement);
      if (!dayElement) {
        return { day: null, weekday: null };
      }

      const dayText = dayElement.textContent.trim();
      const day = parseInt(dayText, 10);

      // 曜日情報を取得（存在する場合）
      const weekdayElement = row.querySelector(
        `${this.selectors.dayElement}:nth-of-type(2)`
      );
      const weekday = weekdayElement ? weekdayElement.textContent.trim() : null;

      return { day, weekday };
    } catch (error) {
      console.warn("ChronoClip: Failed to extract day info:", error);
      return { day: null, weekday: null };
    }
  }

  /**
   * イベント詳細を抽出
   * @param {HTMLElement} row
   * @returns {Array}
   */
  extractEventDetails(row) {
    try {
      const eventBlocks = row.querySelectorAll(this.selectors.eventDetail);
      const eventDetails = [];

      for (const block of eventBlocks) {
        const detail = this.extractSingleEvent(block);
        if (detail) {
          eventDetails.push(detail);
        }
      }

      return eventDetails;
    } catch (error) {
      console.warn("ChronoClip: Failed to extract event details:", error);
      return [];
    }
  }

  /**
   * 単一イベントの詳細を抽出
   * @param {HTMLElement} block
   * @returns {Object|null}
   */
  extractSingleEvent(block) {
    try {
      console.log("ChronoClip: extractSingleEvent - processing block:", block);

      if (!block) {
        console.warn("ChronoClip: extractSingleEvent - block is null");
        return null;
      }

      // タイトル（リンクテキスト）
      const linkElement = block.querySelector(this.selectors.linkElement);
      console.log("ChronoClip: Link element found:", linkElement);

      let title = linkElement ? linkElement.textContent.trim() : null;
      const url = linkElement ? linkElement.href : null;
      console.log("ChronoClip: Extracted title:", title, "URL:", url);

      // リンクがない場合、p.c-mod-calender__links から直接テキストを取得
      if (!title) {
        const titleElement = block.querySelector(".c-mod-calender__links");
        if (titleElement && !titleElement.querySelector("a")) {
          title = titleElement.textContent.trim();
          console.log(
            "ChronoClip: Extracted title from non-linked element:",
            title
          );
        }
      }

      // 時間情報
      const timeElements = block.querySelectorAll(this.selectors.timeElement);
      console.log("ChronoClip: Time elements found:", timeElements.length);

      let startTime = null;
      let description = [];
      let timeInfo = [];
      let contactInfo = []; // ★ 追加: お問い合わせ情報を分離

      for (const timeElement of timeElements) {
        const text = timeElement.textContent.trim();
        console.log("ChronoClip: Processing time text:", text);

        if (text.includes("開始")) {
          const timeMatch = text.match(/開始\s*(\d{1,2}:\d{2})/);
          if (timeMatch) {
            startTime = timeMatch[1];
            console.log("ChronoClip: Extracted start time:", startTime);
            timeInfo.push(`開始: ${startTime}`);
          }
        } else if (text.includes("お問い合わせ")) {
          contactInfo.push(text); // ★ 変更: お問い合わせ情報を別の配列に格納
        }
      }

      // タグ情報（イベントカテゴリ）
      const tagElement = block.querySelector(this.selectors.tagElement);
      const category = tagElement ? tagElement.textContent.trim() : null;
      console.log("ChronoClip: Extracted category:", category);

      // descriptionにはカテゴリを含めず、URLのみを使用
      // （詳細フィールドにはURLが表示され、カテゴリ情報は不要）
      // if (category) {
      //   description.push(`カテゴリ: ${category}`);
      // }
      // descriptionには時間情報を含めないようにする
      // if (timeInfo.length > 0) {
      //   description.push(...timeInfo);
      // }

      // 空の場合はnull を返す前に、代替手段でタイトルを探す
      if (!title && !startTime && description.length === 0) {
        // 代替手段: ブロック内のテキストから直接タイトルを探す
        const allText = block.textContent.trim();
        console.log(
          "ChronoClip: Fallback - extracting from all text:",
          allText
        );

        if (allText) {
          const lines = allText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line);
          const fallbackTitle = lines.find(
            (line) => line && !line.includes("開始") && !line.includes("終了")
          );

          if (fallbackTitle) {
            console.log("ChronoClip: Using fallback title:", fallbackTitle);
            return {
              title: fallbackTitle,
              description: allText,
              startTime: startTime,
              endTime: null,
              url: url,
              category: category,
            };
          }
        }

        console.warn("ChronoClip: No extractable content found in block");
        return null;
      }

      const result = {
        title: title || "イベント",
        description: description.join("\n"), // descriptionにはカテゴリのみ、または空
        startTime: startTime,
        endTime: null,
        url: url,
        category: category,
        contact: contactInfo.join("\n"), // ★ 追加: お問い合わせ情報を別途保持
      };

      console.log("ChronoClip: extractSingleEvent result:", result);
      return result;
    } catch (error) {
      console.warn("ChronoClip: Failed to extract single event:", error);
      return null;
    }
  }

  /**
   * イベントオブジェクトを作成
   * @param {Object} yearMonthInfo
   * @param {Object} dayInfo
   * @param {Object} eventDetail
   * @returns {Object|null}
   */
  createEventObject(yearMonthInfo, dayInfo, eventDetail) {
    try {
      if (!yearMonthInfo || !dayInfo.day || !eventDetail) {
        return null;
      }

      // 日付オブジェクトを作成
      let startDateTime = null;
      let endDateTime = null;
      const { year, month } = yearMonthInfo;
      const day = dayInfo.day;

      if (eventDetail.startTime) {
        const [hour, minute] = eventDetail.startTime.split(":").map(Number);
        // JST (+09:00) を指定してISO文字列を生成
        const isoString = `${year}-${String(month).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(
          minute
        ).padStart(2, "0")}:00+09:00`;
        startDateTime = new Date(isoString);
      } else {
        // 終日イベント
        const isoString = `${year}-${String(month).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}T00:00:00+09:00`;
        startDateTime = new Date(isoString);
      }

      // 終了時刻（仮で3時間後に設定）
      if (startDateTime) {
        endDateTime = new Date(startDateTime.getTime() + 3 * 60 * 60 * 1000);
      }

      return {
        title: eventDetail.title,
        description: eventDetail.description,
        startTime: startDateTime ? startDateTime.toISOString() : null,
        endTime: endDateTime ? endDateTime.toISOString() : null,
        location: "後楽園ホール",
        url: eventDetail.url,
        category: eventDetail.category,
        source: "tokyo-dome-hall",
      };
    } catch (error) {
      console.warn("ChronoClip: Failed to create event object:", error);
      return null;
    }
  }

  /**
   * エクストラクターの設定情報を取得
   * @returns {Object}
   */
  getConfig() {
    return {
      name: this.name,
      domain: this.domain,
      priority: this.priority,
      description: this.description,
      enabled: this.enabled,
      source: this.source,
      urlPattern: this.urlPattern,
      selectors: this.selectors,
    };
  }
}

// グローバルスコープに登録
if (typeof window !== "undefined") {
  window.ChronoClipTokyoDomeHallExtractor = ChronoClipTokyoDomeHallExtractor;
}
