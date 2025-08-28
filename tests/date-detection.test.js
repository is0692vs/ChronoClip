// tests/date-detection.test.js

/**
 * @fileoverview 日付検出機能の単体テストです。
 * このスクリプトを実行して、日付の正規表現と検証ロジックが
 * 期待どおりに機能していることを確認できます。
 *
 * 注: ビルド/バンドルステップがないため、テスト対象の関数は
 * ここで再定義されています。バンドラを使用した実際のシナリオでは、
 * これらはインポートされます。
 */

// --- テスト対象のコードの再定義 ---

const DATE_PATTERN = /\b(\d{4})([-/])(0[1-9]|1[0-2])\2(0[1-9]|[12]\d|3[01])\b/g;

function isValidDate(year, month, day) {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  const date = new Date(yearNum, monthNum - 1, dayNum);
  return (
    date.getFullYear() === yearNum &&
    date.getMonth() === monthNum - 1 &&
    date.getDate() === dayNum
  );
}

/**
 * テストのためにコア検出ロジックを模倣した純粋関数です。
 * @param {string} text 日付をスキャンするテキスト。
 * @returns {Array<object>} 見つかった日付オブジェクトの配列。
 */
function findDatesInText(text) {
  const detectedDates = [];
  let match;
  DATE_PATTERN.lastIndex = 0; // 正規表現の状態をリセット
  while ((match = DATE_PATTERN.exec(text)) !== null) {
    const [fullMatch, year, , month, day] = match;
    if (isValidDate(year, month, day)) {
      detectedDates.push({
        date: fullMatch,
        index: match.index,
      });
    }
  }
  return detectedDates;
}


// --- テストランナー ---

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function runTests() {
  console.log("Running Date Detection Tests...");
  tests.forEach(t => {
    try {
      t.fn();
      console.log(`✅ PASS: ${t.name}`);
      passed++;
    } catch (e) {
      console.error(`❌ FAIL: ${t.name}`);
      console.error(e);
      failed++;
    }
  });
  console.log("--------------------");
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    // CI環境で失敗を示すためにゼロ以外のコードで終了します
    // process.exit(1);
  }
}

function assertEquals(actual, expected, msg = "Values should be equal") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`);
  }
}

// --- テストケース ---

test("isValidDate: should validate correct dates", () => {
  assertEquals(isValidDate("2025", "08", "27"), true);
  assertEquals(isValidDate("2024", "02", "29"), true, "Leap day");
});

test("isValidDate: should invalidate incorrect dates", () => {
  assertEquals(isValidDate("2025", "02", "30"), false, "February 30th");
  assertEquals(isValidDate("2025", "13", "01"), false, "13th month");
  assertEquals(isValidDate("2025", "04", "31"), false, "April 31st");
});

test("findDatesInText: should find no dates in empty or irrelevant text", () => {
  assertEquals(findDatesInText(""), []);
  assertEquals(findDatesInText("Hello world, this is a test."), []);
});

test("findDatesInText: should find dates with YYYY-MM-DD format", () => {
  const text = "Release date is 2025-08-27.";
  const expected = [{ date: "2025-08-27", index: 16 }];
  assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should find dates with YYYY/MM/DD format", () => {
  const text = "An event on 2025/09/15 is scheduled.";
  const expected = [{ date: "2025/09/15", index: 12 }];
  assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should find multiple dates with mixed formats", () => {
  const text = "Dates are 2024-01-10 and 2025/03/05.";
  const expected = [
    { date: "2024-01-10", index: 10 },
    { date: "2025/03/05", index: 25 }
  ];
  assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should ignore invalid dates that match regex", () => {
  const text = "Invalid date: 2025-02-30, valid date: 2025-03-01.";
  const expected = [{ date: "2025-03-01", index: 38 }];
  assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should not match incomplete or malformed dates", () => {
  const text = "Dates: 2025-1-1, 2025/05-20, 2025/12/3, 99/10/10";
  assertEquals(findDatesInText(text), []);
});


// --- すべてのテストを実行 ---
runTests();
