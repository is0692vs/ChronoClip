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
  elements.addSiteRuleBtn.addEventListener("click", addSiteRule);

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

// グローバル関数として公開（HTML内のonclick用）
window.removeDateFormat = removeDateFormat;
window.removeSiteRule = removeSiteRule;
window.openTestPage = openTestPage;

console.log("ChronoClip: Options script loaded");
