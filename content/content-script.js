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
    if (!text || text.trim() === "") {
      return;
    }

    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let matchesFound = false;

    // chrono-nodeによる解析
    const chronoResults = chrono.parse(text, new Date());
    const allMatches = [];

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
      });
    });

    // カスタム正規表現検出器による解析
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
          });
        }
      }
    });

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
      dateSpan.dataset.normalizedDate = match.date; // 正規化された日付をデータ属性に保存

      // カレンダーアイコンを追加
      dateSpan.insertAdjacentHTML("beforeend", CALENDAR_ICON_SVG);

      // イベントリスナー
      dateSpan.addEventListener("click", (e) => {
        e.stopPropagation(); // 親要素へのイベント伝播を防ぐ
        showQuickAddPopup(match.date, e);
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

  let quickAddPopupHost = null; // ポップアップのホスト要素

  /**
   * クイック追加ポップアップを表示します。
   * @param {string} originalDate - 元の日付文字列。
   * @param {string} normalizedDate - 正規化された日付文字列 (YYYY-MM-DD)。
   * @param {MouseEvent} e - クリックイベントオブジェクト。
   */
  async function showQuickAddPopup(normalizedDate, e) {
    // 既にポップアップが表示されている場合は非表示にする
    if (quickAddPopupHost) {
      hideQuickAddPopup();
    }

    // イベント情報を自動抽出
    let extractedEvent = null;
    try {
      if (window.ChronoClipExtractor && e.target) {
        // オプション設定を取得
        const options = { includeURL: true }; // デフォルト値

        // ストレージからオプションを非同期で取得
        chrome.storage.sync.get(["includeURL"], (result) => {
          if (result.includeURL !== undefined) {
            options.includeURL = result.includeURL;
          }
        });

        extractedEvent = window.ChronoClipExtractor.extractEventContext(
          e.target,
          options
        );
        console.log("ChronoClip: Extracted event context:", extractedEvent);
      }
    } catch (error) {
      console.error("ChronoClip: Error extracting event context:", error);
    }

    quickAddPopupHost = document.createElement("div");
    quickAddPopupHost.style.position = "absolute";
    quickAddPopupHost.style.zIndex = "99999"; // 最前面に表示
    document.body.appendChild(quickAddPopupHost);

    const shadowRoot = quickAddPopupHost.attachShadow({ mode: "open" });

    try {
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

        let top = e.clientY + window.scrollY + 10; // クリック位置から少し下に
        let left = e.clientX + window.scrollX + 10; // クリック位置から少し右に

        // 画面下部からはみ出さないように調整
        if (top + popupRect.height > window.innerHeight + window.scrollY) {
          top = window.innerHeight + window.scrollY - popupRect.height - 10;
          if (top < window.scrollY) {
            // 画面に収まらない場合は上端に
            top = window.scrollY + 10;
          }
        }

        // 画面右端からはみ出さないように調整
        if (left + popupRect.width > window.innerWidth + window.scrollX) {
          left = window.innerWidth + window.scrollX - popupRect.width - 10;
          if (left < window.scrollX) {
            // 画面に収まらない場合は左端に
            left = window.scrollX + 10;
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

          const eventPayload = {
            summary: eventTitle,
            description: eventDetails,
            start: { date: normalizedDate },
            end: { date: normalizedDate },
            url: window.location.href,
          };

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
              ignoreSelectors.some((selector) => currentNode.matches(selector))
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            currentNode = currentNode.parentNode;
          }
          // 空白のみのテキストノードはスキップ
          if (node.nodeValue.trim() === "") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false
    );

    const textNodesToProcess = [];
    let currentNode = treeWalker.nextNode();
    while (currentNode) {
      textNodesToProcess.push(currentNode);
      currentNode = treeWalker.nextNode();
    }

    // 収集したテキストノードを処理
    textNodesToProcess.forEach((node) => {
      try {
        processTextNode(node);
      } catch (e) {
        console.error("ChronoClip: Error processing text node:", node, e);
      }
    });

    console.log("ChronoClip: Date highlighting complete.");
  }

  // DOMContentLoadedイベントを待ってから処理を開始
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", findAndHighlightDates);
  } else {
    findAndHighlightDates();
  }

  // MutationObserverで動的に追加されるコンテンツに対応
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
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
                      ignoreSelectors.some((selector) =>
                        currentNode.matches(selector)
                      )
                    ) {
                      return NodeFilter.FILTER_REJECT;
                    }
                    currentNode = currentNode.parentNode;
                  }
                  if (n.nodeValue.trim() === "") {
                    return NodeFilter.FILTER_REJECT;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                },
              },
              false
            );
            let currentNode = treeWalker.nextNode();
            while (currentNode) {
              try {
                processTextNode(currentNode);
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
      }
    });
  });

  // body要素とその子孫の変更を監視
  observer.observe(document.body, { childList: true, subtree: true });
})();

/**
 * サービスワーカーからのメッセージをリッスンします。
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "show_toast") {
    showToast(message.payload.type, message.payload.message);
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
  toast.textContent = message;

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
