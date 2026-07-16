<?php
/**
 * チーム共有版 アプリ画面
 * ルートの index.html（オフライン版と共通のUI）を読み込み、
 *  - アセットのパスを ../ に付け替え
 *  - ログインユーザー情報・CSRFトークン・サーバー同期スクリプトを注入
 * して配信する。UI本体は index.html / js/app.js / js/board.js と共通。
 */
require __DIR__ . '/inc/bootstrap.php';

$user = require_login_page();

$htmlPath = dirname(__DIR__) . '/index.html';
if (!file_exists($htmlPath)) {
    http_response_code(500);
    exit('index.html が見つかりません。リポジトリ全体をアップロードしてください。');
}
$html = file_get_contents($htmlPath);

// 共有アセット（css/js）へのパスを team/ から見た相対パスに変換
$html = str_replace('href="css/', 'href="../css/', $html);
$html = str_replace('src="js/', 'src="../js/', $html);
$html = str_replace('<title>サッカーコーチノート</title>', '<title>サッカーコーチノート（チーム共有版）</title>', $html);

// ユーザー情報・CSRF・同期スクリプトを注入
$role = ($user['role'] ?? 'coach') === 'player' ? 'player' : 'coach';
$inject = '<script>'
    . 'window.TEAM_USER=' . json_encode([
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $role,
        'grade' => $user['grade'] ?? '',
        'memberId' => $user['member_id'] ?? '',
    ], JSON_UNESCAPED_UNICODE) . ';'
    . 'window.APP_ROLE=' . json_encode($role) . ';'
    . 'window.APP_MEMBER_ID=' . json_encode($user['member_id'] ?? '') . ';'
    . 'window.CSRF_TOKEN=' . json_encode(csrf_token()) . ';'
    . '</script>' . "\n"
    . '<script src="js/remote.js"></script>' . "\n";
$html = str_replace('</body>', $inject . '</body>', $html);

header('Content-Type: text/html; charset=utf-8');
echo $html;
