/**
 * @fileoverview 選択範囲からのイベント情報抽出モジュール
 * Issue #11: 右クリックメニューから選択範囲をカレンダーに追加
 */

/**
 * date-parser.jsの出力形式をcontent-script.jsの期待する形式に変換
 * @param {object} parsedDate - date-parser.jsの出力
 * @returns {object} content-script.js互換の形式
 */
function convertDateParserFormat(parsedDate) {
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
      date: startDate.toISOString().split('T')[0],
      dateTime: parsedDate.start.dateTime,
      timeZone: parsedDate.start.timeZone,
    };
    
    result.end = {
      year: endDate.getFullYear(),
      month: endDate.getMonth() + 1,
      day: endDate.getDate(),
      hour: endDate.getHours(),
      minute: endDate.getMinutes(),
      date: endDate.toISOString().split('T')[0],
      dateTime: parsedDate.end.dateTime,
      timeZone: parsedDate.end.timeZone,
    };
  } else {
    // 終日イベント
    const startDate = new Date(parsedDate.start.date + 'T00:00:00');
    
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
 * タイトルから日付関連のテキストを除去
 * @param {string} title - 元のタイトル
 * @param {string} dateText - 日付として使用されたテキスト
 * @returns {string} クリーンアップされたタイトル
 */
function removeDateFromTitle(title, dateText) {
  if (!title || !dateText) return title;

  // 日付パターンをタイトルから除去
  const datePatterns = [
    // ISO形式
    /\d{4}-\d{1,2}-\d{1,2}(?:[T\s]\d{1,2}:\d{2})?/g,
    // 日本語形式
    /\d{1,2}月\d{1,2}日(?:\([^)]+\))?(?:\s*\d{1,2}:\d{2}|\d{1,2}時(?:\d{2}分)?)?/g,
    // スラッシュ形式
    /(?:\d{4}\/)?\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?/g,
    // 和暦
    /令和\d+年\d{1,2}月\d{1,2}日/g,
    // 英語形式
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}(?:pm|am)?)?/gi,
    // 時刻のみ
    /\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?/g,
    /\d{1,2}時(?:\d{2}分)?/g,
    // 開場・開始等の時間表現
    /(?:開場|開始|受付|開催)\s*\d{1,2}:\d{2}/g,
    /(?:開場|開始|受付|開催)\s*\d{1,2}時(?:\d{2}分)?/g,
  ];

  let cleanTitle = title;
  
  // 各パターンで日付を除去
  for (const pattern of datePatterns) {
    cleanTitle = cleanTitle.replace(pattern, '');
  }

  // 余分な空白やカンマ、括弧を除去
  cleanTitle = cleanTitle
    .replace(/\s+/g, ' ')
    .replace(/[,，]\s*/g, ' ')
    .replace(/^\s*[,，(（]\s*/, '')
    .replace(/\s*[,，)）]\s*$/, '')
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();

  // 空になった場合は元のタイトルの最初の部分を使用
  if (!cleanTitle) {
    const words = title.split(/\s+/);
    cleanTitle = words.slice(0, 3).join(' ') || title;
  }

  return cleanTitle;
}

/**
 * テキストを正規化する関数（extractor.jsと同じロジック）
 * @param {string} text - 正規化するテキスト
 * @returns {string} 正規化されたテキスト
 */
function normalizeText(text) {
  if (!text || typeof text !== "string") return "";

  return text
    .replace(/\s+/g, " ") // 複数の空白を単一スペースに
    .replace(/[\r\n\t]/g, " ") // 改行・タブを空白に
    .replace(
      /[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF.,!?()[\]:：（）「」『』、。]/g,
      ""
    ) // 不要な記号を除去
    .trim();
}

/**
 * 要素のCSSパスを取得
 * @param {Element} element - 対象要素
 * @returns {string} CSSパス
 */
function getCssPath(element) {
  if (!element) return "";

  const path = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    }

    if (current.className) {
      const classes = Array.from(current.classList).slice(0, 2); // 最大2つのクラス
      if (classes.length > 0) {
        selector += "." + classes.join(".");
      }
    }

    path.unshift(selector);
    current = current.parentElement;

    if (path.length > 5) break; // パスの長さを制限
  }

  return path.join(" > ");
}

/**
 * 最も近い見出しを検索
 * @param {Element} element - 開始要素
 * @param {number} maxDistance - 最大検索距離
 * @returns {object|null} 見出し情報
 */
function findNearestHeading(element, maxDistance = 5) {
  if (!element) return null;

  const headingTags = ["H1", "H2", "H3", "H4", "H5", "H6"];
  let current = element;
  let distance = 0;

  // 上方向に検索
  while (current && distance < maxDistance) {
    if (headingTags.includes(current.tagName)) {
      return {
        element: current,
        text: normalizeText(current.textContent),
        level: parseInt(current.tagName.substring(1)),
        distance: distance,
        cssPath: getCssPath(current),
      };
    }

    current = current.previousElementSibling || current.parentElement;
    distance++;
  }

  return null;
}

