/**
 * @fileoverview ChronoClip オプション画面のJavaScript
 * 設定の読み込み、保存、バリデーション、UI制御を担当
 */

// グローバル変数
let logger = null;
let errorHandler = null;

// 日付形式の表示名マッピング
const DATE_FORMAT_LABELS = {
  JP: "日本語 (2024年1月15日)",
  US: "アメリカ式 (01/15/2024)",
  ISO: "ISO形式 (2024-01-15)",
  EU: "ヨーロッパ式 (15/01/2024)",
};

// UI状態管理
let currentSettings = null;
let isDirty = false;
let sortableInstance = null;

// DOM要素
let elements = {};

/**
 * 堅牢な要素取得ヘルパー関数
 * @param {string} elementId - 要素のID
 * @param {string} elementName - 要素の説明名（ログ用）
 * @returns {HTMLElement|null} 要素またはnull
 */
function getElementSafe(elementId, elementName = null) {
  // 直接取得を試行
  let element = document.getElementById(elementId);

  // 見つからない場合はquerySelectorでも試行
  if (!element) {
    element = document.querySelector(`#${elementId}`);
  }

  // DOM読み込み待ちが必要かもしれない場合の遅延取得
  if (!element && elementId === "siteRuleForm") {
    // モーダル内の要素は初期化時に見つからない場合がある
    console.log(
      `ChronoClip: ${elementId} not found in initial load, will retry when needed`
    );
    return null;
  }

  if (!element) {
    console.warn(
      `ChronoClip: Element not found: ${elementId} (${
        elementName || elementId
      })`
    );
  }
  return element;
}

/**
 * 要素の存在を確認し、見つからない場合は再取得を試行
 * @param {string} key - elements オブジェクトのキー
 * @param {string} elementId - DOM要素のID
 * @param {string} description - 要素の説明
 */
function ensureElement(key, elementId, description) {
  if (!elements[key]) {
    console.log(`ChronoClip: Re-acquiring ${description} (${elementId})`);
    elements[key] = getElementSafe(elementId, description);

    if (elements[key]) {
      console.log(`ChronoClip: Successfully acquired ${description}`);
    } else {
      console.error(`ChronoClip: Failed to acquire ${description} after retry`);
    }
  }
  return elements[key];
}

/**
 * ページ読み込み時の初期化
 */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("ChronoClip: Options page loaded");

  try {
    // logger/errorHandlerの初期化
    await initializeLogging();

    // DOM要素の初期化を最初に行う
    initializeElements();

    // 設定ライブラリの初期化を待つ（タイムアウト付き）
    if (!window.ChronoClipSettings) {
      logger?.info("Waiting for settings library...");
      await new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100; // 5秒でタイムアウト

        const checkSettings = () => {
          attempts++;
          if (window.ChronoClipSettings) {
            logger?.info("Settings library loaded successfully", {
              attempts,
              duration: attempts * 50 + "ms",
            });
            resolve();
          } else if (attempts >= maxAttempts) {
            const error = new Error("Settings library loading timed out");
            logger?.error("Settings library loading timed out", error);
            reject(error);
          } else {
            setTimeout(checkSettings, 50);
          }
        };
        checkSettings();
      });
    }

    console.log(
      "ChronoClip: window.ChronoClipSettings:",
      window.ChronoClipSettings
    );
    console.log(
      "ChronoClip: Available methods:",
      Object.keys(window.ChronoClipSettings || {})
    );

    // 新しいモジュールシステムの確認
    console.log("ChronoClip: Checking new module system...");
    console.log(
      "ChronoClip: window.ChronoClipSiteRuleManager:",
      window.ChronoClipSiteRuleManager
    );
    console.log(
      "ChronoClip: window.ChronoClipExtractorFactory:",
      window.ChronoClipExtractorFactory
    );

    // SiteRuleManagerの初期化テスト
    if (window.ChronoClipSiteRuleManager) {
      try {
        const siteRuleManager =
          window.ChronoClipSiteRuleManager.getSiteRuleManager();
        await siteRuleManager.initialize();
        console.log("ChronoClip: SiteRuleManager initialized successfully");
        console.log(
          "ChronoClip: Available site rules:",
          siteRuleManager.getAllRules()
        );
      } catch (error) {
        console.error(
          "ChronoClip: SiteRuleManager initialization failed:",
          error
        );
      }
    } else {
      console.warn("ChronoClip: SiteRuleManager not loaded");
    }

    // ExtractorFactoryの初期化テスト
    if (window.ChronoClipExtractorFactory) {
      try {
        const extractorFactory =
          window.ChronoClipExtractorFactory.getExtractorFactory();
        extractorFactory.initialize();
        console.log("ChronoClip: ExtractorFactory initialized successfully");
        console.log(
          "ChronoClip: Available extractors:",
          extractorFactory.getAvailableExtractors()
        );
      } catch (error) {
        console.error(
          "ChronoClip: ExtractorFactory initialization failed:",
          error
        );
      }
    } else {
      console.warn("ChronoClip: ExtractorFactory not loaded");
    }

    await loadSettings();
    initializeEventListeners();
    updateUI();
    
    // Fetch and populate calendar list
    await updateCalendarDropdown();

    // 現在のタブ情報を取得（Chrome拡張機能の場合）
    if (typeof chrome !== "undefined" && chrome.tabs) {
      await getCurrentTabInfo();
    }

    console.log("ChronoClip: Options initialization complete");
  } catch (error) {
    console.error("ChronoClip: Options initialization failed:", error);
    showToast("設定の初期化に失敗しました", "error");
  }
});

/**
 * DOM要素の参照を取得
 */
