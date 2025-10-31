# ドメイン除外リスト機能

## 概要

ChronoClipには、特定のドメインやURLパターンで拡張機能を自動的に無効化する「除外リスト」機能があります。この機能は、サイト固有のルール設定よりもシンプルで、ドメインやURLパターンを指定するだけで、そのサイトでChronoClipの処理を完全にスキップできます。

## 使用例

### 完全なドメインを除外

```json
{
  "excludedDomains": [
    "example.com",
    "internal-site.mycompany.com"
  ]
}
```

この設定により、`example.com` および `internal-site.mycompany.com` での処理がスキップされます。

### サブドメインを一括で除外

ワイルドカード `*.` を使用して、すべてのサブドメインを除外できます：

```json
{
  "excludedDomains": [
    "*.google.com",
    "*.facebook.com"
  ]
}
```

この設定により、`mail.google.com`, `drive.google.com`, `www.facebook.com` など、すべてのサブドメインが除外されます。

### 特定のURLパターンを除外

URLパターンを使用して、特定のページやセクションを除外できます：

```json
{
  "excludedDomains": [
    "example.com/admin/*",
    "mysite.com/private/*",
    "*.internal/*"
  ]
}
```

- `example.com/admin/*`: `example.com` の `/admin/` 以下のすべてのページを除外
- `mysite.com/private/*`: `mysite.com` の `/private/` 以下を除外
- `*.internal/*`: すべてのドメインの `/internal/` パスを除外

## 設定方法

### 手動設定（Chrome Storage）

拡張機能の設定画面または Chrome DevTools のコンソールから設定できます：

```javascript
// 設定を取得
const settings = await chrome.storage.sync.get('chronoClipSettings');

// excludedDomainsを追加
settings.chronoClipSettings.excludedDomains = [
  "example.com",
  "*.google.com",
  "facebook.com/ads/*"
];

// 設定を保存
await chrome.storage.sync.set(settings);
```

### プログラマティックに設定

```javascript
// ChronoClip Settings APIを使用
const settings = await window.ChronoClipSettings.getSettings();
settings.excludedDomains = [
  "example.com",
  "*.google.com"
];
await window.ChronoClipSettings.setSettings(settings);
```

## パターンマッチングのルール

1. **完全一致**: `example.com` - ドメインが完全に一致する場合
2. **サブドメイン一致**: `*.example.com` - すべてのサブドメインに一致
3. **URLパターン一致**: パスを含むパターン（`/` を含む）は、URLに対して正規表現マッチングを実行
   - `*` は任意の文字列（0文字以上）に置換されます
   - `.` は正規表現でエスケープされます

## 動作

除外リストに一致するドメイン/URLでは：

1. コンテンツスクリプトの初期化時にチェックされ、一致する場合は処理が完全にスキップされます
2. 抽出処理（ExtractorFactory）でもチェックされ、除外リストに一致する場合は `null` を返します
3. コンソールに除外されたことを示すログメッセージが出力されます：
   ```
   ChronoClip: ⛔ Domain example.com is excluded, content script will not run
   ```

## 注意事項

- 除外リストは最大100件まで登録できます
- 各パターンは最大256文字まで
- 正規表現は簡易的なワイルドカードマッチングに変換されるため、複雑な正規表現パターンは使用できません
- 除外リストに追加した後は、ページをリロードする必要があります

## サイトルールとの違い

| 機能 | 除外リスト | サイトルール |
|------|-----------|------------|
| 目的 | 特定のサイトで処理を完全にスキップ | サイト固有の詳細な抽出ルールを定義 |
| 設定の複雑さ | シンプル（ドメイン/URLのみ） | 複雑（セレクター、抽出器など） |
| 処理のタイミング | 初期化時とextraction時にチェック | ルールマッチング時に適用 |
| 優先度 | 最高（最初にチェック） | ルールの優先度に依存 |

## トラブルシューティング

### 除外リストが機能しない

1. 設定が正しく保存されているか確認：
   ```javascript
   const settings = await chrome.storage.sync.get('chronoClipSettings');
   console.log(settings.chronoClipSettings.excludedDomains);
   ```

2. ページをリロードしてください

3. パターンが正しいか確認：
   - ドメイン名は小文字で指定
   - `www.` プレフィックスは自動的に正規化されます

### デバッグ

ブラウザのコンソールで除外チェックのログを確認できます：

```
ChronoClip: Domain example.com is excluded (exact match)
ChronoClip: Domain mail.google.com is excluded (subdomain match: *.google.com)
ChronoClip: URL https://facebook.com/ads/manager is excluded (pattern match: facebook.com/ads/*)
```
