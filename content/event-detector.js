/**
 * @fileoverview 統合イベント検出エンジン
 * 選択右クリックと常時ハイライトで共通利用可能な検出・抽出ロジックを提供
 */

/**
 * イベント検出エンジンクラス
 * サイト固有パターン、検出戦略、抽出ロジックを統合管理
 */
class EventDetector {
  constructor() {
    this.sitePatterns = new Map();
    this.extractionStrategies = new Map();
    this.dateParser = window.ChronoClipDateParser;
    this.initialized = false;

    this.init();
  }

  /**
   * エンジンの初期化
   */
  init() {
    this.registerBuiltinSitePatterns();
    this.registerBuiltinExtractionStrategies();
    this.initialized = true;
  }

  /**
   * 組み込みサイトパターンの登録
   */
  registerBuiltinSitePatterns() {
    // イベント系サイトのパターン
    this.registerSitePattern("eventbrite", {
      domains: ["eventbrite.com", "eventbrite.co.jp"],
      selectors: {
        title:
          '.event-title, .event-card__title, h1[data-automation-id="event-title"]',
        date: '.event-details__data, .date-info, [data-automation-id="event-start-date"]',
        description:
          ".event-description, .event-card__description, .structured-content",
        price: ".event-card__price, .conversion-bar__panel-info",
        location: ".venue-info, .event-details__data--location",
      },
      dateFormats: ["YYYY年MM月DD日", "MM月DD日", "YYYY/MM/DD"],
      priority: 10,
    });

    // Amazon商品ページ
    this.registerSitePattern("amazon", {
      domains: ["amazon.co.jp", "amazon.com"],
      selectors: {
        title: "#productTitle, .product-title",
        date: "#availability .a-color-success, #delivery-block",
        description: "#feature-bullets ul, .a-unordered-list .a-list-item",
        price: ".a-price-whole, .a-offscreen",
      },
      dateFormats: ["MM月DD日", "YYYY/MM/DD"],
      priority: 5,
    });

    // 楽天イベント・商品
    this.registerSitePattern("rakuten", {
      domains: ["rakuten.co.jp", "event.rakuten.co.jp"],
      selectors: {
        title: ".item-name, .event-title, h1",
        date: ".delivery-date, .event-date, .date-info",
        description: ".item-desc, .event-description",
        price: ".price, .event-price",
      },
      dateFormats: ["YYYY年MM月DD日", "MM月DD日"],
      priority: 8,
    });

    // 一般的なパターン（フォールバック）
    this.registerSitePattern("general", {
      domains: ["*"],
      selectors: {
        title: "h1, h2, .title, .event-title, .product-title",
        date: ".date, .datetime, .event-date, .delivery-date, time",
        description: ".description, .content, .event-description, p",
        price: ".price, .cost, .fee",
      },
      dateFormats: ["YYYY年MM月DD日", "MM月DD日", "YYYY/MM/DD", "YYYY-MM-DD"],
      priority: 1,
    });
  }

  /**
   * 組み込み抽出戦略の登録
   */
  registerBuiltinExtractionStrategies() {
    // 選択範囲ベースの抽出戦略
    this.registerExtractionStrategy("selection", {
      extractDate: (context) => this.extractDateFromSelection(context),
      extractTitle: (context) => this.extractTitleFromSelection(context),
      extractDescription: (context) =>
        this.extractDescriptionFromSelection(context),
      priority: 10,
    });

    // 常時ハイライト用の抽出戦略
    this.registerExtractionStrategy("highlight", {
      extractDate: (context) => this.extractDateFromHighlight(context),
      extractTitle: (context) => this.extractTitleFromHighlight(context),
      extractDescription: (context) =>
        this.extractDescriptionFromHighlight(context),
      priority: 8,
    });

    // サイト固有の抽出戦略
    this.registerExtractionStrategy("site-specific", {
      extractDate: (context) => this.extractDateFromSitePattern(context),
      extractTitle: (context) => this.extractTitleFromSitePattern(context),
      extractDescription: (context) =>
        this.extractDescriptionFromSitePattern(context),
      priority: 15,
    });
  }

