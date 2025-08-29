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

      // データ属性を設定
      if (match.type === "date") {
        dateSpan.dataset.normalizedDate = match.date;
        dateSpan.dataset.type = "date";
      } else if (match.type === "time") {
        dateSpan.dataset.time = match.original;
        dateSpan.dataset.type = "time";
      }

      // カレンダーアイコンを追加
      dateSpan.insertAdjacentHTML("beforeend", CALENDAR_ICON_SVG);

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
    // 既にポップアップが表示されている場合は非表示にする
    if (quickAddPopupHost) {
      hideQuickAddPopup();
    }

    // イベント情報を自動抽出
    let extractedEvent = null;
    try {
      if (window.ChronoClipExtractor && e.target) {
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
          console.warn("ChronoClip: Failed to load options, using defaults");
        }

        extractedEvent = window.ChronoClipExtractor.extractEventContext(
          e.target,
          options
        );
        performanceMonitor.extractionCalls++;
        console.log("ChronoClip: Extracted event context:", extractedEvent);
      }
    } catch (error) {
      console.error("ChronoClip: Error extracting event context:", error);
    }

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
        return;
      }

      // HTMLとCSSをフェッチ
      const htmlUrl = chrome.runtime.getURL("quick-add-popup.html");
      const cssUrl = chrome.runtime.getURL("quick-add-popup.css");

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

      // 抽出されたイベント情報をフォームに自動入力
      if (extractedEvent) {
        const eventTitleInput = shadowRoot.getElementById("event-title");
        const eventDetailsInput = shadowRoot.getElementById("event-details");

        if (eventTitleInput && extractedEvent.title && !eventTitleInput.value) {
          eventTitleInput.value = extractedEvent.title;
        }

        if (
          eventDetailsInput &&
          extractedEvent.description &&
          !eventDetailsInput.value
        ) {
          eventDetailsInput.value = extractedEvent.description;
        }
      }

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

              if (response && response.ok) {
                showToast(
                  "success",
                  `予定「${eventPayload.summary}」を追加しました。`
                );
              } else {
                const errorMessage =
                  response?.message ||
                  "不明なエラーで予定の追加に失敗しました。";
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
    console.log("ChronoClip: Starting date highlighting...");

    // 処理開始時間を記録（パフォーマンス監視）
    const startTime = performance.now();

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

  // DOMContentLoadedイベントを待ってから処理を開始
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", findAndHighlightDates);
  } else {
    findAndHighlightDates();
  }

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
 * サービスワーカーからのメッセージをリッスンします。
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // エラー以外のメッセージは基本的にログ出力しない
  if (
    message.type !== "show_toast" &&
    message.type !== "show_quick_add_popup"
  ) {
    console.log("ChronoClip: Content script received message:", message);
  }

  switch (message.type) {
    case "show_toast":
      showToast(message.payload.type, message.payload.message);
      break;

    case "show_quick_add_popup":
      // Issue #11: 選択範囲モードからのポップアップ表示
      if (message.payload && message.payload.extractedData) {
        const data = message.payload.extractedData;
        // 抽出されたデータを使ってポップアップを表示
        showQuickAddPopupWithData(data);
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
function showQuickAddPopupWithData(extractedData) {
  console.log(
    "ChronoClip: Showing quick add popup with extracted data:",
    extractedData
  );

  try {
    // 既存のポップアップが表示されている場合は削除
    const existingPopup = document.querySelector(".chronoclip-quick-add-popup");
    if (existingPopup) {
      console.log("ChronoClip: Removing existing popup");
      existingPopup.remove();
    }

    // ポップアップの位置を画面中央に設定
    const rect = {
      left: window.innerWidth / 2 - 200, // 幅400pxとして中央配置
      top: window.innerHeight / 2 - 150, // 高さ300pxとして中央配置
      width: 400,
      height: 300,
    };

    console.log("ChronoClip: Popup position calculated:", rect);

    // 抽出されたデータから日付情報を準備
    let dateInfo = null;
    if (extractedData.dateTime) {
      dateInfo = extractedData.dateTime;
      console.log("ChronoClip: Using extracted date info:", dateInfo);
    } else {
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
    const title = extractedData.title || "イベント";
    const description =
      extractedData.description || extractedData.source?.selectionText || "";

    console.log("ChronoClip: Prepared title and description:", {
      title,
      description,
    });

    // ポップアップを表示
    console.log("ChronoClip: Calling showQuickAddPopup with:", {
      dateInfo,
      eventData: {
        title: title,
        description: description,
        url: extractedData.url || window.location.href,
        source: extractedData.source,
      },
      position: {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      },
    });

    showQuickAddPopupForExtractedData(
      dateInfo,
      {
        title: title,
        description: description,
        url: extractedData.url || window.location.href,
        source: extractedData.source,
      },
      {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }
    );

    console.log("ChronoClip: Quick add popup displayed for selection data");
  } catch (error) {
    console.error(
      "ChronoClip: Error showing popup with extracted data:",
      error
    );
    showToast("error", "ポップアップの表示でエラーが発生しました");
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
  try {
    console.log("ChronoClip: Showing popup for extracted data", {
      dateInfo,
      eventData,
      position,
    });

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
    const htmlUrl = chrome.runtime.getURL("quick-add-popup.html");
    const cssUrl = chrome.runtime.getURL("quick-add-popup.css");

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

    // フォームに抽出データを設定
    const titleInput = shadowRoot.getElementById("event-title");
    const descriptionInput = shadowRoot.getElementById("event-description");
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

    if (descriptionInput && eventData.description) {
      descriptionInput.value = eventData.description;
    }

    // 時刻設定
    const hasTime =
      dateInfo &&
      dateInfo.start &&
      dateInfo.start.hour !== undefined &&
      dateInfo.start.minute !== undefined;

    if (hasTime) {
      if (allDayCheckbox) allDayCheckbox.checked = false;
      if (timeInput) {
        timeInput.value = `${String(dateInfo.start.hour).padStart(
          2,
          "0"
        )}:${String(dateInfo.start.minute).padStart(2, "0")}`;
        timeInput.style.display = "block";
      }
      if (endTimeInput) {
        endTimeInput.style.display = "block";
        // デフォルト終了時刻を3時間後に設定
        const endHour = (dateInfo.start.hour + 3) % 24;
        endTimeInput.value = `${String(endHour).padStart(2, "0")}:${String(
          dateInfo.start.minute
        ).padStart(2, "0")}`;
      }
    } else {
      if (allDayCheckbox) allDayCheckbox.checked = true;
      if (timeInput) timeInput.style.display = "none";
      if (endTimeInput) endTimeInput.style.display = "none";
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
          const formData = new FormData(form);
          const title =
            formData.get("title") || eventData.title || "無題のイベント";
          const description =
            formData.get("description") || eventData.description || "";
          const date = formData.get("date");
          const isAllDay = formData.get("all-day") === "on";

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

          let eventPayload;

          if (isAllDay) {
            eventPayload = {
              summary: title,
              description: description,
              start: { date: date },
              end: { date: date },
              url: eventData.url || window.location.href,
            };
          } else {
            const startTime = formData.get("start-time");
            const endTime = formData.get("end-time");

            if (!startTime) {
              showToast("error", "開始時刻を入力してください");
              const timeInput = shadowRoot.getElementById("event-time");
              if (timeInput) {
                timeInput.style.border = "1px solid red";
                timeInput.focus();
              }
              return;
            }
            const startDateTime = `${date}T${startTime}:00`;
            const endDateTime = `${date}T${endTime}:00`;

            eventPayload = {
              summary: title,
              description: description,
              start: {
                dateTime: startDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              end: {
                dateTime: endDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              url: eventData.url || window.location.href,
            };
          }

          // Googleカレンダーに追加
          chrome.runtime.sendMessage({
            type: "add_to_calendar",
            payload: eventPayload,
          });

          popupHost.remove();
          showToast("success", "イベントをGoogleカレンダーに追加しました！");
        } catch (error) {
          console.error("ChronoClip: Error adding event:", error);
          showToast("error", "イベントの追加でエラーが発生しました");
        }
      });
    }

    console.log("ChronoClip: Quick add popup displayed for extracted data");
  } catch (error) {
    console.error(
      "ChronoClip: Error in showQuickAddPopupForExtractedData:",
      error
    );
    showToast("error", "ポップアップの表示でエラーが発生しました");
  }
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
