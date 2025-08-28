// content/extractor.js
/**
 * @fileoverview イベント情報の自動抽出機能
 * 検出済みの日付要素の周辺コンテキストから、イベントのタイトルと詳細を自動抽出します。
 */

/**
 * 抽出オプションの型定義
 * @typedef {Object} ExtractOptions
 * @property {number} [maxChars=280] - 詳細の最大文字数
 * @property {number} [headingSearchDepth=3] - 見出し検索の深度
 * @property {boolean} [includeURL=true] - URLを詳細に含めるか
 * @property {string[]} [stopwords] - 除外する単語リスト
 */

/**
 * 抽出結果の型定義
 * @typedef {Object} ExtractResult
 * @property {string|null} title - 抽出されたタイトル
 * @property {string|null} description - 抽出された詳細
 * @property {number} confidence - 信頼度スコア (0-1)
 * @property {string[]} sources - 採用したDOMノードの識別情報
 */

// デフォルトのストップワード（日本語）
const DEFAULT_STOPWORDS_JA = [
  "Cookie",
  "クッキー",
  "利用規約",
  "プライバシー",
  "著作権",
  "ナビゲーション",
  "メニュー",
  "ログイン",
  "購読",
  "シェア",
  "広告",
  "同意",
  "お知らせ",
  "前のページへ",
  "次へ",
  "戻る",
  "TOP",
  "トップ",
  "ホーム",
  "サイトマップ",
  "フッター",
  "ヘッダー",
  "サイドバー",
  "検索",
  "RSS",
  "Twitter",
  "Facebook",
  "Instagram",
  "YouTube",
  "アクセス",
  "会社概要",
  "お問い合わせ",
  "採用情報",
  "個人情報保護方針",
  "免責事項",
  "このサイトについて",
  "English",
  "日本語",
  "中文",
  "한국어",
  "Deutsch",
  "Français",
  "Español",
  "Italiano",
  "Português",
  // ナビゲーション関連
  "スケジュール",
  "チケット",
  "チケット情報",
  "予約",
  "購入",
  "申し込み",
  "詳細",
  "詳細情報",
  "一覧",
  "リスト",
  "カレンダー",
  "Calendar",
  "Schedule",
  "Ticket",
  "Tickets",
  "Information",
  "Info",
  "Details",
  "List",
  "More",
  "View",
  "すべて",
  "全て",
  "もっと見る",
  "続きを読む",
  "Read More",
  "View All",
  "See More",
];

/**
 * テキストを正規化します
 * @param {string} text - 正規化するテキスト
 * @returns {string} 正規化されたテキスト
 */
function normalizeText(text) {
  if (!text) return "";

  return text
    .replace(/[\r\n\t]/g, " ") // 改行・タブを空白に変換
    .replace(/\s+/g, " ") // 連続する空白を1つに統合
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // 不可視文字を除去
    .trim(); // 前後の空白を除去
}

/**
 * 日本語の括弧書きや冗長な部分を圧縮します
 * @param {string} text - 処理するテキスト
 * @returns {string} 圧縮されたテキスト
 */
function compressJapaneseText(text) {
  if (!text) return "";

  // 括弧内の長い説明を短縮（20文字以上の括弧内容を省略）
  text = text.replace(/[（(]([^）)]{20,})[）)]/g, "(...)");
  text = text.replace(/【[^】]{20,}】/g, "【...】");
  text = text.replace(/\[[^\]]{20,}\]/g, "[...]");

  // 曜日や会場情報を分離（@や「at」で分割）
  const atMatch = text.match(/^(.+?)[@＠]\s*(.+)$/);
  if (atMatch) {
    return {
      title: normalizeText(atMatch[1]),
      location: normalizeText(atMatch[2]),
    };
  }

  const atEnglishMatch = text.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atEnglishMatch) {
    return {
      title: normalizeText(atEnglishMatch[1]),
      location: normalizeText(atEnglishMatch[2]),
    };
  }

  return normalizeText(text);
}

/**
 * 要素の簡易CSSパスを取得します（デバッグ用）
 * @param {Element} element - 対象要素
 * @returns {string} CSS識別子
 */