  /**
   * サイトパターンの登録
   * @param {string} name パターン名
   * @param {object} pattern パターン定義
   */
  registerSitePattern(name, pattern) {
    this.sitePatterns.set(name, pattern);
  }

  /**
   * 抽出戦略の登録
   * @param {string} name 戦略名
   * @param {object} strategy 戦略定義
   */
  registerExtractionStrategy(name, strategy) {
    this.extractionStrategies.set(name, strategy);
  }

  /**
   * 現在のサイトに適用可能なパターンを取得
   * @returns {Array} 適用可能なパターンの配列（優先度順）
   */
  getApplicableSitePatterns() {
    const currentDomain = window.location.hostname;
    const patterns = [];

    for (const [name, pattern] of this.sitePatterns.entries()) {
      if (this.isPatternApplicable(pattern, currentDomain)) {
        patterns.push({ name, ...pattern });
      }
    }

    return patterns.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * パターンが現在のサイトに適用可能かチェック
   * @param {object} pattern パターン定義
   * @param {string} domain 現在のドメイン
   * @returns {boolean}
   */
  isPatternApplicable(pattern, domain) {
    if (!pattern.domains) return false;

    return pattern.domains.some((patternDomain) => {
      if (patternDomain === "*") return true;
      return domain.includes(patternDomain);
    });
  }

  /**
   * メインのイベント抽出API
   * @param {object} extractionContext 抽出コンテキスト
   * @returns {Promise<object>} 抽出されたイベント情報
   */
  async extractEvent(extractionContext) {
    if (!this.initialized) {
      throw new Error("EventDetector not initialized");
    }

    const result = {
      dateInfo: null,
      title: null,
      description: null,
      metadata: {
        source: null,
        confidence: 0,
        strategies: [],
        patterns: [],
      },
    };

    // 適用可能な抽出戦略を優先度順で取得
    const strategies = Array.from(this.extractionStrategies.entries()).sort(
      (a, b) => (b[1].priority || 0) - (a[1].priority || 0)
    );

    // 各戦略を試行
    for (const [strategyName, strategy] of strategies) {
      try {
        // 日付抽出
        if (!result.dateInfo) {
          const dateInfo = await strategy.extractDate(extractionContext);
          if (dateInfo) {
            result.dateInfo = dateInfo;
            result.metadata.strategies.push(`${strategyName}:date`);
          }
        }

        // タイトル抽出
        if (!result.title) {
          const title = await strategy.extractTitle(extractionContext);
          if (title) {
            result.title = title;
            result.metadata.strategies.push(`${strategyName}:title`);
          }
        }

        // 詳細抽出
        if (!result.description) {
          const description = await strategy.extractDescription(
            extractionContext
          );
          if (description) {
            result.description = description;
            result.metadata.strategies.push(`${strategyName}:description`);
          }
        }

        // 全て取得できたら終了
        if (result.dateInfo && result.title && result.description) {
          break;
        }
      } catch (error) {
        console.warn(`ChronoClip: Strategy ${strategyName} failed:`, error);
      }
    }

    // 信頼度計算
    result.metadata.confidence = this.calculateConfidence(result);

    return result;
  }

  /**
   * 選択範囲からの日付抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<object|null>}
   */
  async extractDateFromSelection(context) {
    if (!context.selectionInfo || !this.dateParser) return null;

    const textSources = [
      context.selectionInfo.text,
      context.contextInfo?.heading?.text || "",
      ...(context.contextInfo?.paragraphs?.map((p) => p.text) || []),
      context.contextInfo?.parent?.textContent || "",
    ].filter((text) => text.length > 0);

    for (const text of textSources) {
      const parsedDate = this.dateParser.parseDate(text);
      if (parsedDate) {
        return this.convertDateParserFormat(parsedDate);
      }
    }

    return null;
  }

  /**
   * 常時ハイライト用の日付抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<object|null>}
   */
  async extractDateFromHighlight(context) {
    if (!context.targetElement || !this.dateParser) return null;

    const element = context.targetElement;
    const textSources = [
      element.textContent,
      element.getAttribute("datetime"),
      element.getAttribute("data-date"),
      this.getElementContext(element, "prev"),
      this.getElementContext(element, "next"),
      this.getElementContext(element, "parent"),
    ].filter((text) => text && text.length > 0);

    for (const text of textSources) {
      const parsedDate = this.dateParser.parseDate(text);
      if (parsedDate) {
        return this.convertDateParserFormat(parsedDate);
      }
    }

    return null;
  }

  /**
   * サイト固有パターンからの日付抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<object|null>}
   */
  async extractDateFromSitePattern(context) {
    const patterns = this.getApplicableSitePatterns();

    for (const pattern of patterns) {
      if (!pattern.selectors?.date) continue;

      const dateElements = document.querySelectorAll(pattern.selectors.date);
      for (const element of dateElements) {
        const text = element.textContent || element.getAttribute("datetime");
        if (text && this.dateParser) {
          const parsedDate = this.dateParser.parseDate(text);
          if (parsedDate) {
            return this.convertDateParserFormat(parsedDate);
          }
        }
      }
    }

    return null;
  }

  /**
   * 選択範囲からのタイトル抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<string|null>}
   */
  async extractTitleFromSelection(context) {
    if (!context.selectionInfo) return null;

    const selectionInfo = context.selectionInfo;
    const contextInfo = context.contextInfo;

    // 1. 見出し要素から抽出
    if (contextInfo?.heading?.text) {
      return this.cleanTitle(contextInfo.heading.text);
    }

    // 2. 選択テキストから抽出
    if (selectionInfo.text && selectionInfo.text.length <= 100) {
      return this.cleanTitle(selectionInfo.text);
    }

    // 3. 親要素の見出しを検索
    const headingElement = this.findNearestHeading(selectionInfo.element);
    if (headingElement) {
      return this.cleanTitle(headingElement.textContent);
    }

    return null;
  }

  /**
   * 常時ハイライト用のタイトル抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<string|null>}
   */
  async extractTitleFromHighlight(context) {
    if (!context.targetElement) return null;

    const element = context.targetElement;

    // 1. 最寄りの見出しを検索
    const heading = this.findNearestHeading(element);
    if (heading) {
      return this.cleanTitle(heading.textContent);
    }

    // 2. 要素自体がタイトル候補か
    if (
      element.tagName &&
      ["H1", "H2", "H3", "H4", "H5", "H6"].includes(element.tagName)
    ) {
      return this.cleanTitle(element.textContent);
    }

    // 3. データ属性から
    const title =
      element.getAttribute("data-title") || element.getAttribute("title");
    if (title) {
      return this.cleanTitle(title);
    }

    return null;
  }

  /**
   * サイト固有パターンからのタイトル抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<string|null>}
   */
  async extractTitleFromSitePattern(context) {
    const patterns = this.getApplicableSitePatterns();

    for (const pattern of patterns) {
      if (!pattern.selectors?.title) continue;

      const titleElements = document.querySelectorAll(pattern.selectors.title);
      for (const element of titleElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0) {
          return this.cleanTitle(text);
        }
      }
    }

    return null;
  }

