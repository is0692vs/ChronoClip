// popup/popup.js

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup script loaded.");

  const statusMessage = document.getElementById("status-message");
  const userInfoDisplay = document.getElementById("user-info");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

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
    } catch (error) {
      console.error("ChronoClip: Failed to load settings in popup:", error);
      settingsInfo.innerHTML =
        '<span style="color: red;">設定の読み込みに失敗</span>';
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

    settingsInfo.innerHTML = `
      <strong>現在の設定:</strong><br>
      • 自動検出: ${autoDetectStatus}<br>
      • ハイライト: ${highlightStatus}<br>
      • デフォルト時間: ${defaultDurationHours}時間${defaultDurationMinutes}分<br>
      • タイムゾーン: ${currentSettings.timezone}<br>
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
      const response = await chrome.runtime.sendMessage({
        type: "auth_check_status",
      });
      console.log("Auth status response:", response);

      if (response && response.loggedIn) {
        statusMessage.textContent = "ログイン済み";
        userInfoDisplay.textContent = `(${response.userInfo.email})`;
        userInfoDisplay.style.display = "block";
        logoutButton.style.display = "block";
      } else {
        statusMessage.textContent = "ログインしていません";
        loginButton.style.display = "block";
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      statusMessage.textContent = "認証状態の確認中にエラーが発生しました。";
      loginButton.style.display = "block"; // エラー時はログインボタンを表示
    }
  }

  // ログインボタンのイベントリスナー
  loginButton.addEventListener("click", async () => {
    statusMessage.textContent = "ログイン処理中...";
    loginButton.disabled = true; // ボタンを無効化して二重クリック防止

    try {
      const response = await chrome.runtime.sendMessage({ type: "auth_login" });
      if (response && response.success) {
        console.log("Login successful:", response.userInfo);
        await updateAuthUI(); // UIを更新
      } else {
        console.error("Login failed:", response.error);
        statusMessage.textContent = `ログイン失敗: ${
          response.error || "不明なエラー"
        }`;
      }
    } catch (error) {
      console.error("Login message error:", error);
      statusMessage.textContent = `ログイン中にエラーが発生しました: ${error.message}`;
    } finally {
      loginButton.disabled = false; // ボタンを再度有効化
    }
  });

  // ログアウトボタンのイベントリスナー
  logoutButton.addEventListener("click", async () => {
    statusMessage.textContent = "ログアウト処理中...";
    logoutButton.disabled = true; // ボタンを無効化

    try {
      const response = await chrome.runtime.sendMessage({
        type: "auth_logout",
      });
      if (response && response.success) {
        console.log("Logout successful.");
        await updateAuthUI(); // UIを更新
      } else {
        console.error("Logout failed.");
        statusMessage.textContent = "ログアウト失敗。";
      }
    } catch (error) {
      console.error("Logout message error:", error);
      statusMessage.textContent = `ログアウト中にエラーが発生しました: ${error.message}`;
    } finally {
      logoutButton.disabled = false; // ボタンを再度有効化
    }
  });

  // 設定変更の監視
  if (window.ChronoClipSettings) {
    window.ChronoClipSettings.onSettingsChanged((newSettings) => {
      currentSettings = newSettings;
      updateSettingsDisplay();
    });
  }

  // 初期化処理
  await Promise.all([updateAuthUI(), loadAndDisplaySettings()]);

  console.log("ChronoClip: Popup initialization complete");
});