function getCssPath(element) {
  if (!element || !element.tagName) return "unknown";

  let path = element.tagName.toLowerCase();

  if (element.id) {
    path += `#${element.id}`;
  } else if (element.className) {
    const classes = element.className.split(" ").filter((c) => c.trim());
    if (classes.length > 0) {
      path += `.${classes.slice(0, 2).join(".")}`;
    }
  }

  return path;
}

/**
 * 最も近い見出し要素を検索します
 * @param {Element} element - 起点となる要素
 * @param {number} maxDepth - 検索する最大深度
 * @returns {Element|null} 見つかった見出し要素
 */
function findNearestHeading(element, maxDepth = 3) {
  let currentElement = element;
  let depth = 0;

  while (currentElement && depth < maxDepth) {
    // 現在の要素とその兄弟から見出しを探す
    const parent = currentElement.parentElement;
    if (parent) {
      // まず、特定のイベント関連セレクターで検索
      const eventSelectors = [
        "h1, h2, h3, h4, h5, h6",
        '[role="heading"]',
        ".title, .heading",
        ".event-title, .schedule-title, .match-title, .tournament-title",
        ".card-title, .item-title",
        '[class*="title"], [class*="heading"]',
        "[data-title]",
      ];

      for (const selector of eventSelectors) {
        const headings = parent.querySelectorAll(selector);
        for (let heading of headings) {
          const text = normalizeText(heading.textContent);
          if (text.length >= 3 && text.length <= 200) {
            // 日付要素の位置と見出しの位置関係を確認
            const headingPos = heading.compareDocumentPosition(element);

            // 見出しが日付より前にある、または同じコンテナ内にある場合
            if (
              headingPos & Node.DOCUMENT_POSITION_FOLLOWING ||
              headingPos & Node.DOCUMENT_POSITION_PRECEDING ||
              headingPos === 0
            ) {
              return heading;
            }
          }
        }
      }
    }

    // 同じレベルで汎用的に見出しを探す
    const headings = currentElement.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, [role="heading"], [class*="title"], [class*="heading"]'
    );

    for (let heading of headings) {
      const text = normalizeText(heading.textContent);
      if (text.length >= 3 && text.length <= 200) {
        return heading;
      }
    }

    // 親要素に移動
    currentElement = currentElement.parentElement;
    depth++;
  }

  // より広範囲でコンテナレベルの見出しを探す
  const containers = [
    element.closest("article"),
    element.closest("section"),
    element.closest(".event"),
    element.closest(".schedule-item"),
    element.closest(".match"),
    element.closest(".card"),
    element.closest(".item"),
    element.closest('[class*="event"]'),
    element.closest('[class*="schedule"]'),
    element.closest('[class*="match"]'),
  ].filter(Boolean);

  for (const container of containers) {
    const heading = container.querySelector(
      "h1, h2, h3, h4, h5, h6, .title, .heading, .event-title, .schedule-title, .match-title"
    );
    if (heading) {
      const text = normalizeText(heading.textContent);
      if (text.length >= 3 && text.length <= 200) {
        return heading;
      }
    }
  }

  // 最後の手段：ページタイトルに近い要素
  const pageHeadings = document.querySelectorAll("h1");
  if (pageHeadings.length > 0) {
    const text = normalizeText(pageHeadings[0].textContent);
    if (text.length >= 3 && text.length <= 200) {
      return pageHeadings[0];
    }
  }

  return null;
}

/**
 * 兄弟要素から段落を収集します
 * @param {Element} element - 起点となる要素
 * @param {Object} range - 収集範囲 {before: number, after: number}
 * @returns {string[]} 収集されたテキストの配列
 */
