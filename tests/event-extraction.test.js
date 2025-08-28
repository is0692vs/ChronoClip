// tests/event-extraction.test.js
/**
 * @fileoverview イベント情報自動抽出機能のテストスイート
 * JSDOM環境でのユニットテストを実装
 */

// Node.js環境での実行時のみJSDOMを使用
let window, document, Node;
if (typeof global !== "undefined") {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
    <head><title>Test Page - サイト名</title></head>
    <body>
      <div id="test-container"></div>
    </body>
    </html>
  `);
  window = dom.window;
  document = window.document;
  Node = window.Node;
  global.window = window;
  global.document = document;
}

// extractorモジュールの読み込み
const extractor = require("../content/extractor.js");
const {
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
} = extractor;

/**
 * テストヘルパー: HTMLから要素を作成
 */
function createTestElement(html) {
  const container = document.getElementById("test-container");
  container.innerHTML = html;
  return container;
}

/**
 * テストヘルパー: テスト後のクリーンアップ
 */
function cleanup() {
  const container = document.getElementById("test-container");
  if (container) {
    container.innerHTML = "";
  }
}

/**
 * テストケース1: 見出し直下に日付がある記事
 */
function testHeadingWithDate() {
  console.log("Testing: 見出し直下に日付がある記事");

  const html = `
    <article>
      <h2>夏の大会 2025</h2>
      <p>開催日: <span class="chronoclip-date" data-normalized-date="2025-08-27">8月27日(水)</span></p>
      <p>会場: 東京ドーム 開場17:00 開演18:00</p>
      <ul>
        <li>第1試合: チームA vs チームB</li>
        <li>第2試合: チームC vs チームD</li>
      </ul>
    </article>
  `;

  const container = createTestElement(html);
  const dateElement = container.querySelector(".chronoclip-date");

  const result = extractEventContext(dateElement, { includeURL: false });

  console.log("Result:", result);
  console.assert(result.title !== null, "タイトルが抽出されていない");
  console.assert(
    result.title.includes("夏の大会"),
    `期待されるタイトルが含まれていない: ${result.title}`
  );
  console.assert(
    result.confidence > 0.5,
    `信頼度が低すぎる: ${result.confidence}`
  );
  console.assert(result.description !== null, "詳細が抽出されていない");

  cleanup();
  console.log("✓ テスト1合格\n");
}

/**
 * テストケース2: 箇条書きのイベント一覧
 */
function testListEvents() {
  console.log("Testing: 箇条書きのイベント一覧");

  const html = `
    <div class="event-list">
      <h3>今月のイベント</h3>
      <ul>
        <li>
          <strong>プロジェクト発表会</strong>
          <span class="chronoclip-date" data-normalized-date="2025-08-28">8月28日</span>
          <p>各チームの成果発表と質疑応答を行います。</p>
        </li>
        <li>
          <strong>懇親会</strong>
          <span class="chronoclip-date" data-normalized-date="2025-08-29">8月29日</span>
          <p>発表会後の懇親会です。お疲れ様でした！</p>
        </li>
      </ul>
    </div>
  `;

  const container = createTestElement(html);
  const dateElements = container.querySelectorAll(".chronoclip-date");

  // 最初のイベント（プロジェクト発表会）をテスト
  const result1 = extractEventContext(dateElements[0], { includeURL: false });

  console.log("Result1:", result1);
  console.assert(result1.title !== null, "タイトルが抽出されていない");
  console.assert(
    result1.title.includes("プロジェクト発表会"),
    `期待されるタイトルが含まれていない: ${result1.title}`
  );
  console.assert(
    result1.description.includes("発表"),
    `期待される詳細が含まれていない: ${result1.description}`
  );

  cleanup();
  console.log("✓ テスト2合格\n");
}

/**
 * テストケース3: 日付とタイトルが離れているケース
 */
function testSeparatedElements() {
  console.log("Testing: 日付とタイトルが別DOMに離れているケース");

  const html = `
    <div class="news-article">
      <header>
        <h1>重要なお知らせ</h1>
        <div class="meta">
          投稿日: <span class="chronoclip-date" data-normalized-date="2025-08-27">2025年8月27日</span>
        </div>
      </header>
      <div class="content">
        <p>システムメンテナンスのため、一時的にサービスを停止いたします。</p>
        <p>ご迷惑をおかけしますが、よろしくお願いいたします。</p>
      </div>
    </div>
  `;

  const container = createTestElement(html);
  const dateElement = container.querySelector(".chronoclip-date");

  const result = extractEventContext(dateElement, { includeURL: false });

  console.log("Result:", result);
  console.assert(result.title !== null, "タイトルが抽出されていない");
  console.assert(
    result.title.includes("重要なお知らせ"),
    `期待されるタイトルが含まれていない: ${result.title}`
  );

  cleanup();
  console.log("✓ テスト3合格\n");
}

/**
 * テストケース4: ナビゲーションやフッターが近いノイズの多いページ
 */
function testNoisyPage() {
  console.log("Testing: ナビゲーションやフッターが近いノイズの多いページ");

  const html = `
    <nav>
      <a href="/">ホーム</a>
      <a href="/about">会社概要</a>
      <a href="/contact">お問い合わせ</a>
    </nav>
    <main>
      <article>
        <h2>セミナー開催のお知らせ</h2>
        <p>日時: <span class="chronoclip-date" data-normalized-date="2025-09-15">9月15日(日)</span> 14:00-16:00</p>
        <p>場所: 弊社会議室A</p>
      </article>
    </main>
    <footer>
      <p>© 2025 Company. All rights reserved.</p>
      <p>プライバシー | 利用規約 | Cookie</p>
    </footer>
  `;

  const container = createTestElement(html);
  const dateElement = container.querySelector(".chronoclip-date");

  const result = extractEventContext(dateElement, { includeURL: false });

  console.log("Result:", result);
  console.assert(result.title !== null, "タイトルが抽出されていない");
  console.assert(
    result.title.includes("セミナー"),
    `期待されるタイトルが含まれていない: ${result.title}`
  );
  console.assert(
    !result.title.includes("ホーム"),
    "ナビゲーションのノイズが混入している"
  );
  console.assert(
    !result.description.includes("© 2025"),
    "フッターのノイズが混入している"
  );

  cleanup();
  console.log("✓ テスト4合格\n");
}

/**
 * テストケース5: 英語UIページ
 */
function testEnglishPage() {
  console.log("Testing: 英語UIページ");

  // ページタイトルを英語に変更
  document.title = "Summer Conference 2025 - Event Site";

  const html = `
    <div class="event-details">
      <h1>Summer Tech Conference</h1>
      <p>Date: <span class="chronoclip-date" data-normalized-date="2025-08-27">Aug 27, 2025</span></p>
      <p>Location: Tech Center Hall</p>
      <p>Join us for an exciting day of technology presentations and networking.</p>
    </div>
  `;

  const container = createTestElement(html);
  const dateElement = container.querySelector(".chronoclip-date");

  const result = extractEventContext(dateElement, { includeURL: false });

  console.log("Result:", result);
  console.assert(result.title !== null, "タイトルが抽出されていない");
  console.assert(
    result.title.includes("Conference"),
    `期待されるタイトルが含まれていない: ${result.title}`
  );

  cleanup();
  console.log("✓ テスト5合格\n");
}

/**
 * テストケース6: 抽出不可時のフォールバック
 */
function testFallback() {
  console.log("Testing: 抽出不可時のフォールバック");

  document.title = "テストページ - サンプルサイト";

  const html = `
    <div>
      <span class="chronoclip-date" data-normalized-date="2025-08-27">8月27日</span>
    </div>
  `;

  const container = createTestElement(html);
  const dateElement = container.querySelector(".chronoclip-date");

  const result = extractEventContext(dateElement, { includeURL: false });

  console.log("Result:", result);
  console.assert(
    result.title !== null,
    "フォールバックタイトルが設定されていない"
  );
  console.assert(
    result.title.includes("テストページ"),
    `期待されるフォールバックタイトルが含まれていない: ${result.title}`
  );
  console.assert(result.confidence > 0, "信頼度が0以下");

  cleanup();
  console.log("✓ テスト6合格\n");
}

/**
 * テストケース7: 280文字超の詳細が省略される
 */
function testLongDescription() {
  console.log("Testing: 280文字超の詳細が省略される");

  const longText = "これは非常に長い説明文です。".repeat(30); // 約300文字

  const html = `
    <article>
      <h2>長文イベント</h2>
      <p>日付: <span class="chronoclip-date" data-normalized-date="2025-08-27">8月27日</span></p>
      <p>${longText}</p>
    </article>
  `;

  const container = createTestElement(html);
  const dateElement = container.querySelector(".chronoclip-date");

  const result = extractEventContext(dateElement, {
    maxChars: 280,
    includeURL: false,
  });

  console.log(
    "Result description length:",
    result.description ? result.description.length : 0
  );
  console.assert(result.description !== null, "詳細が抽出されていない");
  console.assert(
    result.description.length <= 280,
    `詳細が280文字を超えている: ${result.description.length}`
  );
  console.assert(result.description.endsWith("..."), "省略記号が付いていない");

  cleanup();
  console.log("✓ テスト7合格\n");
}

/**
 * ユーティリティ関数のテスト
 */
function testUtilityFunctions() {
  console.log("Testing: ユーティリティ関数");

  // normalizeText のテスト
  const normalizedText = normalizeText("  test\n\ntext  \t  ");
  console.assert(
    normalizedText === "test text",
    `正規化が正しくない: "${normalizedText}"`
  );

  // compressJapaneseText のテスト
  const compressed = compressJapaneseText("イベント名 @ 会場名");
  console.assert(
    typeof compressed === "object",
    "日本語圧縮の結果が期待と異なる"
  );
  console.assert(
    compressed.title === "イベント名",
    `タイトル部分が正しくない: ${compressed.title}`
  );
  console.assert(
    compressed.location === "会場名",
    `場所部分が正しくない: ${compressed.location}`
  );

  // scoreTitleCandidate のテスト
  const headingScore = scoreTitleCandidate("イベント名", "heading");
  const fallbackScore = scoreTitleCandidate("ページタイトル", "fallback");
  console.assert(
    headingScore > fallbackScore,
    `見出しのスコアがフォールバックより低い: ${headingScore} vs ${fallbackScore}`
  );

  // isValidText のテスト
  const validText = isValidText("正常なテキスト", DEFAULT_STOPWORDS_JA);
  const invalidText = isValidText("Cookie利用規約", DEFAULT_STOPWORDS_JA);
  console.assert(validText === true, "正常なテキストが無効と判定された");
  console.assert(
    invalidText === false,
    "ストップワードを含むテキストが有効と判定された"
  );

  console.log("✓ ユーティリティ関数テスト合格\n");
}

/**
 * メインテスト実行
 */
function runTests() {
  console.log("=== ChronoClip イベント抽出機能テスト開始 ===\n");

  try {
    testUtilityFunctions();
    testHeadingWithDate();
    testListEvents();
    testSeparatedElements();
    testNoisyPage();
    testEnglishPage();
    testFallback();
    testLongDescription();

    console.log("=== 全テスト合格！ ===");
  } catch (error) {
    console.error("テスト失敗:", error);
    console.log("=== テスト失敗 ===");
  }
}

// Node.js環境でのテスト実行
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    runTests,
    testHeadingWithDate,
    testListEvents,
    testSeparatedElements,
    testNoisyPage,
    testEnglishPage,
    testFallback,
    testLongDescription,
    testUtilityFunctions,
  };

  // このファイルが直接実行された場合
  if (require.main === module) {
    runTests();
  }
}
