/**
 * @fileoverview サイト固有検出パターン設定
 * 特定サイト用の要素セレクタ、日付フォーマット、抽出戦略を定義
 */

window.ChronoClipSitePatterns = {
  // EventBrite
  eventbrite: {
    domains: ["eventbrite.com", "eventbrite.co.jp"],
    selectors: {
      title: [
        ".event-title",
        ".event-card__title",
        'h1[data-automation-id="event-title"]',
        ".listing-info h1",
        ".event-listing__title",
      ],
      date: [
        ".event-details__data",
        ".date-info",
        '[data-automation-id="event-start-date"]',
        ".event-time",
        ".listing-info__date",
      ],
      description: [
        ".event-description",
        ".event-card__description",
        ".structured-content",
        ".listing-hero-description",
        ".event-about",
      ],
      price: [
        ".event-card__price",
        ".conversion-bar__panel-info",
        ".ticket-info",
        ".event-pricing",
      ],
      location: [
        ".venue-info",
        ".event-details__data--location",
        ".listing-info__address",
        ".event-venue",
      ],
    },
    dateFormats: ["YYYY年MM月DD日", "MM月DD日（曜日）", "YYYY/MM/DD"],
    priority: 10,
    extraction: {
      dateStrategy: "site-specific",
      titleStrategy: "site-specific",
      descriptionStrategy: "site-specific",
    },
  },

  // Amazon
  amazon: {
    domains: ["amazon.co.jp", "amazon.com"],
    selectors: {
      title: [
        "#productTitle",
        ".product-title",
        "h1.a-size-large",
        ".a-spacing-none .a-text-normal",
      ],
      date: [
        "#availability .a-color-success",
        "#delivery-block",
        ".delivery-date",
        "#primeDeliveryMessage",
        ".a-color-success",
      ],
      description: [
        "#feature-bullets ul",
        ".a-unordered-list .a-list-item",
        "#productDescription",
        ".a-spacing-medium .a-spacing-base",
      ],
      price: [
        ".a-price-whole",
        ".a-offscreen",
        ".a-price .a-color-price",
        "#price_inside_buybox",
      ],
    },
    dateFormats: ["MM月DD日", "YYYY/MM/DD", "MM/DD"],
    priority: 5,
    extraction: {
      dateStrategy: "site-specific",
      titleStrategy: "site-specific",
      descriptionStrategy: "general",
    },
  },

  // 楽天
  rakuten: {
    domains: ["rakuten.co.jp", "event.rakuten.co.jp", "travel.rakuten.co.jp"],
    selectors: {
      title: [
        ".item-name",
        ".event-title",
        "h1",
        ".product-name",
        ".hotel-name",
      ],
      date: [
        ".delivery-date",
        ".event-date",
        ".date-info",
        ".check-in-date",
        ".event-schedule",
      ],
      description: [
        ".item-desc",
        ".event-description",
        ".product-details",
        ".event-content",
      ],
      price: [".price", ".event-price", ".item-price", ".hotel-price"],
    },
    dateFormats: ["YYYY年MM月DD日", "MM月DD日", "YYYY年MM月DD日（曜日）"],
    priority: 8,
    extraction: {
      dateStrategy: "site-specific",
      titleStrategy: "site-specific",
      descriptionStrategy: "site-specific",
    },
  },

  // ぴあ
  pia: {
    domains: ["pia.jp", "t.pia.jp"],
    selectors: {
      title: [
        ".p-performance-title",
        ".p-event-title",
        "h1.title",
        ".event-name",
      ],
      date: [
        ".p-performance-schedule",
        ".schedule-info",
        ".event-date",
        ".p-schedule-list",
      ],
      description: [
        ".p-performance-detail",
        ".event-description",
        ".p-event-content",
      ],
      price: [".p-performance-price", ".ticket-price", ".price-info"],
      location: [".p-performance-venue", ".venue-info", ".event-venue"],
    },
    dateFormats: ["YYYY年MM月DD日", "MM月DD日（曜日）", "YYYY/MM/DD（曜日）"],
    priority: 9,
    extraction: {
      dateStrategy: "site-specific",
      titleStrategy: "site-specific",
      descriptionStrategy: "site-specific",
    },
  },

  // メルカリ
  mercari: {
    domains: ["mercari.com", "jp.mercari.com"],
    selectors: {
      title: [".item-name", 'h1[data-testid="item-name"]', ".item-detail-name"],
      date: [".shipping-date", ".delivery-info", ".item-shipping-date"],
      description: [
        ".item-description",
        '[data-testid="item-description"]',
        ".item-detail-description",
      ],
      price: [".price-current", '[data-testid="price"]', ".item-price"],
    },
    dateFormats: ["MM月DD日", "YYYY/MM/DD"],
    priority: 6,
    extraction: {
      dateStrategy: "site-specific",
      titleStrategy: "site-specific",
      descriptionStrategy: "general",
    },
  },

  // YouTube
  youtube: {
    domains: ["youtube.com", "youtu.be"],
    selectors: {
      title: [
        "h1.title",
        ".ytd-video-primary-info-renderer h1",
        'h1[class*="title"]',
      ],
      date: [
        ".date",
        "#info .date",
        ".ytd-video-primary-info-renderer .date",
        "#upload-info .date",
      ],
      description: [
        ".description",
        ".ytd-video-secondary-info-renderer .description",
        "#description",
      ],
    },
    dateFormats: ["YYYY/MM/DD", "MM月DD日", "YYYY年MM月DD日"],
    priority: 4,
    extraction: {
      dateStrategy: "general",
      titleStrategy: "site-specific",
      descriptionStrategy: "general",
    },
  },

  // Connpass
  connpass: {
    domains: ["connpass.com"],
    selectors: {
      title: [".event_title", "h1.event-title", ".title"],
      date: [".event_date", ".datetime", ".event-datetime"],
      description: [
        ".event_description",
        ".description_detail",
        ".event-content",
      ],
      location: [".event_venue", ".venue-info", ".address"],
    },
    dateFormats: ["YYYY/MM/DD", "YYYY年MM月DD日", "MM月DD日（曜日）"],
    priority: 9,
    extraction: {
      dateStrategy: "site-specific",
      titleStrategy: "site-specific",
      descriptionStrategy: "site-specific",
    },
  },

  // NJPW（新日本プロレス）
  njpw: {
    domains: ["www.njpw.co.jp", "njpw.co.jp"],
    selectors: {
      title: [
        "h2",
        "h3",
        ".title",
        ".event-title",
        ".card-title",
        ".schedule-title",
      ],
      date: [
        ".date",
        ".event-date",
        ".schedule-date",
        "time",
        "[datetime]",
        ".card-date",
      ],
      description: [".description", ".event-description", ".content"],
      location: [".venue", ".location", ".event-venue", ".place", ".arena"],
    },
    dateFormats: ["YYYY年MM月DD日", "YYYY/MM/DD", "MM月DD日"],
    priority: 9,
    extraction: {
      dateStrategy: "site-specific",
      titleStrategy: "site-specific",
      descriptionStrategy: "site-specific",
    },
  },

  // 一般的なサイト（フォールバック）
  general: {
    domains: ["*"],
    selectors: {
      title: [
        "h1",
        "h2",
        ".title",
        ".event-title",
        ".product-title",
        ".article-title",
        '[class*="title"]',
      ],
      date: [
        ".date",
        ".datetime",
        ".event-date",
        ".delivery-date",
        "time",
        "[datetime]",
        '[class*="date"]',
      ],
      description: [
        ".description",
        ".content",
        ".event-description",
        "p",
        ".article-content",
        '[class*="description"]',
      ],
      price: [".price", ".cost", ".fee", '[class*="price"]'],
    },
    dateFormats: [
      "YYYY年MM月DD日",
      "MM月DD日",
      "YYYY/MM/DD",
      "YYYY-MM-DD",
      "MM/DD/YYYY",
      "DD/MM/YYYY",
    ],
    priority: 1,
    extraction: {
      dateStrategy: "general",
      titleStrategy: "general",
      descriptionStrategy: "general",
    },
  },
};

/**
 * カスタムパターンを追加するためのAPI
 * @param {string} name パターン名
 * @param {object} pattern パターン設定
 */
window.addCustomSitePattern = function (name, pattern) {
  window.ChronoClipSitePatterns[name] = pattern;

  // EventDetectorが存在する場合は動的に追加
  if (window.ChronoClipEventDetector) {
    window.ChronoClipEventDetector.registerSitePattern(name, pattern);
  }
};

/**
 * 既存パターンを上書きするAPI
 * @param {string} name パターン名
 * @param {object} updates 更新内容
 */
window.updateSitePattern = function (name, updates) {
  if (window.ChronoClipSitePatterns[name]) {
    window.ChronoClipSitePatterns[name] = {
      ...window.ChronoClipSitePatterns[name],
      ...updates,
    };

    // EventDetectorにも反映
    if (window.ChronoClipEventDetector) {
      window.ChronoClipEventDetector.registerSitePattern(
        name,
        window.ChronoClipSitePatterns[name]
      );
    }
  }
};