function collectSiblingParagraphs(element, range = { before: 1, after: 2 }) {
  const texts = [];
  const parent = element.parentElement;
  if (!parent) return texts;

  const siblings = Array.from(parent.children);
  const currentIndex = siblings.indexOf(element);

  // 前の兄弟要素
  for (
    let i = Math.max(0, currentIndex - range.before);
    i < currentIndex;
    i++
  ) {
    const text = normalizeText(siblings[i].textContent);
    if (text.length > 10 && text.length < 500) {
      texts.push(text);
    }
  }

  // 後の兄弟要素
  for (
    let i = currentIndex + 1;
    i <= Math.min(siblings.length - 1, currentIndex + range.after);
    i++
  ) {
    const text = normalizeText(siblings[i].textContent);
    if (text.length > 10 && text.length < 500) {
      texts.push(text);
    }
  }

  return texts;
}

/**
 * ストップワードに基づいてテキストをフィルタリングします
 * @param {string} text - フィルタリングするテキスト
 * @param {string[]} stopwords - ストップワード配列
 * @returns {boolean} true: テキストが有効, false: ノイズと判定
 */
function isValidText(text, stopwords) {
  if (!text || text.length < 3) return false;

  const lowerText = text.toLowerCase();

  // ストップワードチェック
  for (let stopword of stopwords) {
    if (lowerText.includes(stopword.toLowerCase())) {
      return false;
    }
  }

  // URL、メール、電話番号の過度な含有チェック
  const urlCount = (text.match(/https?:\/\/\S+/g) || []).length;
  const emailCount = (text.match(/\S+@\S+\.\S+/g) || []).length;
  const phoneCount = (text.match(/\d{2,4}-\d{2,4}-\d{4}/g) || []).length;

  if (urlCount > 2 || emailCount > 2 || phoneCount > 2) {
    return false;
  }

  return true;
}

/**
 * タイトル候補をスコアリングします
 * @param {string} text - 評価するテキスト
 * @param {string} source - ソースの種類（heading, emphasis, nearby, fallback）
 * @returns {number} スコア（0-1）
 */
function scoreTitleCandidate(text, source) {
  if (!text) return 0;

  let score = 0;

  // ソースによる基本スコア
  switch (source) {
    case "heading":
      score += 0.6;
      break;
    case "emphasis":
      score += 0.4;
      break;
    case "nearby":
      score += 0.3;
      break;
    case "fallback":
      score += 0.2;
      break;
  }

  // テキストの品質による調整
  const normalizedText = normalizeText(text);

  // 理想的な長さの場合は加点（10-50文字）
  if (normalizedText.length >= 10 && normalizedText.length <= 50) {
    score += 0.2;
  } else if (normalizedText.length >= 5 && normalizedText.length <= 100) {
    score += 0.1;
  } else if (normalizedText.length < 3 || normalizedText.length > 200) {
    score -= 0.3;
  }

  // イベント関連のキーワードがある場合は加点
  const eventKeywords = [
    "大会",
    "試合",
    "興行",
    "フェス",
    "コンサート",
    "イベント",
    "セミナー",
    "会議",
    "ライブ",
    "ショー",
    "発表",
    "展示",
    "祭り",
    "祭",
    "フェア",
    "コンペ",
    "カップ",
    "リーグ",
    "トーナメント",
    "選手権",
    "チャンピオン",
    "バトル",
    "マッチ",
    "Conference",
    "Live",
    "Show",
    "Event",
    "Match",
    "Battle",
    "Tournament",
    "記念",
    "周年",
    "Special",
    "Premium",
    "Deluxe",
    "Final",
  ];

  for (const keyword of eventKeywords) {
    if (normalizedText.includes(keyword)) {
      score += 0.15;
      break; // 複数ヒットしても一度だけ加点
    }
  }

  // 年月日が含まれている場合は減点（タイトルではなく日付情報の可能性）
  if (/\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}/.test(normalizedText)) {
    score -= 0.2;
  }

  // ナビゲーション用語の場合は大幅減点
  const navKeywords = [
    "ナビゲーション",
    "メニュー",
    "ヘッダー",
    "フッター",
    "サイドバー",
    "ログイン",
    "検索",
    "トップページ",
    "ホーム",
    "戻る",
    "次へ",
    "前へ",
    "Navigation",
    "Menu",
    "Header",
    "Footer",
    "Sidebar",
    "Login",
    "Search",
  ];

  for (const keyword of navKeywords) {
    if (normalizedText.includes(keyword)) {
      score -= 0.4;
      break;
    }
  }

  // 英数字のみの場合は少し減点
  if (
    /^[a-zA-Z0-9\s\-_]+$/.test(normalizedText) &&
    normalizedText.length < 20
  ) {
    score -= 0.1;
  }

  // 自然な文の終端がある場合は加点
  if (/[。.!?]$/.test(normalizedText)) {
    score += 0.1;
  }

  // 大文字が多すぎる場合は減点
  const upperCount = (normalizedText.match(/[A-Z]/g) || []).length;
  if (upperCount > normalizedText.length * 0.5) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * 詳細候補をスコアリングします
 * @param {string} text - 評価するテキスト
 * @param {string[]} stopwords - ストップワード
 * @returns {number} スコア（0-1）
 */
