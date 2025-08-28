// tests/date-detection.test.js

/**
 * @fileoverview Unit tests for the date detection functionality.
 */

// --- Redefinition of code to be tested ---
// In a real project with a build system, these would be imports.

const ChronoClip = {};

// From regex-patterns.js
ChronoClip.DATE_PATTERN = /\b(\d{4})([-\/])(0[1-9]|1[0-2])\2(0[1-9]|[12]\d|3[01])\b/g;
ChronoClip.WAREKI_DATE_PATTERN = /(令和|平成|昭和|大正)(\d{1,2}|元)年\s*(\d{1,2})月\s*(\d{1,2})日/g;
ChronoClip.MONTH_DAY_DATE_PATTERN = /(\d{1,2})月\s*(\d{1,2})日(?:\s*[(（][月火水木金土日][)）])?/g;
ChronoClip.JA_YYYY_MM_DD_PATTERN = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;

// From date-utils.js
ChronoClip.isValidDate = function(year, month, day) {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  if (monthNum <= 0 || dayNum <= 0) return false;
  const date = new Date(yearNum, monthNum - 1, dayNum);
  return date.getFullYear() === yearNum && date.getMonth() === monthNum - 1 && date.getDate() === dayNum;
};
ChronoClip.ERA_START_YEARS = { "令和": 2018, "平成": 1988, "昭和": 1925, "大正": 1911 };
ChronoClip.convertWarekiToGregorianYear = function(era, eraYearStr) {
  const baseYear = ChronoClip.ERA_START_YEARS[era];
  if (baseYear === undefined) return null;
  const eraYear = (eraYearStr === "元") ? 1 : parseInt(eraYearStr, 10);
  if (isNaN(eraYear)) return null;
  return baseYear + eraYear;
};
ChronoClip.resolveYearForMonthDay = function(month, day) {
  const mockDate = new Date(2025, 3, 1); // April 1, 2025
  const currentYear = mockDate.getFullYear();
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  let candidateDate = new Date(currentYear, monthNum - 1, dayNum);
  mockDate.setHours(0, 0, 0, 0);
  if (candidateDate < mockDate) {
    candidateDate.setFullYear(currentYear + 1);
  }
  return candidateDate;
};

// --- Test version of the main detection logic ---

const {
  isValidDate,
  convertWarekiToGregorianYear,
  resolveYearForMonthDay,
  DATE_PATTERN,
  WAREKI_DATE_PATTERN,
  MONTH_DAY_DATE_PATTERN,
  JA_YYYY_MM_DD_PATTERN
} = ChronoClip;

