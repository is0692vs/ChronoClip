// Service Worker開始確認
console.log("ChronoClip Service Worker Starting");

try {
  importScripts("../shared/calendar.js");
} catch (error) {
  console.error("Failed to load calendar.js:", error);
  // calendar.jsがないとカレンダー機能が動作しない
}

try {
  importScripts("../shared/logger.js");
} catch (error) {
  console.error("Failed to load logger.js:", error);
}

try {
  importScripts("../shared/error-handler.js");
} catch (error) {
  console.error("Failed to load error-handler.js:", error);
}

// ChronoClip Service Worker初期化

// ChronoClipの初期化
let logger, errorHandler;

// Service Worker起動時の初期化
async function initializeServiceWorker() {
  try {
    // Service Worker環境ではselfを使用
    if (self.ChronoClipLogger) {
      logger = new self.ChronoClipLogger();
    }

    if (self.ChronoClipErrorHandler) {
      errorHandler = new self.ChronoClipErrorHandler();
    }

    if (!logger || !errorHandler) {
      throw new Error("Logger or ErrorHandler not loaded");
    }

    logger.info("ChronoClip Service Worker initialized successfully");
  } catch (error) {
    console.error("ChronoClip: Service Worker initialization failed:", error);
    // フォールバック処理
    logger = {
      info: console.log,
      warn: console.warn,
      error: console.error,
      fatal: console.error,
      debug: console.log,
      startProcess: () => {},
      endProcess: () => {},
      apiCall: () => {},
      apiResult: () => {},
      setDebugMode: () => {},
    };
    errorHandler = {
      handleError: (error, context) => {
        console.error("ChronoClip Error:", error, context);
        return { userMessage: { message: "予期しないエラーが発生しました" } };
      },
    };
  }
}

// 初期化実行
initializeServiceWorker();

/**
 * @fileoverview ChronoClip拡張機能のサービスワーカーです。
 * 発見された日付などのコンテンツスクリプトからのメッセージをリッスンし、
 * データの保存や他のChrome APIとの対話などのバックグラウンドタスクを実行できます。
 *
 * エラーハンドリング：全ての外部API呼び出しをラップし、適切なエラー分類とログを提供
 */

const USER_INFO_API_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const REVOKE_TOKEN_URL = "https://accounts.google.com/o/oauth2/revoke";
const STORAGE_KEY_ACCESS_TOKEN = "googleAccessToken";
const STORAGE_KEY_USER_INFO = "googleUserInfo";

/**
 * 外部API呼び出しのラッパー関数（エラーハンドリング付き）
 */
async function safeApiCall(url, options = {}, context = {}) {
  const method = options.method || "GET";

  try {
    logger?.apiCall(method, url, { context });

    const response = await fetch(url, options);
    const status = response.status;

    logger?.apiResult(method, url, status, { ok: response.ok });

    if (!response.ok) {
      const errorData = {
        status,
        statusText: response.statusText,
        url,
        method,
      };

      // レスポンス本文を安全に取得
      try {
        const text = await response.text();
        if (text) {
          errorData.responseText = text.substring(0, 500); // 最初の500文字のみ
        }
      } catch (e) {
        // レスポンス本文の取得に失敗した場合は無視
      }

      const error = new Error(
        `API call failed: ${status} ${response.statusText}`
      );
      error.status = status;
      error.context = context;

      throw error;
    }

    return response;
  } catch (error) {
    const handled = errorHandler?.handleError(error, {
      type: "api_call",
      url,
      method,
      ...context,
    });

    // エラーを再スローして呼び出し元に伝播
    error.handled = handled;
    throw error;
  }
}

/**
 * Chrome Storage APIのラッパー関数（エラーハンドリング付き）
 */
async function safeStorageGet(keys) {
  try {
    logger?.debug("Storage get operation", { keys });
    return await chrome.storage.sync.get(keys);
  } catch (error) {
    errorHandler?.handleError(error, { type: "storage_get", keys });
    throw error;
  }
}

async function safeStorageSet(data) {
  try {
    logger?.debug("Storage set operation", { keys: Object.keys(data) });
    await chrome.storage.sync.set(data);
    logger?.debug("Storage set completed successfully");
  } catch (error) {
    errorHandler?.handleError(error, {
      type: "storage_set",
      keys: Object.keys(data),
    });
    throw error;
  }
}