function initializeElements() {
  console.log("ChronoClip: Initializing DOM elements...");

  // 各要素の安全な取得
  elements = {
    form: getElementSafe("settingsForm", "main form"),
    autoDetect: getElementSafe("autoDetect", "auto detect checkbox"),
    highlightDates: getElementSafe(
      "highlightDates",
      "highlight dates checkbox"
    ),
    highlightColor: getElementSafe("highlightColor", "highlight color input"),
    includeURL: getElementSafe("includeURL", "include URL checkbox"),
    defaultDuration: getElementSafe(
      "defaultDuration",
      "default duration input"
    ),
    defaultCalendar: getElementSafe(
      "defaultCalendar",
      "default calendar select"
    ),
    refreshCalendarsBtn: getElementSafe(
      "refreshCalendarsBtn",
      "refresh calendars button"
    ),
    timezone: getElementSafe("timezone", "timezone select"),
    dateFormatsContainer: getElementSafe(
      "dateFormatsContainer",
      "date formats container"
    ),
    rulesEnabled: getElementSafe("rulesEnabled", "rules enabled checkbox"),
    siteRulesContainer: getElementSafe(
      "siteRulesContainer",
      "site rules container"
    ),
    siteRulesList: getElementSafe("siteRulesList", "site rules list"),
    addSiteRuleBtn: getElementSafe("addSiteRuleBtn", "add site rule button"),
    saveBtn: getElementSafe("saveBtn", "save button"),
    resetBtn: getElementSafe("resetBtn", "reset button"),
    toastContainer: getElementSafe("toastContainer", "toast container"),
    confirmModal: getElementSafe("confirmModal", "confirm modal"),
    confirmTitle: getElementSafe("confirmTitle", "confirm title"),
    confirmMessage: getElementSafe("confirmMessage", "confirm message"),
    confirmOk: getElementSafe("confirmOk", "confirm OK button"),
    confirmCancel: getElementSafe("confirmCancel", "confirm cancel button"),

    // サイトルール関連要素
    currentTabSuggestion: getElementSafe(
      "currentTabSuggestion",
      "current tab suggestion"
    ),
    currentTabDomain: getElementSafe("currentTabDomain", "current tab domain"),
    addCurrentSiteBtn: getElementSafe(
      "addCurrentSiteBtn",
      "add current site button"
    ),
    siteRuleSearch: getElementSafe("siteRuleSearch", "site rule search input"),
    noRulesMessage: getElementSafe("noRulesMessage", "no rules message"),
    exportSiteRulesBtn: getElementSafe(
      "exportSiteRulesBtn",
      "export site rules button"
    ),
    importSiteRulesBtn: getElementSafe(
      "importSiteRulesBtn",
      "import site rules button"
    ),
    importSiteRulesInput: getElementSafe(
      "importSiteRulesInput",
      "import site rules input"
    ),

    // サイトルールモーダル関連
    siteRuleModal: getElementSafe("siteRuleModal", "site rule modal"),
    closeSiteRuleModal: getElementSafe(
      "closeSiteRuleModal",
      "close site rule modal button"
    ),
    siteRuleForm: getElementSafe("siteRuleForm", "site rule form"),
    saveSiteRuleBtn: getElementSafe("saveSiteRuleBtn", "save site rule button"),
    deleteSiteRuleBtn: getElementSafe(
      "deleteSiteRuleBtn",
      "delete site rule button"
    ),
    testSiteRuleBtn: getElementSafe("testSiteRuleBtn", "test site rule button"),

    // サイトルールフォーム項目
    ruleDomain: getElementSafe("ruleDomain", "rule domain input"),
    ruleEnabled: getElementSafe("ruleEnabled", "rule enabled checkbox"),
    ruleInheritSubdomains: getElementSafe(
      "ruleInheritSubdomains",
      "rule inherit subdomains checkbox"
    ),
    ruleDateAnchor: getElementSafe("ruleDateAnchor", "rule date anchor input"),
    ruleDateBlock: getElementSafe("ruleDateBlock", "rule date block input"),
    ruleTitleSelector: getElementSafe(
      "ruleTitleSelector",
      "rule title selector input"
    ),
    ruleTitleFallback: getElementSafe(
      "ruleTitleFallback",
      "rule title fallback checkbox"
    ),
    ruleDescSelectors: getElementSafe(
      "ruleDescSelectors",
      "rule description selectors textarea"
    ),
    ruleMaxBlocks: getElementSafe("ruleMaxBlocks", "rule max blocks input"),
    ruleIncludeURL: getElementSafe("ruleIncludeURL", "rule include URL select"),
    ruleLocationSelector: getElementSafe(
      "ruleLocationSelector",
      "rule location selector input"
    ),
    ruleTimeStart: getElementSafe("ruleTimeStart", "rule time start input"),
    ruleTimeEnd: getElementSafe("ruleTimeEnd", "rule time end input"),
    rulePreferDateTime: getElementSafe(
      "rulePreferDateTime",
      "rule prefer datetime checkbox"
    ),
    ruleRemoveSelectors: getElementSafe(
      "ruleRemoveSelectors",
      "rule remove selectors textarea"
    ),
    ruleStopwords: getElementSafe("ruleStopwords", "rule stopwords textarea"),
    ruleCustomJoiner: getElementSafe(
      "ruleCustomJoiner",
      "rule custom joiner input"
    ),
    ruleTrimBrackets: getElementSafe(
      "ruleTrimBrackets",
      "rule trim brackets checkbox"
    ),
  };

  // 重要な要素の存在確認とデバッグ
  const criticalElements = ["siteRuleModal", "ruleDomain"]; // siteRuleFormは動的取得するため除外
  console.log("ChronoClip: Checking critical elements...");

  let missingElements = [];
  for (const key of criticalElements) {
    const element = elements[key];
    const elementId =
      key === "siteRuleModal"
        ? "siteRuleModal"
        : key === "ruleDomain"
        ? "ruleDomain"
        : key;

    console.log(
      `ChronoClip: Element ${key} - stored:`,
      element ? "found" : "missing"
    );

    if (!element) {
      missingElements.push({ key, elementId });
      console.error(
        `ChronoClip: Critical element not found in elements object: ${key}`
      );
    } else {
      console.log(`ChronoClip: Found element: ${key} = `, element.tagName);
    }
  }

  // siteRuleFormは動的取得されるため、別途チェック
  if (!elements.siteRuleForm) {
    console.log(
      "ChronoClip: siteRuleForm not found during initialization (will be retrieved dynamically)"
    );
  }

  // 欠けている要素の統計 (siteRuleFormは除外)
  const totalElements = Object.keys(elements).length;
  const foundElements = Object.values(elements).filter(
    (el) => el !== null
  ).length;
  console.log(
    `ChronoClip: Elements summary: ${foundElements}/${totalElements} found`
  );

  if (missingElements.length > 0) {
    console.warn(
      `ChronoClip: Missing ${missingElements.length} critical elements:`,
      missingElements
    );
  }

  console.log("ChronoClip: Elements initialization complete");
}

/**
 * 設定をロード
 */
async function loadSettings() {
  try {
    currentSettings = await window.ChronoClipSettings.getSettings();
    console.log("ChronoClip: Settings loaded:", currentSettings);
  } catch (error) {
    console.error("ChronoClip: Failed to load settings:", error);
    currentSettings = window.ChronoClipSettings.getDefaultSettings();
    showToast(
      "設定の読み込みに失敗しました。デフォルト設定を使用します。",
      "warning"
    );
  }
}

/**
 * カレンダーリストを取得して設定に保存
 */
async function fetchAndCacheCalendarList() {
  try {
    console.log("ChronoClip: Fetching calendar list...");
    
    // Check if we need to refresh the calendar list (cache for 1 hour)
    const now = Date.now();
    const lastFetched = currentSettings.calendarListLastFetched;
    const oneHour = 60 * 60 * 1000;
    
    if (lastFetched && (now - lastFetched) < oneHour && currentSettings.calendarList.length > 0) {
      console.log("ChronoClip: Using cached calendar list");
      return currentSettings.calendarList;
    }
    
    // Send message to background script to fetch calendars
    const response = await chrome.runtime.sendMessage({
      type: "getCalendarList"
    });
    
    if (response && response.success && response.calendars) {
      console.log("ChronoClip: Fetched calendars:", response.calendars);
      
      // Update settings with calendar list
      currentSettings.calendarList = response.calendars;
      currentSettings.calendarListLastFetched = now;
      
      // Save to storage
      await window.ChronoClipSettings.saveSettings(currentSettings);
      
      return response.calendars;
    } else {
      console.error("ChronoClip: Failed to fetch calendars:", response?.error);
      return currentSettings.calendarList || [];
    }
  } catch (error) {
    console.error("ChronoClip: Error fetching calendar list:", error);
    return currentSettings.calendarList || [];
  }
}

/**
 * カレンダードロップダウンを更新
 */
async function updateCalendarDropdown() {
  if (!elements.defaultCalendar) {
    console.warn("ChronoClip: Calendar dropdown element not found");
    return;
  }
  
  const calendars = await fetchAndCacheCalendarList();
  
  // Clear existing options
  elements.defaultCalendar.innerHTML = "";
  
  if (calendars.length === 0) {
    // Add primary calendar as fallback
    const option = document.createElement("option");
    option.value = "primary";
    option.textContent = "プライマリカレンダー";
    elements.defaultCalendar.appendChild(option);
  } else {
    // Add all calendars
    calendars.forEach(calendar => {
      const option = document.createElement("option");
      option.value = calendar.id;
      option.textContent = calendar.summary || calendar.id;
      
      // Add visual indicator for primary calendar
      if (calendar.primary) {
        option.textContent += " (プライマリ)";
      }
      
      elements.defaultCalendar.appendChild(option);
    });
  }
  
  // Set the current value
  if (currentSettings.defaultCalendar) {
    elements.defaultCalendar.value = currentSettings.defaultCalendar;
  }
}

/**
 * イベントリスナーを初期化
 */
