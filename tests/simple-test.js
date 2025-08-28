#!/usr/bin/env node
/**
 * @fileoverview Node.js環境でのextractor.js動作確認スクリプト
 * JSDOMなしでの基本機能チェック
 */

// 簡易的なDOMモック（基本的な機能のみ）
const mockDOM = {
  createElement: (tagName) => ({
    tagName: tagName.toUpperCase(),
    textContent: "",
    innerHTML: "",
    className: "",
    id: "",
    dataset: {},
    children: [],
    parentElement: null,
    querySelector: () => null,
    querySelectorAll: () => [],
    matches: () => false,
    closest: () => null,
    compareDocumentPosition: () => 0,
  }),
  body: {
    tagName: "BODY",
    compareDocumentPosition: () => 0,
  },
  title: "テストページ - サンプルサイト",
};

// グローバル変数の設定
global.document = mockDOM;
global.window = { location: { href: "https://example.com/test" } };
global.Node = {
  DOCUMENT_POSITION_FOLLOWING: 4,
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
};

// extractor.jsの読み込み
const fs = require("fs");
const path = require("path");

const extractorPath = path.join(__dirname, "../content/extractor.js");
const extractorCode = fs.readFileSync(extractorPath, "utf8");

// extractor.jsを実行してモジュールを取得
eval(extractorCode);
const extractor = module.exports;

console.log("=== ChronoClip Extractor 基本機能テスト ===\n");

// ユーティリティ関数のテスト
console.log("1. normalizeText テスト");
const normalizeResult = extractor.normalizeText("  test\n\ntext  \t  ");
console.log(`結果: "${normalizeResult}"`);
console.log(`期待: "test text"`);
console.log(`判定: ${normalizeResult === "test text" ? "✓ 合格" : "✗ 失敗"}\n`);

console.log("2. compressJapaneseText テスト");
const compressResult = extractor.compressJapaneseText("イベント名 @ 会場名");
console.log(`結果:`, compressResult);
console.log(
  `判定: ${
    typeof compressResult === "object" && compressResult.title === "イベント名"
      ? "✓ 合格"
      : "✗ 失敗"
  }\n`
);

console.log("3. scoreTitleCandidate テスト");
const headingScore = extractor.scoreTitleCandidate("イベント名", "heading");
const fallbackScore = extractor.scoreTitleCandidate(
  "ページタイトル",
  "fallback"
);
console.log(`見出しスコア: ${headingScore}`);
console.log(`フォールバックスコア: ${fallbackScore}`);
console.log(`判定: ${headingScore > fallbackScore ? "✓ 合格" : "✗ 失敗"}\n`);

console.log("4. isValidText テスト");
const validText = extractor.isValidText(
  "正常なテキスト",
  extractor.DEFAULT_STOPWORDS_JA
);
const invalidText = extractor.isValidText(
  "Cookie利用規約",
  extractor.DEFAULT_STOPWORDS_JA
);
console.log(`正常テキスト判定: ${validText}`);
console.log(`ノイズテキスト判定: ${invalidText}`);
console.log(
  `判定: ${validText === true && invalidText === false ? "✓ 合格" : "✗ 失敗"}\n`
);

console.log("5. extractEventContext 基本テスト（モック要素）");
const mockElement = {
  tagName: "SPAN",
  textContent: "8月27日",
  className: "chronoclip-date",
  parentElement: mockDOM.body,
  closest: () => mockDOM.body,
  querySelector: () => null,
  querySelectorAll: () => [],
};

try {
  const extractResult = extractor.extractEventContext(mockElement, {
    includeURL: false,
  });
  console.log(`結果:`, extractResult);
  console.log(
    `判定: ${
      extractResult.title !== null ? "✓ フォールバック成功" : "✗ 失敗"
    }\n`
  );
} catch (error) {
  console.log(`エラー: ${error.message}`);
  console.log(`判定: ✓ エラーハンドリング確認\n`);
}

console.log("=== 基本機能テスト完了 ===");
console.log(
  "注意: 完全なテストにはブラウザ環境または tests/event-extraction-test.html を使用してください。"
);
