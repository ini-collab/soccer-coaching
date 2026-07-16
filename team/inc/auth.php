<?php
declare(strict_types=1);

/** ログイン中のユーザー（未ログインなら null） */
function current_user(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    $st = db()->prepare('SELECT id, email, name FROM users WHERE id = ?');
    $st->execute([(int)$_SESSION['uid']]);
    $u = $st->fetch();
    return $u ?: null;
}

/** 画面用：未ログインならログインページへ */
function require_login_page(): array
{
    $u = current_user();
    if (!$u) {
        header('Location: login.php');
        exit;
    }
    return $u;
}

/** API用：未ログインなら401 */
function require_login_api(): array
{
    $u = current_user();
    if (!$u) {
        json_out(['ok' => false, 'error' => 'unauthorized'], 401);
    }
    return $u;
}

function login_session(int $uid): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = $uid;
    unset($_SESSION['pending_google']);
}

function find_user_by_email(string $email): ?array
{
    $st = db()->prepare('SELECT * FROM users WHERE email = ?');
    $st->execute([mb_strtolower(trim($email))]);
    $u = $st->fetch();
    return $u ?: null;
}

function find_user_by_google(string $sub): ?array
{
    $st = db()->prepare('SELECT * FROM users WHERE google_sub = ?');
    $st->execute([$sub]);
    $u = $st->fetch();
    return $u ?: null;
}

function create_user(string $email, string $name, ?string $passHash, ?string $googleSub): int
{
    $st = db()->prepare('INSERT INTO users (email, name, pass_hash, google_sub, created_at) VALUES (?, ?, ?, ?, ?)');
    $st->execute([mb_strtolower(trim($email)), trim($name), $passHash, $googleSub, gmdate('c')]);
    return (int)db()->lastInsertId();
}

function link_google(int $uid, string $sub): void
{
    $st = db()->prepare('UPDATE users SET google_sub = ? WHERE id = ?');
    $st->execute([$sub, $uid]);
}

/** チーム招待コードの照合（未設定なら常にOK） */
function check_invite(string $code): bool
{
    global $CONFIG;
    $need = trim((string)($CONFIG['invite_code'] ?? ''));
    return $need === '' || hash_equals($need, trim($code));
}

function google_enabled(): bool
{
    global $CONFIG;
    return !empty($CONFIG['google']['client_id']) && !empty($CONFIG['google']['client_secret']);
}

function invite_required(): bool
{
    global $CONFIG;
    return trim((string)($CONFIG['invite_code'] ?? '')) !== '';
}