function initializeEventListeners() {
  console.log("ChronoClip: Initializing event listeners...");

  // 安全なイベントリスナー追加
  function addSafeEventListener(elementName, eventType, handler, description) {
    const element = elements[elementName];
    if (element) {
      element.addEventListener(eventType, handler);
      console.log(`ChronoClip: Added ${eventType} listener to ${description}`);
    } else {
      console.warn(
        `ChronoClip: Could not add ${eventType} listener to ${description} - element not found`
      );
    }
  }

  // フォーム送信の詳細デバッグ
  if (elements.form) {
    console.log("ChronoClip: Registering form submit handler");
    elements.form.addEventListener("submit", handleSave);

    // フォームの状態確認
    console.log("ChronoClip: Form element details:", {
      id: elements.form.id,
      tagName: elements.form.tagName,
      method: elements.form.method,
      action: elements.form.action,
    });
  } else {
    console.error(
      "ChronoClip: elements.form is null - submit handler not registered!"
    );
    // 代替手段：直接クエリでフォームを取得してリスナーを登録
    const formDirect = document.getElementById("settingsForm");
    if (formDirect) {
      console.log(
        "ChronoClip: Found form by direct query, registering listener"
      );
      elements.form = formDirect;
      formDirect.addEventListener("submit", handleSave);
    } else {
      console.error("ChronoClip: settingsForm not found in DOM!");
    }
  }

  // saveBtn の詳細確認
  if (elements.saveBtn) {
    console.log("ChronoClip: saveBtn found:", elements.saveBtn);
    console.log("ChronoClip: saveBtn type:", elements.saveBtn.type);
    console.log("ChronoClip: saveBtn form:", elements.saveBtn.form);

    // onclick イベントも追加登録（念のため）
    elements.saveBtn.addEventListener("click", (e) => {
      console.log("ChronoClip: saveBtn clicked directly");
      console.log("ChronoClip: Button type:", elements.saveBtn.type);
      console.log("ChronoClip: Button form:", elements.saveBtn.form);
      console.log("ChronoClip: elements.form:", elements.form);

      // 確実にhandleSaveを呼ぶ（フォームsubmitと重複してもpreventDefaultで制御）
      console.log("ChronoClip: Calling handleSave from click event");
      handleSave(e);
    });
  } else {
    console.error("ChronoClip: elements.saveBtn is null!");
    const saveBtnDirect = document.getElementById("saveBtn");
    if (saveBtnDirect) {
      console.log("ChronoClip: Found saveBtn by direct query");
      elements.saveBtn = saveBtnDirect;
      saveBtnDirect.addEventListener("click", handleSave);
    }
  }

  // リセットボタン
  addSafeEventListener("resetBtn", "click", handleReset, "reset button");

  // カレンダー更新ボタン
  addSafeEventListener(
    "refreshCalendarsBtn",
    "click",
    handleRefreshCalendars,
    "refresh calendars button"
  );

  // サイトルール関連
  addSafeEventListener(
    "rulesEnabled",
    "change",
    handleRulesEnabledChange,
    "rules enabled checkbox"
  );
  addSafeEventListener(
    "addSiteRuleBtn",
    "click",
    () => openSiteRuleModal(),
    "add site rule button"
  );
  addSafeEventListener(
    "addCurrentSiteBtn",
    "click",
    addCurrentSiteRule,
    "add current site button"
  );
  addSafeEventListener(
    "siteRuleSearch",
    "input",
    filterSiteRules,
    "site rule search input"
  );

  // インポート・エクスポート関連
  addSafeEventListener(
    "exportSiteRulesBtn",
    "click",
    exportSiteRules,
    "export site rules button"
  );
  addSafeEventListener(
    "importSiteRulesBtn",
    "click",
    () => {
      if (elements.importSiteRulesInput) {
        elements.importSiteRulesInput.click();
      }
    },
    "import site rules button"
  );
  addSafeEventListener(
    "importSiteRulesInput",
    "change",
    importSiteRules,
    "import site rules input"
  );

  // サイトルールモーダル関連
  addSafeEventListener(
    "closeSiteRuleModal",
    "click",
    closeSiteRuleModal,
    "close site rule modal button"
  );
  addSafeEventListener(
    "saveSiteRuleBtn",
    "click",
    saveSiteRule,
    "save site rule button"
  );
  addSafeEventListener(
    "deleteSiteRuleBtn",
    "click",
    deleteSiteRule,
    "delete site rule button"
  );
  addSafeEventListener(
    "testSiteRuleBtn",
    "click",
    testSiteRule,
    "test site rule button"
  );

  // モーダル外クリックで閉じる
  if (elements.siteRuleModal) {
    elements.siteRuleModal.addEventListener("click", (e) => {
      if (e.target === elements.siteRuleModal) {
        closeSiteRuleModal();
      }
    });
  }

  // 折りたたみセクション
  document.querySelectorAll(".collapsible-header").forEach((header) => {
    header.addEventListener("click", toggleCollapsibleSection);
  });

  // 設定変更検知
  if (elements.form) {
    elements.form.addEventListener("input", () => {
      isDirty = true;
      updateSaveButtonState();
    });
  }

  // モーダル関連
  addSafeEventListener(
    "confirmOk",
    "click",
    handleConfirmOk,
    "confirm OK button"
  );
  addSafeEventListener(
    "confirmCancel",
    "click",
    hideConfirmModal,
    "confirm cancel button"
  );

  // ページ離脱前の確認
  window.addEventListener("beforeunload", handleBeforeUnload);

  // サイトルールアクションボタンのイベント委譲
  if (elements.siteRulesList) {
    elements.siteRulesList.addEventListener("click", (e) => {
      const button = e.target.closest("[data-action]");
      if (!button) return;

      const action = button.dataset.action;
      const domain = button.dataset.domain;

      switch (action) {
        case "toggle":
          toggleSiteRule(domain);
          break;
        case "edit":
          editSiteRule(domain);
          break;
        case "delete":
          confirmDeleteSiteRule(domain);
          break;
      }
    });
  }

  // 現在のタブ情報を取得
  getCurrentTabInfo();

  // テストページボタン
  const openTestPageBtn = document.getElementById("openTestPageBtn");
  if (openTestPageBtn) {
    openTestPageBtn.addEventListener("click", openTestPage);
  }

  // デバッグ機能の初期化
  initializeDebugFeatures();

  console.log("ChronoClip: Event listeners initialization complete");
}

/**
 * UIを現在の設定に更新
 */
function updateUI() {
  // チェックボックス
  elements.autoDetect.checked = currentSettings.autoDetect;
  elements.highlightDates.checked = currentSettings.highlightDates;
  elements.includeURL.checked = currentSettings.includeURL;
  elements.rulesEnabled.checked = currentSettings.rulesEnabled;

  // デバッグ・監視設定
  const debugModeCheckbox = document.getElementById("debugMode");
  const errorReportCheckbox = document.getElementById("errorReportConsent");
  if (debugModeCheckbox)
    debugModeCheckbox.checked = currentSettings.debugMode || false;
  if (errorReportCheckbox)
    errorReportCheckbox.checked = currentSettings.errorReportConsent || false;

  // カラーピッカー
  elements.highlightColor.value = currentSettings.highlightColor || "#ffeb3b";

  // 数値入力
  elements.defaultDuration.value = currentSettings.defaultDuration;

  // セレクト
  elements.defaultCalendar.value = currentSettings.defaultCalendar;
  elements.timezone.value = currentSettings.timezone;

  // 日付形式リスト
  updateDateFormatsUI();

  // サイトルール表示/非表示
  handleRulesEnabledChange();

  // サイトルールリスト
  updateSiteRulesUI();

  // ボタン状態
  isDirty = false;
  updateSaveButtonState();
}

/**
 * 日付形式UIを更新
 */
function updateDateFormatsUI() {
  elements.dateFormatsContainer.innerHTML = "";

  currentSettings.dateFormats.forEach((format, index) => {
    const item = document.createElement("div");
    item.className = "sortable-item";
    item.draggable = true;
    item.dataset.format = format;

    item.innerHTML = `
      <span class="drag-handle">≡</span>
      <span class="format-label">${DATE_FORMAT_LABELS[format] || format}</span>
      <button type="button" class="remove-btn" onclick="removeDateFormat('${format}')">×</button>
    `;

    elements.dateFormatsContainer.appendChild(item);
  });

  // 利用可能な形式の追加ボタン
  const availableFormats =
    window.ChronoClipSettings.getAllowedDateFormats().filter(
      (format) => !currentSettings.dateFormats.includes(format)
    );

  if (availableFormats.length > 0) {
    const addContainer = document.createElement("div");
    addContainer.className = "add-format-container";

    const select = document.createElement("select");
    select.className = "add-format-select";
    select.innerHTML = '<option value="">+ 日付形式を追加</option>';

    availableFormats.forEach((format) => {
      const option = document.createElement("option");
      option.value = format;
      option.textContent = DATE_FORMAT_LABELS[format] || format;
      select.appendChild(option);
    });

    select.addEventListener("change", (e) => {
      if (e.target.value) {
        addDateFormat(e.target.value);
        e.target.value = "";
      }
    });

    addContainer.appendChild(select);
    elements.dateFormatsContainer.appendChild(addContainer);
  }

  // ドラッグ&ドロップ初期化
  initializeSortable();
}

/**
 * サイトルールUIを更新
 */
function updateSiteRulesUI() {
  elements.siteRulesList.innerHTML = "";

  Object.entries(currentSettings.siteRules).forEach(([site, rule]) => {
    const item = createSiteRuleItem(site, rule);
    elements.siteRulesList.appendChild(item);
  });
}

/**
 * サイトルール項目を作成
 */
function createSiteRuleItem(site, rule) {
  const item = document.createElement("div");
  item.className = "site-rule-item";
  item.dataset.site = site;

  item.innerHTML = `
    <div class="site-rule-header">
      <input type="text" class="site-input" value="${site}" placeholder="example.com">
      <label>
        <input type="checkbox" class="rule-enabled" ${
          rule.enabled !== false ? "checked" : ""
        }>
        有効
      </label>
      <button type="button" class="remove-btn" onclick="removeSiteRule('${site}')">削除</button>
    </div>
    <div class="site-rule-content">
      <label>CSSセレクター（カンマ区切り）</label>
      <textarea class="selectors-input" placeholder=".event-date, .schedule-time">${(
        rule.selectors || []
      ).join(", ")}</textarea>
    </div>
  `;

  // イベントリスナー追加
  const siteInput = item.querySelector(".site-input");
  const enabledInput = item.querySelector(".rule-enabled");
  const selectorsInput = item.querySelector(".selectors-input");

  siteInput.addEventListener("change", () =>
    updateSiteRule(site, siteInput, enabledInput, selectorsInput)
  );
  enabledInput.addEventListener("change", () =>
    updateSiteRule(site, siteInput, enabledInput, selectorsInput)
  );
  selectorsInput.addEventListener("input", () =>
    updateSiteRule(site, siteInput, enabledInput, selectorsInput)
  );

  return item;
}

