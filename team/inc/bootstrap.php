<?php
/**
 * 共通初期化：設定読み込み・セッション・DB・ヘルパー
 */
declare(strict_types=1);

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="ja"><meta charset="utf-8"><title>初期設定が必要です</title>'
       . '<body style="font-family:sans-serif;max-width:640px;margin:60px auto;line-height:1.9">'
       . '<h1>⚽ 初期設定が必要です</h1>'
       . '<p><code>team/config.sample.php</code> を <code>team/config.php</code> という名前でコピーして、'
       . '招待コードなどを設定してください。</p></body></html>';
    exit;
}
$CONFIG = require $configFile;

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'path'     => '/',
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
]);
session_name('scnote_sid');
session_start();

require __DIR__ . '/db.php';
require __DIR__ . '/auth.php';

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function json_out(array $o, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($o, JSON_UNESCAPED_UNICODE);
    exit;
}

/** team/ ディレクトリの公開URL（末尾スラッシュなし） */
function base_url(): string
{
    global $CONFIG;
    if (!empty($CONFIG['base_url'])) {
        return rtrim((string)$CONFIG['base_url'], '/');
    }
    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scheme = $https ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir    = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    if (substr($dir, -4) === '/api') {
        $dir = substr($dir, 0, -4);
    }
    return $scheme . '://' . $host . $dir;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function csrf_check_post(): void
{
    $t = $_POST['csrf'] ?? '';
    if (!is_string($t) || !hash_equals($_SESSION['csrf'] ?? '', $t)) {
        http_response_code(400);
        exit('不正なリクエストです。ページを開き直してもう一度お試しください。');
    }
}
