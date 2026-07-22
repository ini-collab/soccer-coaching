<?php
declare(strict_types=1);

/** ログイン中のユーザー（未ログインなら null） */
function current_user(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    $st = db()->prepare('SELECT id, email, name, role, grade, member_id FROM users WHERE id = ?');
    $st->execute([(int)$_SESSION['uid']]);
    $u = $st->fetch();
    if (!$u) {
        return null;
    }
    // 旧DBの移行直後などで role が空ならコーチ扱い
    if (empty($u['role'])) {
        $u['role'] = 'coach';
    }
    return $u;
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

function create_user(string $email, string $name, ?string $passHash, ?string $googleSub, string $role = 'coach', string $grade = ''): int
{
    $role = ($role === 'player') ? 'player' : 'coach';
    $st = db()->prepare('INSERT INTO users (email, name, pass_hash, google_sub, role, grade, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $st->execute([mb_strtolower(trim($email)), trim($name), $passHash, $googleSub, $role, trim($grade), gmdate('c')]);
    $uid = (int)db()->lastInsertId();
    // 新しいチームには練習の見本を一度だけ投入（架空の選手・予定は入れない）
    maybe_seed_sample_content();
    // 名簿（共有データ）にも自動登録し、ユーザーと紐づける
    // ID は 'pu'+ユーザーID（app.js のシード p1/p2… や uid('p') と衝突しない形）
    $mid = 'pu' . $uid;
    if ($role === 'player') {
        put_item('members', $mid, ['id' => $mid, 'kind' => 'player', 'name' => trim($name), 'grade' => trim($grade), 'number' => '', 'note' => '', 'userId' => (string)$uid], trim($name));
    } else {
        // コーチも名簿にコーチとして表示される
        put_item('members', $mid, ['id' => $mid, 'kind' => 'coach', 'name' => trim($name), 'role' => '', 'grades' => [], 'note' => '', 'userId' => (string)$uid], trim($name));
    }
    $up = db()->prepare('UPDATE users SET member_id = ? WHERE id = ?');
    $up->execute([$mid, $uid]);
    return $uid;
}

function link_google(int $uid, string $sub): void
{
    $st = db()->prepare('UPDATE users SET google_sub = ? WHERE id = ?');
    $st->execute([$sub, $uid]);
}

/** ロール別の招待コード（未設定は空） */
function invite_code_for(string $role): string
{
    global $CONFIG;
    if ($role === 'player') {
        return trim((string)($CONFIG['player_invite_code'] ?? ''));
    }
    $coach = trim((string)($CONFIG['coach_invite_code'] ?? ''));
    return $coach !== '' ? $coach : trim((string)($CONFIG['invite_code'] ?? ''));
}

/** そのロールの自己登録が許可されているか（コードが空なら不可）*/
function role_registration_allowed(string $role): bool
{
    return invite_code_for($role) !== '';
}

/** 招待コードの照合 */
function check_invite(string $role, string $code): bool
{
    $need = invite_code_for($role);
    return $need !== '' && hash_equals($need, trim($code));
}

function google_enabled(): bool
{
    global $CONFIG;
    return !empty($CONFIG['google']['client_id']) && !empty($CONFIG['google']['client_secret']);
}

/** 学年の選択肢（app.js の GRADES と一致させる）*/
function grade_list(): array
{
    return ['年少', '年中', '年長', '小1', '小2', '小3', '小4', '小5', '小6', 'その他'];
}

function update_password(int $uid, string $passHash): void
{
    $st = db()->prepare('UPDATE users SET pass_hash = ? WHERE id = ?');
    $st->execute([$passHash, $uid]);
}

/** パスワード再設定トークンを発行し、生トークンを返す（1時間有効） */
function create_reset_token(int $uid): string
{
    $token = bin2hex(random_bytes(32));
    $st = db()->prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, used) VALUES (?, ?, ?, 0)');
    $st->execute([hash('sha256', $token), $uid, time() + 3600]);
    return $token;
}

/** トークンを検証してユーザーIDを返す（無効なら null）。$consume=true で使用済みにする */
function verify_reset_token(string $token, bool $consume = false): ?int
{
    if ($token === '' || !ctype_xdigit($token)) {
        return null;
    }
    $hash = hash('sha256', $token);
    $st = db()->prepare('SELECT user_id, expires_at, used FROM password_resets WHERE token_hash = ?');
    $st->execute([$hash]);
    $row = $st->fetch();
    if (!$row || (int)$row['used'] === 1 || (int)$row['expires_at'] < time()) {
        return null;
    }
    if ($consume) {
        $u = db()->prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?');
        $u->execute([$hash]);
        // そのユーザーの他の未使用トークンも無効化
        $u2 = db()->prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?');
        $u2->execute([(int)$row['user_id']]);
    }
    return (int)$row['user_id'];
}
