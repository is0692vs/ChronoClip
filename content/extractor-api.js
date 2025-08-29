/**
 * @fileoverview 統合イベント抽出API
 * 選択右クリックと常時ハイライトで共通利用可能な抽出インターフェース
 */

/**
 * 統合イベント抽出API
 * EventDetectorを利用した高レベルな抽出インターフェース
 */
class EventExtractorAPI {
  constructor() {
    this.detector = null;
    this.initialized = false;
  }

  /**
   * APIの初期化
   */
  async init() {
    if (this.initialized) return;

    // EventDetectorの初期化を待つ
    if (window.ChronoClipEventDetector) {
      this.detector = window.ChronoClipEventDetector;
    } else {
      // EventDetectorが利用できない場合の警告
      console.warn(
        "ChronoClip: EventDetector not available, using fallback methods"
      );
    }

    // サイトパターンの読み込み
    if (window.ChronoClipSitePatterns) {
      this.loadSitePatterns();
    }

    this.initialized = true;
  }

  /**
   * サイトパターンをEventDetectorに読み込み
   */
  loadSitePatterns() {
    if (!this.detector || !window.ChronoClipSitePatterns) return;

    for (const [name, pattern] of Object.entries(
      window.ChronoClipSitePatterns
    )) {
      this.detector.registerSitePattern(name, pattern);
    }
  }

  /**
   * 選択範囲からのイベント抽出
   * @param {object} selectionInfo 選択情報
   * @param {object} contextInfo コンテキスト情報
   * @param {object} pageInfo ページ情報
   * @returns {Promise<object>} 抽出結果
   */
  async extractFromSelection(selectionInfo, contextInfo, pageInfo) {
    await this.init();

    const extractionContext = {
      type: "selection",
      selectionInfo,
      contextInfo,
      pageInfo,
      targetElement: selectionInfo?.element,
    };

    return this.detector
      ? await this.detector.extractEvent(extractionContext)
      : await this.fallbackExtractFromSelection(
          selectionInfo,
          contextInfo,
          pageInfo
        );
  }

  /**
   * 要素からのイベント抽出（常時ハイライト用）
   * @param {Element} element 対象要素
   * @param {object} context 追加コンテキスト
   * @returns {Promise<object>} 抽出結果
   */
  async extractFromElement(element, context = {}) {
    await this.init();

    const extractionContext = {
      type: "highlight",
      targetElement: element,
      contextInfo: context,
      pageInfo: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
      },
    };