/**
 * ソート可能リストを初期化
 */
function initializeSortable() {
  // 簡易ドラッグ&ドロップ実装
  let draggedElement = null;

  elements.dateFormatsContainer.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("sortable-item")) {
      draggedElement = e.target;
      e.target.style.opacity = "0.5";
    }
  });

  elements.dateFormatsContainer.addEventListener("dragend", (e) => {
    if (e.target.classList.contains("sortable-item")) {
      e.target.style.opacity = "";
      draggedElement = null;
    }
  });

  elements.dateFormatsContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  elements.dateFormatsContainer.addEventListener("drop", (e) => {
    e.preventDefault();
    if (draggedElement && e.target.classList.contains("sortable-item")) {
      const container = elements.dateFormatsContainer;
      const afterElement = getDragAfterElement(container, e.clientY);

      if (afterElement == null) {
        container.appendChild(draggedElement);
      } else {
        container.insertBefore(draggedElement, afterElement);
      }

      updateDateFormatsFromUI();
    }
  });
}

/**
 * ドラッグ位置に基づいて挿入位置を取得
 */
function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".sortable-item:not(.dragging)"),
  ];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

/**
 * UIから日付形式の順序を更新
 */
function updateDateFormatsFromUI() {
  const items = [
    ...elements.dateFormatsContainer.querySelectorAll(".sortable-item"),
  ];
  currentSettings.dateFormats = items.map((item) => item.dataset.format);
  isDirty = true;
  updateSaveButtonState();
}

/**
 * 日付形式を追加
 */
function addDateFormat(format) {
  if (!currentSettings.dateFormats.includes(format)) {
    currentSettings.dateFormats.push(format);
    updateDateFormatsUI();
    isDirty = true;
    updateSaveButtonState();
  }
}

/**
 * 日付形式を削除
 */
function removeDateFormat(format) {
  const index = currentSettings.dateFormats.indexOf(format);
  if (index > -1 && currentSettings.dateFormats.length > 1) {
    currentSettings.dateFormats.splice(index, 1);
    updateDateFormatsUI();
    isDirty = true;
    updateSaveButtonState();
  } else if (currentSettings.dateFormats.length === 1) {
    showToast("最低1つの日付形式は必要です", "warning");
  }
}

/**
 * サイトルールを追加
 */
function addSiteRule() {
  const site = prompt("サイトのドメインを入力してください（例: example.com）:");
  if (site && site.trim()) {
    const cleanSite = site.trim().toLowerCase();
    if (!currentSettings.siteRules[cleanSite]) {
      currentSettings.siteRules[cleanSite] = {
        enabled: true,
        selectors: [],
      };
      updateSiteRulesUI();
      isDirty = true;
      updateSaveButtonState();
    } else {
      showToast("このサイトのルールは既に存在します", "warning");
    }
  }
}

/**
 * サイトルールを削除
 */
function removeSiteRule(site) {
  if (confirm(`${site} のルールを削除しますか？`)) {
    delete currentSettings.siteRules[site];
    updateSiteRulesUI();
    isDirty = true;
    updateSaveButtonState();
  }
}

/**
 * サイトルールを更新
 */
function updateSiteRule(oldSite, siteInput, enabledInput, selectorsInput) {
  const newSite = siteInput.value.trim().toLowerCase();
  const enabled = enabledInput.checked;
  const selectors = selectorsInput.value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s);

  // サイト名が変更された場合
  if (oldSite !== newSite && newSite) {
    if (currentSettings.siteRules[newSite]) {
      showToast("このサイトのルールは既に存在します", "warning");
      siteInput.value = oldSite;
      return;
    }

    delete currentSettings.siteRules[oldSite];
    currentSettings.siteRules[newSite] = { enabled, selectors };
    updateSiteRulesUI();
  } else if (newSite) {
    currentSettings.siteRules[newSite] = { enabled, selectors };
  }

  isDirty = true;
  updateSaveButtonState();
}

/**
 * サイトルール有効/無効の切り替え
 */
function handleRulesEnabledChange() {
  const enabled = elements.rulesEnabled.checked;
  if (enabled) {
    elements.siteRulesContainer.classList.remove("site-rules-hidden");
  } else {
    elements.siteRulesContainer.classList.add("site-rules-hidden");
  }
}

/**
 * 設定保存の処理
 */
async function handleSave(e) {
  console.log("ChronoClip: ===== handleSave function called =====");
  console.log("ChronoClip: Event object:", e);
  console.log("ChronoClip: Event type:", e?.type);
  console.log("ChronoClip: Event target:", e?.target);
  console.log("ChronoClip: Current time:", new Date().toISOString());

  if (e) {
    e.preventDefault();
    console.log("ChronoClip: preventDefault() called");
  }

  try {
    console.log("ChronoClip: Starting settings save...");

    // window.ChronoClipSettings の存在確認
    if (!window.ChronoClipSettings) {
      console.error("ChronoClip: window.ChronoClipSettings is not available!");
      showToast("設定システムが利用できません", "error");
      return;
    }

    console.log(
      "ChronoClip: window.ChronoClipSettings available:",
      typeof window.ChronoClipSettings
    );

    // フォームから設定を取得
    console.log("ChronoClip: Calling getSettingsFromForm...");
    const formSettings = getSettingsFromForm();
    console.log("ChronoClip: Form settings:", formSettings);

    // バリデーション
    const validation = window.ChronoClipSettings.validateSettings(formSettings);
    console.log("ChronoClip: Validation result:", validation);

    if (!validation.isValid) {
      const errors = validation.errors
        .map((e) => `${e.field}: ${e.message}`)
        .join("\n");
      showToast(`設定にエラーがあります:\n${errors}`, "error");
      return;
    }

    // 保存実行
    if (elements.saveBtn) {
      elements.saveBtn.disabled = true;
      elements.saveBtn.textContent = "保存中...";
    }

    console.log("ChronoClip: Calling setSettings...");
    await window.ChronoClipSettings.setSettings(formSettings);

    currentSettings = formSettings;
    isDirty = false;
    updateSaveButtonState();

    showToast("設定を保存しました", "success");
    console.log("ChronoClip: Settings saved successfully");
  } catch (error) {
    console.error("ChronoClip: Failed to save settings:", error);
    showToast(`保存に失敗しました: ${error.message}`, "error");
  } finally {
    if (elements.saveBtn) {
      elements.saveBtn.disabled = false;
      elements.saveBtn.textContent = "設定を保存";
    }
  }
}

/**
 * フォームから設定オブジェクトを取得
 */
function getSettingsFromForm() {
  // デバッグ設定のチェックボックスを取得
  const debugModeCheckbox = document.getElementById("debugMode");
  const errorReportCheckbox = document.getElementById("errorReportConsent");

  const settings = {
    ...currentSettings,
    autoDetect: elements.autoDetect.checked,
    highlightDates: elements.highlightDates.checked,
    highlightColor: elements.highlightColor.value,
    includeURL: elements.includeURL.checked,
    defaultDuration: parseInt(elements.defaultDuration.value, 10),
    defaultCalendar: elements.defaultCalendar.value,
    timezone: elements.timezone.value,
    rulesEnabled: elements.rulesEnabled.checked,
    // デバッグ・監視設定
    debugMode: debugModeCheckbox ? debugModeCheckbox.checked : false,
    errorReportConsent: errorReportCheckbox
      ? errorReportCheckbox.checked
      : false,
    // dateFormats と siteRules は既に currentSettings に反映済み
  };

  // 新しいモジュール化システムとの同期
  if (window.ChronoClipSiteRuleManager) {
    try {
      const siteRuleManager =
        window.ChronoClipSiteRuleManager.getSiteRuleManager();
      // サイトルール管理クラスのルールも取得して統合
      const moduleRules = siteRuleManager.getAllRules();
      if (moduleRules && Object.keys(moduleRules).length > 0) {
        settings.siteRules = {
          ...settings.siteRules,
          ...moduleRules,
        };
      }
    } catch (error) {
      console.log("サイトルール管理クラスとの同期に失敗:", error);
    }
  }

  return settings;
}

/**
 * リセット処理
 */
