// content/content-script.js
/**
 * 日付スキャンの対象外とするCSSセレクターのリスト。
 * スクリプト、スタイルシート、編集可能な要素などを無視してパフォーマンスを向上させる。
 */
const ignoreSelectors = [
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "button",
  "[contenteditable]", // ユーザーが直接編集する要素
  "time", // <time>タグは別途解釈することが多いため除外
  ".chronoclip-date", // 既に処理済みの要素
  ".chronoclip-ignore", // トーストなどの無視すべき要素
  ".code",
  ".CodeMirror",
  ".ace_editor",
  "pre", // コード表示エリア
];

/**
 * @fileoverview ChronoClipのメインコンテンツスクリプト。
 * このスクリプトは、Webページのコンテンツをスキャンして日付を検索し、
 * それらを検証してハイライト表示し、イベントリスナーを追加します。
 */

(function () {
  // --- 設定管理 ---
  let currentSettings = null;
  let isInitialized = false;

  // --- Logger/ErrorHandler 初期化 ---
  let logger = null;
  let errorHandler = null;

  // Logger/ErrorHandler の初期化（遅延初期化）
  function initializeLogging() {
    if (!logger && window.ChronoClipLogger) {
      try {
        logger = new window.ChronoClipLogger();
        // 一時的にデバッグモードを有効化
        logger.setDebugMode(true);
        console.log("ChronoClip: Logger initialized");
      } catch (error) {
        console.error("ChronoClip: Failed to initialize logger:", error);
      }
    }

    if (!errorHandler && window.ChronoClipErrorHandler) {
      try {
        errorHandler = new window.ChronoClipErrorHandler();
        console.log("ChronoClip: Error handler initialized");
      } catch (error) {
        console.error("ChronoClip: Failed to initialize error handler:", error);
      }
    }
  }
  /**
   * 設定を初期化・購読
   */
  async function initializeSettings() {
    // Logger/ErrorHandler を先に初期化
    initializeLogging();

    try {
      logger?.info("Initializing content script settings");
      currentSettings = await window.ChronoClipSettings.getSettings();
      logger?.info("Settings loaded in content script", {
        autoDetect: currentSettings?.autoDetect,
        highlightDates: currentSettings?.highlightDates,
      });

      // 設定変更リスナーを登録
      window.ChronoClipSettings.onSettingsChanged(handleSettingsChanged);

      return currentSettings;
    } catch (error) {
      const handled = errorHandler?.handleError(error, {
        type: "settings",
        phase: "initialization",
      });

      logger?.error("Failed to load settings in content script", {
        error: error.message,
        userMessage: handled?.userMessage?.message,
      });

      currentSettings = window.ChronoClipSettings.getDefaultSettings();
      return currentSettings;
    }
  }

  /**
   * 設定変更時の処理
   */
  function handleSettingsChanged(newSettings) {
    logger?.info("Settings updated in content script", {
      autoDetect: newSettings?.autoDetect,
      highlightDates: newSettings?.highlightDates,
    });
    const oldSettings = currentSettings;
    currentSettings = newSettings;

    // autoDetect設定の変更
    if (oldSettings && oldSettings.autoDetect !== newSettings.autoDetect) {
      if (newSettings.autoDetect) {
        // 自動検出が有効になった - ページをスキャン
        setTimeout(() => findAndHighlightDates(), 100);
      } else {
        // 自動検出が無効になった - ハイライトを削除
        removeAllHighlights();
      }
    }

    // highlightDates設定の変更
    if (
      oldSettings &&
      oldSettings.highlightDates !== newSettings.highlightDates
    ) {
      if (!newSettings.highlightDates) {
        // ハイライト表示が無効になった - ハイライトを削除
        removeAllHighlights();
      } else if (newSettings.autoDetect) {
        // ハイライト表示が有効になった - 再スキャン
        setTimeout(() => findAndHighlightDates(), 100);
      }
    }
  }

  /**
   * すべてのハイライトを削除
   */
  function removeAllHighlights() {
    const highlights = document.querySelectorAll(".chronoclip-date");
    highlights.forEach((highlight) => {
      const parent = highlight.parentNode;
      parent.replaceChild(
        document.createTextNode(highlight.textContent),
        highlight
      );
      parent.normalize();
    });
  }

  // --- パフォーマンス監視 ---
  const performanceMonitor = {
    startTime: performance.now(),
    processedNodes: 0,
    extractionCalls: 0,

    log() {
      const elapsedTime = performance.now() - this.startTime;
      // パフォーマンスログは5分ごと、または大量処理時のみ
      if (elapsedTime > 300000 || this.processedNodes > 1000) {
        console.log(
          `ChronoClip Performance: ${this.processedNodes} nodes processed, ${
            this.extractionCalls
          } extractions in ${elapsedTime.toFixed(2)}ms`
        );
        this.startTime = performance.now(); // リセット
        this.processedNodes = 0;
        this.extractionCalls = 0;
      }
    },
  };

  // --- 依存関係のチェック ---
  if (
    typeof ChronoClip === "undefined" ||
    !ChronoClip.DATE_PATTERN ||
    !ChronoClip.isValidDate ||
    typeof chrono === "undefined"
  ) {
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
    JA_YYYY_MM_DD_PATTERN,
  } = ChronoClip;

  // --- 日付検出器の定義 (既存のものを再利用) ---
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
          case "今日":
            break;
          case "明日":
            startDate.setDate(startDate.getDate() + 1);
            break;
          case "昨日":
            startDate.setDate(startDate.getDate() - 1);
            break;
          case "来週":
            startDate.setDate(startDate.getDate() + 7);
            break;
          case "先週":
            startDate.setDate(startDate.getDate() - 7);
            break;
          case "今月末":
            startDate = new Date(
              startDate.getFullYear(),
              startDate.getMonth() + 1,
              0
            );
            break;
          case "来月":
            startDate.setMonth(startDate.getMonth() + 1, 1);
            break;
          case "先月":
            startDate.setMonth(startDate.getMonth() - 1, 1);
            break;
        }

        const year = startDate.getFullYear();
        const month = startDate.getMonth() + 1;
        const day = startDate.getDate();

        const normalizedDate = `${year}-${String(month).padStart(
          2,
          "0"
        )}-${String(day).padStart(2, "0")}`;
        return { normalizedDate, original: match[0] };
      },
    },
    {
      name: "YYYY-MM-DD or YYYY/MM/DD",
      pattern: DATE_PATTERN,
      handler: (match) => {
        const [, year, , month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(
            2,
            "0"
          )}-${String(day).padStart(2, "0")}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      },
    },
    {
      name: "YYYY年M月D日 (JA)",
      pattern: JA_YYYY_MM_DD_PATTERN,
      handler: (match) => {
        const [, year, month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(
            2,
            "0"
          )}-${String(day).padStart(2, "0")}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      },
    },
    {
      name: "和暦 (Wareki)",
      pattern: WAREKI_DATE_PATTERN,
      handler: (match) => {
        const [, era, eraYearStr, month, day] = match;
        const year = convertWarekiToGregorianYear(era, eraYearStr);
        if (year && isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(
            2,
            "0"
          )}-${String(day).padStart(2, "0")}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      },
    },
    {
      name: "月日 (Month-Day)",
      pattern: MONTH_DAY_DATE_PATTERN,
      handler: (match) => {
        const [, month, day] = match;
        const resolvedDate = resolveYearForMonthDay(month, day);
        if (
          isValidDate(
            resolvedDate.getFullYear(),
            resolvedDate.getMonth() + 1,
            resolvedDate.getDate()
          )
        ) {
          const year = resolvedDate.getFullYear();
          const normalizedDate = `${year}-${String(month).padStart(
            2,
            "0"
          )}-${String(day).padStart(2, "0")}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      },
    },
  ];

  // カレンダーアイコンのSVG
  const CALENDAR_ICON_SVG = `
    <svg class="chronoclip-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM5 7V6h14v1H5z"/>
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM5 7V6h14v1H5z"/>
  `;

  /**
   * テキストノード内の日付を検出し、ハイライトしてイベントリスナーを追加します。
   * @param {Text} textNode - 処理するテキストノード。
   */
  function processTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || text.trim() === "" || text.length > 1000) {
      // 長すぎるテキストは処理しない
      return;
    }

    // サイト固有設定の取得（サイトルールの無視セレクタチェック）
    let effectiveSettings = null;
    try {
      if (
        window.ChronoClipSettings &&
        typeof window.ChronoClipSettings.getEffectiveSettings === "function"
      ) {
        effectiveSettings = window.ChronoClipSettings.getEffectiveSettings(
          window.location.hostname
        );

        // サイトルールで無視セレクタが指定されている場合、親要素をチェック
        if (
          effectiveSettings?.siteRule?.enabled &&
          effectiveSettings.siteRule.ignoreSelector
        ) {
          let parentElement = textNode.parentElement;
          while (parentElement && parentElement !== document.body) {
            if (
              parentElement.matches(effectiveSettings.siteRule.ignoreSelector)
            ) {
              return; // 無視セレクタにマッチした場合は処理をスキップ
            }
            parentElement = parentElement.parentElement;
          }
        }
      }
    } catch (error) {
      console.warn(
        "ChronoClip: Error getting effective settings in processTextNode:",
        error
      );
    }

    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let matchesFound = false;
    const allMatches = [];

    // カスタム正規表現検出器による解析（高速）
    detectors.forEach((detector) => {
      detector.pattern.lastIndex = 0; // 各検出器でlastIndexをリセット
      let match;
      while ((match = detector.pattern.exec(text)) !== null) {
        const result = detector.handler(match);
        if (result) {
          allMatches.push({
            date: result.normalizedDate,
            original: result.original,
            index: match.index,
            detector: detector.name,
            endIndex: match.index + result.original.length,
            type: "date", // 日付として分類
          });
        }
      }
    });

    // 時刻パターンも検出（HH:MM形式）
    const timePattern = /(?:[01]?[0-9]|2[0-3]):[0-5][0-9]/g;
    let timeMatch;
    while ((timeMatch = timePattern.exec(text)) !== null) {
      // 時刻が日付検出範囲と重複していないかチェック
      const overlaps = allMatches.some(
        (match) =>
          timeMatch.index < match.endIndex &&
          timeMatch.index + timeMatch[0].length > match.index
      );

      if (!overlaps) {
        allMatches.push({
          date: null, // 時刻単体では日付は不明
          original: timeMatch[0],
          index: timeMatch.index,
          detector: "time-pattern",
          endIndex: timeMatch.index + timeMatch[0].length,
          type: "time", // 時刻として分類
        });
      }
    }

    // chrono-nodeによる解析（カスタム検出器で見つからない場合のみ）
    if (allMatches.length === 0 && text.length < 500) {
      // 短いテキストのみchrono-nodeを使用
      try {
        const chronoResults = chrono.parse(text, new Date());
        chronoResults.forEach((result) => {
          const date = result.start.date();
          const normalizedDate = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          allMatches.push({
            date: normalizedDate,
            original: result.text,
            index: result.index,
            detector: "chrono-node",
            endIndex: result.index + result.text.length,
            type: "date", // 日付として分類
          });
        });
      } catch (error) {
        console.warn("ChronoClip: chrono-node parsing failed:", error);
      }
    }

    // マッチをインデックス順にソートし、重複を排除
    allMatches.sort((a, b) => a.index - b.index);
    const uniqueMatches = [];
    let lastEndIndex = -1;

    allMatches.forEach((match) => {
      // 重複する範囲をスキップ
      if (match.index >= lastEndIndex) {
        uniqueMatches.push(match);
        lastEndIndex = match.endIndex;
      }
    });

    uniqueMatches.forEach((match) => {
      // マッチ前のテキストを追加
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex, match.index))
        );
      }

      // 日付要素を作成し、イベントリスナーを追加
      const dateSpan = document.createElement("span");
      dateSpan.className = "chronoclip-date";
      dateSpan.textContent = match.original;

      // highlightDates設定が無効な場合は見た目のハイライトを適用しない
      if (!currentSettings.highlightDates) {
        dateSpan.style.backgroundColor = "transparent";
        dateSpan.style.border = "none";
        dateSpan.style.borderRadius = "0";
      }

      // データ属性を設定
      if (match.type === "date") {
        dateSpan.dataset.normalizedDate = match.date;
        dateSpan.dataset.type = "date";
      } else if (match.type === "time") {
        dateSpan.dataset.time = match.original;
        dateSpan.dataset.type = "time";
      }

      // highlightDates設定が有効な場合のみカレンダーアイコンを表示
      if (currentSettings.highlightDates) {
        dateSpan.insertAdjacentHTML("beforeend", CALENDAR_ICON_SVG);
      }

      // イベントリスナー
      dateSpan.addEventListener("click", (e) => {
        e.stopPropagation(); // 親要素へのイベント伝播を防ぐ

        if (match.type === "date") {
          // 日付クリック時は終日予定
          showQuickAddPopup(match.date, null, e);
        } else if (match.type === "time") {
          // 時刻クリック時は近くの日付を探す
          const nearbyDate = findNearbyDate(e.target);
          showQuickAddPopup(nearbyDate, match.original, e);
        }
      });

      fragment.appendChild(dateSpan);
      lastIndex = match.endIndex;
      matchesFound = true;
    });

    // 最後のマッチ以降のテキストを追加
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    if (matchesFound) {
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  }

  /**
   * 時刻要素の近くにある日付を探します
   * @param {Element} timeElement - 時刻要素
   * @returns {string|null} 見つかった日付のYYYY-MM-DD形式、または今日の日付
   */
  function findNearbyDate(timeElement) {
    // 1. 同じテキストノード内で日付を探す
    const parentText = timeElement.closest(
      "p, div, span, li, td, th, section, article"
    );
    if (parentText) {
      const dateElements = parentText.querySelectorAll(
        '.chronoclip-date[data-type="date"]'
      );
      for (let dateElement of dateElements) {
        if (dateElement.dataset.normalizedDate) {
          return dateElement.dataset.normalizedDate;
        }
      }
    }

    // 2. より広い範囲（親コンテナ）で日付を探す
    const container = timeElement.closest(
      "article, section, .event, .schedule-item, .match, .card, .item"
    );
    if (container) {
      const dateElements = container.querySelectorAll(
        '.chronoclip-date[data-type="date"]'
      );
      for (let dateElement of dateElements) {
        if (dateElement.dataset.normalizedDate) {
          return dateElement.dataset.normalizedDate;
        }
      }
    }

    // 3. テキスト解析で周辺の日付を探す
    let searchElement = timeElement.parentElement;
    for (let i = 0; i < 3 && searchElement; i++) {
      const text = searchElement.textContent;

      // 簡単な日付パターンで検索
      const datePatterns = [
        /(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/,
        /(\d{1,2})[月\/\-](\d{1,2})/,
      ];

      for (let pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
          let year, month, day;
          if (match.length === 4) {
            // YYYY年MM月DD日形式
            [, year, month, day] = match;
          } else {
            // MM月DD日形式（今年を仮定）
            year = new Date().getFullYear();
            [, month, day] = match;
          }

          const normalizedDate = `${year}-${String(month).padStart(
            2,
            "0"
          )}-${String(day).padStart(2, "0")}`;
          return normalizedDate;
        }
      }

      searchElement = searchElement.parentElement;
    }

    // 4. 見つからない場合は今日の日付を返す
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
  }

  let quickAddPopupHost = null; // ポップアップのホスト要素

  /**
   * クイック追加ポップアップを表示します。
   * @param {string} normalizedDate - 正規化された日付文字列 (YYYY-MM-DD)
   * @param {string|null} time - 時刻文字列 (HH:MM) または null（終日の場合）
   * @param {MouseEvent} e - クリックイベントオブジェクト
   */
  async function showQuickAddPopup(normalizedDate, time, e) {
    // Logger/ErrorHandler の初期化確認
    if (!logger || !errorHandler) {
      initializeLogging();
    }

    logger?.debug("Showing quick add popup", {
      normalizedDate,
      hasTime: !!time,
      hasTarget: !!e?.target,
    });

    // 既にポップアップが表示されている場合は非表示にする
    if (quickAddPopupHost) {
      hideQuickAddPopup();
    }

    // イベント情報を自動抽出
    let extractedEvent = null;
    let shouldShowDefaultPopup = true; // デフォルトポップアップを表示するかのフラグ

    try {
      if (e.target) {
        // 新しい抽出エンジンファクトリーを使用
        if (window.ChronoClipExtractorFactory) {
          const extractorFactory =
            window.ChronoClipExtractorFactory.getExtractorFactory();
          const domain = window.location.hostname;

          logger?.debug("Using ExtractorFactory for domain", { domain });

          // ExtractorFactoryで抽出を実行
          extractedEvent = extractorFactory.extract(e.target, domain);
        } else if (window.ChronoClipExtractor) {
          // フォールバック: 古い抽出エンジンを使用
          logger?.debug("Falling back to legacy extractor");

          // オプション設定を取得
          const options = {
            includeURL: true,
            maxChars: 200, // 処理を軽くするため短縮
            headingSearchDepth: 2, // 探索深度も制限
          };

          // ストレージからオプションを非同期で取得（軽量化）
          try {
            // Extension context が有効かチェック
            if (chrome.runtime?.id) {
              const result = await new Promise((resolve) => {
                chrome.storage.sync.get(["includeURL"], resolve);
              });
              if (result.includeURL !== undefined) {
                options.includeURL = result.includeURL;
              }
            }
          } catch (error) {
            logger?.warn("Failed to load extraction options, using defaults", {
              error: error.message,
            });
          }

          extractedEvent = window.ChronoClipExtractor.extractEventContext(
            e.target,
            options
          );
        }
        performanceMonitor.extractionCalls++;
        console.log("ChronoClip: Extracted event context:", extractedEvent);

        logger?.debug("Event context extraction result", {
          hasResult: !!extractedEvent,
          isPromise:
            extractedEvent && typeof extractedEvent.then === "function",
          extractedEventType: typeof extractedEvent,
          extractedEventConstructor: extractedEvent?.constructor?.name,
        });

        // extractedEventがPromiseの場合は結果を待つ
        if (extractedEvent && typeof extractedEvent.then === "function") {
          console.log("ChronoClip: Processing Promise result");
          shouldShowDefaultPopup = false; // デフォルトポップアップを無効化

          try {
            logger?.debug("Awaiting promise resolution for extracted event");
            const result = await extractedEvent;
            logger?.debug("Resolved extracted event", {
              hasTitle: !!result?.title,
              hasDate: !!result?.date,
              hasEvents: !!result?.events,
              fullResult: result,
            });

            // 抽出結果があり、有効なデータがある場合はポップアップを表示
            if (result && (result.title || result.date || result.events)) {
              logger?.info("Showing popup with extracted data");
              try {
                await showQuickAddPopupWithData(result);
                return; // 抽出結果ポップアップを表示したので終了
              } catch (popupError) {
                logger?.warn(
                  "Error in showQuickAddPopupWithData, falling back to default",
                  {
                    error: popupError.message,
                    stack: popupError.stack,
                    extractedData: {
                      title: result.title,
                      hasDate: !!result.date,
                      hasEvents: !!result.events,
                      hasLocation: !!result.location,
                      url: result.url,
                    },
                  }
                );
                console.error(
                  "ChronoClip: showQuickAddPopupWithData error details:",
                  popupError
                );
                // ポップアップ表示でエラーが発生した場合はデフォルトポップアップへ
                shouldShowDefaultPopup = true;
              }
            } else {
              // 抽出結果が無効な場合はデフォルトポップアップを表示
              logger?.info("No valid extracted data, showing default popup", {
                result: result,
                hasTitle: !!result?.title,
                hasDate: !!result?.date,
                hasEvents: !!result?.events,
              });
              shouldShowDefaultPopup = true;
            }
          } catch (error) {
            const handled = errorHandler?.handleError(error, {
              type: "extraction",
              phase: "promise_resolution",
            });

            logger?.warn(
              "Error resolving extracted event, falling back to default popup",
              {
                error: error.message,
                userMessage: handled?.userMessage?.message,
              }
            );

            // エラーの場合もデフォルトポップアップを表示（処理を継続）
            shouldShowDefaultPopup = true;
          }
        } else if (
          extractedEvent &&
          (extractedEvent.title || extractedEvent.date || extractedEvent.events)
        ) {
          // 同期的な結果の場合
          console.log("ChronoClip: Processing sync result", extractedEvent);
          logger?.info("Showing popup with extracted data (sync)");
          try {
            await showQuickAddPopupWithData(extractedEvent);
            return; // ポップアップが表示された場合は通常のポップアップは表示しない
          } catch (popupError) {
            logger?.warn(
              "Error in showQuickAddPopupWithData (sync), falling back to default",
              {
                error: popupError.message,
                extractedData: extractedEvent,
              }
            );
            // ポップアップ表示でエラーが発生した場合はデフォルトポップアップを継続
            shouldShowDefaultPopup = true;
          }
        } else {
          // extractedEventが存在するが有効でない場合
          console.log("ChronoClip: extractedEvent exists but invalid", {
            extractedEvent,
            hasTitle: !!extractedEvent?.title,
            hasDate: !!extractedEvent?.date,
            hasEvents: !!extractedEvent?.events,
          });
        }
      }
    } catch (error) {
      const handled = errorHandler?.handleError(error, {
        type: "extraction",
        phase: "event_context_extraction",
      });

      logger?.warn("Error extracting event context", {
        error: error.message,
        userMessage: handled?.userMessage?.message,
      });
    }

    // デフォルトポップアップを表示するかチェック
    if (!shouldShowDefaultPopup) {
      return;
    }

    // デフォルトポップアップの表示処理
    showDefaultQuickAddPopup(normalizedDate, time, e);
  }

  /**
   * デフォルトのクイック追加ポップアップを表示
   */
  async function showDefaultQuickAddPopup(normalizedDate, time, e) {
    quickAddPopupHost = document.createElement("div");
    quickAddPopupHost.style.position = "absolute";
    quickAddPopupHost.style.zIndex =
      window.ChronoClipConfig?.UI?.POPUP_Z_INDEX || "99999"; // 最前面に表示
    document.body.appendChild(quickAddPopupHost);

    const shadowRoot = quickAddPopupHost.attachShadow({ mode: "open" });

    try {
      // Extension context が有効かチェック
      if (!chrome.runtime?.id) {
        console.error("ChronoClip: Extension context invalidated");
        // Extension contextが無効な場合は、ページリロードを促すメッセージを表示
        showToast(
          "error",
          "拡張機能が再読み込みされました。ページをリロードしてください。"
        );
        return;
      }

      // HTMLとCSSをフェッチ
      const htmlUrl = chrome.runtime.getURL("src/ui/quick-add-popup.html");
      const cssUrl = chrome.runtime.getURL("src/ui/quick-add-popup.css");

      const [htmlResponse, cssResponse] = await Promise.all([
        fetch(htmlUrl),
        fetch(cssUrl),
      ]);

      const htmlText = await htmlResponse.text();
      const cssText = await cssResponse.text();

      // Shadow DOMにHTMLを挿入
      shadowRoot.innerHTML = htmlText;

      // CSSをShadow DOMに適用
      const style = document.createElement("style");
      style.textContent = cssText;
      shadowRoot.appendChild(style);

      // 日付フィールドに値を設定
      const eventDateInput = shadowRoot.getElementById("event-date");
      if (eventDateInput) {
        eventDateInput.value = normalizedDate;
      }

      // 時刻フィールドの設定
      const eventTimeInput = shadowRoot.getElementById("event-time");
      const eventEndTimeInput = shadowRoot.getElementById("event-end-time");
      const allDayCheckbox = shadowRoot.getElementById("all-day");

      // 終了時刻を計算する関数
      const calculateEndTime = (startTime) => {
        if (!startTime) return "";
        const [hours, minutes] = startTime.split(":").map(Number);
        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);

        const durationMs =
          window.ChronoClipConfig?.EVENT?.DEFAULT_DURATION_MS ||
          3 * 60 * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);

        return (
          String(endDate.getHours()).padStart(2, "0") +
          ":" +
          String(endDate.getMinutes()).padStart(2, "0")
        );
      };

      if (time && eventTimeInput && allDayCheckbox) {
        // 時刻が指定されている場合
        eventTimeInput.value = time;
        if (eventEndTimeInput) {
          eventEndTimeInput.value = calculateEndTime(time);
        }
        allDayCheckbox.checked = false;
        eventTimeInput.classList.remove("hidden");
        if (eventEndTimeInput) {
          eventEndTimeInput.classList.remove("hidden");
        }
      } else if (allDayCheckbox) {
        // 終日の場合
        allDayCheckbox.checked = true;
        if (eventTimeInput) {
          eventTimeInput.classList.add("hidden");
        }
        if (eventEndTimeInput) {
          eventEndTimeInput.classList.add("hidden");
        }
      }

      // 抽出されたイベント情報は新しい関数では使用不可
      // デフォルトポップアップでは抽出情報なしで表示

      // ポップアップの位置を調整
      const popupElement = shadowRoot.querySelector(
        ".chronoclip-quick-add-popup"
      );
      if (popupElement) {
        // ポップアップのサイズを取得（レンダリング後に取得する必要がある）
        // 一時的に表示してサイズを測る
        popupElement.style.visibility = "hidden";
        popupElement.style.display = "block"; // display noneだとサイズが取れない
        const popupRect = popupElement.getBoundingClientRect();
        popupElement.style.visibility = "";
        popupElement.style.display = "";

        const offset = window.ChronoClipConfig?.UI?.POPUP_OFFSET || 10;

        let top = e.clientY + window.scrollY + offset; // クリック位置から少し下に
        let left = e.clientX + window.scrollX + offset; // クリック位置から少し右に

        // 画面下部からはみ出さないように調整
        if (top + popupRect.height > window.innerHeight + window.scrollY) {
          top = window.innerHeight + window.scrollY - popupRect.height - offset;
          if (top < window.scrollY) {
            // 画面に収まらない場合は上端に
            top = window.scrollY + offset;
          }
        }

        // 画面右端からはみ出さないように調整
        if (left + popupRect.width > window.innerWidth + window.scrollX) {
          left = window.innerWidth + window.scrollX - popupRect.width - offset;
          if (left < window.scrollX) {
            // 画面に収まらない場合は左端に
            left = window.scrollX + offset;
          }
        }

        quickAddPopupHost.style.top = `${top}px`;
        quickAddPopupHost.style.left = `${left}px`;
      }

      // イベントリスナーを設定
      const closeButton = shadowRoot.querySelector(".close-button");
      if (closeButton) {
        closeButton.addEventListener("click", hideQuickAddPopup);
      }

      const cancelButton = shadowRoot.querySelector(".cancel-button");
      if (cancelButton) {
        cancelButton.addEventListener("click", hideQuickAddPopup);
      }

      // 全日チェックボックスのイベントリスナー
      if (allDayCheckbox && eventTimeInput) {
        allDayCheckbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            eventTimeInput.classList.add("hidden");
            if (eventEndTimeInput) {
              eventEndTimeInput.classList.add("hidden");
            }
          } else {
            eventTimeInput.classList.remove("hidden");
            if (eventEndTimeInput) {
              eventEndTimeInput.classList.remove("hidden");
            }
            if (!eventTimeInput.value && time) {
              eventTimeInput.value = time; // デフォルト時刻を設定
              if (eventEndTimeInput) {
                eventEndTimeInput.value = calculateEndTime(time);
              }
            }
          }
        });
      }

      // 開始時刻変更時のイベントリスナー
      if (eventTimeInput && eventEndTimeInput) {
        eventTimeInput.addEventListener("change", (e) => {
          const startTime = e.target.value;
          if (startTime) {
            eventEndTimeInput.value = calculateEndTime(startTime);
          }
        });
      }

      const addButton = shadowRoot.querySelector(".add-button");
      if (addButton) {
        addButton.addEventListener("click", (event) => {
          event.preventDefault(); // フォームのデフォルト送信を防ぐ
          const eventTitle = shadowRoot.getElementById("event-title").value;
          const eventDetails = shadowRoot.getElementById("event-details").value;

          if (!eventTitle) {
            const titleInput = shadowRoot.getElementById("event-title");
            titleInput.style.border = "1px solid red";
            titleInput.placeholder = "タイトルは必須です";
            titleInput.focus();
            return;
          }

          const eventTimeInput = shadowRoot.getElementById("event-time");
          const eventEndTimeInput = shadowRoot.getElementById("event-end-time");
          const allDayCheckbox = shadowRoot.getElementById("all-day");
          const isAllDay = allDayCheckbox ? allDayCheckbox.checked : !time;

          let eventPayload;

          if (isAllDay || !eventTimeInput || !eventTimeInput.value) {
            // 終日イベント
            eventPayload = {
              summary: eventTitle,
              description: eventDetails,
              start: { date: normalizedDate },
              end: { date: normalizedDate },
              url: window.location.href,
            };
          } else {
            // 時刻指定イベント
            const startTimeValue = eventTimeInput.value;
            const endTimeValue = eventEndTimeInput
              ? eventEndTimeInput.value
              : null;

            if (!startTimeValue) {
              const timeInput = shadowRoot.getElementById("event-time");
              timeInput.style.border = "1px solid red";
              timeInput.focus();
              return;
            }

            const startDateTime = `${normalizedDate}T${startTimeValue}:00`;
            let endDateTime;

            if (endTimeValue) {
              // 終了時刻が指定されている場合
              endDateTime = `${normalizedDate}T${endTimeValue}:00`;
            } else {
              // 終了時刻が指定されていない場合は設定値で計算
              const startDate = new Date(startDateTime);
              const durationMs =
                window.ChronoClipConfig?.EVENT?.DEFAULT_DURATION_MS ||
                3 * 60 * 60 * 1000;
              const endDate = new Date(startDate.getTime() + durationMs);
              endDateTime = endDate.toISOString().slice(0, 16) + ":00"; // YYYY-MM-DDTHH:MM:SS
            }

            eventPayload = {
              summary: eventTitle,
              description: eventDetails,
              start: {
                dateTime: startDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              end: {
                dateTime: endDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              url: window.location.href,
            };
          }

          // Extension context が有効かチェック
          if (!chrome.runtime?.id) {
            console.error("ChronoClip: Extension context invalidated");
            showToast(
              "error",
              "拡張機能が無効になっています。ページをリロードしてください。"
            );
            hideQuickAddPopup();
            return;
          }

          console.log("ChronoClip: Sending event to background:", eventPayload);
          chrome.runtime.sendMessage(
            {
              type: "calendar:createEvent",
              payload: eventPayload,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "ChronoClip: Message sending failed:",
                  chrome.runtime.lastError
                );
                showToast("error", "カレンダー連携でエラーが発生しました。");
                return;
              }

              console.log("ChronoClip: Received response:", response);

              if (response && response.ok) {
                showToast(
                  "success",
                  `予定「${eventPayload.summary}」を追加しました。`
                );
              } else {
                const errorMessage =
                  response?.message ||
                  "不明なエラーで予定の追加に失敗しました。";
                console.error("ChronoClip: Calendar API error:", errorMessage);
                showToast("error", `エラー: ${errorMessage}`);
              }
            }
          );

          hideQuickAddPopup();
        });
      }

      // キーボードショートカット (Escapeキーで閉じる)
      document.addEventListener("keydown", handleKeyDown);
    } catch (error) {
      console.error("ChronoClip: Error loading quick add popup:", error);
      if (quickAddPopupHost) {
        quickAddPopupHost.remove();
        quickAddPopupHost = null;
      }
    }
  }

  /**
   * クイック追加ポップアップを非表示にします。
   */
  function hideQuickAddPopup() {
    if (quickAddPopupHost) {
      quickAddPopupHost.remove();
      quickAddPopupHost = null;
      document.removeEventListener("keydown", handleKeyDown);
    }
  }

  /**
   * キーボードイベントハンドラ
   * @param {KeyboardEvent} event
   */
  function handleKeyDown(event) {
    if (event.key === "Escape") {
      hideQuickAddPopup();
    }
  }

  /**
   * ページ全体を走査して日付を検出・処理します。
   */
  function findAndHighlightDates() {
    // 設定確認：autoDetectまたはhighlightDatesが無効な場合は実行しない
    if (
      !currentSettings ||
      (!currentSettings.autoDetect && !currentSettings.highlightDates)
    ) {
      console.log("ChronoClip: Date detection skipped (disabled in settings)");
      return;
    }

    console.log("ChronoClip: Starting date highlighting...");

    // 処理開始時間を記録（パフォーマンス監視）
    const startTime = performance.now();

    // サイト固有設定の取得
    let effectiveSettings = null;
    let additionalIgnoreSelectors = [];
    try {
      if (
        window.ChronoClipSettings &&
        typeof window.ChronoClipSettings.getEffectiveSettings === "function"
      ) {
        effectiveSettings = window.ChronoClipSettings.getEffectiveSettings(
          window.location.hostname
        );

        // サイトルールの無視セレクタを追加
        if (
          effectiveSettings?.siteRule?.enabled &&
          effectiveSettings.siteRule.ignoreSelector
        ) {
          additionalIgnoreSelectors.push(
            effectiveSettings.siteRule.ignoreSelector
          );
        }
      }
    } catch (error) {
      console.warn(
        "ChronoClip: Error getting effective settings in findAndHighlightDates:",
        error
      );
    }

    // 既に処理済みの要素を避けるためのセレクタ
    const ignoreSelectors = [
      "script",
      "style",
      "noscript",
      "iframe",
      "canvas",
      "svg",
      "img",
      "video",
      "audio",
      ".chronoclip-date", // 既に処理済みの要素
      ".chronoclip-ignore", // トーストなどの無視すべき要素
      '[contenteditable="true"]', // 編集可能な要素
      "input",
      "textarea",
      "select", // フォーム要素
      ...additionalIgnoreSelectors, // サイト固有の無視セレクタ
    ];

    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          // 親要素が無視リストに含まれる場合はスキップ
          let currentNode = node.parentNode;
          while (currentNode && currentNode !== document.body) {
            if (
              ignoreSelectors.some(
                (selector) =>
                  currentNode.matches && currentNode.matches(selector)
              )
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            currentNode = currentNode.parentNode;
          }
          // 空白のみまたは短すぎるテキストノードはスキップ
          if (
            !node.nodeValue ||
            node.nodeValue.trim() === "" ||
            node.nodeValue.length < 5
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false
    );

    const textNodesToProcess = [];
    let currentNode = treeWalker.nextNode();
    let nodeCount = 0;

    // 処理するノード数を制限（大きなページでの過負荷を防ぐ）
    while (currentNode && nodeCount < 500) {
      textNodesToProcess.push(currentNode);
      currentNode = treeWalker.nextNode();
      nodeCount++;
    }

    if (nodeCount >= 500) {
      console.warn(
        "ChronoClip: Large page detected, limiting processing to 500 nodes"
      );
    }

    // 収集したテキストノードを処理（バッチ処理で分割）
    let processedCount = 0;
    const batchSize = 50;

    function processBatch() {
      const endIndex = Math.min(
        processedCount + batchSize,
        textNodesToProcess.length
      );

      for (let i = processedCount; i < endIndex; i++) {
        try {
          processTextNode(textNodesToProcess[i]);
          performanceMonitor.processedNodes++;
        } catch (e) {
          console.error(
            "ChronoClip: Error processing text node:",
            textNodesToProcess[i],
            e
          );
        }
      }

      processedCount = endIndex;

      if (processedCount < textNodesToProcess.length) {
        // 次のバッチを非同期で処理（UIブロッキングを防ぐ）
        setTimeout(processBatch, 10);
      } else {
        const endTime = performance.now();
        console.log(
          `ChronoClip: Date highlighting complete. Processed ${processedCount} nodes in ${(
            endTime - startTime
          ).toFixed(2)}ms`
        );
      }
    }

    // 最初のバッチを開始
    processBatch();
  }

  // メイン初期化関数
  async function initialize() {
    try {
      // ロギングシステムの確実な初期化
      initializeLogging();

      await initializeSettings();
      isInitialized = true;

      // autoDetect設定が有効な場合のみ日付検出を開始
      if (currentSettings.autoDetect) {
        // DOMContentLoadedイベントを待ってから処理を開始
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", findAndHighlightDates);
        } else {
          findAndHighlightDates();
        }
      }

      logger?.info("Content script initialized", {
        autoDetect: currentSettings.autoDetect,
        highlightDates: currentSettings.highlightDates,
      });
    } catch (error) {
      const handled = errorHandler?.handleError(error, {
        type: "initialization",
        phase: "content_script_startup",
      });

      logger?.error("Failed to initialize content script", {
        error: error.message,
        userMessage: handled?.userMessage?.message,
      });

      // エラーでも基本的な初期化は完了とする
      isInitialized = true;
    }
  }

  // 初期化実行
  initialize();

  // MutationObserverで動的に追加されるコンテンツに対応（デバウンス付き）
  let mutationTimeout = null;
  let pendingMutations = [];

  const observer = new MutationObserver((mutations) => {
    // 小さな変更は無視（フォーカス変更、スタイル変更など）
    const significantMutations = mutations.filter((mutation) => {
      return (
        mutation.addedNodes.length > 0 &&
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            node.textContent &&
            node.textContent.trim().length > 10
        )
      );
    });

    if (significantMutations.length === 0) return;

    // SPA対応: 大きな変更（ページ全体の書き換えなど）を検出
    const hasMajorChanges = significantMutations.some((mutation) => {
      return Array.from(mutation.addedNodes).some(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.textContent.length > 5000 || // 大量のテキスト
            node.querySelectorAll("*").length > 50) // 多数の子要素
      );
    });

    pendingMutations.push(...significantMutations);

    // デバウンス処理：SPA変更は長めに待つ
    const debounceTime = hasMajorChanges ? 1500 : 500;

    if (mutationTimeout) {
      clearTimeout(mutationTimeout);
    }

    mutationTimeout = setTimeout(() => {
      // 大きな変更がある場合のみログ出力
      if (hasMajorChanges && pendingMutations.length > 50) {
        console.log(
          `ChronoClip: Processing ${pendingMutations.length} major mutations`
        );
      }

      if (hasMajorChanges) {
        // 大きな変更の場合は、ページ全体を再スキャン
        console.log(
          "ChronoClip: Major page changes detected, re-scanning entire page..."
        );
        setTimeout(() => {
          findAndHighlightDates();
        }, 100);
      } else {
        // 小さな変更の場合は部分的に処理
        pendingMutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 小さなノードは処理をスキップ
              if (node.textContent && node.textContent.length < 20) return;

              // 既に処理済みかチェック
              if (node.querySelector(".chronoclip-date")) return;

              // 追加された要素内のテキストノードを再走査
              const treeWalker = document.createTreeWalker(
                node,
                NodeFilter.SHOW_TEXT,
                {
                  acceptNode: function (n) {
                    // 既に処理済みの要素や無視リストに含まれる要素はスキップ
                    let currentNode = n.parentNode;
                    while (currentNode && currentNode !== node) {
                      if (
                        ignoreSelectors.some(
                          (selector) =>
                            currentNode.matches && currentNode.matches(selector)
                        )
                      ) {
                        return NodeFilter.FILTER_REJECT;
                      }
                      currentNode = currentNode.parentNode;
                    }
                    if (
                      !n.nodeValue ||
                      n.nodeValue.trim() === "" ||
                      n.nodeValue.length < 5
                    ) {
                      return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                  },
                },
                false
              );

              let processedCount = 0;
              let currentNode = treeWalker.nextNode();
              while (currentNode && processedCount < 20) {
                // SPAでは最大20ノードまで
                try {
                  processTextNode(currentNode);
                  processedCount++;
                } catch (e) {
                  console.error(
                    "ChronoClip: Error processing dynamically added node:",
                    currentNode,
                    e
                  );
                }
                currentNode = treeWalker.nextNode();
              }
            }
          });
        });
      }

      pendingMutations = [];
      mutationTimeout = null;
    }, debounceTime);
  });

  // body要素とその子孫の変更を監視
  observer.observe(document.body, { childList: true, subtree: true });

  // パフォーマンス情報を定期的に出力
  setInterval(() => {
    if (
      performanceMonitor.processedNodes > 0 ||
      performanceMonitor.extractionCalls > 0
    ) {
      performanceMonitor.log();
    }
  }, 30000); // 30秒ごと
})();

/**
 * グローバルloggerとerrorHandlerを取得するユーティリティ関数
 */
function getLoggerAndErrorHandler() {
  const logger =
    window.chronoClipLogger ||
    (window.ChronoClipLogger ? new window.ChronoClipLogger() : null);
  const errorHandler =
    window.chronoClipErrorHandler ||
    (window.ChronoClipErrorHandler
      ? new window.ChronoClipErrorHandler()
      : null);

  // デバッグモードを有効化
  if (logger && logger.setDebugMode) {
    logger.setDebugMode(true);
  }

  return { logger, errorHandler };
}

/**
 * サービスワーカーからのメッセージをリッスンします。
 */
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // エラー以外のメッセージは基本的にログ出力しない
  if (
    message.type !== "show_toast" &&
    message.type !== "show_quick_add_popup"
  ) {
    console.log("ChronoClip: Content script received message:", message);
  }

  switch (message.type) {
    case "settings:updated":
      // バックグラウンドからの設定更新通知
      if (message.settings) {
        handleSettingsChanged(message.settings);
      }
      sendResponse({ success: true });
      break;

    case "show_toast":
      showToast(message.payload.type, message.payload.message);
      break;

    case "show_quick_add_popup":
      // Issue #11: 選択範囲モードからのポップアップ表示
      if (message.payload && message.payload.extractedData) {
        const data = message.payload.extractedData;
        // 抽出されたデータを使ってポップアップを表示
        await showQuickAddPopupWithData(data);
      }
      break;

    case "extract_selection":
      // このメッセージはselection.jsで処理される - content-scriptでは何もしない
      break;

    default:
      console.warn("ChronoClip: Unknown message type:", message.type);
      break;
  }
});

/**
 * ページ右下にトースト通知を表示します。
 * @param {'success' | 'error'} type - トーストの種類
 * @param {string} message - 表示するメッセージ
 */
function showToast(type, message) {
  // トースト要素を作成
  const toast = document.createElement("div");
  toast.className = `chronoclip-toast chronoclip-toast-${type}`;

  // ハイライト処理を避けるため、特別なクラスを追加
  toast.classList.add("chronoclip-ignore");

  // HTMLタグを除去してプレーンテキストとして表示
  const cleanMessage = message.replace(/<[^>]*>/g, "");
  toast.textContent = cleanMessage;

  // ページに追加
  document.body.appendChild(toast);

  // 3秒後にアニメーション付きで削除
  setTimeout(() => {
    toast.classList.add("chronoclip-toast-fade-out");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}

/**
 * Issue #11: 選択範囲から抽出されたデータを使ってポップアップを表示
 * @param {object} extractedData - 抽出されたデータ
 */
async function showQuickAddPopupWithData(extractedData) {
  // loggerとerrorHandlerをグローバルから取得
  const { logger, errorHandler } = getLoggerAndErrorHandler();

  logger?.info("Showing quick add popup with extracted data", {
    hasTitle: !!extractedData?.title,
    hasEvents: !!extractedData?.events?.length,
    hasDate: !!extractedData?.date || !!extractedData?.dateTime,
  });

  logger?.debug("showQuickAddPopupWithData - step 1: function entry");

  try {
    logger?.debug(
      "showQuickAddPopupWithData - step 2: checking existing popup"
    );
    // 既存のポップアップが表示されている場合は削除
    const existingPopup = document.querySelector(".chronoclip-quick-add-popup");
    if (existingPopup) {
      console.log("ChronoClip: Removing existing popup");
      existingPopup.remove();
    }

    logger?.debug("showQuickAddPopupWithData - step 3: calculating position");
    // ポップアップの位置を画面上部寄りに設定
    const rect = {
      left: window.innerWidth / 2 - 200, // 幅400pxとして中央配置
      top: Math.max(50, window.innerHeight / 4 - 150), // 上部1/4位置、最低50px確保
      width: 400,
      height: 300,
    };

    console.log("ChronoClip: Popup position calculated:", rect);

    logger?.debug("showQuickAddPopupWithData - step 4: preparing date info");
    // 抽出されたデータから日付情報を準備
    let dateInfo = null;

    console.log("ChronoClip: Checking extracted date data:", {
      dateTime: extractedData.dateTime,
      date: extractedData.date,
      events: extractedData.events,
      url: extractedData.url,
    });

    if (extractedData.events && extractedData.events.length > 0) {
      // eventsフィールドから日付情報とURLを優先的に使用
      const firstEvent = extractedData.events[0];
      if (firstEvent.startTime) {
        const dateObj = new Date(firstEvent.startTime);
        if (!isNaN(dateObj.getTime())) {
          dateInfo = {
            type: "datetime",
            start: {
              dateTime: firstEvent.startTime,
              hour: dateObj.getHours(),
              minute: dateObj.getMinutes(),
            },
            end: { dateTime: firstEvent.endTime || firstEvent.startTime },
          };
          console.log(
            "ChronoClip: Created date info from first event:",
            dateInfo
          );
        }
      }
      // URLもfirstEventから取得（extractedData.urlが未設定の場合のみ）
      if (firstEvent.url && !extractedData.url) {
        extractedData.url = firstEvent.url;
        console.log("ChronoClip: Set URL from first event:", firstEvent.url);
      }
    } else if (extractedData.dateTime) {
      dateInfo = extractedData.dateTime;
      console.log("ChronoClip: Using extracted dateTime:", dateInfo);
    } else if (extractedData.date) {
      // date フィールドから日付情報を作成（時刻情報も考慮）
      const dateObj = new Date(extractedData.date);
      if (!isNaN(dateObj.getTime())) {
        // 時刻がある場合（0:00以外）は datetime として扱う
        if (dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0) {
          dateInfo = {
            type: "datetime",
            start: {
              dateTime: dateObj.toISOString(),
              hour: dateObj.getHours(),
              minute: dateObj.getMinutes(),
            },
            end: {
              dateTime: new Date(
                dateObj.getTime() + 3 * 60 * 60 * 1000
              ).toISOString(),
            },
          };
          console.log(
            "ChronoClip: Created datetime info from date field:",
            dateInfo
          );
        } else {
          dateInfo = {
            type: "date",
            start: { date: formatDate(dateObj) },
            end: { date: formatDate(dateObj) },
          };
          console.log(
            "ChronoClip: Created date info from date field:",
            dateInfo
          );
        }
      }
    } else if (extractedData.events && extractedData.events.length > 0) {
      // eventsフィールドから日付情報を作成
      const firstEvent = extractedData.events[0];
      if (firstEvent.startTime) {
        const dateObj = new Date(firstEvent.startTime);
        if (!isNaN(dateObj.getTime())) {
          dateInfo = {
            type: "datetime",
            start: { dateTime: firstEvent.startTime },
            end: { dateTime: firstEvent.endTime || firstEvent.startTime },
          };
          console.log("ChronoClip: Created date info from events:", dateInfo);
        }
      }
    }

    if (!dateInfo) {
      // デフォルトは明日の日付
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateInfo = {
        type: "date",
        start: { date: formatDate(tomorrow) },
        end: { date: formatDate(tomorrow) },
      };
      console.log("ChronoClip: Using default date info:", dateInfo);
    }

    // タイトルと詳細を準備
    let title = extractedData.title;
    let description =
      extractedData.description || extractedData.source?.selectionText || "";
    let eventSpecificUrl = extractedData.url; // 初期値はextractedData.url

    // タイトルが取得できていない場合、eventsからタイトルを取得
    if (!title && extractedData.events && extractedData.events.length > 0) {
      title = extractedData.events[0].title;
      console.log("ChronoClip: Using title from events:", title);
    }

    // 詳細が取得できていない場合、eventsから詳細を取得
    if (
      !description &&
      extractedData.events &&
      extractedData.events.length > 0
    ) {
      description = extractedData.events[0].description;
      console.log("ChronoClip: Using description from events:", description);
    }

    // eventsからのURL更新を反映
    eventSpecificUrl = extractedData.url;

    // URLが設定されていない場合のフォールバック
    if (!eventSpecificUrl) {
      eventSpecificUrl = window.location.href;
    }

    // 最終的なフォールバック
    title = title || "イベント";

    console.log("ChronoClip: Final title, description, and URL:", {
      title,
      description,
      url: eventSpecificUrl,
    });

    // ポップアップを表示
    console.log("ChronoClip: Calling showQuickAddPopup with:", {
      dateInfo,
      eventData: {
        title: title,
        description: description,
        url: eventSpecificUrl,
        source: extractedData.source,
      },
      position: {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      },
    });

    logger?.debug(
      "showQuickAddPopupWithData - step 5: calling showQuickAddPopupForExtractedData"
    );
    try {
      await showQuickAddPopupForExtractedData(
        dateInfo,
        {
          title: title,
          description: description,
          url: eventSpecificUrl,
          source: extractedData.source,
          events: extractedData.events, // Pass multiple events if available
        },
        {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }
      );
      logger?.debug(
        "showQuickAddPopupWithData - step 6: showQuickAddPopupForExtractedData completed successfully"
      );
    } catch (extractedDataError) {
      logger?.error("Error in showQuickAddPopupForExtractedData call", {
        error: extractedDataError.message,
        stack: extractedDataError.stack,
        dateInfo: dateInfo,
        title: title,
        description: description,
        url: eventSpecificUrl,
      });
      console.error(
        "ChronoClip: showQuickAddPopupForExtractedData error:",
        extractedDataError
      );
      throw extractedDataError; // 再throw してshowQuickAddPopupWithDataのcatchブロックに渡す
    }

    logger?.info("Quick add popup displayed for extracted data");
  } catch (error) {
    const handled = errorHandler?.handleError(error, {
      type: "ui",
      phase: "popup_display",
    });

    logger?.error("Error showing popup with extracted data", {
      error: error.message,
      userMessage: handled?.userMessage?.message,
    });

    showToast(
      "error",
      handled?.userMessage?.message ||
        "ポップアップの表示でエラーが発生しました"
    );
  }
}

/**
 * 抽出されたデータ用のポップアップ表示関数
 * @param {object} dateInfo - 日付情報
 * @param {object} eventData - イベントデータ
 * @param {object} position - 表示位置
 */
async function showQuickAddPopupForExtractedData(
  dateInfo,
  eventData,
  position
) {
  // loggerとerrorHandlerをグローバルから取得
  const { logger, errorHandler } = getLoggerAndErrorHandler();

  logger?.debug("Showing popup for extracted data", {
    hasDateInfo: !!dateInfo,
    hasEventData: !!eventData,
    hasPosition: !!position,
  });

  try {
    // ポップアップが既に存在する場合は削除
    const existingPopup = document.getElementById("chronoclip-popup-host");
    if (existingPopup) {
      existingPopup.remove();
    }

    // ポップアップのホスト要素を作成
    const popupHost = document.createElement("div");
    popupHost.id = "chronoclip-popup-host";
    popupHost.style.cssText = `
      position: fixed;
      z-index: 999999;
      left: ${position.clientX || 200}px;
      top: ${position.clientY || 200}px;
      width: 400px;
      height: 300px;
      pointer-events: auto;
    `;
    document.body.appendChild(popupHost);

    const shadowRoot = popupHost.attachShadow({ mode: "open" });

    // Extension context が有効かチェック
    if (!chrome.runtime?.id) {
      console.error("ChronoClip: Extension context invalidated");
      showToast("error", "拡張機能が無効になっています");
      return;
    }

    // HTMLとCSSをフェッチ
    const htmlUrl = chrome.runtime.getURL("src/ui/quick-add-popup.html");
    const cssUrl = chrome.runtime.getURL("src/ui/quick-add-popup.css");

    const [htmlResponse, cssResponse] = await Promise.all([
      fetch(htmlUrl),
      fetch(cssUrl),
    ]);

    const htmlText = await htmlResponse.text();
    const cssText = await cssResponse.text();

    // Shadow DOMにHTMLを挿入
    shadowRoot.innerHTML = htmlText;

    // CSSをShadow DOMに適用
    const style = document.createElement("style");
    style.textContent = cssText;
    shadowRoot.appendChild(style);

    // Check if we have multiple events
    const multipleEventsSection = shadowRoot.querySelector(".multiple-events-section");
    const singleEventForm = shadowRoot.querySelector(".popup-form");
    
    if (eventData.events && eventData.events.length > 1) {
      // Show multiple events UI
      await showMultipleEventsUI(shadowRoot, eventData.events, popupHost);
      return;
    }

    // Hide multiple events section for single event
    if (multipleEventsSection) {
      multipleEventsSection.classList.add("hidden");
    }

    // フォームに抽出データを設定
    const titleInput = shadowRoot.getElementById("event-title");
    const descriptionInput = shadowRoot.getElementById("event-details"); // 正しいIDに修正
    const dateInput = shadowRoot.getElementById("event-date");
    const timeInput = shadowRoot.getElementById("event-time");
    const endTimeInput = shadowRoot.getElementById("event-end-time");
    const allDayCheckbox = shadowRoot.getElementById("all-day");

    // 日付設定
    let hasValidDate = false;
    if (dateInput && dateInfo && dateInfo.start) {
      let dateStr = "";
      if (dateInfo.start.date) {
        dateStr = dateInfo.start.date;
      } else if (dateInfo.start.dateTime) {
        // dateTimeから日付部分を抽出
        const dateObj = new Date(dateInfo.start.dateTime);
        if (!isNaN(dateObj.getTime())) {
          dateStr = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD形式
        }
      } else if (
        dateInfo.start.year &&
        dateInfo.start.month &&
        dateInfo.start.day
      ) {
        dateStr = `${dateInfo.start.year}-${String(
          dateInfo.start.month
        ).padStart(2, "0")}-${String(dateInfo.start.day).padStart(2, "0")}`;
      }
      if (dateStr) {
        dateInput.value = dateStr;
        hasValidDate = true;
      }
    }

    // 日付フィールドを編集可能にする
    if (dateInput) {
      dateInput.removeAttribute("readonly");
      dateInput.type = "date";

      if (!hasValidDate) {
        // 日付が抽出できなかった場合は空白にして、ユーザーが入力しやすくする
        dateInput.value = "";
        dateInput.placeholder = "YYYY-MM-DD";
      }
    }

    // タイトルと説明の設定（日付の有無で処理を分ける）
    if (hasValidDate) {
      // 日付がある場合：タイトルには抽出されたイベントタイトルまたはページタイトル、日付以外の情報を設定
      if (titleInput) {
        let titleValue = "";
        if (
          eventData.title &&
          !eventData.title.match(/^\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}/)
        ) {
          // 抽出されたタイトルが日付以外の場合
          titleValue = eventData.title;
        } else {
          // ページタイトルまたはデフォルトタイトルを使用
          titleValue = document.title || "イベント";
        }
        titleInput.value = titleValue;
      }
    } else {
      // 日付がない場合：タイトルに抽出されたテキストを設定、日付は空白で手動入力を促す
      if (titleInput && eventData.title) {
        titleInput.value = eventData.title;
      }
      // 日付フィールドは空白のまま（上記で既に設定済み）
    }

    if (descriptionInput) {
      let description = "";

      console.log("ChronoClip: Setting description - debug info:", {
        eventDataUrl: eventData.url,
        currentUrl: window.location.href,
        urlExists: !!eventData.url,
        urlDifferent: eventData.url !== window.location.href,
        eventDataDescription: eventData.description,
      });

      // 後楽園ホール専用抽出器の場合はURLのみを詳細として設定
      if (eventData.url && eventData.url !== window.location.href) {
        description = eventData.url;
        console.log("ChronoClip: Set description to event URL:", description);
      } else if (eventData.description) {
        description = eventData.description;
        console.log("ChronoClip: Using original description:", description);
      }

      console.log("ChronoClip: Final description:", description);

      descriptionInput.value = description;
    }

    // 時刻設定
    let hasTime = false;
    if (
      dateInfo &&
      dateInfo.start &&
      (dateInfo.start.hour !== undefined ||
        (dateInfo.start.dateTime &&
          new Date(dateInfo.start.dateTime).getHours() !== undefined))
    ) {
      try {
        let startTimeDate;
        if (dateInfo.start.hour !== undefined) {
          // hour/minuteが直接指定されている場合
          hasTime = true;
          const hour = dateInfo.start.hour;
          const minute = dateInfo.start.minute || 0;

          if (allDayCheckbox) allDayCheckbox.checked = false;
          if (timeInput) {
            timeInput.value = `${String(hour).padStart(2, "0")}:${String(
              minute
            ).padStart(2, "0")}`;
            timeInput.style.display = "block";
          }
          if (endTimeInput) {
            // デフォルト終了時刻を3時間後に設定
            const endHour = (hour + 3) % 24;
            endTimeInput.value = `${String(endHour).padStart(2, "0")}:${String(
              minute
            ).padStart(2, "0")}`;
            endTimeInput.style.display = "block";
          }
          console.log(
            "ChronoClip: Set time from hour/minute:",
            hour,
            minute,
            "->",
            timeInput.value
          );
        } else if (dateInfo.start.dateTime) {
          // dateTimeが指定されている場合
          startTimeDate = new Date(dateInfo.start.dateTime);
          if (!isNaN(startTimeDate.getTime())) {
            hasTime = true;
            const hour = startTimeDate.getHours();
            const minute = startTimeDate.getMinutes();

            if (allDayCheckbox) allDayCheckbox.checked = false;
            if (timeInput) {
              timeInput.value = `${String(hour).padStart(2, "0")}:${String(
                minute
              ).padStart(2, "0")}`;
              timeInput.style.display = "block";
            }
            if (endTimeInput) {
              // デフォルト終了時刻を3時間後に設定
              const endDate = new Date(
                startTimeDate.getTime() + 3 * 60 * 60 * 1000
              );
              const endHour = endDate.getHours();
              const endMinute = endDate.getMinutes();
              endTimeInput.value = `${String(endHour).padStart(
                2,
                "0"
              )}:${String(endMinute).padStart(2, "0")}`;
              endTimeInput.style.display = "block";
            }
            console.log(
              "ChronoClip: Set time from dateTime:",
              dateInfo.start.dateTime,
              "->",
              timeInput.value
            );
          }
        }
      } catch (error) {
        console.warn("ChronoClip: Failed to parse dateInfo.start:", error);
      }
    }

    if (allDayCheckbox) {
      allDayCheckbox.checked = !hasTime;
    }
    if (timeInput) {
      timeInput.style.display = hasTime ? "block" : "none";
    }
    if (endTimeInput) {
      endTimeInput.style.display = hasTime ? "block" : "none";
    }

    // All Dayチェックボックスの変更で時間フィールドの表示/非表示を切り替え
    if (allDayCheckbox) {
      allDayCheckbox.addEventListener("change", () => {
        const isAllDay = allDayCheckbox.checked;
        if (timeInput) {
          timeInput.style.display = isAllDay ? "none" : "block";
        }
        if (endTimeInput) {
          endTimeInput.style.display = isAllDay ? "none" : "block";
        }
      });
    }

    // イベントハンドラー設定
    const closeBtn = shadowRoot.querySelector(".close-button");
    const cancelBtn = shadowRoot.querySelector(".cancel-button");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        popupHost.remove();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        popupHost.remove();
      });
    }

    // Escキーでポップアップを閉じる
    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        popupHost.remove();
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);

    // フォーム送信処理
    const form = shadowRoot.querySelector("form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        try {
          const title = shadowRoot.getElementById("event-title").value;
          const description = shadowRoot.getElementById("event-details").value;
          const date = shadowRoot.getElementById("event-date").value;
          const isAllDay = shadowRoot.getElementById("all-day").checked;
          const startTime = shadowRoot.getElementById("event-time").value;
          const endTime = shadowRoot.getElementById("event-end-time").value;

          // バリデーション
          if (!date) {
            showToast("error", "日付を入力してください");
            const dateInput = shadowRoot.getElementById("event-date");
            if (dateInput) {
              dateInput.style.border = "1px solid red";
              dateInput.focus();
            }
            return;
          }

          if (!title.trim()) {
            showToast("error", "タイトルを入力してください");
            const titleInput = shadowRoot.getElementById("event-title");
            if (titleInput) {
              titleInput.style.border = "1px solid red";
              titleInput.focus();
            }
            return;
          }

          // デバッグ: フォーム値の確認
          console.log("ChronoClip: Form values:", {
            title,
            description,
            date,
            isAllDay,
            startTime,
            endTime,
            eventDataUrl: eventData?.url,
          });

          let eventPayload;

          if (isAllDay) {
            eventPayload = {
              summary: title,
              description: description,
              start: { date: date },
              end: { date: date },
            };
          } else {
            if (!startTime) {
              showToast("error", "開始時刻を入力してください");
              const timeInput = shadowRoot.getElementById("event-time");
              if (timeInput) {
                timeInput.style.border = "1px solid red";
                timeInput.focus();
              }
              return;
            }

            const startDateTimeStr = `${date}T${startTime}:00`;
            let endDateTimeStr = endTime ? `${date}T${endTime}:00` : null;

            // 終了時刻が開始時刻より前の場合は、翌日の日付として扱う
            let endDateTime;
            if (endDateTimeStr) {
              const startDate = new Date(startDateTimeStr);
              const endDate = new Date(endDateTimeStr);
              if (endDate < startDate) {
                endDate.setDate(endDate.getDate() + 1);
              }
              endDateTime = endDate.toISOString();
            } else {
              // 終了時刻がない場合は、開始時刻から3時間後を設定
              const startDate = new Date(startDateTimeStr);
              endDateTime = new Date(
                startDate.getTime() + 3 * 60 * 60 * 1000
              ).toISOString();
            }

            eventPayload = {
              summary: title,
              description: description,
              start: {
                dateTime: startDateTimeStr,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              end: {
                dateTime: endDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
            };
          }

          // URLをペイロードに追加
          if (eventData.url && eventData.url !== window.location.href) {
            eventPayload.url = eventData.url;
          }

          // Googleカレンダーに追加
          console.log("ChronoClip: Sending event to background:", eventPayload);
          console.log("ChronoClip: About to call chrome.runtime.sendMessage");

          // Service Workerが応答するかテスト
          const testServiceWorker = () => {
            return new Promise((resolve, reject) => {
              console.log("ChronoClip: Testing service worker connectivity");

              let timeoutId;
              let completed = false;

              // 5秒のタイムアウトを設定
              timeoutId = setTimeout(() => {
                if (!completed) {
                  completed = true;
                  console.error("ChronoClip: Service worker ping timeout");
                  reject(new Error("Service worker ping timeout"));
                }
              }, 5000);

              chrome.runtime.sendMessage({ type: "ping" }, (response) => {
                if (!completed) {
                  completed = true;
                  clearTimeout(timeoutId);

                  if (chrome.runtime.lastError) {
                    console.error(
                      "ChronoClip: Service worker ping failed:",
                      chrome.runtime.lastError
                    );
                    reject(chrome.runtime.lastError);
                  } else {
                    console.log(
                      "ChronoClip: Service worker ping success:",
                      response
                    );
                    resolve(response);
                  }
                }
              });
            });
          };

          // まずService Workerをテスト
          testServiceWorker()
            .then(() => {
              console.log(
                "ChronoClip: Service worker is responsive, sending event"
              );

              const messageData = {
                type: "calendar:createEvent",
                payload: eventPayload,
              };

              console.log("ChronoClip: Message data:", messageData);

              chrome.runtime.sendMessage(messageData, (response) => {
                console.log("ChronoClip: Message callback called");
                console.log(
                  "ChronoClip: chrome.runtime.lastError:",
                  chrome.runtime.lastError
                );

                if (chrome.runtime.lastError) {
                  console.error(
                    "ChronoClip: Runtime error:",
                    chrome.runtime.lastError.message
                  );
                  showToast(
                    "error",
                    `イベント追加に失敗しました: ${chrome.runtime.lastError.message}`
                  );
                  return;
                }

                console.log("ChronoClip: Received response:", response);
                console.log("ChronoClip: Response type:", typeof response);
                console.log("ChronoClip: Response.success:", response?.success);

                if (response && response.success) {
                  showToast(
                    "success",
                    `イベント「${eventPayload.summary}」をカレンダーに追加しました。`
                  );
                } else {
                  const errorMessage = response?.error || "不明なエラー";
                  console.error(
                    "ChronoClip: Calendar API error:",
                    errorMessage
                  );
                  showToast(
                    "error",
                    `イベントの追加に失敗しました: ${errorMessage}`
                  );
                }
              });
            })
            .catch((error) => {
              console.error(
                "ChronoClip: Service worker test failed, trying direct send:",
                error
              );

              // Service Workerテストが失敗した場合でも、直接送信を試行
              const messageData = {
                type: "calendar:createEvent",
                payload: eventPayload,
              };

              chrome.runtime.sendMessage(messageData, (response) => {
                console.log("ChronoClip: Message callback called (fallback)");
                console.log(
                  "ChronoClip: chrome.runtime.lastError:",
                  chrome.runtime.lastError
                );

                if (chrome.runtime.lastError) {
                  console.error(
                    "ChronoClip: Runtime error:",
                    chrome.runtime.lastError.message
                  );
                  showToast(
                    "error",
                    `イベント追加に失敗しました: ${chrome.runtime.lastError.message}`
                  );
                  return;
                }

                console.log("ChronoClip: Received response:", response);
                console.log("ChronoClip: Response type:", typeof response);
                console.log("ChronoClip: Response.success:", response?.success);

                if (response && response.success) {
                  showToast(
                    "success",
                    `イベント「${eventPayload.summary}」をカレンダーに追加しました。`
                  );
                } else {
                  const errorMessage = response?.error || "不明なエラー";
                  console.error(
                    "ChronoClip: Calendar API error:",
                    errorMessage
                  );
                  showToast(
                    "error",
                    `イベントの追加に失敗しました: ${errorMessage}`
                  );
                }
              });
            });

          popupHost.remove();
        } catch (error) {
          console.error("ChronoClip: Error adding event:", error);
          showToast("error", "イベントの追加でエラーが発生しました");
        }
      });
    }
    logger?.info("Quick add popup displayed for extracted data");
  } catch (error) {
    const handled = errorHandler?.handleError(error, {
      type: "ui",
      phase: "popup_display_extracted",
    });

    logger?.error("Error in showQuickAddPopupForExtractedData", {
      error: error.message,
      userMessage: handled?.userMessage?.message,
    });

    showToast(
      "error",
      handled?.userMessage?.message ||
        "ポップアップの表示でエラーが発生しました"
    );
  }
}

/**
 * Show UI for selecting and adding multiple events
 * @param {ShadowRoot} shadowRoot - Shadow DOM root
 * @param {Array} events - Array of event objects
 * @param {HTMLElement} popupHost - Popup host element
 */
async function showMultipleEventsUI(shadowRoot, events, popupHost) {
  const { logger } = getLoggerAndErrorHandler();
  
  logger?.info("Showing multiple events UI", { eventCount: events.length });
  
  // Hide the single event form
  const singleEventForm = shadowRoot.querySelector(".popup-form");
  if (singleEventForm) {
    singleEventForm.style.display = "none";
  }
  
  // Show multiple events section
  const multipleEventsSection = shadowRoot.querySelector(".multiple-events-section");
  if (multipleEventsSection) {
    multipleEventsSection.classList.remove("hidden");
  }
  
  // Update events count
  const eventsCount = shadowRoot.querySelector(".events-count");
  if (eventsCount) {
    eventsCount.textContent = `Select events to add (${events.length} found)`;
  }
  
  // Populate events list
  const eventsList = shadowRoot.querySelector(".events-list");
  if (eventsList) {
    eventsList.innerHTML = "";
    
    events.forEach((event, index) => {
      const eventItem = document.createElement("div");
      eventItem.className = "event-item";
      
      // Format date
      let dateStr = "";
      if (event.startTime) {
        const date = new Date(event.startTime);
        if (!isNaN(date.getTime())) {
          dateStr = date.toLocaleString("ja-JP", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }
      
      eventItem.innerHTML = `
        <label>
          <input type="checkbox" class="event-checkbox" data-index="${index}" checked />
          <div class="event-item-content">
            <div class="event-item-title">${event.title || "No title"}</div>
            ${dateStr ? `<div class="event-item-date">${dateStr}</div>` : ""}
            ${event.location ? `<div class="event-item-location">${event.location}</div>` : ""}
          </div>
        </label>
      `;
      
      eventsList.appendChild(eventItem);
    });
  }
  
  // Setup select all checkbox
  const selectAllCheckbox = shadowRoot.getElementById("select-all-events");
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.addEventListener("change", (e) => {
      const checkboxes = shadowRoot.querySelectorAll(".event-checkbox");
      checkboxes.forEach(cb => cb.checked = e.target.checked);
      updateAddButtonState();
    });
  }
  
  // Update add button state based on selection
  const updateAddButtonState = () => {
    const checkedBoxes = shadowRoot.querySelectorAll(".event-checkbox:checked");
    const addButton = shadowRoot.querySelector(".add-selected-button");
    if (addButton) {
      addButton.disabled = checkedBoxes.length === 0;
      addButton.textContent = `Add Selected (${checkedBoxes.length})`;
    }
  };
  
  // Listen to individual checkbox changes
  const checkboxes = shadowRoot.querySelectorAll(".event-checkbox");
  checkboxes.forEach(cb => {
    cb.addEventListener("change", updateAddButtonState);
  });
  
  // Setup add selected button
  const addSelectedButton = shadowRoot.querySelector(".add-selected-button");
  if (addSelectedButton) {
    addSelectedButton.addEventListener("click", async () => {
      await addSelectedEvents(shadowRoot, events, popupHost);
    });
  }
  
  // Setup cancel button
  const cancelButtons = shadowRoot.querySelectorAll(".cancel-button");
  cancelButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      popupHost.remove();
    });
  });
  
  // Setup close button
  const closeButton = shadowRoot.querySelector(".close-button");
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      popupHost.remove();
    });
  }
  
  // Escape key handler
  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      popupHost.remove();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);
}

/**
 * Add selected events to calendar with progress display
 * @param {ShadowRoot} shadowRoot - Shadow DOM root
 * @param {Array} events - Array of all events
 * @param {HTMLElement} popupHost - Popup host element
 */
async function addSelectedEvents(shadowRoot, events, popupHost) {
  const { logger } = getLoggerAndErrorHandler();
  
  // Get selected events
  const selectedIndexes = [];
  const checkboxes = shadowRoot.querySelectorAll(".event-checkbox:checked");
  checkboxes.forEach(cb => {
    selectedIndexes.push(parseInt(cb.dataset.index));
  });
  
  if (selectedIndexes.length === 0) {
    showToast("info", "イベントが選択されていません");
    return;
  }
  
  logger?.info("Adding selected events", { count: selectedIndexes.length });
  
  // Show progress section
  const progressSection = shadowRoot.querySelector(".progress-section");
  if (progressSection) {
    progressSection.classList.remove("hidden");
  }
  
  // Disable buttons during processing
  const addButton = shadowRoot.querySelector(".add-selected-button");
  const cancelButtons = shadowRoot.querySelectorAll(".cancel-button");
  if (addButton) addButton.disabled = true;
  cancelButtons.forEach(btn => btn.disabled = true);
  
  // Process events
  const results = [];
  const failedEvents = [];
  
  for (let i = 0; i < selectedIndexes.length; i++) {
    const index = selectedIndexes[i];
    const event = events[index];
    
    // Update progress
    const progress = ((i + 1) / selectedIndexes.length) * 100;
    const progressFill = shadowRoot.querySelector(".progress-fill");
    const progressText = shadowRoot.querySelector(".progress-text");
    
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }
    if (progressText) {
      progressText.textContent = `Processing ${i + 1} of ${selectedIndexes.length}...`;
    }
    
    try {
      // Create event payload
      const eventPayload = createEventPayload(event);
      
      // Send to background script
      const response = await chrome.runtime.sendMessage({
        type: "calendar:createEvent",
        payload: eventPayload,
      });
      
      if (response && response.success) {
        results.push({ success: true, event });
        logger?.debug("Event added successfully", { index, title: event.title });
      } else {
        const error = new Error(response?.error || "Failed to add event");
        results.push({ success: false, event, error });
        failedEvents.push(event);
        logger?.warn("Event add failed", { index, error: response?.error });
      }
    } catch (error) {
      results.push({ success: false, event, error });
      failedEvents.push(event);
      logger?.error("Error adding event", { index, error });
    }
    
    // Rate limiting: wait a bit between requests
    if (i < selectedIndexes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  // Show results
  const successCount = results.filter(r => r.success).length;
  const failedCount = failedEvents.length;
  
  if (progressText) {
    progressText.textContent = `Complete: ${successCount} succeeded, ${failedCount} failed`;
  }
  
  logger?.info("Batch add completed", { successCount, failedCount });
  
  // Show toast notification
  if (failedCount === 0) {
    showToast("success", `${successCount}件のイベントを追加しました`);
  } else if (successCount > 0) {
    showToast("warn", `${successCount}件追加、${failedCount}件失敗しました`);
  } else {
    showToast("error", "イベントの追加に失敗しました");
  }
  
  // Close popup after a delay
  setTimeout(() => {
    popupHost.remove();
  }, 2000);
}

/**
 * Create calendar event payload from event object
 * @param {Object} event - Event object
 * @returns {Object} Calendar event payload
 */
function createEventPayload(event) {
  const payload = {
    summary: event.title || "Event",
    description: event.description || "",
  };
  
  // Handle date/time
  if (event.startTime) {
    const startDate = new Date(event.startTime);
    const endDate = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
    
    // Check if it's an all-day event (no specific time)
    if (startDate.getHours() === 0 && startDate.getMinutes() === 0) {
      // All-day event
      payload.start = { date: startDate.toISOString().split("T")[0] };
      payload.end = { date: endDate.toISOString().split("T")[0] };
    } else {
      // Timed event
      payload.start = {
        dateTime: startDate.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      payload.end = {
        dateTime: endDate.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }
  }
  
  // Add location if available
  if (event.location) {
    payload.location = event.location;
  }
  
  // Add URL if available
  if (event.url && event.url !== window.location.href) {
    payload.description = payload.description 
      ? `${payload.description}\n\n${event.url}`
      : event.url;
  }
  
  return payload;
}

/**
 * 日付をYYYY-MM-DD形式でフォーマット（ヘルパー関数）
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
 * ページ内の全ての日付を一括でカレンダーに追加
 */
async function addAllDatesToCalendar() {
  try {
    logger?.info("Starting batch add to calendar");

    // 現在ハイライトされている全ての日付要素を取得
    const highlightedElements = document.querySelectorAll(".chronoclip-date");

    if (highlightedElements.length === 0) {
      showToast("info", "追加可能な日付が見つかりません");
      return;
    }

    logger?.info("Found highlighted dates", {
      count: highlightedElements.length,
    });

    // 各日付要素から情報を抽出
    const dateItems = [];
    for (const element of highlightedElements) {
      try {
        const extractedData = await extractEventDataFromElement(element);
        if (extractedData && extractedData.date) {
          dateItems.push({
            element,
            data: extractedData,
            index: dateItems.length,
          });
        }
      } catch (error) {
        logger?.warn("Failed to extract data from element", { error, element });
      }
    }

    if (dateItems.length === 0) {
      showToast("warn", "有効な日付情報を抽出できませんでした");
      return;
    }

    logger?.info("Extracted valid date items", { count: dateItems.length });

    // 一括処理を実行
    const results = [];
    let successCount = 0;
    let failedItems = [];

    for (const item of dateItems) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "add_to_calendar",
          eventData: item.data,
        });

        if (response && response.success) {
          results.push({ success: true, item });
          successCount++;
          logger?.debug("Item added successfully", { index: item.index });
        } else {
          const error = new Error(response?.error || "追加に失敗しました");
          results.push({ success: false, item, error });
          failedItems.push(item);
          logger?.warn("Item add failed", {
            index: item.index,
            error: response?.error,
          });
        }
      } catch (error) {
        results.push({ success: false, item, error });
        failedItems.push(item);
        logger?.error("Item add error", { index: item.index, error });
      }

      // 短い間隔でリクエストを送信（APIレート制限を考慮）
      if (item.index < dateItems.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // 結果をerrorHandlerで処理
    const batchResult = errorHandler?.handleBatchResult(results) || {
      message: `${successCount}件中${successCount}件が完了しました`,
      successful: successCount,
      failed: failedItems.length,
      total: dateItems.length,
    };

    // 結果を表示
    showBatchResultToast(batchResult, failedItems);

    logger?.info("Batch add completed", batchResult);
  } catch (error) {
    const handled = errorHandler?.handleError(error, "一括追加") || {
      userMessage: { message: "一括追加中にエラーが発生しました" },
    };

    logger?.error("Batch add failed", error);
    showToast("error", handled.userMessage.message);
  }
}

/**
 * 要素から詳細なイベントデータを抽出
 * @param {HTMLElement} element - 日付要素
 * @returns {Object} 抽出されたイベントデータ
 */
async function extractEventDataFromElement(element) {
  try {
    // 基本的な日付抽出
    const dateText = element.textContent.trim();
    const parsedDate = parseDateText(dateText);

    if (!parsedDate) {
      throw new Error("日付の解析に失敗しました");
    }

    // extractorを使用してより詳細な情報を抽出
    let extractedData = null;
    if (window.ExtractorFactory) {
      try {
        const extractor = window.ExtractorFactory.createExtractor(
          window.location.href
        );
        if (extractor) {
          extractedData = await extractor.extractEvents(element);
          if (extractedData && extractedData.length > 0) {
            // 最初の結果を使用
            extractedData = extractedData[0];
          }
        }
      } catch (extractorError) {
        logger?.debug(
          "Extractor failed, using basic extraction",
          extractorError
        );
      }
    }

    // 基本的なデータ構造を作成
    return {
      date: formatDate(parsedDate),
      title: extractedData?.title || generateEventTitle(element),
      description:
        extractedData?.description || generateEventDescription(element),
      location: extractedData?.location || "",
      startTime: extractedData?.startTime || null,
      endTime: extractedData?.endTime || null,
      source: window.location.href,
      rawText: dateText,
      elementHtml: element.outerHTML.substring(0, 200), // デバッグ用
    };
  } catch (error) {
    logger?.error("Failed to extract event data from element", {
      error,
      element,
    });
    throw error;
  }
}

/**
 * 要素周辺からイベントタイトルを生成
 * @param {HTMLElement} element - 日付要素
 * @returns {string} 生成されたタイトル
 */
function generateEventTitle(element) {
  try {
    // 見出し要素を探す
    const headings =
      element
        .closest("article, section, div")
        ?.querySelectorAll("h1, h2, h3, h4, h5, h6") || [];
    for (const heading of headings) {
      const text = heading.textContent.trim();
      if (text && text.length > 3 && text.length < 100) {
        return text;
      }
    }

    // タイトル候補となる要素を探す
    const titleSelectors = [".title", ".headline", ".event-title", ".name"];
    for (const selector of titleSelectors) {
      const titleEl = element
        .closest("article, section, div")
        ?.querySelector(selector);
      if (titleEl) {
        const text = titleEl.textContent.trim();
        if (text && text.length > 3 && text.length < 100) {
          return text;
        }
      }
    }

    // フォールバック: ページタイトル
    return document.title || "ウェブページのイベント";
  } catch (error) {
    logger?.debug("Failed to generate event title", error);
    return "ウェブページのイベント";
  }
}

/**
 * 要素周辺からイベント詳細を生成
 * @param {HTMLElement} element - 日付要素
 * @returns {string} 生成された詳細
 */
function generateEventDescription(element) {
  try {
    const container = element.closest("article, section, div, p");
    if (!container) return "";

    // 説明文候補を探す
    const descSelectors = ["p", ".description", ".content", ".detail"];
    for (const selector of descSelectors) {
      const descEl = container.querySelector(selector);
      if (descEl && descEl !== element) {
        const text = descEl.textContent.trim();
        if (text && text.length > 10 && text.length < 500) {
          return text;
        }
      }
    }

    // コンテナのテキストを使用（日付部分を除く）
    const containerText = container.textContent.trim();
    const dateText = element.textContent.trim();
    const description = containerText.replace(dateText, "").trim();

    if (description && description.length > 10 && description.length < 500) {
      return description;
    }

    return "";
  } catch (error) {
    logger?.debug("Failed to generate event description", error);
    return "";
  }
}

/**
 * 一括処理結果をトーストで表示
 * @param {Object} batchResult - handleBatchResultの結果
 * @param {Array} failedItems - 失敗したアイテム
 */
function showBatchResultToast(batchResult, failedItems = []) {
  const { total, successful, failed, message } = batchResult;

  if (failed === 0) {
    // 全成功
    showToast("success", `${successful}件のイベントを追加しました`);
  } else if (successful === 0) {
    // 全失敗
    showToast("error", message);
  } else {
    // 部分成功
    showToast("success", `${successful}件のイベントを追加しました`);
    setTimeout(() => {
      showToast("warn", `${failed}件のイベント追加に失敗しました`);
    }, 2000);
  }
}

// 一括処理機能をグローバル関数として公開
window.addAllDatesToCalendar = addAllDatesToCalendar;