    return this.detector
      ? await this.detector.extractEvent(extractionContext)
      : await this.fallbackExtractFromElement(element, context);
  }

  /**
   * ページ全体からのイベント抽出（スキャン用）
   * @param {object} options 抽出オプション
   * @returns {Promise<Array>} 抽出結果の配列
   */
  async extractFromPage(options = {}) {
    await this.init();

    const {
      excludeSelectors = [
        "script",
        "style",
        "noscript",
        "textarea",
        "input",
        "select",
        "button",
        "[contenteditable]",
        ".chronoclip-date",
        ".chronoclip-ignore",
      ],
      includeSelectors = [
        "p",
        "div",
        "span",
        "li",
        "td",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ],
      maxResults = 50,
    } = options;

    const results = [];
    const processedElements = new Set();

    // 日付らしいテキストを含む要素を検索
    const datePattern =
      /\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日|\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{1,2}-\d{1,2}/;

    for (const selector of includeSelectors) {
      const elements = document.querySelectorAll(selector);

      for (const element of elements) {
        if (results.length >= maxResults) break;
        if (processedElements.has(element)) continue;
        if (this.shouldExcludeElement(element, excludeSelectors)) continue;

        const text = element.textContent?.trim();
        if (!text || text.length < 5) continue;
        if (!datePattern.test(text)) continue;

        try {
          const result = await this.extractFromElement(element);
          if (result && result.dateInfo) {
            results.push({
              ...result,
              element,
              metadata: {
                ...result.metadata,
                extractionType: "page-scan",
                selector,
              },
            });
            processedElements.add(element);
          }
        } catch (error) {
          console.warn("ChronoClip: Page extraction error:", error);
        }
      }
    }

    return results;
  }

  /**
   * 要素が除外対象かチェック
   * @param {Element} element 対象要素
   * @param {Array} excludeSelectors 除外セレクター
   * @returns {boolean}
   */
  shouldExcludeElement(element, excludeSelectors) {
    for (const selector of excludeSelectors) {
      if (element.matches(selector)) return true;
      if (element.closest(selector)) return true;
    }
    return false;
  }

  /**
   * フォールバック：選択範囲からの抽出
   * EventDetectorが利用できない場合の代替処理
   */
  async fallbackExtractFromSelection(selectionInfo, contextInfo, pageInfo) {
    const result = {
      dateInfo: null,
      title: null,
      description: null,
      metadata: {
        source: "fallback",
        confidence: 0.5,
        strategies: ["fallback-selection"],
      },
    };

    // 日付抽出のフォールバック
    if (window.ChronoClipDateParser) {
      const textSources = [
        selectionInfo.text,
        contextInfo?.heading?.text || "",
        ...(contextInfo?.paragraphs?.map((p) => p.text) || []),
        contextInfo?.parent?.textContent || "",
      ].filter((text) => text.length > 0);

      for (const text of textSources) {
        const parsedDate = window.ChronoClipDateParser.parseDate(text);
        if (parsedDate) {
          result.dateInfo = this.convertDateParserFormat(parsedDate);
          break;
        }
      }
    }

    // タイトル抽出のフォールバック
    if (contextInfo?.heading?.text) {
      result.title = this.cleanTitle(contextInfo.heading.text);
    } else if (selectionInfo.text && selectionInfo.text.length <= 100) {
      result.title = this.cleanTitle(selectionInfo.text);
    }

    // 詳細抽出のフォールバック
    const descriptionParts = [];
    if (contextInfo?.paragraphs?.length > 0) {
      contextInfo.paragraphs.forEach((p) => {
        if (p.text && p.text.length > 10) {
          descriptionParts.push(p.text.trim());
        }
      });
    }
    if (descriptionParts.length > 0) {
      result.description = descriptionParts.join("\n\n");
    }

    return result;
  }

  /**
   * フォールバック：要素からの抽出
   * EventDetectorが利用できない場合の代替処理
   */
  async fallbackExtractFromElement(element, context) {
    const result = {
      dateInfo: null,
      title: null,
      description: null,
      metadata: {
        source: "fallback",
        confidence: 0.3,
        strategies: ["fallback-element"],
      },
    };

    // 日付抽出のフォールバック
    if (window.ChronoClipDateParser) {
      const text = element.textContent;
      if (text) {
        const parsedDate = window.ChronoClipDateParser.parseDate(text);
        if (parsedDate) {
          result.dateInfo = this.convertDateParserFormat(parsedDate);
        }
      }
    }

    // タイトル抽出のフォールバック
    const heading = this.findNearestHeading(element);
    if (heading) {
      result.title = this.cleanTitle(heading.textContent);
    }

    return result;
  }

  /**
   * date-parser.js形式の変換（フォールバック用）
   */
  convertDateParserFormat(parsedDate) {
    if (!parsedDate) return null;

    const result = {
      type: parsedDate.type,
      confidence: parsedDate.confidence,
      source: parsedDate.source,
      start: {},
      end: {},
    };

    if (parsedDate.type === "datetime") {
      const startDate = new Date(parsedDate.start.dateTime);
      const endDate = new Date(parsedDate.end.dateTime);

      result.start = {
        year: startDate.getFullYear(),
        month: startDate.getMonth() + 1,
        day: startDate.getDate(),
        hour: startDate.getHours(),
        minute: startDate.getMinutes(),
        date: startDate.toISOString().split("T")[0],
        dateTime: parsedDate.start.dateTime,
        timeZone: parsedDate.start.timeZone,
      };

      result.end = {
        year: endDate.getFullYear(),
        month: endDate.getMonth() + 1,
        day: endDate.getDate(),
        hour: endDate.getHours(),
        minute: endDate.getMinutes(),
        date: endDate.toISOString().split("T")[0],
        dateTime: parsedDate.end.dateTime,
        timeZone: parsedDate.end.timeZone,
      };
    } else {
      const startDate = new Date(parsedDate.start.date + "T00:00:00");

      result.start = {
        year: startDate.getFullYear(),
        month: startDate.getMonth() + 1,
        day: startDate.getDate(),
        date: parsedDate.start.date,
      };

      result.end = {
        year: startDate.getFullYear(),
        month: startDate.getMonth() + 1,
        day: startDate.getDate(),
        date: parsedDate.end.date,
      };
    }

    return result;
  }

  /**
   * タイトルクリーンアップ（フォールバック用）
   */
  cleanTitle(title) {
    if (!title) return "";

    return title
      .replace(/^\s*[-•·]\s*/, "")
      .replace(/\s*[|｜]\s*.*$/, "")
      .replace(/\s*[-–—]\s*.*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 100);
  }

  /**
   * 最寄り見出し検索（フォールバック用）
   */
  findNearestHeading(element) {
    if (!element) return null;

    let current = element;
    while (current && current !== document.body) {
      if (current.tagName && /^H[1-6]$/.test(current.tagName)) {
        return current;
      }

      const prevHeading = current.previousElementSibling;
      if (prevHeading && /^H[1-6]$/.test(prevHeading.tagName)) {
        return prevHeading;
      }

      current = current.parentElement;
    }

    const section = element.closest("section, article, .content");
    if (section) {
      const heading = section.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) return heading;
    }

    return null;
  }

  /**
   * カスタム抽出戦略の追加
   * @param {string} name 戦略名
   * @param {object} strategy 戦略定義
   */
  addCustomStrategy(name, strategy) {
    if (this.detector) {
      this.detector.registerExtractionStrategy(name, strategy);
    }
  }

  /**
   * カスタムサイトパターンの追加
   * @param {string} name パターン名
   * @param {object} pattern パターン定義
   */
  addCustomSitePattern(name, pattern) {
    if (this.detector) {
      this.detector.registerSitePattern(name, pattern);
    }
  }
}

// グローバルインスタンスの作成
window.ChronoClipExtractor = new EventExtractorAPI();
