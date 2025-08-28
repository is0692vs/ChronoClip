// popup/popup.js

document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup script loaded.");

  const statusMessage = document.getElementById('status-message');
  const userInfoDisplay = document.getElementById('user-info');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');

  /**
   * UIを更新し、認証状態を表示します。
   */
  async function updateAuthUI() {
    statusMessage.textContent = '認証状態を確認中...';
    userInfoDisplay.style.display = 'none';
    loginButton.style.display = 'none';
    logoutButton.style.display = 'none';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'auth_check_status' });
      console.log('Auth status response:', response);

      if (response && response.loggedIn) {
        statusMessage.textContent = 'ログイン済み';
        userInfoDisplay.textContent = `(${response.userInfo.email})`;
        userInfoDisplay.style.display = 'block';
        logoutButton.style.display = 'block';
      } else {
        statusMessage.textContent = 'ログインしていません';
        loginButton.style.display = 'block';
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      statusMessage.textContent = '認証状態の確認中にエラーが発生しました。';
      loginButton.style.display = 'block'; // エラー時はログインボタンを表示
    }
  }

  // ログインボタンのイベントリスナー
  loginButton.addEventListener('click', async () => {
    statusMessage.textContent = 'ログイン処理中...';
    loginButton.disabled = true; // ボタンを無効化して二重クリック防止

    try {
      const response = await chrome.runtime.sendMessage({ type: 'auth_login' });
      if (response && response.success) {
        console.log('Login successful:', response.userInfo);
        await updateAuthUI(); // UIを更新
      } else {
        console.error('Login failed:', response.error);
        statusMessage.textContent = `ログイン失敗: ${response.error || '不明なエラー'}`;
      }
    } catch (error) {
      console.error('Login message error:', error);
      statusMessage.textContent = `ログイン中にエラーが発生しました: ${error.message}`;
    } finally {
      loginButton.disabled = false; // ボタンを再度有効化
    }
  });

  // ログアウトボタンのイベントリスナー
  logoutButton.addEventListener('click', async () => {
    statusMessage.textContent = 'ログアウト処理中...';
    logoutButton.disabled = true; // ボタンを無効化

    try {
      const response = await chrome.runtime.sendMessage({ type: 'auth_logout' });
      if (response && response.success) {
        console.log('Logout successful.');
        await updateAuthUI(); // UIを更新
      } else {
        console.error('Logout failed.');
        statusMessage.textContent = 'ログアウト失敗。';
      }
    } catch (error) {
      console.error('Logout message error:', error);
      statusMessage.textContent = `ログアウト中にエラーが発生しました: ${error.message}`;
    } finally {
      logoutButton.disabled = false; // ボタンを再度有効化
    }
  });

  // ポップアップがロードされたときに認証状態をチェック
  updateAuthUI();
});