/**
 * 選択範囲の情報を収集
 * @param {string} selectionText - 選択されたテキスト
 * @returns {object} 選択範囲情報
 */
function collectSelectionInfo(selectionText) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { text: selectionText, range: null, container: null };
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const containerElement =
    container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

  return {
    text: normalizeText(selectionText),
    range: {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      collapsed: range.collapsed,
    },
    container: {
      element: containerElement,
      tagName: containerElement?.tagName,
      className: containerElement?.className,
      textContent: normalizeText(containerElement?.textContent),
      cssPath: getCssPath(containerElement),
    },
  };
}

/**
 * 選択範囲周辺のコンテキスト情報を収集
 * @param {Element} containerElement - 選択範囲の親要素
 * @returns {object} コンテキスト情報
 */
function collectContextInfo(containerElement) {
  if (!containerElement) return {};

  const context = {
    heading: null,
    paragraphs: [],
    parent: null,
    siblings: [],
  };

  // 1. 最も近い見出し
  context.heading = findNearestHeading(containerElement);

  // 2. 親要素の情報
  if (containerElement.parentElement) {
    const parent = containerElement.parentElement;
    context.parent = {
      tagName: parent.tagName,
      className: parent.className,
      textContent: normalizeText(parent.textContent),
      cssPath: getCssPath(parent),
    };
  }

  // 3. 近隣の段落
  const nearbyElements = [];

  // 前の兄弟要素
  let prev = containerElement.previousElementSibling;
  let prevCount = 0;
  while (prev && prevCount < 3) {
    if (prev.textContent && prev.textContent.trim().length > 10) {
      nearbyElements.push({
        position: "before",
        element: prev,
        text: normalizeText(prev.textContent),
        tagName: prev.tagName,
        cssPath: getCssPath(prev),
      });
    }
    prev = prev.previousElementSibling;
    prevCount++;
  }

  // 次の兄弟要素
  let next = containerElement.nextElementSibling;
  let nextCount = 0;
  while (next && nextCount < 3) {
    if (next.textContent && next.textContent.trim().length > 10) {
      nearbyElements.push({
        position: "after",
        element: next,
        text: normalizeText(next.textContent),
        tagName: next.tagName,
        cssPath: getCssPath(next),
      });
    }
    next = next.nextElementSibling;
    nextCount++;
  }

  context.paragraphs = nearbyElements;

  return context;
}

/**
 * 抽出された情報をextractor.jsを使って処理
 * @param {object} selectionInfo - 選択範囲情報
 * @param {object} contextInfo - コンテキスト情報
 * @param {object} pageInfo - ページ情報
 * @returns {Promise<object>} 抽出結果
 */
async function extractEventFromSelection(selectionInfo, contextInfo, pageInfo) {
  console.log("ChronoClip: Extracting event from selection:", {
    selectionInfo,
    contextInfo,
    pageInfo,
  });

  try {
    // 1. 日付情報の抽出
    const dateParser = window.ChronoClipDateParser;
    let dateInfo = null;
    let dateTextUsed = "";

    if (dateParser) {
      // 選択テキストと周辺コンテキストから日付を検索
      const textSources = [
        selectionInfo.text,
        contextInfo.heading?.text || "",
        ...(contextInfo.paragraphs?.map((p) => p.text) || []),
        contextInfo.parent?.textContent || "",
      ].filter((text) => text.length > 0);

      for (const text of textSources) {
        const parsedDate = dateParser.parseDate(text);
        if (parsedDate) {
          console.log("ChronoClip: Date found in text:", text, parsedDate);
          
          // date-parser.jsの形式をcontent-script.jsの期待する形式に変換
          dateInfo = convertDateParserFormat(parsedDate);
          dateTextUsed = text;
          break;
        }
      }
    } else {
      console.warn("ChronoClip: Date parser not available");
    }

    // 2. タイトル・詳細の抽出（extractor.jsのロジックを使用）
    let eventData = { title: null, description: null };

    const extractor = window.ChronoClipExtractor;
    if (extractor) {
      try {
        // 軽量化のため、より簡単なオプションで抽出
        const fakeEventElement = {
          textContent: selectionInfo.text,
          parentElement: selectionInfo.container.element,
          querySelector: () => null,
          querySelectorAll: () => [],
          closest: (selector) => {
            if (
              selectionInfo.container.element &&
              selectionInfo.container.element.closest
            ) {
              return selectionInfo.container.element.closest(selector);
            }
            return null;
          },
        };

        // 軽量なオプションで高速化
        const extractOptions = {
          includeURL: true,
          maxChars: 150, // 短縮してパフォーマンス向上
          headingSearchDepth: 2, // 探索深度を制限
        };

        eventData = extractor.extractEventContext(
          fakeEventElement,
          extractOptions
        );
        console.log("ChronoClip: Extractor result:", eventData);
      } catch (extractorError) {
        console.warn(
          "ChronoClip: Extractor failed, using fallback:",
          extractorError
        );
      }
    } else {
      console.warn("ChronoClip: Event extractor not available, using fallback");
    }

    // 3. 日時として使用されたテキストをタイトルから除外
    let cleanTitle = eventData.title || extractTitleFromSelection(selectionInfo, contextInfo);
    if (dateTextUsed && cleanTitle) {
      cleanTitle = removeDateFromTitle(cleanTitle, dateTextUsed);
    }

    // 4. 結果をマージ
    const result = {
      title: cleanTitle || "イベント",
      description:
        eventData.description ||
        extractDescriptionFromSelection(selectionInfo, contextInfo),
      dateTime: dateInfo,
      url: pageInfo.pageUrl,
      source: {
        selectionText: selectionInfo.text,
        heading: contextInfo.heading?.text,
        pageTitle: pageInfo.pageTitle,
        extractedAt: new Date().toISOString(),
        dateTextUsed: dateTextUsed,
      },
    };

    console.log("ChronoClip: Event extraction result:", result);
    return result;
  } catch (error) {
    console.error("ChronoClip: Error extracting event from selection:", error);

    // エラー時もフォールバック情報を返す
    const fallbackResult = {
      title: extractTitleFromSelection(selectionInfo, contextInfo),
      description: extractDescriptionFromSelection(selectionInfo, contextInfo),
      dateTime: null,
      url: pageInfo.pageUrl,
      source: {
        selectionText: selectionInfo.text,
        heading: contextInfo.heading?.text,
        pageTitle: pageInfo.pageTitle,
        extractedAt: new Date().toISOString(),
        error: error.message,
      },
    };

    console.log(
      "ChronoClip: Using fallback result due to error:",
      fallbackResult
    );
    return fallbackResult;
  }
}