async function handleReset() {
  showConfirmModal(
    "設定のリセット",
    "すべての設定をデフォルトに戻しますか？この操作は取り消せません。",
    async () => {
      try {
        const defaultSettings =
          await window.ChronoClipSettings.resetToDefault();
        currentSettings = defaultSettings;
        updateUI();
        showToast("設定をデフォルトに戻しました", "success");
      } catch (error) {
        console.error("ChronoClip: Failed to reset settings:", error);
        showToast("リセットに失敗しました", "error");
      }
    }
  );
}

/**
 * カレンダーリストを強制的に再取得
 */
async function handleRefreshCalendars() {
  try {
    // Disable button during refresh
    if (elements.refreshCalendarsBtn) {
      elements.refreshCalendarsBtn.disabled = true;
      elements.refreshCalendarsBtn.textContent = "🔄";
    }

    console.log("ChronoClip: Forcing calendar list refresh...");
    
    // Clear cache by setting lastFetched to 0
    currentSettings.calendarListLastFetched = 0;
    
    // Fetch fresh calendar list
    const response = await chrome.runtime.sendMessage({
      type: "getCalendarList"
    });
    
    if (response && response.success && response.calendars) {
      console.log("ChronoClip: Refreshed calendars:", response.calendars);
      
      // Update settings with new calendar list
      currentSettings.calendarList = response.calendars;
      currentSettings.calendarListLastFetched = Date.now();
      
      // Save to storage
      await window.ChronoClipSettings.saveSettings(currentSettings);
      
      // Update dropdown
      await updateCalendarDropdown();
      
      showToast("カレンダーリストを更新しました", "success");
    } else {
      throw new Error(response?.error || "Failed to fetch calendars");
    }
  } catch (error) {
    console.error("ChronoClip: Failed to refresh calendars:", error);
    showToast("カレンダーリストの更新に失敗しました", "error");
  } finally {
    // Re-enable button
    if (elements.refreshCalendarsBtn) {
      elements.refreshCalendarsBtn.disabled = false;
      elements.refreshCalendarsBtn.textContent = "🔄";
    }
  }
}

/**
 * 保存ボタンの状態を更新
 */
function updateSaveButtonState() {
  elements.saveBtn.disabled = !isDirty;
  elements.saveBtn.textContent = isDirty ? "設定を保存" : "保存済み";
}

/**
 * ページ離脱前の確認
 */
function handleBeforeUnload(e) {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = "変更が保存されていません。このページを離れますか？";
    return e.returnValue;
  }
}

/**
 * トースト通知を表示
 */
function showToast(message, type = "info") {
  console.log(`ChronoClip Toast [${type}]: ${message}`);

  // toastContainer要素の存在確認
  if (!elements.toastContainer) {
    const container = document.getElementById("toastContainer");
    if (container) {
      elements.toastContainer = container;
    } else {
      console.error("ChronoClip: toastContainer not found, using console log");
      console.log(`Toast message: ${message}`);
      return;
    }
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  // アニメーション
  setTimeout(() => toast.classList.add("show"), 10);

  // 自動削除
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

/**
 * 確認モーダルを表示
 */
function showConfirmModal(title, message, onConfirm) {
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmModal.style.display = "flex";

  // 確認ボタンのイベントを一時的に置き換え
  elements.confirmOk.onclick = () => {
    hideConfirmModal();
    onConfirm();
  };
}

/**
 * 確認モーダルを非表示
 */
function hideConfirmModal() {
  elements.confirmModal.style.display = "none";
  elements.confirmOk.onclick = null;
}

/**
 * 確認ボタンの処理
 */
function handleConfirmOk() {
  // showConfirmModal で動的に設定される
}

/**
 * テストページを開く
 */
function openTestPage() {
  const extensionUrl = chrome.runtime.getURL(
    "tests/settings-integration-test.html"
  );
  chrome.tabs.create({ url: extensionUrl });
}

// サイトルール管理関数群

/**
 * 現在のタブ情報を取得して提案表示
 */
async function getCurrentTabInfo() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        const domain = url.hostname;

        // chrome:// や file:// などは除外
        if (url.protocol === "http:" || url.protocol === "https:") {
          if (elements.currentTabDomain) {
            elements.currentTabDomain.textContent = domain;
          }
          if (elements.currentTabSuggestion) {
            elements.currentTabSuggestion.classList.remove("hidden");
          }
        }
      } catch (urlError) {
        console.log("URL解析に失敗:", urlError);
      }
    }
  } catch (error) {
    console.log("現在のタブ情報取得に失敗:", error);
  }
}

/**
 * サイトルール一覧UIを更新
 */
async function updateSiteRulesUI() {
  try {
    let siteRules = currentSettings.siteRules || {};

    // 新しいモジュール化システムからもルールを取得して統合
    if (window.ChronoClipSiteRuleManager) {
      const siteRuleManager =
        window.ChronoClipSiteRuleManager.getSiteRuleManager();
      await siteRuleManager.initialize();
      const moduleRules = siteRuleManager.getAllRulesAsObject();

      console.log(
        "ChronoClip: Module rules from SiteRuleManager:",
        moduleRules
      );

      if (moduleRules && Object.keys(moduleRules).length > 0) {
        siteRules = { ...siteRules, ...moduleRules };
      }
    }

    console.log("ChronoClip: Final combined site rules:", siteRules);
    const ruleEntries = Object.entries(siteRules);

    if (ruleEntries.length === 0) {
      elements.siteRulesList.innerHTML =
        '<div class="no-rules-message"><p>まだサイトルールが設定されていません。</p><p>「新しいルールを追加」ボタンまたは現在のタブの提案からルールを作成してください。</p></div>';
      if (elements.noRulesMessage) {
        elements.noRulesMessage.classList.remove("hidden");
      }
      return;
    }

    if (elements.noRulesMessage) {
      elements.noRulesMessage.classList.add("hidden");
    }

    const searchTerm = elements.siteRuleSearch
      ? elements.siteRuleSearch.value.toLowerCase()
      : "";
    const filteredRules = ruleEntries.filter(([domain]) =>
      domain.toLowerCase().includes(searchTerm)
    );

    elements.siteRulesList.innerHTML = filteredRules
      .map(
        ([domain, rule]) => `
      <div class="site-rule-item ${
        rule.enabled ? "" : "disabled"
      }" data-domain="${domain}">
        <div class="site-rule-info">
          <div class="site-rule-domain">${domain}</div>
          <div class="site-rule-details">
            ${rule.inheritSubdomains ? "サブドメイン継承 | " : ""}
            ${
              rule.source
                ? `ソース: ${rule.source === "code" ? "コード" : "UI"} | `
                : ""
            }
            ${rule.priority ? `優先度: ${rule.priority} | ` : ""}
            ${rule.enabled ? "有効" : "無効"}
          </div>
          ${
            rule.extractorModule
              ? `<div class="site-rule-extractor">抽出エンジン: ${rule.extractorModule}</div>`
              : ""
          }
        </div>
        <div class="site-rule-actions">
          <button type="button" class="secondary-btn small-btn" data-action="toggle" data-domain="${domain}">
            ${rule.enabled ? "無効化" : "有効化"}
          </button>
          <button type="button" class="secondary-btn small-btn" data-action="edit" data-domain="${domain}">
            編集
          </button>
          ${
            rule.source !== "code"
              ? `<button type="button" class="danger-btn small-btn" data-action="delete" data-domain="${domain}">
            削除
          </button>`
              : ""
          }
        </div>
      </div>
    `
      )
      .join("");
  } catch (error) {
    console.error("サイトルールUI更新エラー:", error);
    elements.siteRulesList.innerHTML =
      '<div class="error-message">サイトルールの読み込みに失敗しました</div>';
  }
}

/**
 * サイトルール検索フィルター
 */
function filterSiteRules() {
  updateSiteRulesUI();
}

/**
 * 現在のサイトのルールを追加
 */
async function addCurrentSiteRule() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const url = new URL(tabs[0].url);
      const domain = url.hostname;
      openSiteRuleModal(domain);
    }
  } catch (error) {
    showToast("現在のタブ情報の取得に失敗しました", "error");
  }
}

/**
 * サイトルールモーダルを開く
 */