async function safeStorageRemove(keys) {
  try {
    logger?.debug("Storage remove operation", { keys });
    await chrome.storage.sync.remove(keys);
    logger?.debug("Storage remove completed successfully");
  } catch (error) {
    errorHandler?.handleError(error, { type: "storage_remove", keys });
    throw error;
  }
}

/**
 * アクセストークンを使い、Googleからユーザー情報を取得します。
 * @param {string} token - OAuthアクセストークン
 * @returns {Promise<object>} ユーザー情報のオブジェクト
 */
async function fetchUserInfo(token) {
  const response = await safeApiCall(
    USER_INFO_API_URL,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    { operation: "fetch_user_info" }
  );

  return await response.json();
}

console.log("ChronoClip: Setting up message listener");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("ChronoClip: Message received in service worker", {
    type: message.type,
    sender: sender.tab?.url,
  });

  logger?.debug("Message received in service worker", {
    type: message.type,
    sender: sender.tab?.url,
  });

  // 非同期処理のためのラッパー
  const handleMessageAsync = async () => {
    try {
      console.log("ChronoClip: Processing message type:", message.type);
      switch (message.type) {
        case "content_script_loaded":
          // ...
          break;

        case "dates_found":
          // ...
          break;

        case "settings:updated":
          // 設定変更をすべてのタブに通知
          await handleSettingsUpdate(message.settings);
          return { success: true };

        case "auth_login":
          return await handleAuthLogin();

        case "auth_logout":
          return await handleAuthLogout();

        case "auth_status":
        case "auth_check_status":
          return await handleAuthStatus();

        case "add_to_calendar":
          return await handleAddToCalendar(message.eventData);

        case "calendar:createEvent":
          return await handleAddToCalendar(message.payload);
          
        case "getCalendarList":
          return await handleGetCalendarList();

        case "retry_failed_items":
          return await handleRetryFailedItems(message.items);

        case "ping":
          return { success: true, message: "pong" };

        default:
          logger?.warn("Unknown message type received", { type: message.type });
          return { success: false, error: "Unknown message type" };
      }
    } catch (error) {
      const handled = errorHandler?.handleError(error, {
        type: "message_handler",
        messageType: message.type,
      });

      logger?.error("Message handler error", {
        messageType: message.type,
        error: error.message,
      });

      return {
        success: false,
        error: handled?.userMessage?.message || "処理中にエラーが発生しました",
        details: handled?.details,
      };
    }
  };

  // 非同期処理を実行
  handleMessageAsync()
    .then((response) => {
      console.log("ChronoClip: Sending response to content script:", response);
      sendResponse(response || { success: true });
    })
    .catch((error) => {
      console.error("ChronoClip: Critical error in message handler:", error);
      logger?.fatal("Critical error in message handler", {
        error: error.message,
      });
      const errorResponse = {
        success: false,
        error: "重大なエラーが発生しました。拡張機能を再起動してください。",
      };
      console.log("ChronoClip: Sending error response:", errorResponse);
      sendResponse(errorResponse);
    });

  // 非同期処理のため true を返す
  return true;
});

/**
 * 認証ログイン処理
 */
async function handleAuthLogin() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      try {
        if (chrome.runtime.lastError || !token) {
          const error = new Error(
            chrome.runtime.lastError?.message || "Authentication failed"
          );
          error.status = 401;
          throw error;
        }

        // ログイン成功後、ユーザー情報を取得
        const userInfo = await fetchUserInfo(token);

        logger?.info("User authentication successful", {
          email: userInfo.email,
        });

        const response = { success: true, userInfo };
        resolve(response);
      } catch (error) {
        const handled = errorHandler?.handleError(error, {
          type: "auth_login",
        });

        const errorResponse = {
          success: false,
          error: handled?.userMessage?.message || "ログインに失敗しました",
        };

        resolve(errorResponse);
      }
    });
  });
}

/**
 * 認証ログアウト処理
 */
async function handleAuthLogout() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      try {
        if (token) {
          // Google側の認証を無効化
          await safeApiCall(
            `${REVOKE_TOKEN_URL}?token=${token}`,
            {},
            { operation: "revoke_token" }
          );

          // 拡張機能のキャッシュからトークンを削除
          chrome.identity.removeCachedAuthToken({ token }, () => {
            logger?.info("User logout successful");
            resolve({ success: true });
          });
        } else {
          resolve({
            success: false,
            error: "ログアウトするトークンがありません",
          });
        }
      } catch (error) {
        const handled = errorHandler?.handleError(error, {
          type: "auth_logout",
        });
        resolve({
          success: false,
          error: handled?.userMessage?.message || "ログアウトに失敗しました",
        });
      }
    });
  });
}

