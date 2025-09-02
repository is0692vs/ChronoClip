# ChronoClip

> Chrome + Chrono(時間) + Clip(切り取る)

![GitHub last commit](https://img.shields.io/github/last-commit/is0692vs/ChronoClip) ![GitHub issues](https://img.shields.io/github/issues/is0692vs/ChronoClip) ![GitHub pull requests](https://img.shields.io/github/issues-pr/is0692vs/ChronoClip)

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

### 方法 2: 手動インストール（開発者向け）

1.  このリポジトリをダウンロードまたはクローンします。
2.  `manifest.example.json` をコピーして `manifest.json` を作成します。
3.  Google Cloud Console で OAuth 2.0 クライアント ID を作成し、`manifest.json` 内の `"YOUR_GOOGLE_CLOUD_OAUTH_CLIENT_ID.apps.googleusercontent.com"` をご自身のクライアント ID に置き換えます。
    - _（注: `manifest.json` の `key` は、拡張機能を一度読み込むと自動的に生成されるため、手動での設定は不要です。）_
4.  Chrome で `chrome://extensions` を開きます。
5.  右上の「デベロッパー モード」をオンにします。
6.  「パッケージ化されていない拡張機能を読み込む」ボタンをクリックし、このプロジェクトのルートフォルダを選択します。

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

2.  **拡張機能の読み込み**
    - 上記の「手動インストール」セクションの手順に従って、拡張機能を読み込みます。
    - ソースコードを変更した場合は、`chrome://extensions` ページで拡張機能のリロードボタンをクリックしてください。

### 拡張機能のパッケージングと ID の固定

開発した拡張機能を配布可能な `.crx` ファイルとしてパッケージ化したり、開発中に拡張機能の ID を固定したり（Google OAuth の設定で必要）するには、以下の手順を実行します。

1.  Chrome で `chrome://extensions` を開きます。
2.  「デベロッパー モード」がオンになっていることを確認します。
3.  「拡張機能をパッケージ化」ボタンをクリックします。
4.  「拡張機能のルート ディレクトリ」に、このプロジェクトのルートフォルダ（`ChronoClip`フォルダ）を指定します。
5.  **秘密鍵ファイル (.pem) の指定:**
    - **初回パッケージ時:** この欄は空のままにします。「拡張機能をパッケージ化」をクリックすると、`.crx`ファイルと一緒に新しい`.pem`ファイル（秘密鍵）が生成されます。
    - **2 回目以降（ID を固定する場合）:** 初回に生成された`.pem`ファイルを指定します。これにより、拡張機能の ID が同じものに固定されます。
6.  「拡張機能をパッケージ化」をクリックすると、プロジェクトの親ディレクトリに `ChronoClip.crx` と（初回の場合は）`ChronoClip.pem` が生成されます。

**重要:** 生成された `.pem` ファイルは、拡張機能の ID を保証する重要な秘密鍵です。紛失しないように安全な場所に保管し、絶対に公開したり、Git などのバージョン管理に含めたりしないでください。

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

### サイト固有ルール（カスタム抽出器）の追加手順

特定のウェブサイト向けに、より高精度な情報抽出ルール（カスタム抽出器）を追加できます。以下の手順に従って開発してください。

#### 1. 新しい抽出器（Extractor）ファイルを作成する

まず、サイト固有の抽出ロジックを記述するファイルを作成します。

1.  `src/shared/extractors/example-extractor.js` をコピーし、`src/shared/extractors/` ディレクトリ内に `{サイト名}-extractor.js` という名前で新しいファイルを作成します。（例: `my-site-extractor.js`）
2.  ファイル内のクラス名を、`ChronoClip{サイト名}Extractor` のように、サイトに合わせて変更します。（例: `ChronoClipMySiteExtractor`）
3.  `BaseExtractor` を継承するようにクラス定義を変更します。これにより、基本的な抽出機能やヘルパーメソッドを利用できます。

    ```javascript
    // 変更前
    class ChronoClipMySiteExtractor {
      // ...
    }

    // 変更後
    class ChronoClipMySiteExtractor extends window.ChronoClipBaseExtractor {
      constructor(rule) {
        super(rule); // 親クラスのコンストラクタを呼び出す
        this.name = "MySiteExtractor";
        this.version = "1.0.0";
      }
      // ...
    }
    ```

4.  `extractAll` メソッドをオーバーライド（再定義）し、サイトの HTML 構造に合わせて、タイトル、日付、詳細情報などを抽出する具体的なロジックを実装します。多くの場合、`context.querySelector()` や `context.querySelectorAll()` を使って特定の CSS セレクタを持つ要素から情報を取得します。

    ```javascript
    async extractAll(context) {
        // 親のextractAllを呼び出して基本的な情報を取得
        const baseData = await super.extractAll(context);

        // このサイト固有のロジックで情報を上書き・追加
        const titleElement = context.querySelector('h1.event-title');
        if (titleElement) {
            baseData.title = this.cleanText(titleElement.textContent);
        }

        // 抽出の信頼度を更新
        baseData.confidence = this.calculateConfidence(Object.values(baseData));

        return baseData;
    }
    ```

#### 2. URL パターンと抽出器を紐付ける

次に、どの URL で新しい抽出器を有効にするかを設定します。

1.  `config/site-patterns.js` ファイルを開きます。
2.  `window.ChronoClipSitePatterns` オブジェクトの末尾に、新しいサイトの設定を追加します。`extractorModule` には、次のステップで Factory に登録する際の一意なキー（通常はサイト名）を指定します。

    ```javascript
    window.ChronoClipSitePatterns = {
      // ... 既存のルール
      "my-site": {
        // サイトの一意なキー
        domains: ["www.my-site.com", "event.my-site.com"], // 対象ドメイン
        priority: 10, // 優先度（高いほど優先される）
        extractorModule: "my-site", // 抽出器のキー
        selectors: {
          // BaseExtractorが使用するセレクタ
          title: "h1.event-title, .main-title",
          date: ".date-info, .schedule",
          // ... その他必要なセレクタ
        },
      },
      // ... generalルールは最後に
    };
    ```

#### 3. 抽出器を Factory に登録する

作成した抽出器を、アプリケーションが認識できるように登録します。

1.  `src/shared/extractors/extractor-factory.js` を開きます。
2.  `registerExtractors` メソッド内に、新しい抽出器を登録するコードを追加します。キーは `site-patterns.js` で指定したものと一致させます。

    ```javascript
    registerExtractors() {
      // ... 既存のExtractor
      this.extractors.set('my-site', window.ChronoClipMySiteExtractor);
      // ...
    }
    ```

#### 4. `manifest.json` を更新する

最後に、作成した抽出器の JavaScript ファイルを Chrome 拡張機能に読み込ませるための設定を行います。

1.  `manifest.json` （または `manifest.example.json`）を開きます。
2.  `web_accessible_resources` セクションの `resources` 配列に、作成した抽出器ファイルへのパスを追加します。これにより、ウェブページからスクリプトにアクセスできるようになります。

    ```json
    "web_accessible_resources": [
      {
        "resources": [
          // ...
          "src/shared/extractors/my-site-extractor.js"
        ],
        "matches": ["<all_urls>"]
      }
    ]
    ```

#### 5. 動作確認

1.  Chrome で `chrome://extensions` を開きます。
2.  ChronoClip 拡張機能の「リロード」ボタンをクリックして、変更を反映させます。
3.  設定した対象サイトのページを開き、日付などが正しくハイライトされたり、ポップアップに情報が自動入力されたりすることを確認します。

もし問題が発生した場合は、デベロッパーコンソール（`F12`キー）で `ChronoClip:` から始まるログメッセージを確認すると、デバッグの助けになります。
