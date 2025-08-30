# ChronoClip テストガイド

このディレクトリには、ChronoClip の各機能が正しく動作することを確認するためのテストファイルが含まれています。

テストは大きく分けて「単体テスト」と「統合テスト」の2種類があります。

- **単体テスト**: 特定のモジュールや機能（日付解析、情報抽出など）を個別にテストします。ほとんどは、HTML ファイルをブラウザで直接開くことで実行できます。
- **統合テスト**: 複数のモジュールを組み合わせた、より実践的なテストです。一部は Chrome 拡張機能のAPI（`chrome.storage`など）に依存するため、拡張機能のコンテキストで実行する必要があります。

## 🧪 テストファイル一覧

```
date-detection.test.js
date-extraction-test.js
date-parsing-test.html
error-handling-test.html
event-extraction-test.html
event-extraction.test.js
integrated-module-test.html
README.md
selection-test.html
settings-integration-test.html
simple-test.js
site-rule-integration-test.html
stardom-detail-test.html
stardom-month-test.html
test.html
tokyo-dome-hall-test.html
```

## 実行方法

### 1. 単体テスト

日付解析やDOMからの情報抽出など、特定の機能に関するテストです。

- **実行方法**: テストしたい `*.html` ファイルをブラウザで直接開きます。
- **例**: `date-parsing-test.html` を開くと、様々な形式の日付文字列が正しく解析されるかを確認できます。

```bash
# 例: 日付解析テストを実行
open tests/date-parsing-test.html
```

### 2. 統合テスト

設定管理システムなど、拡張機能のAPIを必要とする機能のテストです。

#### 対象ファイル

- `settings-integration-test.html`
- `site-rule-integration-test.html`

#### ⚠️ 重要：拡張機能コンテキストでの実行が必要

これらのテストは、通常のWebページとしてファイルを開いただけでは `chrome.*` APIが利用できず、正しく動作しません。

**推奨される実行手順:**

1.  プロジェクトを「パッケージ化されていない拡張機能」としてChromeに読み込みます。
2.  拡張機能のオプションページを開きます。
3.  ページ下部にあるテストページへのリンク（例: 「📊 設定システムのテストページを開く」）をクリックします。

または、拡張機能のIDを調べて、直接URLにアクセスすることも可能です。

```
chrome-extension://<あなたの拡張機能ID>/tests/settings-integration-test.html
```

#### `settings-integration-test.html` の詳細

このテストページでは、設定管理システム（`settings.js`）の以下の機能を検証します。

- **基本機能**: 設定の保存、読み込み、デフォルト値の適用。
- **バリデーション**: 不正な値が保存されないことの確認。
- **マイグレーション**: 古いバージョンの設定が新しい形式に移行されることの確認。
- **ブロードキャスト**: 設定変更が他のページに即時反映されることの確認。

ページ上の「全テスト実行」ボタン、または各項目の「実行」ボタンでテストを開始できます。

- ✅ **緑色**: テスト成功
- ❌ **赤色**: テスト失敗
- ⚠️ **黄色**: 拡張機能のコンテキストでないためテストがスキップされた状態

トラブルシューティングについては、このテストページ内の指示に従ってください。