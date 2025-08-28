// background/service-worker.js

console.log("ChronoClip Service Worker loaded.");

/**
 * @fileoverview ChronoClip拡張機能のサービスワーカーです。
 * 発見された日付などのコンテンツスクリプトからのメッセージをリッスンし、
 * データの保存や他のChrome APIとの対話などのバックグラウンドタスクを実行できます。
 */

const USER_INFO_API_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE_TOKEN_URL = 'https://accounts.google.com/o/oauth2/revoke';
const STORAGE_KEY_ACCESS_TOKEN = 'googleAccessToken';
const STORAGE_KEY_USER_INFO = 'googleUserInfo';

/**
 * Google APIからユーザー情報を取得します。
 * @param {string} accessToken - Googleアクセストークン
 * @returns {Promise<Object|null>} ユーザー情報オブジェクト、またはエラーの場合はnull
 */
async function fetchUserInfo(accessToken) {
  try {
    const response = await fetch(USER_INFO_API_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      console.error('Failed to fetch user info:', response.statusText);
      return null;
    }
    const userInfo = await response.json();
    console.log('User Info:', userInfo);
    return userInfo;
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
}

/**
 * Google OAuth2.0認証フローを開始し、アクセストークンを取得します。
 * @param {boolean} interactive - ユーザーに同意画面を表示するかどうか
 * @returns {Promise<{accessToken: string, userInfo: Object}|null>} アクセストークンとユーザー情報、または認証失敗の場合はnull
 */
async function getAuthToken(interactive) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: interactive }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error('Authentication failed:', chrome.runtime.lastError?.message || 'No token received.');
        resolve(null);
        return;
      }

      console.log('Access Token obtained:', token);
      const userInfo = await fetchUserInfo(token);

      if (userInfo) {
        await chrome.storage.local.set({
          [STORAGE_KEY_ACCESS_TOKEN]: token,
          [STORAGE_KEY_USER_INFO]: userInfo
        });
        console.log('Token and user info saved to storage.');
        resolve({ accessToken: token, userInfo: userInfo });
      } else {
        console.error('Failed to get user info after token acquisition.');
        resolve(null);
      }
    });
  });
}

/**
 * 認証トークンを削除し、Google側でも無効化します。
 * @param {string} accessToken - 削除するアクセストークン
 * @returns {Promise<boolean>} 成功した場合はtrue、失敗した場合はfalse
 */
async function removeAuthToken(accessToken) {
  try {
    // Chromeのキャッシュからトークンを削除
    chrome.identity.removeCachedAuthToken({ token: accessToken }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to remove cached token:', chrome.runtime.lastError.message);
      } else {
        console.log('Cached token removed from Chrome.');
      }
    });

    // Google側でトークンを無効化
    const revokeResponse = await fetch(`${REVOKE_TOKEN_URL}?token=${accessToken}`);
    if (!revokeResponse.ok) {
      console.error('Failed to revoke token on Google side:', revokeResponse.statusText);
      return false;
    }
    console.log('Token successfully revoked on Google side.');

    // ローカルストレージからトークンとユーザー情報を削除
    await chrome.storage.local.remove([STORAGE_KEY_ACCESS_TOKEN, STORAGE_KEY_USER_INFO]);
    console.log('Token and user info removed from local storage.');
    return true;
  } catch (error) {
    console.error('Error during token removal:', error);
    return false;
  }
}

/**
 * 現在の認証状態をチェックします。
 * @returns {Promise<{loggedIn: boolean, userInfo: Object|null}>} 認証状態とユーザー情報
 */
async function checkAuthStatus() {
  const storedToken = (await chrome.storage.local.get(STORAGE_KEY_ACCESS_TOKEN))[STORAGE_KEY_ACCESS_TOKEN];
  const storedUserInfo = (await chrome.storage.local.get(STORAGE_KEY_USER_INFO))[STORAGE_KEY_USER_INFO];

  if (storedToken && storedUserInfo) {
    // トークンがストレージに存在する場合、有効性を確認するために非対話的に取得を試みる
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          console.log('Stored token is invalid or expired, attempting re-auth if needed.');
          await chrome.storage.local.remove([STORAGE_KEY_ACCESS_TOKEN, STORAGE_KEY_USER_INFO]);
          resolve({ loggedIn: false, userInfo: null });
          return;
        }
        // トークンが有効であれば、ユーザー情報も有効とみなす
        console.log('User is already authenticated with a valid token.');
        resolve({ loggedIn: true, userInfo: storedUserInfo });
      });
    });
  } else {
    console.log('No stored token or user info found.');
    return { loggedIn: false, userInfo: null };
  }
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("ChronoClip: Message received in service worker.", message);

  switch (message.type) {
    case "content_script_loaded":
      console.log("ChronoClip: Content script loaded on:", message.payload.url);
      sendResponse({ status: "Message received successfully" });
      break;

    case "dates_found":
      console.log("ChronoClip: Received dates from content script.", message.payload);
      const { url, dates } = message.payload;
      chrome.storage.local.set({ [url]: dates }, () => {
        console.log(`ChronoClip: Saved ${dates.length} dates for ${url}.`);
      });
      sendResponse({ status: "Dates received and saved." });
      break;

    // --- Google OAuth 関連の新しいメッセージハンドラ ---
    case "auth_login":
      console.log("ChronoClip: Attempting Google login...");
      getAuthToken(true) // interactive: true で同意画面を表示
        .then(authResult => {
          if (authResult) {
            sendResponse({ success: true, userInfo: authResult.userInfo });
          } else {
            sendResponse({ success: false, error: "Authentication failed." });
          }
        })
        .catch(error => {
          console.error("Login error:", error);
          sendResponse({ success: false, error: error.message });
        });
      break;

    case "auth_logout":
      console.log("ChronoClip: Attempting Google logout...");
      chrome.storage.local.get(STORAGE_KEY_ACCESS_TOKEN, async (data) => {
        const accessToken = data[STORAGE_KEY_ACCESS_TOKEN];
        if (accessToken) {
          const success = await removeAuthToken(accessToken);
          sendResponse({ success: success });
        } else {
          console.log("No access token found to logout.");
          sendResponse({ success: true }); // Already logged out or no token
        }
      });
      break;

    case "auth_check_status":
      console.log("ChronoClip: Checking Google auth status...");
      checkAuthStatus()
        .then(status => {
          sendResponse(status);
        })
        .catch(error => {
          console.error("Check auth status error:", error);
          sendResponse({ loggedIn: false, userInfo: null, error: error.message });
        });
      break;

    default:
      console.warn("ChronoClip: Received an unknown message type:", message.type);
      sendResponse({ status: "Unknown message type" });
      break;
  }

  return true; // 非同期応答を示す
});