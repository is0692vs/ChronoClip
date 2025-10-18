# Multi-Calendar Support Feature

## 概要 (Overview)

同じGoogleアカウント内の複数のカレンダーにイベントを追加できる機能を実装しました。
これにより、個人用、仕事用、時間割用など、用途に応じて異なるカレンダーを使い分けることができます。

This feature allows adding events to multiple calendars within the same Google account.
Users can now separate events into different calendars for personal, work, timetable, etc.

## 主な変更点 (Main Changes)

### 1. カレンダーリストの取得 (Calendar List Fetching)

- Google Calendar APIからユーザーのカレンダーリストを取得
- 1時間キャッシュして不要なAPI呼び出しを削減
- Fetches user's calendar list from Google Calendar API
- Caches for 1 hour to reduce unnecessary API calls

### 2. 設定画面 (Options Page)

- カレンダー選択ドロップダウンを追加
- 利用可能なすべてのカレンダーが表示される
- デフォルトカレンダーを選択可能
- Added calendar selection dropdown
- Shows all available calendars
- Default calendar can be selected

### 3. クイック追加ポップアップ (Quick Add Popup)

- イベント追加時にカレンダーを選択可能
- デフォルトで設定画面で選択したカレンダーが選択される
- Calendar can be selected when adding events
- Defaults to calendar selected in settings

### 4. ポップアップ画面 (Extension Popup)

- 現在のデフォルトカレンダー名を表示
- Displays current default calendar name

## 使い方 (How to Use)

### 初回セットアップ (Initial Setup)

1. 拡張機能の設定画面を開く
2. カレンダーリストが自動的に読み込まれる
3. 「追加先カレンダー」ドロップダウンから希望のカレンダーを選択
4. 「保存」ボタンをクリック

1. Open extension settings
2. Calendar list is automatically loaded
3. Select desired calendar from "Default Calendar" dropdown
4. Click "Save"

### イベントの追加 (Adding Events)

1. ウェブページ上の日付をクリック、またはテキストを選択して右クリック
2. クイック追加ポップアップが表示される
3. 「Calendar」ドロップダウンから追加先カレンダーを選択（デフォルトは設定で選択したカレンダー）
4. イベント情報を入力して「Add」をクリック

1. Click a date on webpage or select text and right-click
2. Quick add popup appears
3. Select destination calendar from "Calendar" dropdown (defaults to settings selection)
4. Fill in event information and click "Add"

## 技術詳細 (Technical Details)

### OAuth スコープの追加 (Additional OAuth Scope)

```
https://www.googleapis.com/auth/calendar.readonly
```

カレンダーリストの読み取りに必要です。
Required for reading calendar list.

### API エンドポイント (API Endpoint)

```
GET https://www.googleapis.com/calendar/v3/users/me/calendarList
```

### データ構造 (Data Structure)

設定に保存されるカレンダー情報:
Calendar information stored in settings:

```javascript
{
  calendarList: [
    {
      id: "primary",
      summary: "メインカレンダー",
      primary: true
    },
    {
      id: "calendar_id@group.calendar.google.com",
      summary: "仕事用カレンダー",
      primary: false
    }
  ],
  calendarListLastFetched: 1234567890000, // Unix timestamp
  defaultCalendar: "primary" // Selected default calendar ID
}
```

### キャッシュ戦略 (Caching Strategy)

- カレンダーリストは1時間キャッシュされます
- キャッシュが古い場合、または存在しない場合は自動的に再取得されます
- Calendar list is cached for 1 hour
- Automatically refetches if cache is old or doesn't exist

## トラブルシューティング (Troubleshooting)

### カレンダーが表示されない (Calendars Not Showing)

1. 拡張機能を再読み込みしてみてください
2. Googleアカウントに再ログインしてみてください
3. manifest.jsonに正しいOAuthスコープが含まれているか確認してください

1. Try reloading the extension
2. Try re-logging into your Google account
3. Verify manifest.json contains the correct OAuth scopes

### イベントが間違ったカレンダーに追加される (Events Added to Wrong Calendar)

1. クイック追加ポップアップで正しいカレンダーが選択されているか確認してください
2. 設定画面でデフォルトカレンダーを確認してください

1. Verify correct calendar is selected in quick add popup
2. Check default calendar in settings

## 今後の改善案 (Future Improvements)

- [ ] カレンダーごとの色分け表示
- [ ] カレンダーのフィルタリング機能
- [ ] 最近使用したカレンダーの履歴
- [ ] サイト別にデフォルトカレンダーを設定

- [ ] Color-coded calendar display
- [ ] Calendar filtering feature
- [ ] Recent calendar history
- [ ] Site-specific default calendars
