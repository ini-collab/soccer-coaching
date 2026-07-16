# ⚽ サッカーコーチノート チーム共有版（ConoHa WING対応）

ログインして使う**サーバー共有バージョン**です。作成した練習メニュー・ドリル・戦術ボード・ポジション表がサーバーに保存され、**登録したコーチ全員で共有**されます。

- メールアドレス＋パスワード、または **Googleアカウント** でログイン
- 新規登録には**チーム招待コード**（config.phpで設定）が必要
- 変更は自動保存され、他のメンバーの変更も約20秒ごとに自動反映
- UI・機能はオフライン版と共通（PNG保存・JSON書き出し・印刷もそのまま使えます）

## 動作要件

- PHP 7.4以上（PHP 8.x推奨）＋ PDO（SQLite または MySQL）＋ curl
- ConoHa WING はすべて標準で対応しています

## ConoHa WING への設置手順

### 1. ファイルをアップロード

リポジトリの**全ファイル**を `public_html/`（または任意のサブディレクトリ）にアップロードします。

- ConoHa WING コントロールパネル →「サイト管理」→「ファイルマネージャー」、または FTP/SFTP
- `index.html`・`css/`・`js/`・`team/` がすべて必要です（team版は共通のUIファイルを参照します）

### 2. 設定ファイルを作成

`team/config.sample.php` を複製して `team/config.php` にリネームし、編集します。

```php
'invite_code' => 'あなたのチームの合言葉',  // ★必ず変更してください
```

### 3. アクセスして動作確認

`https://あなたのドメイン/team/` を開くとログイン画面が表示されます。
「新規登録」からお名前・メールアドレス・パスワード・招待コードで登録するとすぐ使えます。

データベースは標準で **SQLite**（`team/data/app.db` に自動作成、設定不要）。
`team/data/` には `.htaccess` が自動設置され、Webから直接読めないよう保護されます。

> 💡 ConoHa WINGの無料独自SSL（HTTPS）を必ず有効にしてください。

### 4. MySQLを使う場合（任意）

ConoHa WING コントロールパネル →「サイト管理」→「データベース」で DB とユーザーを作成し、`config.php` を書き換えます。

```php
'db' => [
  'driver' => 'mysql',
  'mysql' => [
    'host'    => 'mysqlXXXX.conoha.ne.jp', // DBサーバー名
    'dbname'  => '作成したDB名',
    'user'    => '作成したユーザー名',
    'pass'    => 'パスワード',
    'charset' => 'utf8mb4',
  ],
],
```

テーブルは初回アクセス時に自動作成されます。

### 5. Googleログインを有効にする場合（任意）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「OAuth同意画面」を設定（外部／アプリ名など最低限でOK）
3. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」→ 種類は**ウェブアプリケーション**
4. **承認済みのリダイレクトURI**に次を登録：
   ```
   https://あなたのドメイン/team/auth_google.php
   ```
5. 発行された クライアントID／クライアントシークレット を `config.php` に貼り付け：
   ```php
   'google' => [
     'client_id'     => 'xxxxx.apps.googleusercontent.com',
     'client_secret' => 'GOCSPX-xxxxx',
   ],
   ```

設定するとログイン画面に「Googleでログイン」ボタンが表示されます。
Googleで初めてログインするメンバーにも招待コードの入力を求めるので、部外者は参加できません。

## データの共有のしくみ

- 全メンバーが**同じ1つのチームデータ**（ドリル・メニュー・ボード・ポジション表）を見ます
- 編集は項目ごとの差分としてサーバーに保存（最後に保存した内容が有効）
- 「データ」タブの JSON 書き出し／読み込みはチーム全体のデータに対して動作します（読み込み・全削除は全員に影響するため注意）

## ファイル構成

```
team/
├── index.php          アプリ画面（要ログイン。../index.html を共通UIとして配信）
├── login.php          ログイン・新規登録・招待コード確認
├── logout.php         ログアウト
├── auth_google.php    Google OAuth 2.0 ログイン
├── api/data.php       データ共有API（差分同期）
├── js/remote.js       サーバー同期エンジン（自動保存・自動反映）
├── inc/               共通処理（設定・DB・認証）
├── config.sample.php  設定ファイルのひな形 → config.php にコピーして使用
└── data/              SQLiteデータベース（自動作成・Webアクセス遮断）
```
