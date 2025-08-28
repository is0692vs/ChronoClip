importScripts("../lib/calendar.js");
// background/service-worker.js

console.log("ChronoClip Service Worker loaded.");

/**
 * @fileoverview ChronoClip拡張機能のサービスワーカーです。
 * 発見された日付などのコンテンツスクリプトからのメッセージをリッスンし、
 * データの保存や他のChrome APIとの対話などのバックグラウンドタスクを実行できます。
 */

const USER_INFO_API_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const REVOKE_TOKEN_URL = "https://accounts.google.com/o/oauth2/revoke";
const STORAGE_KEY_ACCESS_TOKEN = "googleAccessToken";
const STORAGE_KEY_USER_INFO = "googleUserInfo";

/**
 * アクセストークンを使い、Googleからユーザー情報を取得します。
 * @param {string} token - OAuthアクセストークン
 * @returns {Promise<object>} ユーザー情報のオブジェクト
 */
async function fetchUserInfo(token) {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return await response.json();
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("ChronoClip: Message received in service worker.", message);

  switch (message.type) {
    case "content_script_loaded":
      // ...
      break;

    case "dates_found":
      // ...
      break;

    case "auth_login":
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError?.message,
          });
        } else {
          // ログイン成功後、ユーザー情報を取得して返す
          const userInfo = await fetchUserInfo(token);
          sendResponse({ success: true, userInfo: userInfo });
        }
      });
      break; // caseを終了

    case "auth_logout":
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          // Google側の認証を無効化
          fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
          // 拡張機能のキャッシュからトークンを削除
          chrome.identity.removeCachedAuthToken({ token: token }, () => {
            sendResponse({ success: true });
          });
        } else {
          sendResponse({ success: false, error: "No token to logout." });
        }
      });
      break; // caseを終了

    case "auth_check_status":
      chrome.identity.getAuthToken({ interactive: false }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({ loggedIn: false });
        } else {
          // ログイン済みの場合、ユーザー情報を取得して返す
          const userInfo = await fetchUserInfo(token);
          sendResponse({ loggedIn: true, userInfo: userInfo });
        }
      });
      break; // caseを終了

    case "calendar:createEvent":
      console.log("ChronoClip: Received calendar:createEvent", message.payload);
      createEvent(message.payload)
        .then((event) => {
          showNotification(
            "success",
            "イベントを追加しました",
            event.summary,
            event.htmlLink
          );
          sendResponse({
            ok: true,
            eventId: event.id,
            htmlLink: event.htmlLink,
          });
        })
        .catch((err) => {
          console.error("Failed to create event:", err);
          const errorMessage = getErrorMessage(err);
          showNotification(
            "error",
            "イベントの追加に失敗しました",
            errorMessage
          );
          sendResponse({ ok: false, code: err.code, message: errorMessage });
        });
      break;

    default:
      console.warn(
        "ChronoClip: Received an unknown message type:",
        message.type
      );
      sendResponse({ status: "Unknown message type" });
      break;
  }

  return true; // Indicate asynchronous response
});

/**
 * Shows a notification to the user.
 * @param {'success' | 'error'} type - The type of notification.
 * @param {string} title - The notification title.
 * @param {string} message - The notification message.
 * @param {string} [linkUrl] - An optional URL to open when the notification is clicked.
 */
function showNotification(type, title, message, linkUrl) {
  const notificationId = `chronoclip-notification-${Date.now()}`;
  const iconUrl = type === "success" ? "icons/icon128.png" : "icons/icon48.png"; // Use different icons for feedback

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: iconUrl,
    title: title,
    message: message,
    priority: 2,
  });

  if (linkUrl) {
    const clickListener = (id) => {
      if (id === notificationId) {
        chrome.tabs.create({ url: linkUrl });
        chrome.notifications.clear(id);
        chrome.notifications.onClicked.removeListener(clickListener);
      }
    };
    chrome.notifications.onClicked.addListener(clickListener);
  }
}

/**
 * Converts an error object into a user-friendly error message.
 * @param {Error} err - The error object, potentially with code and reason properties.
 * @returns {string} A user-friendly error message.
 */
function getErrorMessage(err) {
  switch (err.code) {
    case 401:
      return "Google認証に失敗しました。拡張機能の権限を確認してください。";
    case 403:
      if (err.reason === "forbidden") {
        return "カレンダーの編集権限がありません。OAuth設定を見直してください。";
      }
      return "Google Calendar APIへのアクセスが拒否されました。";
    case 400:
      return "日付形式が不正です。開始と終了を確認してください。";
    default:
      return "Google Calendar APIでエラーが発生しました。しばらくしてから再試行してください。";
  }
}

// --- Context Menu for Testing ---
const CONTEXT_MENU_ID = "chronoclip-test-event";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "ChronoClip: テストイベント追加",
    contexts: ["page"],
  });
});

/**
 * 現在アクティブなタブにトースト表示のメッセージを送信します。
 * @param {'success' | 'error'} type - トーストの種類
 * @param {string} message - 表示するメッセージ
 */
function showToastInActiveTab(type, message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "show_toast",
        payload: { type, message },
      });
    }
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowStr = `${yyyy}-${mm}-${dd}`;

    const testEvent = {
      summary: "ChronoClip Test Event",
      description: "自動テストイベント",
      start: { date: tomorrowStr },
      end: { date: tomorrowStr },
      url: tab.url,
    };

    console.log("Creating test event:", testEvent);

    createEvent(testEvent)
      .then((event) => {
        showToastInActiveTab("success", `予定を追加しました: ${event.summary}`);
      })
      .catch((err) => {
        const errorMessage = getErrorMessage(err);
        showToastInActiveTab("error", `エラー: ${errorMessage}`);
      });
  }
});