  /**
   * 選択範囲からの詳細抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<string|null>}
   */
  async extractDescriptionFromSelection(context) {
    if (!context.selectionInfo) return null;

    const selectionInfo = context.selectionInfo;
    const contextInfo = context.contextInfo;

    const descriptionParts = [];

    // 1. 周辺段落
    if (contextInfo?.paragraphs?.length > 0) {
      contextInfo.paragraphs.forEach((p) => {
        if (p.text && p.text.length > 10) {
          descriptionParts.push(p.text.trim());
        }
      });
    }

    // 2. 選択テキスト自体（長い場合）
    if (selectionInfo.text && selectionInfo.text.length > 50) {
      descriptionParts.push(selectionInfo.text.trim());
    }

    return descriptionParts.length > 0 ? descriptionParts.join("\n\n") : null;
  }

  /**
   * 常時ハイライト用の詳細抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<string|null>}
   */
  async extractDescriptionFromHighlight(context) {
    if (!context.targetElement) return null;

    const element = context.targetElement;
    const descriptionParts = [];

    // 1. 同じセクション内の段落
    const section = element.closest("section, article, .content, .description");
    if (section) {
      const paragraphs = section.querySelectorAll("p");
      paragraphs.forEach((p) => {
        const text = p.textContent?.trim();
        if (text && text.length > 10) {
          descriptionParts.push(text);
        }
      });
    }

    // 2. 要素自体の内容（長い場合）
    const elementText = element.textContent?.trim();
    if (elementText && elementText.length > 50) {
      descriptionParts.push(elementText);
    }

    return descriptionParts.length > 0 ? descriptionParts.join("\n\n") : null;
  }