function openSiteRuleModal(domain = "", rule = null) {
  console.log("ChronoClip: Opening site rule modal for domain:", domain);

  // モーダル関連要素を動的に再取得
  const modal = document.getElementById("siteRuleModal");
  const form = document.getElementById("siteRuleForm");

  if (!modal) {
    console.error("ChronoClip: siteRuleModal not found in DOM");
    showToast("モーダルウィンドウが見つかりません", "error");
    return;
  }

  if (!form) {
    console.error("ChronoClip: siteRuleForm not found in DOM");
    showToast("サイトルール編集フォームが見つかりません", "error");
    return;
  }

  // elements オブジェクトを更新
  elements.siteRuleModal = modal;
  elements.siteRuleForm = form;

  // フォーム内の要素も再取得
  const formElements = {
    ruleDomain: document.getElementById("ruleDomain"),
    ruleEnabled: document.getElementById("ruleEnabled"),
    ruleInheritSubdomains: document.getElementById("ruleInheritSubdomains"),
    ruleDateAnchor: document.getElementById("ruleDateAnchor"),
    ruleDateBlock: document.getElementById("ruleDateBlock"),
    ruleTitleSelector: document.getElementById("ruleTitleSelector"),
    ruleTitleFallback: document.getElementById("ruleTitleFallback"),
    ruleDescSelectors: document.getElementById("ruleDescSelectors"),
    ruleMaxBlocks: document.getElementById("ruleMaxBlocks"),
    ruleIncludeURL: document.getElementById("ruleIncludeURL"),
    ruleLocationSelector: document.getElementById("ruleLocationSelector"),
    ruleTimeStart: document.getElementById("ruleTimeStart"),
    ruleTimeEnd: document.getElementById("ruleTimeEnd"),
    rulePreferDateTime: document.getElementById("rulePreferDateTime"),
    ruleRemoveSelectors: document.getElementById("ruleRemoveSelectors"),
    ruleStopwords: document.getElementById("ruleStopwords"),
    ruleCustomJoiner: document.getElementById("ruleCustomJoiner"),
    ruleTrimBrackets: document.getElementById("ruleTrimBrackets"),
    deleteSiteRuleBtn: document.getElementById("deleteSiteRuleBtn"),
  };

  // 欠けている要素をチェック
  const missingElements = [];
  for (const [key, element] of Object.entries(formElements)) {
    if (!element) {
      missingElements.push(key);
    } else {
      elements[key] = element;
    }
  }

  if (missingElements.length > 0) {
    console.warn("ChronoClip: Missing form elements:", missingElements);
  }

  console.log("ChronoClip: Modal elements re-acquired successfully");

  // フォームをリセット
  try {
    console.log("ChronoClip: Resetting form:", elements.siteRuleForm);
    elements.siteRuleForm.reset();
  } catch (error) {
    console.error("ChronoClip: Failed to reset form:", error);
  }

  if (rule) {
    // 編集モード
    elements.ruleDomain.value = domain;
    elements.ruleDomain.disabled = true;
    elements.ruleEnabled.checked = rule.enabled ?? true;
    elements.ruleInheritSubdomains.checked = rule.inheritSubdomains ?? false;

    // 日付設定
    if (rule.date) {
      elements.ruleDateAnchor.value = rule.date.anchorSelector || "";
      elements.ruleDateBlock.value = rule.date.withinBlockSelector || "";
    }

    // タイトル設定
    if (rule.title) {
      elements.ruleTitleSelector.value = rule.title.fromSameBlockSelector || "";
      elements.ruleTitleFallback.checked =
        rule.title.fallbackFromPrevHeading ?? true;
    }

    // 詳細設定
    if (rule.description) {
      elements.ruleDescSelectors.value = (
        rule.description.fromSameBlockSelectors || []
      ).join("\n");
      elements.ruleMaxBlocks.value = rule.description.maxBlocks || 3;
      elements.ruleIncludeURL.value = rule.description.includeURL || "inherit";
    }

    // 場所・時間設定
    if (rule.location) {
      elements.ruleLocationSelector.value = rule.location.selector || "";
    }
    if (rule.time) {
      elements.ruleTimeStart.value = rule.time.startSelector || "";
      elements.ruleTimeEnd.value = rule.time.endSelector || "";
      elements.rulePreferDateTime.checked =
        rule.time.preferDateTimeAttr ?? true;
    }

    // フィルター設定
    if (rule.filters) {
      elements.ruleRemoveSelectors.value = (
        rule.filters.removeSelectors || []
      ).join("\n");
      elements.ruleStopwords.value = (rule.filters.stopwords || []).join("\n");
    }

    // 高度な設定
    if (rule.advanced) {
      elements.ruleCustomJoiner.value = rule.advanced.customJoiner || " / ";
      elements.ruleTrimBrackets.checked = rule.advanced.trimBrackets ?? false;
    }

    elements.deleteSiteRuleBtn.classList.remove("hidden");
  } else {
    // 新規作成モード
    elements.ruleDomain.value = domain;
    elements.ruleDomain.disabled = false;
    elements.ruleEnabled.checked = true;

    // デフォルト値を設定
    const defaultRule = window.ChronoClipSettings.getDefaultSiteRule();
    elements.ruleDateBlock.value = defaultRule.date.withinBlockSelector;
    elements.ruleTitleSelector.value = defaultRule.title.fromSameBlockSelector;
    elements.ruleTitleFallback.checked =
      defaultRule.title.fallbackFromPrevHeading;
    elements.ruleDescSelectors.value =
      defaultRule.description.fromSameBlockSelectors.join("\n");
    elements.ruleMaxBlocks.value = defaultRule.description.maxBlocks;
    elements.ruleIncludeURL.value = defaultRule.description.includeURL;
    elements.ruleLocationSelector.value = defaultRule.location.selector;
    elements.ruleTimeStart.value = defaultRule.time.startSelector;
    elements.ruleTimeEnd.value = defaultRule.time.endSelector;
    elements.rulePreferDateTime.checked = defaultRule.time.preferDateTimeAttr;
    elements.ruleCustomJoiner.value = defaultRule.advanced.customJoiner;
    elements.ruleTrimBrackets.checked = defaultRule.advanced.trimBrackets;

    elements.deleteSiteRuleBtn.classList.add("hidden");
  }

  // モーダルタイトル設定
  document.getElementById("siteRuleModalTitle").textContent = rule
    ? `サイトルールの編集 - ${domain}`
    : "サイトルールの追加";

  // モーダル表示
  elements.siteRuleModal.style.display = "flex";
}

/**
 * サイトルールモーダルを閉じる
 */
function closeSiteRuleModal() {
  elements.siteRuleModal.style.display = "none";
  elements.ruleDomain.disabled = false;
}

/**
 * サイトルールを保存
 */
async function saveSiteRule() {
  console.log("ChronoClip: Starting saveSiteRule...");

  try {
    const domain = elements.ruleDomain.value.trim();

    if (!domain) {
      showToast("ドメイン名を入力してください", "error");
      return;
    }

    // ドメイン名の簡易検証
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain) && domain !== "*") {
      showToast("有効なドメイン名を入力してください", "error");
      return;
    }

    console.log("ChronoClip: Saving rule for domain:", domain);

    // ルールオブジェクトの構築
    const rule = {
      enabled: elements.ruleEnabled.checked,
      inheritSubdomains: elements.ruleInheritSubdomains.checked,
      date: {
        anchorSelector: elements.ruleDateAnchor.value.trim(),
        withinBlockSelector: elements.ruleDateBlock.value.trim(),
      },
      title: {
        fromSameBlockSelector: elements.ruleTitleSelector.value.trim(),
        fallbackFromPrevHeading: elements.ruleTitleFallback.checked,
      },
      description: {
        fromSameBlockSelectors: elements.ruleDescSelectors.value
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s),
        maxBlocks: parseInt(elements.ruleMaxBlocks.value) || 3,
        includeURL: elements.ruleIncludeURL.value,
      },
      location: {
        selector: elements.ruleLocationSelector.value.trim(),
      },
      time: {
        startSelector: elements.ruleTimeStart.value.trim(),
        endSelector: elements.ruleTimeEnd.value.trim(),
        preferDateTimeAttr: elements.rulePreferDateTime.checked,
      },
      filters: {
        removeSelectors: elements.ruleRemoveSelectors.value
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s),
        stopwords: elements.ruleStopwords.value
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s),
      },
      advanced: {
        customJoiner: elements.ruleCustomJoiner.value,
        trimBrackets: elements.ruleTrimBrackets.checked,
      },
    };

    console.log("ChronoClip: Constructed rule:", rule);

    // CSSセレクターの簡易検証
    const selectorsToValidate = [
      rule.date.anchorSelector,
      rule.date.withinBlockSelector,
      rule.title.fromSameBlockSelector,
      ...rule.description.fromSameBlockSelectors,
      rule.location.selector,
      rule.time.startSelector,
      rule.time.endSelector,
      ...rule.filters.removeSelectors,
    ].filter((s) => s);

    for (const selector of selectorsToValidate) {
      if (!isValidCSSSelector(selector)) {
        showToast(`無効なCSSセレクターです: ${selector}`, "error");
        return;
      }
    }

    // 新しいモジュール化システムで保存（優先）
    let savedWithNewSystem = false;
    if (window.ChronoClipSiteRuleManager) {
      try {
        console.log("ChronoClip: Saving with new SiteRuleManager system...");
        const siteRuleManager =
          window.ChronoClipSiteRuleManager.getSiteRuleManager();
        await siteRuleManager.initialize();

        // 新システム用のルール形式
        const newSystemRule = {
          ...rule,
          priority: 5, // UI追加ルールの優先度
          titleSelector: rule.title.fromSameBlockSelector,
          descriptionSelector: rule.description.fromSameBlockSelectors[0] || "",
          dateSelector: rule.date.anchorSelector,
          locationSelector: rule.location.selector,
          ignoreSelector: rule.filters.removeSelectors[0] || "",
          extractorModule: "general", // デフォルトエンジン
        };

        await siteRuleManager.addRule(domain, newSystemRule);
        console.log("ChronoClip: Saved with new system successfully");
        savedWithNewSystem = true;
      } catch (error) {
        console.error("ChronoClip: Failed to save with new system:", error);
      }
    }

    // 従来システムでも保存（後方互換性・フォールバック）
    try {
      console.log("ChronoClip: Saving with legacy system...");
      if (!currentSettings.siteRules) {
        currentSettings.siteRules = {};
      }
      currentSettings.siteRules[domain] = rule;

      // 設定を保存
      await window.ChronoClipSettings.setSettings(currentSettings);
      console.log("ChronoClip: Saved with legacy system successfully");
    } catch (error) {
      console.error("ChronoClip: Failed to save with legacy system:", error);
      if (!savedWithNewSystem) {
        throw error; // 両方失敗した場合はエラーを再発生
      }
    }

    const systemMessage = savedWithNewSystem
      ? "(新システム)" +
        (currentSettings.siteRules[domain] ? " & 従来システム" : "")
      : "(従来システムのみ)";

    showToast(
      `サイトルール "${domain}" を保存しました ${systemMessage}`,
      "success"
    );

    // UI更新
    updateSiteRulesUI();
    closeSiteRuleModal();

    // 変更フラグ設定
    isDirty = true;
    updateSaveButtonState();
  } catch (error) {
    console.error("ChronoClip: saveSiteRule failed:", error);
    showToast("サイトルールの保存に失敗しました: " + error.message, "error");
  }
}

