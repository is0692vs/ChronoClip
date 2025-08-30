# ChronoClip

> ウェブ上のあらゆる日付情報を、あなたのカレンダーへシームレスに

ChronoClip は、ウェブサイト上の日付やイベント情報を自動的に検出し、Google カレンダーに簡単に追加できる Chrome 拡張機能です。イベント情報の手動入力の手間を省き、スケジュール管理を効率化します。

## 🚀 主な機能

- **日付の自動検出**: ページ上の日付をハイライトし、クリック一つでカレンダーに追加できます。
- **イベント情報の自動抽出**: 日付周辺のテキストから、イベントのタイトルや詳細情報を自動でフォームに入力します。
- **手動選択**: テキストを選択して右クリックするだけで、特定の情報を抜き出してカレンダーに登録できます。
- **サイト固有ルール**: 特定のウェブサイト（例: Eventbrite, Amazon）に最適化された情報抽出ルールを適用できます。
- **高いカスタマイズ性**: 開発者はサイト固有の抽出ルールやカスタム抽出器を簡単に追加できます。

## 📥 インストール手順

### 方法 1: Chrome ウェブストアから（準備中）

現在 Chrome ウェブストアに申請中です。公開され次第、リンクを掲載します。

### 方法 2: 手動インストール

1.  リリースページ（準備中）から最新版の `ChronoClip.zip` をダウンロードします。
2.  ダウンロードしたファイルを解凍します。
3.  Chrome で `chrome://extensions` を開きます。
4.  右上の「デベロッパー モード」をオンにします。
5.  「パッケージ化されていない拡張機能を読み込む」ボタンをクリックし、解凍したフォルダを選択します。

## 使い方

### 1. 自動検出

ウェブページを読み込むと、ChronoClip が自動的に日付を検出し、ハイライト表示します。ハイライトされた日付をクリックすると、カレンダー追加用のポップアップが開きます。

### 2. 手動選択

カレンダーに追加したい情報（日付、イベント名など）を含むテキストを選択し、右クリックメニューから「Add to Calendar」を選択します。

## 🛠️ 開発者向け情報

### 開発環境のセットアップ

1.  **リポジトリをクローン**

    ```bash
    git clone https://github.com/your-username/ChronoClip.git
    cd ChronoClip
    ```

2.  **`manifest.json` の設定**

    - `manifest.example.json` をコピーして `manifest.json` を作成します。
    - Google Cloud Console で OAuth 2.0 クライアント ID を作成し、`manifest.json` 内の `"YOUR_GOOGLE_CLOUD_OAUTH_CLIENT_ID.apps.googleusercontent.com"` を置き換えます。
    - 拡張機能のキーを `"YOUR_GENERATED_EXTENSION_KEY"` に設定します。

3.  **拡張機能の読み込み**
    - Chrome で `chrome://extensions` を開き、「デベロッパー モード」をオンにします。
    - 「パッケージ化されていない拡張機能を読み込む」をクリックし、このプロジェクトのルートフォルダを選択します。

### プロジェクト構成

```
ChronoClip/
├── config/
│   ├── constants.js              # 各種設定値
│   └── site-patterns.js          # サイト固有の抽出パターン
├── manifest.json                 # 拡張機能のマニフェスト
├── src/
│   ├── background/
│   │   └── service-worker.js     # バックグラウンド処理
│   ├── content/                  # Webページに挿入されるスクリプト
│   │   ├── content-script.js
│   │   ├── event-detector.js
│   │   └── ...
│   ├── shared/                   # 共有モジュール
│   │   ├── calendar.js
│   │   ├── date-parser.js
│   │   └── extractors/           # サイト別抽出ロジック
│   └── ui/                       # UI関連ファイル
│       ├── options/              # 設定ページ
│       └── popup/                # ポップアップ
└── README.md
```

### テストの実行

このプロジェクトのテストは、ブラウザで HTML ファイルを開くことで実行します。

1.  **単体テスト**: `tests` ディレクトリにある `date-parsing-test.html` や `event-extraction-test.html` などをブラウザで直接開きます。
2.  **統合テスト**: 一部のテスト（例: `settings-integration-test.html`）は、拡張機能のコンテキストで実行する必要があります。
    - 拡張機能を読み込んだ後、`chrome-extension://<拡張機能ID>/tests/settings-integration-test.html` のような URL にアクセスします。
    - 詳細は `tests/README.md` を参照してください。

### カスタム抽出器の開発

特定のサイト向けに専用の抽出器を `src/shared/extractors/` 内に作成できます。

1.  `example-extractor.js` を参考に新しい抽出器ファイルを作成します。
2.  ドメイン、セレクター、抽出ロジックを実装します。
3.  `src/shared/extractors/extractor-factory.js` に新しい抽出器を登録します。
4.  詳細は既存の抽出器（例: `stardom-detail-extractor.js`）を参照してください。