function scoreDescriptionCandidate(text, stopwords) {
  if (!text) return 0;

  let score = 0.5; // 基本スコア

  // 箇条書きや自然な文終端がある場合は加点
  if (/[。.!?]/.test(text) || /・/.test(text)) {
    score += 0.2;
  }

  // ノイズ語を含む場合は減点
  if (!isValidText(text, stopwords)) {
    score -= 0.3;
  }

  // 適切な長さの場合は加点
  if (text.length >= 20 && text.length <= 200) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * 日付要素の周辺コンテキストからイベント情報を抽出します
 * @param {HTMLElement} dateElement - 日付要素
 * @param {ExtractOptions} [options={}] - 抽出オプション
 * @returns {ExtractResult} 抽出結果
 */
function extractEventContext(dateElement, options = {}) {
  // デフォルトオプション
  const opts = {
    maxChars: 280,
    headingSearchDepth: 3,
    includeURL: true,
    stopwords: DEFAULT_STOPWORDS_JA,
    ...options,
  };

  const result = {
    title: null,
    description: null,
    confidence: 0,
    sources: [],
  };

  try {
    // タイトル抽出の試行
    const titleCandidates = [];

    // 1. 近傍見出しの探索
    const nearestHeading = findNearestHeading(
      dateElement,
      opts.headingSearchDepth
    );
    if (nearestHeading) {
      const headingText = normalizeText(nearestHeading.textContent);
      if (headingText && isValidText(headingText, opts.stopwords)) {
        const compressed = compressJapaneseText(headingText);
        const titleText =
          typeof compressed === "object" ? compressed.title : compressed;

        titleCandidates.push({
          text: titleText,
          score: scoreTitleCandidate(titleText, "heading"),
          source: getCssPath(nearestHeading),
        });
      }
    }

    // 2. 同階層の強調テキスト
    const parent = dateElement.closest(
      "article, section, div, li, p, .event, .schedule-item, .match, .card"
    );
    if (parent) {
      const emphasisSelectors = [
        "strong, b, em, mark",
        ".title, .heading",
        ".event-title, .schedule-title, .match-title, .tournament-title",
        ".card-title, .item-title",
        "[class*='title'], [class*='heading']",
        "a[class*='title'], a[class*='link']",
        ".name, .event-name",
      ];

      for (const selector of emphasisSelectors) {
        const emphasisElements = parent.querySelectorAll(selector);
        for (let elem of emphasisElements) {
          const emphasisText = normalizeText(elem.textContent);
          if (emphasisText && isValidText(emphasisText, opts.stopwords)) {
            const compressed = compressJapaneseText(emphasisText);
            const titleText =
              typeof compressed === "object" ? compressed.title : compressed;

            // 日付要素と近い場合はスコアを上げる
            let baseScore = scoreTitleCandidate(titleText, "emphasis");
            const distance = Math.abs(
              elem.getBoundingClientRect().top -
                dateElement.getBoundingClientRect().top
            );
            if (distance < 100) {
              // 100px以内の場合
              baseScore += 0.1;
            }

            titleCandidates.push({
              text: titleText,
              score: Math.min(1, baseScore),
              source: getCssPath(elem),
            });
          }
        }
      }
    }

    // 3. 近接テキストからの抽出
    const siblingTexts = collectSiblingParagraphs(dateElement);
    for (let siblingText of siblingTexts) {
      if (isValidText(siblingText, opts.stopwords)) {
        // 文頭の名詞句を抽出（最初の句点まで、または50文字まで）
        const firstSentence = siblingText.split(/[。.!?]/)[0];
        const titleText =
          firstSentence.length > 50
            ? firstSentence.substring(0, 50) + "..."
            : firstSentence;

        titleCandidates.push({
          text: normalizeText(titleText),
          score: scoreTitleCandidate(titleText, "nearby"),
          source: "sibling-text",
        });
      }
    }

    // 4. ページタイトルフォールバック
    if (document.title) {
      let pageTitle = document.title;
      // 一般的なサイト名やノイズを除去
      pageTitle = pageTitle.replace(/\s*[-|｜]\s*.+$/, ""); // 「- サイト名」形式を除去
      pageTitle = normalizeText(pageTitle);

      if (pageTitle && isValidText(pageTitle, opts.stopwords)) {
        titleCandidates.push({
          text: pageTitle,
          score: scoreTitleCandidate(pageTitle, "fallback"),
          source: "document.title",
        });
      }
    }

    // 最高スコアのタイトルを選択
    if (titleCandidates.length > 0) {
      titleCandidates.sort((a, b) => b.score - a.score);
      const bestTitle = titleCandidates[0];
      result.title = bestTitle.text;
      result.sources.push(bestTitle.source);
      result.confidence = bestTitle.score;
    }

    // 詳細抽出
    const descriptionParts = [];

    // 親ブロックのテキスト収集
    const parentBlock = dateElement.closest("article, section, li, div, p");
    if (parentBlock) {
      const blockText = normalizeText(parentBlock.textContent);
      if (blockText && isValidText(blockText, opts.stopwords)) {
        descriptionParts.push(blockText);
      }
    }

    // 兄弟要素のテキスト収集
    const siblingTexts2 = collectSiblingParagraphs(dateElement, {
      before: 1,
      after: 2,
    });
    descriptionParts.push(
      ...siblingTexts2.filter((text) => isValidText(text, opts.stopwords))
    );

    // 詳細テキストの結合と整形
    if (descriptionParts.length > 0) {
      let description = descriptionParts.slice(0, 3).join("。"); // 最大3つまで結合

      // 最大文字数でトリミング
      if (description.length > opts.maxChars) {
        description = description.substring(0, opts.maxChars - 3) + "...";
      }

      // URLを追記
      if (opts.includeURL) {
        description += `\nURL: ${window.location.href}`;
      }

      result.description = description;
      result.sources.push("context-paragraphs");

      // 詳細のスコアも考慮
      const descScore = scoreDescriptionCandidate(description, opts.stopwords);
      result.confidence = (result.confidence + descScore) / 2;
    }

    // 最終的な信頼度の調整
    result.confidence = Math.max(0, Math.min(1, result.confidence));
  } catch (error) {
    console.error("ChronoClip: Error in extractEventContext:", error);
    // エラー時はフォールバック
    result.title = document.title
      ? normalizeText(document.title.split(/[-|｜]/)[0])
      : null;
    result.description = `エラーが発生しました。\nURL: ${window.location.href}`;
    result.confidence = 0.1;
    result.sources = ["error-fallback"];
  }

  return result;
}

// エクスポート
if (typeof module !== "undefined" && module.exports) {
  // Node.js環境（テスト用）
  module.exports = {
    extractEventContext,
    normalizeText,
    compressJapaneseText,
    findNearestHeading,
    collectSiblingParagraphs,
    getCssPath,
    isValidText,
    scoreTitleCandidate,
    scoreDescriptionCandidate,
    DEFAULT_STOPWORDS_JA,
  };
} else {
  // ブラウザ環境
  window.ChronoClipExtractor = {
    extractEventContext,
    normalizeText,
    compressJapaneseText,
    findNearestHeading,
    collectSiblingParagraphs,
    getCssPath,
    isValidText,
    scoreTitleCandidate,
    scoreDescriptionCandidate,
    DEFAULT_STOPWORDS_JA,
  };
}