/**
 * CSSセレクターの簡易検証
 */
function isValidCSSSelector(selector) {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * サイトルールの有効/無効切り替え
 */
async function toggleSiteRule(domain) {
  try {
    if (currentSettings.siteRules && currentSettings.siteRules[domain]) {
      const newStatus = !currentSettings.siteRules[domain].enabled;
      currentSettings.siteRules[domain].enabled = newStatus;

      // 新しいモジュール化システムでも更新
      if (window.ChronoClipSiteRuleManager) {
        const siteRuleManager =
          window.ChronoClipSiteRuleManager.getSiteRuleManager();
        await siteRuleManager.initialize();

        const rule = await siteRuleManager.getRuleForDomain(domain);
        if (rule) {
          rule.enabled = newStatus;
          await siteRuleManager.addRule(domain, rule);
        }
      }

      updateSiteRulesUI();
      isDirty = true;
      updateSaveButtonState();

      const status = newStatus ? "有効" : "無効";
      showToast(`サイトルール "${domain}" を${status}にしました`, "success");
    }
  } catch (error) {
    console.error("サイトルール有効/無効切り替えエラー:", error);
    showToast("サイトルールの切り替えに失敗しました", "error");
  }
}

/**
 * サイトルール編集
 */
async function editSiteRule(domain) {
  try {
    let rule = null;

    // 新しいモジュール化システムからルールを取得
    if (window.ChronoClipSiteRuleManager) {
      const siteRuleManager =
        window.ChronoClipSiteRuleManager.getSiteRuleManager();
      await siteRuleManager.initialize();
      rule = await siteRuleManager.getRuleForDomain(domain);
    }

    // フォールバック: 従来設定からルールを取得
    if (
      !rule &&
      currentSettings.siteRules &&
      currentSettings.siteRules[domain]
    ) {
      rule = currentSettings.siteRules[domain];
    }

    if (rule) {
      openSiteRuleModal(domain, rule);
    } else {
      showToast(`サイトルール "${domain}" が見つかりません`, "error");
    }
  } catch (error) {
    console.error("サイトルール編集エラー:", error);
    showToast("サイトルールの取得に失敗しました", "error");
  }
}

/**
 * サイトルール削除確認
 */
function confirmDeleteSiteRule(domain) {
  showConfirmModal(
    "サイトルールの削除",
    `サイトルール "${domain}" を削除しますか？この操作は取り消せません。`,
    () => deleteSiteRuleConfirmed(domain)
  );
}

/**
 * サイトルール削除実行
 */
async function deleteSiteRuleConfirmed(domain) {
  try {
    // 新しいモジュール化システムで削除
    if (window.ChronoClipSiteRuleManager) {
      const siteRuleManager =
        window.ChronoClipSiteRuleManager.getSiteRuleManager();
      await siteRuleManager.initialize();
      await siteRuleManager.removeRule(domain);
    }

    // 従来の設定からも削除
    if (currentSettings.siteRules && currentSettings.siteRules[domain]) {
      delete currentSettings.siteRules[domain];
    }

    updateSiteRulesUI();
    isDirty = true;
    updateSaveButtonState();
    showToast(`サイトルール "${domain}" を削除しました`, "success");
  } catch (error) {
    console.error("サイトルール削除エラー:", error);
    showToast("サイトルールの削除に失敗しました", "error");
  }
}

/**
 * サイトルール削除（モーダル内から）
 */
function deleteSiteRule() {
  const domain = elements.ruleDomain.value;
  confirmDeleteSiteRule(domain);
  closeSiteRuleModal();
}

/**
 * サイトルールテスト実行
 */
async function testSiteRule() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      showToast("アクティブなタブが見つかりません", "warning");
      return;
    }

    const domain = elements.ruleDomain.value.trim();
    const currentDomain = new URL(tabs[0].url).hostname;

    if (domain !== currentDomain) {
      showToast(`テストするには ${domain} のページを開いてください`, "warning");
      return;
    }

    showToast("サイトルールのテスト機能は開発中です", "info");
  } catch (error) {
    showToast("テスト実行に失敗しました", "error");
    console.error("Site rule test error:", error);
  }
}

/**
 * サイトルールのエクスポート
 */
function exportSiteRules() {
  const siteRules = currentSettings.siteRules || {};
  const dataStr = JSON.stringify(siteRules, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(dataBlob);
  link.download = `chronoclip-site-rules-${
    new Date().toISOString().split("T")[0]
  }.json`;
  link.click();

  showToast("サイトルールをエクスポートしました", "success");
}

/**
 * サイトルールのインポート
 */
async function importSiteRules(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedRules = JSON.parse(text);

    if (typeof importedRules !== "object" || importedRules === null) {
      throw new Error("無効なファイル形式です");
    }

    // 既存ルールとマージするか確認
    const existingCount = Object.keys(currentSettings.siteRules || {}).length;
    if (existingCount > 0) {
      showConfirmModal(
        "サイトルールのインポート",
        `既存の${existingCount}件のルールにインポートしたルールを追加しますか？同じドメインのルールは上書きされます。`,
        () => {
          currentSettings.siteRules = {
            ...currentSettings.siteRules,
            ...importedRules,
          };
          updateSiteRulesUI();
          isDirty = true;
          updateSaveButtonState();
          showToast(
            `${
              Object.keys(importedRules).length
            }件のサイトルールをインポートしました`,
            "success"
          );
        }
      );
    } else {
      currentSettings.siteRules = importedRules;
      updateSiteRulesUI();
      isDirty = true;
      updateSaveButtonState();
      showToast(
        `${
          Object.keys(importedRules).length
        }件のサイトルールをインポートしました`,
        "success"
      );
    }
  } catch (error) {
    showToast("ファイルの読み込みに失敗しました: " + error.message, "error");
  }

  // ファイル入力をリセット
  event.target.value = "";
}

/**
 * 折りたたみセクションの切り替え
 */
function toggleCollapsibleSection(event) {
  const header = event.currentTarget;
  const section = header.closest(".collapsible");
  section.classList.toggle("collapsed");
}

/**
 * logger/errorHandlerの初期化
 */
async function initializeLogging() {
  try {
    if (window.ChronoClipLogger) {
      logger = new window.ChronoClipLogger();
      console.log("ChronoClip: Options logger initialized");
    }

    if (window.ChronoClipErrorHandler) {
      errorHandler = new window.ChronoClipErrorHandler();
      logger?.info("Options error handler initialized");
    }

    if (!logger || !errorHandler) {
      console.warn(
        "ChronoClip: Logger or ErrorHandler not available in options"
      );
    }
  } catch (error) {
    console.error(
      "ChronoClip: Failed to initialize logging in options:",
      error
    );
  }
}

/**
 * デバッグ機能の初期化
 */
