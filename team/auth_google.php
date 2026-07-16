<?php
/**
 * Googleログイン（OAuth 2.0 認可コードフロー）
 *  - パラメータなしでアクセス → Googleの同意画面へリダイレクト
 *  - ?code=... 付きで戻ってくる → トークン交換してログイン
 */
require __DIR__ . '/inc/bootstrap.php';

function google_fail(string $msg): void
{
    header('Location: login.php?err=' . urlencode($msg));
    exit;
}

$g = $CONFIG['google'] ?? [];
if (empty($g['client_id']) || empty($g['client_secret'])) {
    google_fail('Googleログインはこのサーバーでは設定されていません。');
}
$redirect = base_url() . '/auth_google.php';

if (isset($_GET['code'])) {
    /* ---- コールバック ---- */
    $state = (string)($_GET['state'] ?? '');
    if (!hash_equals($_SESSION['g_state'] ?? '', $state) || $state === '') {
        google_fail('不正なリクエストです。もう一度お試しください。');
    }
    unset($_SESSION['g_state']);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_POSTFIELDS => http_build_query([
            'code' => (string)$_GET['code'],
            'client_id' => $g['client_id'],
            'client_secret' => $g['client_secret'],
            'redirect_uri' => $redirect,
            'grant_type' => 'authorization_code',
        ]),
    ]);
    $res = curl_exec($ch);
    $errno = curl_errno($ch);
    curl_close($ch);
    if ($errno || !is_string($res)) {
        google_fail('Googleとの通信に失敗しました。時間をおいてお試しください。');
    }

    $tok = json_decode($res, true);
    $idToken = is_array($tok) ? (string)($tok['id_token'] ?? '') : '';
    $parts = explode('.', $idToken);
    if (count($parts) !== 3) {
        google_fail('Googleからの応答を確認できませんでした。');
    }
    // id_token はGoogleのトークンエンドポイントからTLSで直接受け取ったものなので
    // 署名検証は省略できる（audだけ確認する）
    $p = json_decode(base64_decode(strtr($parts[1], '-_', '+/')) ?: '', true);
    if (!is_array($p) || ($p['aud'] ?? '') !== $g['client_id'] || empty($p['sub'])) {
        google_fail('Googleアカウント情報を確認できませんでした。');
    }
    $sub = (string)$p['sub'];
    $email = mb_strtolower(trim((string)($p['email'] ?? '')));
    $name = trim((string)($p['name'] ?? ''));
    if ($name === '') {
        $name = $email !== '' ? explode('@', $email)[0] : 'コーチ';
    }

    // 1) Googleアカウント連携済み
    $u = find_user_by_google($sub);
    if ($u) {
        login_session((int)$u['id']);
        header('Location: index.php');
        exit;
    }
    // 2) 同じメールアドレスの既存ユーザー → 連携してログイン
    $u = $email !== '' ? find_user_by_email($email) : null;
    if ($u) {
        link_google((int)$u['id'], $sub);
        login_session((int)$u['id']);
        header('Location: index.php');
        exit;
    }
    // 3) 新規メンバー → 区分・招待コードの確認画面へ
    $_SESSION['pending_google'] = ['sub' => $sub, 'email' => $email, 'name' => $name];
    header('Location: login.php');
    exit;

} elseif (isset($_GET['error'])) {
    google_fail('Googleログインがキャンセルされました。');

} else {
    /* ---- 認可開始 ---- */
    $state = bin2hex(random_bytes(16));
    $_SESSION['g_state'] = $state;
    $q = http_build_query([
        'client_id' => $g['client_id'],
        'redirect_uri' => $redirect,
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'state' => $state,
        'prompt' => 'select_account',
    ]);
    header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $q);
    exit;
}