const detectors = [
    { name: "YYYY-MM-DD or YYYY/MM/DD", pattern: DATE_PATTERN, handler: (match) => {
        const [, year, , month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
    }},
    { name: "YYYY年M月D日 (JA)", pattern: JA_YYYY_MM_DD_PATTERN, handler: (match) => {
        const [, year, month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
    }},
    { name: "和暦 (Wareki)", pattern: WAREKI_DATE_PATTERN, handler: (match) => {
        const [, era, eraYearStr, month, day] = match;
        const year = convertWarekiToGregorianYear(era, eraYearStr);
        if (year && isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
    }},
    { name: "月日 (Month-Day)", pattern: MONTH_DAY_DATE_PATTERN, handler: (match) => {
        const [, month, day] = match;
        const resolvedDate = resolveYearForMonthDay(month, day);
        if (isValidDate(resolvedDate.getFullYear(), resolvedDate.getMonth() + 1, resolvedDate.getDate())) {
          const year = resolvedDate.getFullYear();
          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
    }}
];

function findDatesInText(text) {
    let allMatches = [];
    detectors.forEach(detector => {
      let match;
      detector.pattern.lastIndex = 0;
      while ((match = detector.pattern.exec(text)) !== null) {
        const result = detector.handler(match);
        if (result) {
          allMatches.push({
            date: result.normalizedDate,
            original: result.original,
            index: match.index,
            detector: detector.name,
            endIndex: match.index + result.original.length
          });
        }
      }
    });

    allMatches.sort((a, b) => a.index - b.index);

    const finalDates = [];
    let lastEndIndex = -1;

    allMatches.forEach(match => {
      if (match.index >= lastEndIndex) {
        // a new match must be pushed without the `endIndex` property
        const {endIndex, ...rest} = match;
        finalDates.push(rest);
        lastEndIndex = match.endIndex;
      }
    });

    return finalDates;
}


// --- Test Runner ---

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) { tests.push({ name, fn }); }

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
  console.log("--------------------\n");
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
}

function assertEquals(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || "Values should be equal"}\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`);
  }
}

// --- Test Cases ---

test("isValidDate: should validate correct dates", () => {
  assertEquals(isValidDate("2025", "08", "27"), true);
  assertEquals(isValidDate("2024", "02", "29"), true, "Leap day");
  assertEquals(isValidDate("2023", "2", "29"), false, "Non-leap day");
});

test("convertWarekiToGregorianYear: should convert correctly", () => {
    assertEquals(convertWarekiToGregorianYear("令和", "6"), 2024);
    assertEquals(convertWarekiToGregorianYear("平成", "元"), 1989);
    assertEquals(convertWarekiToGregorianYear("昭和", "64"), 1989);
});

test("resolveYearForMonthDay: should resolve to current or next year", () => {
    // Mock date is April 1, 2025
    assertEquals(resolveYearForMonthDay(5, 10).getFullYear(), 2025, "Future date should be current year");
    assertEquals(resolveYearForMonthDay(3, 15).getFullYear(), 2026, "Past date should be next year");
    assertEquals(resolveYearForMonthDay(4, 1).getFullYear(), 2025, "Today should be current year");
});

test("findDatesInText: should find YYYY-MM-DD and YYYY/MM/DD", () => {
  const text = "Dates: 2024-01-10 and 2025/03/05.";
  const expected = [
    { date: "2024-01-10", original: "2024-01-10", index: 7, detector: "YYYY-MM-DD or YYYY/MM/DD" },
    { date: "2025-03-05", original: "2025/03/05", index: 22, detector: "YYYY-MM-DD or YYYY/MM/DD" }
  ];
  assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should find YYYY年M月D日 format", () => {
    const text = "日付は 2025 年 8 月 27 日 です。";
    const expected = [{
        date: "2025-08-27",
        original: "2025 年 8 月 27 日",
        index: 4,
        detector: "YYYY年M月D日 (JA)"
    }];
    assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should find Wareki formats and avoid overlap", () => {
    const text = "令和6年10月1日と平成元年1月8日";
    const expected = [
        { date: "2024-10-01", original: "令和6年10月1日", index: 0, detector: "和暦 (Wareki)" },
        { date: "1989-01-08", original: "平成元年1月8日", index: 10, detector: "和暦 (Wareki)" }
    ];
    assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should find Month-Day formats and resolve year", () => {
    // Mock date is April 1, 2025
    const text = "締め切りは3月10日と、次のイベントは5月20日です。";
    const expected = [
        { date: "2026-03-10", original: "3月10日", index: 5, detector: "月日 (Month-Day)" },
        { date: "2025-05-20", original: "5月20日", index: 19, detector: "月日 (Month-Day)" }
    ];
    assertEquals(findDatesInText(text), expected);
});

test("findDatesInText: should handle a mix of all formats and avoid overlap", () => {
    const text = "イベント一覧: 令和6年12月25日、2025/01/01、そして2月14日です。";
     // Mock date is April 1, 2025
    const expected = [
        { date: "2024-12-25", original: "令和6年12月25日", index: 8, detector: "和暦 (Wareki)" },
        { date: "2025-01-01", original: "2025/01/01", index: 19, detector: "YYYY-MM-DD or YYYY/MM/DD" },
        { date: "2026-02-14", original: "2月14日", index: 33, detector: "月日 (Month-Day)" }
    ];
    assertEquals(findDatesInText(text), expected);
});


// --- Run all tests ---
runTests();