/**
 * 認証ステータス確認処理
 */
async function handleAuthStatus() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      try {
        if (chrome.runtime.lastError || !token) {
          resolve({ loggedIn: false });
        } else {
          // ログイン済みの場合、ユーザー情報を取得
          const userInfo = await fetchUserInfo(token);
          resolve({ loggedIn: true, userInfo });
        }
      } catch (error) {
        // ユーザー情報取得に失敗した場合は未ログイン扱い
        logger?.warn("Failed to fetch user info during status check", {
          error: error.message,
        });
        resolve({ loggedIn: false });
      }
    });
  });
}

/**
 * カレンダーリスト取得処理
 */
async function handleGetCalendarList() {
  try {
    logger?.startProcess("calendar_list_fetch");
    
    const calendars = await getCalendarList();
    
    logger?.endProcess("calendar_list_fetch", {
      count: calendars.length,
    });
    
    return { success: true, calendars };
  } catch (error) {
    logger?.error("Failed to fetch calendar list", {
      error: error.message,
    });
    
    const handled = errorHandler?.handleError(error, {
      type: "calendar_list_fetch",
    });
    
    return {
      success: false,
      error: handled?.userMessage?.message || "カレンダーリストの取得に失敗しました",
    };
  }
}

/**
 * カレンダーイベント追加処理
 */
async function handleAddToCalendar(eventData) {
  try {
    logger?.startProcess("calendar_event_creation", {
      title: eventData.summary,
    });

    // ペイロードの検証
    if (!eventData) {
      throw new Error("イベントデータが提供されていません");
    }
    if (!eventData.summary) {
      throw new Error("イベントタイトルが必要です");
    }
    if (!eventData.start) {
      throw new Error("開始時刻が必要です");
    }

    // カレンダーAPIを呼び出し
    const result = await createEvent(eventData);

    logger?.endProcess("calendar_event_creation", {
      eventId: result.id,
      title: eventData.summary,
    });

    return { success: true, event: result };
  } catch (error) {
    // 認証エラーの場合、自動的にログインを試行
    if (
      error.code === 401 ||
      error.status === 401 ||
      error.message?.includes("auth") ||
      error.message?.includes("token")
    ) {
      try {
        const loginResult = await handleAuthLogin();
        if (loginResult.success) {
          // 再度カレンダーイベント作成を試行
          const retryResult = await createEvent(eventData);

          logger?.endProcess("calendar_event_creation", {
            eventId: retryResult.id,
            title: eventData.summary,
          });

          return { success: true, event: retryResult };
        } else {
          return {
            success: false,
            error: `ログインが必要です: ${loginResult.error}`,
            needsLogin: true,
          };
        }
      } catch (loginError) {
        return {
          success: false,
          error: "ログインに失敗しました。手動でログインしてください。",
          needsLogin: true,
        };
      }
    }

    const handled = errorHandler?.handleError(error, {
      type: "calendar_creation",
      eventTitle: eventData?.summary,
    });

    return {
      success: false,
      error:
        handled?.userMessage?.message || "カレンダーへの追加に失敗しました",
    };
  }
}

/**
 * 設定更新処理
 */
async function handleSettingsUpdate(settings) {
  try {
    logger?.info("Settings update received", { keys: Object.keys(settings) });

    // デバッグモードの変更を検出
    if (settings.debugMode !== undefined) {
      logger?.setDebugMode(settings.debugMode);
      logger?.info(`Debug mode ${settings.debugMode ? "enabled" : "disabled"}`);
    }

    // 全てのタブに設定変更を通知
    const tabs = await chrome.tabs.query({});
    const notifications = tabs.map((tab) =>
      chrome.tabs
        .sendMessage(tab.id, {
          type: "settings:updated",
          settings,
        })
        .catch((error) => {
          // 一部のタブで失敗しても継続
          logger?.debug("Failed to notify tab of settings update", {
            tabId: tab.id,
            url: tab.url,
          });
        })
    );

    await Promise.allSettled(notifications);
    logger?.info("Settings update notifications sent to all tabs");
  } catch (error) {
    errorHandler?.handleError(error, { type: "settings_update" });
    throw error;
  }
}

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

