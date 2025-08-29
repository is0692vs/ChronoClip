/**
 * 日付・時刻抽出機能のテスト用スクリプト
 * ブラウザのコンソールで実行してテストする
 */

// テストケース
const testCases = [
  "2025年10月11日 (土) 15:00 開場16:00 開始",
  "2025年8月27日（水）",
  "2025年9月15日 14:30",
  "2025年12月25日(火) 18:00",
  "2025年1月1日",
  "8月27日 18:00",
  "9月1日のイベント",
  "明日の予定",
];

// date-parser.jsの関数が利用可能かチェック
if (typeof parseDate !== "undefined") {
  console.log("=== 日付・時刻抽出テスト ===");

  testCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. テストケース: "${testCase}"`);

    try {
      const result = parseDate(testCase);
      if (result) {
        console.log("✅ 抽出成功:", {
          type: result.type,
          confidence: result.confidence,
          source: result.source,
          start: result.start,
          end: result.end,
        });
      } else {
        console.log("❌ 抽出失敗: null");
      }
    } catch (error) {
      console.log("❌ エラー:", error.message);
    }
  });
} else {
  console.log(
    "❌ parseDate関数が見つかりません。date-parser.jsが読み込まれているか確認してください。"
  );
}