  /**
   * サイト固有パターンからの詳細抽出
   * @param {object} context 抽出コンテキスト
   * @returns {Promise<string|null>}
   */
  async extractDescriptionFromSitePattern(context) {
    const patterns = this.getApplicableSitePatterns();

    for (const pattern of patterns) {
      if (!pattern.selectors?.description) continue;

      const descElements = document.querySelectorAll(
        pattern.selectors.description
      );
      const descriptionParts = [];

      for (const element of descElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 10) {
          descriptionParts.push(text);
        }
      }

      if (descriptionParts.length > 0) {
        return descriptionParts.join("\n\n");
      }
    }

    return null;
  }

  /**
   * date-parser.jsの出力形式をcontent-script.js互換形式に変換
   * @param {object} parsedDate date-parser.jsの出力
   * @returns {object} 変換後の形式
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
      // 時刻付きイベント
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
      // 終日イベント
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
   * タイトルのクリーンアップ
   * @param {string} title 元のタイトル
   * @returns {string} クリーンアップ後のタイトル
   */
  cleanTitle(title) {
    if (!title) return "";

    return title
      .replace(/^\s*[-•·]\s*/, "") // 先頭の箇条書き記号
      .replace(/\s*[|｜]\s*.*$/, "") // パイプ以降の削除
      .replace(/\s*[-–—]\s*.*$/, "") // ダッシュ以降の削除
      .replace(/\s+/g, " ") // 連続空白の正規化
      .trim()
      .substring(0, 100); // 長さ制限
  }

  /**
   * 最寄りの見出し要素を検索
   * @param {Element} element 基準要素
   * @returns {Element|null} 見出し要素
   */
  findNearestHeading(element) {
    if (!element) return null;

    // 1. 親要素を遡って見出しを検索
    let current = element;
    while (current && current !== document.body) {
      if (current.tagName && /^H[1-6]$/.test(current.tagName)) {
        return current;
      }

      // 兄弟要素の見出しをチェック
      const prevHeading = current.previousElementSibling;
      if (prevHeading && /^H[1-6]$/.test(prevHeading.tagName)) {
        return prevHeading;
      }

      current = current.parentElement;
    }

    // 2. セクション内の見出しを検索
    const section = element.closest("section, article, .content");
    if (section) {
      const heading = section.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) return heading;
    }

    return null;
  }

  /**
   * 要素のコンテキストテキストを取得
   * @param {Element} element 基準要素
   * @param {string} direction 方向（'prev', 'next', 'parent'）
   * @returns {string} コンテキストテキスト
   */
  getElementContext(element, direction) {
    if (!element) return "";

    switch (direction) {
      case "prev":
        return element.previousElementSibling?.textContent || "";
      case "next":
        return element.nextElementSibling?.textContent || "";
      case "parent":
        return element.parentElement?.textContent || "";
      default:
        return "";
    }
  }

  /**
   * 抽出結果の信頼度を計算
   * @param {object} result 抽出結果
   * @returns {number} 信頼度（0-1）
   */
  calculateConfidence(result) {
    let confidence = 0;

    // 日付情報の信頼度
    if (result.dateInfo) {
      confidence += result.dateInfo.confidence * 0.5;
    }

    // タイトルの有無
    if (result.title && result.title.length > 0) {
      confidence += 0.3;
    }

    // 詳細の有無
    if (result.description && result.description.length > 10) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }
}

// グローバルインスタンスの作成
window.ChronoClipEventDetector = new EventDetector();