function initializeDebugFeatures() {
  // デバッグボタンのイベントリスナー
  const clearLogsBtn = document.getElementById("clearLogsBtn");
  const exportLogsBtn = document.getElementById("exportLogsBtn");
  const testErrorHandlingBtn = document.getElementById("testErrorHandlingBtn");
  const showSystemInfoBtn = document.getElementById("showSystemInfoBtn");

  const refreshLogsBtn = document.getElementById("refreshLogsBtn");
  const hideLogsBtn = document.getElementById("hideLogsBtn");
  const hideSystemInfoBtn = document.getElementById("hideSystemInfoBtn");

  const logLevelFilter = document.getElementById("logLevelFilter");

  // ログクリア
  clearLogsBtn?.addEventListener("click", () => {
    try {
      if (logger && typeof logger.clearLogs === "function") {
        logger.clearLogs();
        showToast("ログをクリアしました", "success");
        refreshDebugLogs();
      } else {
        showToast("ログクリア機能が利用できません", "error");
      }
    } catch (error) {
      logger?.error("Failed to clear logs", error);
      showToast("ログクリアに失敗しました", "error");
    }
  });

  // ログエクスポート
  exportLogsBtn?.addEventListener("click", async () => {
    try {
      const logs = await getLogEntries();
      const logData = {
        timestamp: new Date().toISOString(),
        entries: logs,
        systemInfo: await getSystemInfo(),
      };

      const blob = new Blob([JSON.stringify(logData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `chronoclip-logs-${new Date()
        .toISOString()
        .replace(/:/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("ログを出力しました", "success");
      logger?.info("Logs exported successfully");
    } catch (error) {
      logger?.error("Failed to export logs", error);
      showToast("ログ出力に失敗しました", "error");
    }
  });

  // エラーハンドリングテスト
  testErrorHandlingBtn?.addEventListener("click", () => {
    try {
      const testErrors = [
        { type: "Error", message: "テスト用エラーメッセージ" },
        { type: "TypeError", message: "undefined is not a function" },
        { type: "NetworkError", message: "Failed to fetch from API" },
      ];

      const randomError =
        testErrors[Math.floor(Math.random() * testErrors.length)];
      const error = new Error(randomError.message);
      error.name = randomError.type;

      if (errorHandler) {
        const result = errorHandler.handleError(
          error,
          "エラーハンドリングテスト"
        );
        showToast("エラーハンドリングテストを実行しました", "info");
        logger?.info("Error handling test executed", { result });
      } else {
        throw new Error("ErrorHandler not available");
      }
    } catch (error) {
      logger?.error("Failed to test error handling", error);
      showToast("エラーハンドリングテストに失敗しました", "error");
    }
  });

  // システム情報表示
  showSystemInfoBtn?.addEventListener("click", async () => {
    try {
      const systemInfo = await getSystemInfo();
      displaySystemInfo(systemInfo);
      showToast("システム情報を表示しました", "info");
    } catch (error) {
      logger?.error("Failed to show system info", error);
      showToast("システム情報表示に失敗しました", "error");
    }
  });

  // ログ更新
  refreshLogsBtn?.addEventListener("click", () => {
    refreshDebugLogs();
    showToast("ログを更新しました", "info");
  });

  // ログ非表示
  hideLogsBtn?.addEventListener("click", () => {
    const container = document.getElementById("debugLogsContainer");
    container?.classList.add("hidden");
  });

  // システム情報非表示
  hideSystemInfoBtn?.addEventListener("click", () => {
    const container = document.getElementById("systemInfoContainer");
    container?.classList.add("hidden");
  });

  // ログレベルフィルター
  logLevelFilter?.addEventListener("change", () => {
    refreshDebugLogs();
  });
}

/**
 * デバッグログの更新
 */
async function refreshDebugLogs() {
  try {
    const logs = await getLogEntries();
    const levelFilter =
      document.getElementById("logLevelFilter")?.value || "all";
    const filteredLogs =
      levelFilter === "all"
        ? logs
        : logs.filter((log) => log.level === levelFilter);

    const output = document.getElementById("debugLogsOutput");
    if (output) {
      output.innerHTML = "";

      if (filteredLogs.length === 0) {
        output.textContent = "ログエントリがありません";
        return;
      }

      filteredLogs.slice(-100).forEach((entry) => {
        const logDiv = document.createElement("div");
        logDiv.className = `debug-log-entry ${entry.level}`;

        const timestamp = new Date(entry.timestamp).toLocaleString();
        logDiv.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="log-level">[${entry.level.toUpperCase()}]</span> ${
          entry.message
        }`;

        if (entry.context) {
          const contextSpan = document.createElement("span");
          contextSpan.className = "log-context";
          contextSpan.textContent = ` | ${JSON.stringify(entry.context)}`;
          logDiv.appendChild(contextSpan);
        }

        output.appendChild(logDiv);
      });

      // 最新のログまでスクロール
      output.scrollTop = output.scrollHeight;
    }

    // ログコンテナを表示
    const container = document.getElementById("debugLogsContainer");
    container?.classList.remove("hidden");
  } catch (error) {
    logger?.error("Failed to refresh debug logs", error);
  }
}

/**
 * ログエントリの取得
 */
async function getLogEntries() {
  try {
    // logger からログ履歴を取得
    if (logger && typeof logger.getLogs === "function") {
      return await logger.getLogs();
    }

    // フォールバック: Chrome storage から取得
    const result = await chrome.storage.local.get(["chronoclip_logs"]);
    return result.chronoclip_logs || [];
  } catch (error) {
    console.error("Failed to get log entries:", error);
    return [];
  }
}

/**
 * システム情報の取得
 */
async function getSystemInfo() {
  const manifest = chrome.runtime.getManifest();
  const settings = currentSettings || {};

  const systemInfo = {
    extension: {
      version: manifest.version,
      manifestVersion: manifest.manifest_version,
      name: manifest.name,
    },
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
    },
    settings: {
      autoDetect: settings.autoDetect,
      highlightDates: settings.highlightDates,
      debugMode: settings.debugMode,
      errorReportConsent: settings.errorReportConsent,
      timezone: settings.timezone,
    },
    storage: {
      // ストレージ使用量情報
    },
    permissions: {
      // 権限情報
    },
  };

  try {
    // ストレージ使用量を取得
    const storageInfo = await chrome.storage.local.getBytesInUse();
    systemInfo.storage.bytesInUse = storageInfo;
  } catch (error) {
    systemInfo.storage.error = error.message;
  }

  try {
    // 権限情報を取得
    const permissions = await chrome.permissions.getAll();
    systemInfo.permissions = permissions;
  } catch (error) {
    systemInfo.permissions.error = error.message;
  }

  return systemInfo;
}

/**
 * システム情報の表示
 */
function displaySystemInfo(systemInfo) {
  const output = document.getElementById("systemInfoOutput");
  if (!output) return;

  output.innerHTML = "";

  // セクション作成関数
  function createSection(title, data) {
    const section = document.createElement("div");
    section.className = "system-info-section";

    const header = document.createElement("h4");
    header.textContent = title;
    section.appendChild(header);

    Object.entries(data).forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "system-info-item";

      const keySpan = document.createElement("span");
      keySpan.className = "system-info-key";
      keySpan.textContent = key;

      const valueSpan = document.createElement("span");
      valueSpan.className = "system-info-value";
      valueSpan.textContent =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      item.appendChild(keySpan);
      item.appendChild(valueSpan);
      section.appendChild(item);
    });

    return section;
  }

  // 各セクションを追加
  output.appendChild(createSection("拡張機能情報", systemInfo.extension));
  output.appendChild(createSection("ブラウザ情報", systemInfo.browser));
  output.appendChild(createSection("設定情報", systemInfo.settings));
  output.appendChild(createSection("ストレージ情報", systemInfo.storage));
  output.appendChild(createSection("権限情報", systemInfo.permissions));

  // システム情報コンテナを表示
  const container = document.getElementById("systemInfoContainer");
  container?.classList.remove("hidden");
}

// グローバル関数として公開（HTML内のonclick用）
window.removeDateFormat = removeDateFormat;
window.removeSiteRule = removeSiteRule;
window.openTestPage = openTestPage;
window.toggleSiteRule = toggleSiteRule;
window.editSiteRule = editSiteRule;
window.confirmDeleteSiteRule = confirmDeleteSiteRule;
window.addCurrentSiteRule = addCurrentSiteRule;
window.filterSiteRules = filterSiteRules;
window.openSiteRuleModal = openSiteRuleModal;
window.closeSiteRuleModal = closeSiteRuleModal;
window.saveSiteRule = saveSiteRule;
window.exportSiteRules = exportSiteRules;
window.importSiteRules = importSiteRules;
window.toggleCollapsibleSection = toggleCollapsibleSection;

console.log("ChronoClip: Options script loaded");
