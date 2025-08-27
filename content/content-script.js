console.log("Content script loaded.");

// バックグラウンドスクリプトへメッセージを送信
chrome.runtime.sendMessage({
    type: "content_script_loaded",
    payload: {
        url: window.location.href
    }
}, (response) => {
    if (chrome.runtime.lastError) {
        console.error("Error sending message:", chrome.runtime.lastError);
    } else {
        console.log("Background script responded:", response);
    }
});

// バックグラウンドスクリプトからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received from background:", message);
    if (message.type === "background_to_content") {
        // この例ではシンプルにログを出力
        console.log("Payload from background:", message.payload);
    }
    // 必要であれば応答を返す
    sendResponse({ status: "Received by content script" });
    return true;
});