// --- Context Menu Setup ---
const CONTEXT_MENU_ID = "chronoclip-test-event";
const CONTEXT_MENU_SELECTION_ID = "chronoclip-add-selection";

chrome.runtime.onInstalled.addListener(() => {
  // 既存のテストメニュー
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "ChronoClip: テストイベント追加",
    contexts: ["page"],
  });

  // Issue #11: 選択範囲をカレンダーに追加
  chrome.contextMenus.create({
    id: CONTEXT_MENU_SELECTION_ID,
    title: "選択範囲をカレンダーに追加",
    contexts: ["selection"],
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
    // 既存のテストイベント機能
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
  } else if (info.menuItemId === CONTEXT_MENU_SELECTION_ID) {
    // Issue #11: 選択範囲をカレンダーに追加
    console.log(
      "ChronoClip: Selection menu clicked, selected text:",
      info.selectionText
    );

    // content/selection.jsに選択範囲の解析を依頼
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: "extract_selection",
        payload: {
          selectionText: info.selectionText,
          pageUrl: tab.url,
          pageTitle: tab.title,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "ChronoClip: Error sending message to content script:",
            chrome.runtime.lastError
          );
          showToastInActiveTab("error", "選択範囲の解析でエラーが発生しました");
          return;
        }

        console.log("ChronoClip: Selection extraction response:", response);

        if (response && response.success) {
          // 抽出成功 - クイック追加ポップアップを表示
          chrome.tabs.sendMessage(tab.id, {
            type: "show_quick_add_popup",
            payload: {
              extractedData: response.data,
              source: "selection",
            },
          });
        } else {
          // 抽出失敗 - エラーメッセージを表示
          const errorMsg =
            response?.error || "選択範囲からイベント情報を抽出できませんでした";
          showToastInActiveTab("error", errorMsg);
        }
      }
    );
  }
});

/**
 * 設定変更をすべてのタブに通知する
 * @param {Object} settings 更新された設定
 */
function handleSettingsUpdate(settings) {
  console.log(
    "ChronoClip: Broadcasting settings update to all tabs:",
    settings
  );

  // すべてのタブに設定変更を通知
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      // content scriptが読み込まれているタブのみに送信
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: "settings:updated",
          settings: settings,
        },
        (response) => {
          // レスポンスエラーは無視（content scriptが読み込まれていないタブ等）
          if (chrome.runtime.lastError) {
            // ログを出力せず、静かに無視
          }
        }
      );
    });
  });
}

/**
 * 失敗したアイテムの再試行処理
 * @param {Array} items - 失敗したアイテムのリスト
 * @returns {Object} 再試行結果
 */
async function handleRetryFailedItems(items) {
  try {
    logger?.info("Starting retry for failed items", { count: items.length });

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error("再試行するアイテムがありません");
    }

    const results = [];

    for (const item of items) {
      try {
        // アイテムのeventDataを取得
        const eventData = item.data || item.eventData;
        if (!eventData) {
          results.push({
            success: false,
            item,
            error: new Error("イベントデータが見つかりません"),
          });
          continue;
        }

        // カレンダー追加を再試行
        const result = await handleAddToCalendar(eventData);

        if (result.success) {
          results.push({ success: true, item });
          logger?.debug("Retry successful for item", { index: item.index });
        } else {
          results.push({
            success: false,
            item,
            error: new Error(result.error || "再試行に失敗しました"),
          });
          logger?.warn("Retry failed for item", {
            index: item.index,
            error: result.error,
          });
        }

        // APIレート制限を考慮した間隔
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        results.push({ success: false, item, error });
        logger?.error("Retry error for item", { index: item.index, error });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger?.info("Retry completed", {
      total: items.length,
      successful,
      failed,
    });

    return {
      success: true,
      results,
      summary: {
        total: items.length,
        successful,
        failed,
      },
    };
  } catch (error) {
    const handled = errorHandler?.handleError(error, "失敗アイテム再試行");

    logger?.error("Failed to retry items", error);

    return {
      success: false,
      error:
        handled?.userMessage?.message || "再試行処理でエラーが発生しました",
    };
  }
}
