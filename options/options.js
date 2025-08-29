/**
 * @fileoverview ChronoClip オプション画面のJavaScript
 * 設定の読み込み、保存、バリデーション、UI制御を担当
 */

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
 * ページ読み込み時の初期化
 */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("ChronoClip: Options page loaded");

  try {
    initializeElements();
    await loadSettings();
    initializeEventListeners();
    updateUI();
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
  elements = {
    form: document.getElementById("settingsForm"),
    autoDetect: document.getElementById("autoDetect"),
    highlightDates: document.getElementById("highlightDates"),
    includeURL: document.getElementById("includeURL"),
    defaultDuration: document.getElementById("defaultDuration"),
    defaultCalendar: document.getElementById("defaultCalendar"),
    timezone: document.getElementById("timezone"),
    dateFormatsContainer: document.getElementById("dateFormatsContainer"),
    rulesEnabled: document.getElementById("rulesEnabled"),
    siteRulesContainer: document.getElementById("siteRulesContainer"),
    siteRulesList: document.getElementById("siteRulesList"),
    addSiteRuleBtn: document.getElementById("addSiteRuleBtn"),
    saveBtn: document.getElementById("saveBtn"),
    resetBtn: document.getElementById("resetBtn"),
    toastContainer: document.getElementById("toastContainer"),
    confirmModal: document.getElementById("confirmModal"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmOk: document.getElementById("confirmOk"),
    confirmCancel: document.getElementById("confirmCancel"),

    // サイトルール関連要素
    currentTabSuggestion: document.getElementById("currentTabSuggestion"),
    currentTabDomain: document.getElementById("currentTabDomain"),
    addCurrentSiteBtn: document.getElementById("addCurrentSiteBtn"),
    siteRuleSearch: document.getElementById("siteRuleSearch"),
    noRulesMessage: document.getElementById("noRulesMessage"),
    exportSiteRulesBtn: document.getElementById("exportSiteRulesBtn"),
    importSiteRulesBtn: document.getElementById("importSiteRulesBtn"),
    importSiteRulesInput: document.getElementById("importSiteRulesInput"),

    // サイトルールモーダル関連
    siteRuleModal: document.getElementById("siteRuleModal"),
    closeSiteRuleModal: document.getElementById("closeSiteRuleModal"),
    siteRuleForm: document.getElementById("siteRuleForm"),
    saveSiteRuleBtn: document.getElementById("saveSiteRuleBtn"),
    deleteSiteRuleBtn: document.getElementById("deleteSiteRuleBtn"),
    testSiteRuleBtn: document.getElementById("testSiteRuleBtn"),

    // サイトルールフォーム項目
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
  };
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
 * イベントリスナーを初期化
 */
function initializeEventListeners() {
  // フォーム送信
  elements.form.addEventListener("submit", handleSave);

  // リセットボタン
  elements.resetBtn.addEventListener("click", handleReset);

  // サイトルール関連
  elements.rulesEnabled.addEventListener("change", handleRulesEnabledChange);
  elements.addSiteRuleBtn.addEventListener("click", () => openSiteRuleModal());
  elements.addCurrentSiteBtn.addEventListener("click", addCurrentSiteRule);
  elements.siteRuleSearch.addEventListener("input", filterSiteRules);
  elements.exportSiteRulesBtn.addEventListener("click", exportSiteRules);
  elements.importSiteRulesBtn.addEventListener("click", () =>
    elements.importSiteRulesInput.click()
  );
  elements.importSiteRulesInput.addEventListener("change", importSiteRules);

  // サイトルールモーダル関連
  elements.closeSiteRuleModal.addEventListener("click", closeSiteRuleModal);
  elements.saveSiteRuleBtn.addEventListener("click", saveSiteRule);
  elements.deleteSiteRuleBtn.addEventListener("click", deleteSiteRule);
  elements.testSiteRuleBtn.addEventListener("click", testSiteRule);
  elements.siteRuleModal.addEventListener("click", (e) => {
    if (e.target === elements.siteRuleModal) {
      closeSiteRuleModal();
    }
  });

  // 折りたたみセクション
  document.querySelectorAll(".collapsible-header").forEach((header) => {
    header.addEventListener("click", toggleCollapsibleSection);
  });

  // 設定変更検知
  elements.form.addEventListener("input", () => {
    isDirty = true;
    updateSaveButtonState();
  });

  // モーダル関連
  elements.confirmOk.addEventListener("click", handleConfirmOk);
  elements.confirmCancel.addEventListener("click", hideConfirmModal);

  // ページ離脱前の確認
  window.addEventListener("beforeunload", handleBeforeUnload);

  // 現在のタブ情報を取得
  getCurrentTabInfo();
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
  e.preventDefault();

  try {
    // フォームから設定を取得
    const formSettings = getSettingsFromForm();

    // バリデーション
    const validation = window.ChronoClipSettings.validateSettings(formSettings);
    if (!validation.isValid) {
      const errors = validation.errors
        .map((e) => `${e.field}: ${e.message}`)
        .join("\n");
      showToast(`設定にエラーがあります:\n${errors}`, "error");
      return;
    }

    // 保存実行
    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = "保存中...";

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
    elements.saveBtn.disabled = false;
    elements.saveBtn.textContent = "設定を保存";
  }
}

/**
 * フォームから設定オブジェクトを取得
 */
function getSettingsFromForm() {
  return {
    ...currentSettings,
    autoDetect: elements.autoDetect.checked,
    highlightDates: elements.highlightDates.checked,
    includeURL: elements.includeURL.checked,
    defaultDuration: parseInt(elements.defaultDuration.value, 10),
    defaultCalendar: elements.defaultCalendar.value,
    timezone: elements.timezone.value,
    rulesEnabled: elements.rulesEnabled.checked,
    // dateFormats と siteRules は既に currentSettings に反映済み
  };
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
    if (tabs.length > 0) {
      const url = new URL(tabs[0].url);
      const domain = url.hostname;

      // chrome:// や file:// などは除外
      if (url.protocol === "http:" || url.protocol === "https:") {
        elements.currentTabDomain.textContent = domain;
        elements.currentTabSuggestion.classList.remove("hidden");
      }
    }
  } catch (error) {
    console.log("現在のタブ情報取得に失敗:", error);
  }
}

/**
 * サイトルール一覧UIを更新
 */
function updateSiteRulesUI() {
  const siteRules = currentSettings.siteRules || {};
  const ruleEntries = Object.entries(siteRules);

  if (ruleEntries.length === 0) {
    elements.siteRulesList.innerHTML =
      '<div class="no-rules-message"><p>まだサイトルールが設定されていません。</p><p>「新しいルールを追加」ボタンまたは現在のタブの提案からルールを作成してください。</p></div>';
    elements.noRulesMessage.classList.remove("hidden");
    return;
  }

  elements.noRulesMessage.classList.add("hidden");

  const searchTerm = elements.siteRuleSearch.value.toLowerCase();
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
          ${rule.enabled ? "有効" : "無効"}
        </div>
      </div>
      <div class="site-rule-actions">
        <button type="button" class="secondary-btn small-btn" onclick="toggleSiteRule('${domain}')">
          ${rule.enabled ? "無効化" : "有効化"}
        </button>
        <button type="button" class="secondary-btn small-btn" onclick="editSiteRule('${domain}')">
          編集
        </button>
        <button type="button" class="danger-btn small-btn" onclick="confirmDeleteSiteRule('${domain}')">
          削除
        </button>
      </div>
    </div>
  `
    )
    .join("");
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
  // フォームをリセット
  elements.siteRuleForm.reset();

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
  const domain = elements.ruleDomain.value.trim();

  if (!domain) {
    showToast("ドメイン名を入力してください", "error");
    return;
  }

  // ドメイン名の簡易検証
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    showToast("有効なドメイン名を入力してください", "error");
    return;
  }

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

  // 設定に追加
  if (!currentSettings.siteRules) {
    currentSettings.siteRules = {};
  }
  currentSettings.siteRules[domain] = rule;

  // UI更新
  updateSiteRulesUI();
  closeSiteRuleModal();

  // 変更フラグ設定
  isDirty = true;
  updateSaveButtonState();

  showToast(`サイトルール "${domain}" を保存しました`, "success");
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
function toggleSiteRule(domain) {
  if (currentSettings.siteRules && currentSettings.siteRules[domain]) {
    currentSettings.siteRules[domain].enabled =
      !currentSettings.siteRules[domain].enabled;
    updateSiteRulesUI();
    isDirty = true;
    updateSaveButtonState();

    const status = currentSettings.siteRules[domain].enabled ? "有効" : "無効";
    showToast(`サイトルール "${domain}" を${status}にしました`, "success");
  }
}

/**
 * サイトルール編集
 */
function editSiteRule(domain) {
  const rule = currentSettings.siteRules[domain];
  if (rule) {
    openSiteRuleModal(domain, rule);
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
function deleteSiteRuleConfirmed(domain) {
  if (currentSettings.siteRules && currentSettings.siteRules[domain]) {
    delete currentSettings.siteRules[domain];
    updateSiteRulesUI();
    isDirty = true;
    updateSaveButtonState();
    showToast(`サイトルール "${domain}" を削除しました`, "success");
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

// グローバル関数として公開（HTML内のonclick用）
window.removeDateFormat = removeDateFormat;
window.removeSiteRule = removeSiteRule;
window.openTestPage = openTestPage;
window.toggleSiteRule = toggleSiteRule;
window.editSiteRule = editSiteRule;
window.confirmDeleteSiteRule = confirmDeleteSiteRule;

console.log("ChronoClip: Options script loaded");
