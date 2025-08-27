console.log("Service worker loaded.");

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in service worker:", message);

    if (message.type === "content_script_loaded") {
        console.log("Content script loaded on:", message.payload.url);
        // 応答を送信
        sendResponse({ status: "Message received successfully" });

        // 少し遅延させてからbackgroundからcontentへメッセージを送信
        setTimeout(() => {
            chrome.tabs.sendMessage(sender.tab.id, {
                type: "background_to_content",
                payload: "Hello from background!"
            });
        }, 500);
    }

    // 非同期の応答のためにtrueを返す
    return true;
});
