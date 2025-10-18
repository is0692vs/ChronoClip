// popup/popup.js

// グローバル変数
let logger = null;
let errorHandler = null;

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup script loaded.");

  // logger/errorHandlerの初期化
  await initializeLogging();

  const statusMessage = document.getElementById("status-message");
  const userInfoDisplay = document.getElementById("user-info");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  // エラー表示UI要素
  const errorNotification = document.getElementById("error-notification");
  const errorTitle = document.getElementById("error-title");
  const errorMessage = document.getElementById("error-message");
  const errorDetails = document.getElementById("error-details");
  const errorDetailsText = document.getElementById("error-details-text");
  const errorCloseBtn = document.getElementById("error-close");
  const errorToggleDetailsBtn = document.getElementById("error-toggle-details");
  const errorRetryBtn = document.getElementById("error-retry");
  const errorReportBtn = document.getElementById("error-report");

  // 成功通知UI要素
  const successNotification = document.getElementById("success-notification");
  const successMessage = document.getElementById("success-message");
  const successCloseBtn = document.getElementById("success-close");

  // 現在のエラー情報
  let currentError = null;
  let currentRetryAction = null;

  /**
   * logger/errorHandlerの初期化
   */
  async function initializeLogging() {
    try {
      if (window.ChronoClipLogger) {
        logger = new window.ChronoClipLogger();
        logger.info("Popup logger initialized");
      }

      if (window.ChronoClipErrorHandler) {
        errorHandler = new window.ChronoClipErrorHandler();
        logger?.info("Popup error handler initialized");
      }

      if (!logger || !errorHandler) {
        console.warn(
          "ChronoClip: Logger or ErrorHandler not available in popup"
        );
      }
    } catch (error) {
      console.error(
        "ChronoClip: Failed to initialize logging in popup:",
        error
      );
    }
  }

  /**
   * エラーを表示する
   * @param {Error|string} error - エラー情報
   * @param {string} context - エラーコンテキスト
   * @param {Function} retryAction - 再試行アクション（オプション）
   */
  function showError(error, context = "不明な操作", retryAction = null) {
    try {
      const errorResult = errorHandler?.handleError(error, context) || {
        userMessage: {
          message:
            typeof error === "string"
              ? error
              : "予期しないエラーが発生しました",
          details: error?.stack || String(error),
        },
      };

      currentError = error;
      currentRetryAction = retryAction;

      // エラー表示を更新
      errorTitle.textContent = `${context}でエラーが発生しました`;
      errorMessage.textContent = errorResult.userMessage.message;

      if (errorResult.userMessage.details) {
        errorDetailsText.textContent = errorResult.userMessage.details;
        errorToggleDetailsBtn.style.display = "block";
      } else {
        errorToggleDetailsBtn.style.display = "none";
      }
      // 再試行ボタンの表示制御
      if (retryAction) {
        errorRetryBtn.classList.remove("hidden");
      } else {
        errorRetryBtn.classList.add("hidden");
      }

      // エラー通知を表示
      errorNotification.classList.remove("hidden");

      logger?.warn("Error displayed in popup", { error, context });
    } catch (displayError) {
      console.error("ChronoClip: Failed to display error:", displayError);
      // フォールバック表示
      errorTitle.textContent = "エラーが発生しました";
      errorMessage.textContent =
        typeof error === "string" ? error : "予期しないエラーが発生しました";
      errorNotification.classList.remove("hidden");
    }
  }

  /**
   * 成功メッセージを表示する
   * @param {string} message - 成功メッセージ
   * @param {number} autoHideMs - 自動非表示時間（ミリ秒、0で自動非表示しない）
   */
  function showSuccess(message, autoHideMs = 3000) {
    successMessage.textContent = message;
    successNotification.classList.remove("hidden");

    logger?.info("Success message displayed", { message });

    if (autoHideMs > 0) {
      setTimeout(() => {
        successNotification.classList.add("hidden");
      }, autoHideMs);
    }
  }

  /**
   * 一括処理結果を表示する
   * @param {Object} batchResult - handleBatchResultの結果オブジェクト
   * @param {Array} failedItems - 失敗したアイテムのリスト（再試行用）
   */
  function showBatchResult(batchResult, failedItems = []) {
    try {
      const { total, successful, failed, message } = batchResult;

      if (failed === 0) {
        // 全成功
        showSuccess(`${successful}件のイベントを追加しました`, 4000);
      } else if (successful === 0) {
        // 全失敗
        const retryAction =
          failedItems.length > 0 ? () => retryFailedItems(failedItems) : null;
        showError(new Error(message), "一括追加", retryAction);
      } else {
        // 部分成功 - 成功通知とエラー通知を両方表示
        showSuccess(`${successful}件のイベントを追加しました`, 4000);

        setTimeout(() => {
          const retryAction =
            failedItems.length > 0 ? () => retryFailedItems(failedItems) : null;
          showError(
            new Error(`${failed}件のイベント追加に失敗しました`),
            "一括追加",
            retryAction
          );
        }, 1000);
      }

      logger?.info("Batch result displayed", batchResult);
    } catch (error) {
      logger?.error("Failed to display batch result", error);
      showError(error, "結果表示");
    }
  }

  /**
   * 失敗したアイテムの再試行
   * @param {Array} failedItems - 失敗したアイテムのリスト
   */
  async function retryFailedItems(failedItems) {
    try {
      logger?.info("Retrying failed items", { count: failedItems.length });

      // background scriptに再試行リクエストを送信
      const response = await chrome.runtime.sendMessage({
        type: "retry_failed_items",
        items: failedItems,
      });

      if (response && response.success) {
        // 再試行結果を表示
        const retryResult = errorHandler?.handleBatchResult(response.results);
        if (retryResult) {
          showBatchResult(
            retryResult,
            response.results.filter((r) => !r.success)
          );
        } else {
          showSuccess("再試行が完了しました");
        }
      } else {
        throw new Error(response?.error || "再試行に失敗しました");
      }
    } catch (error) {
      logger?.error("Failed to retry items", error);
      showError(error, "再試行");
    }
  }

  /**
   * エラー表示を隠す
   */
  function hideError() {
    errorNotification.classList.add("hidden");
    errorDetails.classList.add("hidden");
    errorToggleDetailsBtn.textContent = "詳細表示";
    currentError = null;
    currentRetryAction = null;
  }

  /**
   * 成功表示を隠す
   */
  function hideSuccess() {
    successNotification.classList.add("hidden");
  }

  // エラー表示のイベントリスナー
  errorCloseBtn.addEventListener("click", hideError);

  errorToggleDetailsBtn.addEventListener("click", () => {
    const isHidden = errorDetails.classList.contains("hidden");
    if (isHidden) {
      errorDetails.classList.remove("hidden");
      errorToggleDetailsBtn.textContent = "詳細非表示";
    } else {
      errorDetails.classList.add("hidden");
      errorToggleDetailsBtn.textContent = "詳細表示";
    }
  });

  errorRetryBtn.addEventListener("click", async () => {
    if (currentRetryAction) {
      hideError();
      try {
        await currentRetryAction();
        showSuccess("再試行が完了しました");
      } catch (retryError) {
        showError(retryError, "再試行", currentRetryAction);
      }
    }
  });

  errorReportBtn.addEventListener("click", async () => {
    try {
      // エラーレポート送信（仮実装）
      const settings = (await window.ChronoClipSettings?.getSettings()) || {};
      if (settings.errorReportConsent) {
        logger?.info("Error report would be sent", { error: currentError });
        showSuccess("エラーレポートを送信しました", 2000);
      } else {
        showError(
          "エラーレポート送信にはオプションページで同意が必要です",
          "レポート送信"
        );
      }
    } catch (reportError) {
      showError(reportError, "レポート送信");
    }
  });

  // 成功通知のイベントリスナー
  successCloseBtn.addEventListener("click", hideSuccess);

  // 設定情報表示エリア（HTMLに追加が必要）
  let settingsInfo = document.getElementById("settings-info");
  if (!settingsInfo) {
    // 設定情報表示エリアを動的に作成
    settingsInfo = document.createElement("div");
    settingsInfo.id = "settings-info";
    settingsInfo.style.cssText = `
      margin-top: 10px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 12px;
      color: #666;
    `;
    document.body.appendChild(settingsInfo);
  }

  // 設定を読み込み・表示
  let currentSettings = null;
  async function loadAndDisplaySettings() {
    try {
      currentSettings = await window.ChronoClipSettings.getSettings();
      updateSettingsDisplay();
      logger?.debug("Settings loaded in popup", currentSettings);
    } catch (error) {
      logger?.error("Failed to load settings in popup", error);
      settingsInfo.innerHTML =
        '<span style="color: red;">設定の読み込みに失敗</span>';
      showError(error, "設定読み込み");
    }
  }

  /**
   * 設定表示を更新
   */
  function updateSettingsDisplay() {
    if (!currentSettings) {
      settingsInfo.innerHTML = "設定が読み込まれていません";
      return;
    }

    const autoDetectStatus = currentSettings.autoDetect ? "ON" : "OFF";
    const highlightStatus = currentSettings.highlightDates ? "ON" : "OFF";
    const defaultDurationHours = Math.floor(
      currentSettings.defaultDuration / 60
    );
    const defaultDurationMinutes = currentSettings.defaultDuration % 60;
    
    // Find calendar name from calendar list
    let calendarName = "プライマリカレンダー";
    if (currentSettings.calendarList && currentSettings.calendarList.length > 0) {
      const selectedCalendar = currentSettings.calendarList.find(
        cal => cal.id === currentSettings.defaultCalendar
      );
      if (selectedCalendar) {
        calendarName = selectedCalendar.summary || selectedCalendar.id;
      }
    }

    settingsInfo.innerHTML = `
      <strong>現在の設定:</strong><br>
      • 自動検出: ${autoDetectStatus}<br>
      • ハイライト: ${highlightStatus}<br>
      • デフォルト時間: ${defaultDurationHours}時間${defaultDurationMinutes}分<br>
      • タイムゾーン: ${currentSettings.timezone}<br>
      • カレンダー: ${calendarName}<br>
      <small><a href="#" id="open-options">設定を変更</a></small>
    `;

    // 設定変更リンクのイベントリスナー
    const openOptionsLink = document.getElementById("open-options");
    if (openOptionsLink) {
      openOptionsLink.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
        window.close(); // ポップアップを閉じる
      });
    }
  }

  /**
   * UIを更新し、認証状態を表示します。
   */
  async function updateAuthUI() {
    statusMessage.textContent = "認証状態を確認中...";
    userInfoDisplay.style.display = "none";
    loginButton.style.display = "none";
    logoutButton.style.display = "none";

    try {
      logger?.debug("Checking auth status");
      const response = await chrome.runtime.sendMessage({
        type: "auth_check_status",
      });
      logger?.debug("Auth status response received", response);

      if (response && response.loggedIn) {
        statusMessage.textContent = "ログイン済み";
        userInfoDisplay.textContent = `(${response.userInfo.email})`;
        userInfoDisplay.style.display = "block";
        logoutButton.style.display = "block";
        logger?.info("User is logged in", { email: response.userInfo.email });
      } else {
        statusMessage.textContent = "ログインしていません";
        loginButton.style.display = "block";
        logger?.info("User is not logged in");
      }
    } catch (error) {
      logger?.error("Error checking auth status", error);
      statusMessage.textContent = "認証状態の確認中にエラーが発生しました。";
      loginButton.style.display = "block"; // エラー時はログインボタンを表示
      showError(error, "認証状態確認");
    }
  }

  // ログインボタンのイベントリスナー
  loginButton.addEventListener("click", async () => {
    statusMessage.textContent = "ログイン処理中...";
    loginButton.disabled = true; // ボタンを無効化して二重クリック防止

    try {
      logger?.info("Starting login process");
      const response = await chrome.runtime.sendMessage({ type: "auth_login" });
      if (response && response.success) {
        logger?.info("Login successful", { userInfo: response.userInfo });
        await updateAuthUI(); // UIを更新
        showSuccess("ログインしました");
      } else {
        const errorMsg = response.error || "不明なエラー";
        logger?.error("Login failed", { error: errorMsg });
        statusMessage.textContent = `ログイン失敗: ${errorMsg}`;
        showError(new Error(errorMsg), "ログイン", () => loginButton.click());
      }
    } catch (error) {
      logger?.error("Login message error", error);
      statusMessage.textContent = `ログイン中にエラーが発生しました: ${error.message}`;
      showError(error, "ログイン", () => loginButton.click());
    } finally {
      loginButton.disabled = false; // ボタンを再度有効化
    }
  });

  // ログアウトボタンのイベントリスナー
  logoutButton.addEventListener("click", async () => {
    statusMessage.textContent = "ログアウト処理中...";
    logoutButton.disabled = true; // ボタンを無効化

    try {
      logger?.info("Starting logout process");
      const response = await chrome.runtime.sendMessage({
        type: "auth_logout",
      });
      if (response && response.success) {
        logger?.info("Logout successful");
        await updateAuthUI(); // UIを更新
        showSuccess("ログアウトしました");
      } else {
        logger?.error("Logout failed");
        statusMessage.textContent = "ログアウト失敗。";
        showError(new Error("ログアウトに失敗しました"), "ログアウト", () =>
          logoutButton.click()
        );
      }
    } catch (error) {
      logger?.error("Logout message error", error);
      statusMessage.textContent = `ログアウト中にエラーが発生しました: ${error.message}`;
      showError(error, "ログアウト", () => logoutButton.click());
    } finally {
      logoutButton.disabled = false; // ボタンを再度有効化
    }
  });

  // 設定変更の監視
  if (window.ChronoClipSettings) {
    window.ChronoClipSettings.onSettingsChanged((newSettings) => {
      logger?.info("Settings changed in popup", newSettings);
      currentSettings = newSettings;
      updateSettingsDisplay();
    });
  }

  // 初期化処理
  try {
    logger?.info("Starting popup initialization");
    await Promise.all([updateAuthUI(), loadAndDisplaySettings()]);
    logger?.info("Popup initialization complete");
  } catch (error) {
    logger?.error("Popup initialization failed", error);
    showError(error, "初期化");
  }
});
