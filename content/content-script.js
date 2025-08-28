// content/content-script.js

/**
 * @fileoverview ChronoClipのメインコンテンツスクリプト。
 * このスクリプトは、Webページのコンテンツをスキャンして日付を検索し、
 * それらを検証してハイライト表示し、イベントリスナーを追加します。
 */

(function() {
  // --- 依存関係のチェック ---
  if (typeof ChronoClip === 'undefined' || !ChronoClip.DATE_PATTERN || !ChronoClip.isValidDate || typeof chrono === 'undefined') {
    console.error("ChronoClip: 依存関係が正しく読み込まれていません。");
    return;
  }
  console.log("ChronoClip content script loaded and running.");

  // --- ユーティリティ関数のエイリアス ---
  const {
    isValidDate,
    convertWarekiToGregorianYear,
    resolveYearForMonthDay,
    DATE_PATTERN,
    WAREKI_DATE_PATTERN,
    MONTH_DAY_DATE_PATTERN,
    JA_YYYY_MM_DD_PATTERN
  } = ChronoClip;

  // --- 日付検出器の定義 (既存のものを再利用) ---
  const detectors = [
    {
      name: "日本語の相対日付 (JA Relative)",
      pattern: /(今日|明日|昨日|来週|先週|今月末|来月|先月)/gi,
      handler: (match) => {
          const text = match[0];
          const refDate = new Date();
          refDate.setHours(0, 0, 0, 0);
          let startDate = new Date(refDate);

          switch (text) {
              case '今日':
                  break;
              case '明日':
                  startDate.setDate(startDate.getDate() + 1);
                  break;
              case '昨日':
                  startDate.setDate(startDate.getDate() - 1);
                  break;
              case '来週':
                  startDate.setDate(startDate.getDate() + 7);
                  break;
              case '先週':
                  startDate.setDate(startDate.getDate() - 7);
                  break;
              case '今月末':
                  startDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
                  break;
              case '来月':
                  startDate.setMonth(startDate.getMonth() + 1, 1);
                  break;
              case '先月':
                  startDate.setMonth(startDate.getMonth() - 1, 1);
                  break;
          }
          
          const year = startDate.getFullYear();
          const month = startDate.getMonth() + 1;
          const day = startDate.getDate();

          const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
      }
    },
    {
      name: "YYYY-MM-DD or YYYY/MM/DD",
      pattern: DATE_PATTERN,
      handler: (match) => {
        const [, year, , month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    },
    {
      name: "YYYY年M月D日 (JA)",
      pattern: JA_YYYY_MM_DD_PATTERN,
      handler: (match) => {
        const [, year, month, day] = match;
        if (isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    },
    {
      name: "和暦 (Wareki)",
      pattern: WAREKI_DATE_PATTERN,
      handler: (match) => {
        const [, era, eraYearStr, month, day] = match;
        const year = convertWarekiToGregorianYear(era, eraYearStr);
        if (year && isValidDate(year, month, day)) {
          const normalizedDate = `${year}-${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    },
    {
      name: "月日 (Month-Day)",
      pattern: MONTH_DAY_DATE_PATTERN,
      handler: (match) => {
        const [, month, day] = match;
        const resolvedDate = resolveYearForMonthDay(month, day);
        if (isValidDate(resolvedDate.getFullYear(), resolvedDate.getMonth() + 1, resolvedDate.getDate())) {
          const year = resolvedDate.getFullYear();
          const normalizedDate = `${year}-${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return { normalizedDate, original: match[0] };
        }
        return null;
      }
    }
  ];

  // カレンダーアイコンのSVG
  const CALENDAR_ICON_SVG = `
    <svg class="chronoclip-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM5 7V6h14v1H5z"/>
    </svg>
  `;

  /**
   * テキストノード内の日付を検出し、ハイライトしてイベントリスナーを追加します。
   * @param {Text} textNode - 処理するテキストノード。
   */
  function processTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || text.trim() === '') {
      return;
    }

    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let matchesFound = false;

    // chrono-nodeによる解析
    const chronoResults = chrono.parse(text, new Date());
    const allMatches = [];

    chronoResults.forEach(result => {
      const date = result.start.date();
      const normalizedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      allMatches.push({
        date: normalizedDate,
        original: result.text,
        index: result.index,
        detector: 'chrono-node',
        endIndex: result.index + result.text.length
      });
    });

    // カスタム正規表現検出器による解析
    detectors.forEach(detector => {
      detector.pattern.lastIndex = 0; // 各検出器でlastIndexをリセット
      let match;
      while ((match = detector.pattern.exec(text)) !== null) {
        const result = detector.handler(match);
        if (result) {
          allMatches.push({
            date: result.normalizedDate,
            original: result.original,
            index: match.index,
            detector: detector.name,
            endIndex: match.index + result.original.length
          });
        }
      }
    });

    // マッチをインデックス順にソートし、重複を排除
    allMatches.sort((a, b) => a.index - b.index);
    const uniqueMatches = [];
    let lastEndIndex = -1;

    allMatches.forEach(match => {
      // 重複する範囲をスキップ
      if (match.index >= lastEndIndex) {
        uniqueMatches.push(match);
        lastEndIndex = match.endIndex;
      }
    });

    uniqueMatches.forEach(match => {
      // マッチ前のテキストを追加
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      // 日付要素を作成し、イベントリスナーを追加
      const dateSpan = document.createElement('span');
      dateSpan.className = 'chronoclip-date';
      dateSpan.textContent = match.original;
      dateSpan.dataset.normalizedDate = match.date; // 正規化された日付をデータ属性に保存

      // カレンダーアイコンを追加
      dateSpan.insertAdjacentHTML('beforeend', CALENDAR_ICON_SVG);

      // イベントリスナー
      dateSpan.addEventListener('click', (e) => {
        e.stopPropagation(); // 親要素へのイベント伝播を防ぐ
        console.log('ChronoClip: Date clicked!', match.original, 'Normalized:', match.date);
        // ここにカレンダー追加などのアクションを実装
        chrome.runtime.sendMessage({
          type: "date_clicked",
          payload: {
            originalDate: match.original,
            normalizedDate: match.date,
            url: window.location.href
          }
        });
      });

      fragment.appendChild(dateSpan);
      lastIndex = match.endIndex;
      matchesFound = true;
    });

    // 最後のマッチ以降のテキストを追加
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    if (matchesFound) {
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  }

  /**
   * ページ全体を走査して日付を検出・処理します。
   */
  function findAndHighlightDates() {
    // 既に処理済みの要素を避けるためのセレクタ
    const ignoreSelectors = [
      'script', 'style', 'noscript', 'iframe', 'canvas', 'svg', 'img', 'video', 'audio',
      '.chronoclip-date', // 既に処理済みの要素
      '[contenteditable="true"]', // 編集可能な要素
      'input', 'textarea', 'select' // フォーム要素
    ];

    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // 親要素が無視リストに含まれる場合はスキップ
          let currentNode = node.parentNode;
          while (currentNode && currentNode !== document.body) {
            if (ignoreSelectors.some(selector => currentNode.matches(selector))) {
              return NodeFilter.FILTER_REJECT;
            }
            currentNode = currentNode.parentNode;
          }
          // 空白のみのテキストノードはスキップ
          if (node.nodeValue.trim() === '') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    const textNodesToProcess = [];
    let currentNode = treeWalker.nextNode();
    while (currentNode) {
      textNodesToProcess.push(currentNode);
      currentNode = treeWalker.nextNode();
    }

    // 収集したテキストノードを処理
    textNodesToProcess.forEach(node => {
      try {
        processTextNode(node);
      } catch (e) {
        console.error("ChronoClip: Error processing text node:", node, e);
      }
    });

    console.log("ChronoClip: Date highlighting complete.");
  }

  // DOMContentLoadedイベントを待ってから処理を開始
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', findAndHighlightDates);
  } else {
    findAndHighlightDates();
  }

  // MutationObserverで動的に追加されるコンテンツに対応
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 追加された要素内のテキストノードを再走査
            const treeWalker = document.createTreeWalker(
              node,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: function(n) {
                  // 既に処理済みの要素や無視リストに含まれる要素はスキップ
                  let currentNode = n.parentNode;
                  while (currentNode && currentNode !== node) {
                    if (ignoreSelectors.some(selector => currentNode.matches(selector))) {
                      return NodeFilter.FILTER_REJECT;
                    }
                    currentNode = currentNode.parentNode;
                  }
                  if (n.nodeValue.trim() === '') {
                    return NodeFilter.FILTER_REJECT;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              },
              false
            );
            let currentNode = treeWalker.nextNode();
            while (currentNode) {
              try {
                processTextNode(currentNode);
              } catch (e) {
                console.error("ChronoClip: Error processing dynamically added node:", currentNode, e);
              }
              currentNode = treeWalker.nextNode();
            }
          }
        });
      }
    });
  });

  // body要素とその子孫の変更を監視
  observer.observe(document.body, { childList: true, subtree: true });

})();