// background/service-worker.js

console.log("ChronoClip Service Worker loaded.");

/**
 * @fileoverview ChronoClip拡張機能のサービスワーカーです。
 * 発見された日付などのコンテンツスクリプトからのメッセージをリッスンし、
 * データの保存や他のChrome APIとの対話などのバックグラウンドタスクを実行できます。
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("ChronoClip: Message received in service worker.", message);

  switch (message.type) {
    case "content_script_loaded":
      // このケースは元のサンプルコードのものです。デバッグに役立ちます。
      console.log("ChronoClip: Content script loaded on:", message.payload.url);
      sendResponse({ status: "Message received successfully" });
      break;

    case "dates_found":
      // これは、コンテンツスクリプトから送信された日付を処理するための新しいケースです。
      console.log("ChronoClip: Received dates from content script.", message.payload);
      
      // とりあえず、日付をログに記録し、ローカルストレージに保存します。
      // これにより、ポップアップなど、拡張機能の他の部分でデータを利用できるようになります。
      const { url, dates } = message.payload;
      chrome.storage.local.set({ [url]: dates }, () => {
        console.log(`ChronoClip: Saved ${dates.length} dates for ${url}.`);
      });

      // 受信を確認するためにコンテンツスクリリプトに応答を送信します。
      sendResponse({ status: "Dates received and saved." });
      break;

    default:
      // 不明なメッセージタイプを処理します
      console.warn("ChronoClip: Received an unknown message type:", message.type);
      sendResponse({ status: "Unknown message type" });
      break;
  }

  // 非同期で応答を送信することを示すためにtrueを返します。
  // メッセージ処理のいずれかが非同期である場合、これは重要です。
  return true;
});