/**
 * 選択範囲からタイトルを抽出（フォールバック）
 * @param {object} selectionInfo - 選択範囲情報
 * @param {object} contextInfo - コンテキスト情報
 * @returns {string} 抽出されたタイトル
 */
function extractTitleFromSelection(selectionInfo, contextInfo) {
  // 1. 見出しがあればそれを優先
  if (contextInfo.heading?.text) {
    return contextInfo.heading.text;
  }

  // 2. 選択テキストの最初の行または最初の30文字
  const selectionText = selectionInfo.text;
  if (selectionText) {
    const firstLine = selectionText.split("\n")[0].trim();
    if (firstLine.length > 0) {
      return firstLine.length > 30
        ? firstLine.substring(0, 30) + "..."
        : firstLine;
    }
  }

  // 3. フォールバック
  return "イベント";
}

/**
 * 選択範囲から詳細を抽出（フォールバック）
 * @param {object} selectionInfo - 選択範囲情報
 * @param {object} contextInfo - コンテキスト情報
 * @returns {string} 抽出された詳細
 */
function extractDescriptionFromSelection(selectionInfo, contextInfo) {
  const parts = [];

  // 選択テキスト
  if (selectionInfo.text) {
    parts.push(selectionInfo.text);
  }

  // 周辺段落（最大2つ）
  if (contextInfo.paragraphs) {
    const relevantParagraphs = contextInfo.paragraphs
      .filter((p) => p.text.length > 20 && p.text.length < 200)
      .slice(0, 2);

    for (const paragraph of relevantParagraphs) {
      parts.push(paragraph.text);
    }
  }

  return parts.join("\n\n").trim();
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("ChronoClip: Selection script received message:", message);

  if (message.type === "extract_selection") {
    const { selectionText, pageUrl, pageTitle } = message.payload;

    try {
      // 選択範囲情報を収集
      const selectionInfo = collectSelectionInfo(selectionText);
      const contextInfo = collectContextInfo(selectionInfo.container?.element);
      const pageInfo = { pageUrl, pageTitle };

      // イベント情報を抽出
      extractEventFromSelection(selectionInfo, contextInfo, pageInfo)
        .then((result) => {
          console.log("ChronoClip: Extraction completed successfully:", result);
          sendResponse({
            success: true,
            data: result,
          });
        })
        .catch((error) => {
          console.error("ChronoClip: Selection extraction failed:", error);

          // エラー時でもフォールバック結果を提供
          const fallbackResult = {
            title: extractTitleFromSelection(selectionInfo, contextInfo),
            description: extractDescriptionFromSelection(
              selectionInfo,
              contextInfo
            ),
            dateTime: null,
            url: pageInfo.pageUrl,
            source: {
              selectionText: selectionInfo.text,
              heading: contextInfo.heading?.text,
              pageTitle: pageInfo.pageTitle,
              extractedAt: new Date().toISOString(),
              error: error.message,
            },
          };

          console.log(
            "ChronoClip: Using fallback result in catch:",
            fallbackResult
          );
          sendResponse({
            success: true,
            data: fallbackResult,
          });
        });
    } catch (error) {
      console.error("ChronoClip: Selection processing failed:", error);
      sendResponse({
        success: false,
        error: error.message || "選択範囲の処理でエラーが発生しました",
      });
    }

    return true; // 非同期レスポンス
  }
});

console.log("ChronoClip: Selection script loaded");
