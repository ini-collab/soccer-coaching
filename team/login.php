<?php
require __DIR__ . '/inc/bootstrap.php';

if (current_user()) {
    header('Location: index.php');
    exit;
}

$err = isset($_GET['err']) ? (string)$_GET['err'] : '';
$notice = ($_GET['reset'] ?? '') === 'ok' ? 'パスワードを変更しました。新しいパスワードでログインしてください。' : '';
$mode = ($_GET['mode'] ?? '') === 'register' ? 'register' : 'login';
$pending = $_SESSION['pending_google'] ?? null;
$keepEmail = '';
$keepName = '';
$keepRole = 'coach';
$keepGrade = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check_post();
    $action = $_POST['action'] ?? '';

    if ($action === 'login') {
        $email = trim((string)($_POST['email'] ?? ''));
        $pass = (string)($_POST['password'] ?? '');
        $keepEmail = $email;
        $u = find_user_by_email($email);
        if ($u && $u['pass_hash'] && password_verify($pass, $u['pass_hash'])) {
            login_session((int)$u['id']);
            header('Location: index.php');
            exit;
        }
        usleep(500000); // 総当たり対策に少し待つ
        $err = ($u && !$u['pass_hash'])
            ? 'このメールアドレスはGoogleログインで登録されています。「Googleでログイン」をご利用ください。'
            : 'メールアドレスまたはパスワードが違います。';

    } elseif ($action === 'register') {
        $mode = 'register';
        $name = trim((string)($_POST['name'] ?? ''));
        $email = trim((string)($_POST['email'] ?? ''));
        $pass = (string)($_POST['password'] ?? '');
        $invite = (string)($_POST['invite'] ?? '');
        $role = ($_POST['role'] ?? 'coach') === 'player' ? 'player' : 'coach';
        $grade = trim((string)($_POST['grade'] ?? ''));
        $keepEmail = $email; $keepName = $name; $keepRole = $role; $keepGrade = $grade;
        if (!role_registration_allowed($role)) {
            $err = ($role === 'player')
                ? 'プレイヤーの登録は現在受け付けていません。コーチにお問い合わせください。'
                : 'コーチの登録は現在受け付けていません。管理者にお問い合わせください。';
        } elseif (!check_invite($role, $invite)) {
            $err = ($role === 'player' ? 'プレイヤー用' : 'コーチ用') . 'の招待コードが違います。チームの代表者に確認してください。';
        } elseif ($name === '') {
            $err = 'お名前（ニックネーム可）を入力してください。';
        } elseif ($role === 'player' && !in_array($grade, grade_list(), true)) {
            $err = '学年を選んでください。';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $err = 'メールアドレスの形式が正しくありません。';
        } elseif (strlen($pass) < 8) {
            $err = 'パスワードは8文字以上にしてください。';
        } elseif (find_user_by_email($email)) {
            $err = 'このメールアドレスは登録済みです。ログインしてください。';
        } else {
            $id = create_user($email, $name, password_hash($pass, PASSWORD_DEFAULT), null, $role, $grade);
            login_session($id);
            header('Location: index.php');
            exit;
        }

    } elseif ($action === 'google_invite' && $pending) {
        // Googleログインの新規ユーザー：ロール・招待コード（・学年）の確認
        $role = ($_POST['role'] ?? 'coach') === 'player' ? 'player' : 'coach';
        $grade = trim((string)($_POST['grade'] ?? ''));
        $keepRole = $role; $keepGrade = $grade;
        if (!role_registration_allowed($role)) {
            $err = ($role === 'player')
                ? 'プレイヤーの登録は現在受け付けていません。'
                : 'コーチの登録は現在受け付けていません。';
        } elseif (!check_invite($role, (string)($_POST['invite'] ?? ''))) {
            $err = ($role === 'player' ? 'プレイヤー用' : 'コーチ用') . 'の招待コードが違います。';
        } elseif ($role === 'player' && !in_array($grade, grade_list(), true)) {
            $err = '学年を選んでください。';
        } else {
            $u = $pending['email'] !== '' ? find_user_by_email($pending['email']) : null;
            if ($u) {
                link_google((int)$u['id'], $pending['sub']);
                $id = (int)$u['id'];
            } else {
                $email = $pending['email'] !== '' ? $pending['email'] : ('google-' . $pending['sub'] . '@login.invalid');
                $id = create_user($email, $pending['name'], null, $pending['sub'], $role, $grade);
            }
            login_session($id);
            header('Location: index.php');
            exit;
        }
    }
}

$csrf = csrf_token();
$gradeOptions = function ($sel) {
    $o = '<option value="">選択してください</option>';
    foreach (grade_list() as $g) {
        $o .= '<option value="' . h($g) . '"' . ($g === $sel ? ' selected' : '') . '>' . h($g) . '</option>';
    }
    return $o;
};
?>
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ログイン - サッカーコーチノート</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9A%BD%3C/text%3E%3C/svg%3E">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
    background: linear-gradient(160deg, #1c7c44, #0e4a26); color: #22301f; padding: 20px;
  }
  .box { background: #fff; border-radius: 18px; padding: 28px 26px; width: 100%; max-width: 420px; box-shadow: 0 12px 40px rgba(0,0,0,.3); }
  h1 { font-size: 21px; margin: 0 0 4px; }
  .sub { color: #5c6b57; font-size: 13px; margin: 0 0 18px; }
  label { display: block; font-size: 13px; font-weight: 700; color: #47543f; margin: 12px 0 4px; }
  input { width: 100%; font: inherit; border: 1.5px solid #dbe3d7; border-radius: 10px; padding: 12px; min-height: 48px; }
  input:focus { outline: 2px solid #1c7c44; border-color: #1c7c44; }
  button { width: 100%; margin-top: 18px; min-height: 50px; font: inherit; font-weight: 700; border: none; border-radius: 12px; background: #1c7c44; color: #fff; cursor: pointer; font-size: 16px; }
  button:active { transform: scale(.98); }
  .g-btn { background: #fff; color: #333; border: 1.5px solid #dbe3d7; display: flex; align-items: center; justify-content: center; gap: 10px; }
  select { width: 100%; font: inherit; border: 1.5px solid #dbe3d7; border-radius: 10px; padding: 12px; min-height: 48px; background: #fff; }
  .err { background: #fdeaea; color: #b03030; border: 1px solid #f2c7c7; border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; line-height: 1.7; }
  .notice { background: #e7f5ec; color: #1c6c3c; border: 1px solid #b9e0c7; border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; line-height: 1.7; }
  .switch { text-align: center; font-size: 13px; margin-top: 16px; }
  .switch a { color: #1c7c44; font-weight: 700; }
  .or { display: flex; align-items: center; gap: 10px; color: #999; font-size: 12px; margin: 18px 0 0; }
  .or::before, .or::after { content: ""; flex: 1; height: 1px; background: #e2e8de; }
  .note { font-size: 12px; color: #5c6b57; margin-top: 6px; line-height: 1.7; }
  .roles { display: flex; gap: 8px; margin-top: 6px; }
  .roles label { flex: 1; margin: 0; border: 1.5px solid #dbe3d7; border-radius: 10px; padding: 10px; text-align: center; cursor: pointer; font-weight: 700; }
  .roles input { display: none; }
  .roles input:checked + span { color: #1c7c44; }
  .roles label:has(input:checked) { border-color: #1c7c44; background: #edf6ef; box-shadow: 0 0 0 1.5px #1c7c44; }
  .roles small { display: block; font-weight: 500; font-size: 11px; color: #5c6b57; margin-top: 2px; }
  .forgot { text-align: right; font-size: 12px; margin-top: 8px; }
  .forgot a { color: #5c6b57; }
</style>
</head>
<body>
<div class="box">
  <h1>⚽ サッカーコーチノート</h1>
  <p class="sub">チーム共有版 ─ 練習メニュー・戦術・ポジションをコーチみんなで共有</p>

  <?php if ($notice !== ''): ?><div class="notice"><?= h($notice) ?></div><?php endif; ?>
  <?php if ($err !== ''): ?><div class="err"><?= h($err) ?></div><?php endif; ?>

  <?php if ($pending): ?>
    <!-- Googleログイン：新規メンバーのロール・招待コード確認 -->
    <p>こんにちは、<b><?= h($pending['name']) ?></b> さん！<br>初めての参加ですね。区分と招待コードを入力してください。</p>
    <form method="post" id="reg-form">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="google_invite">
      <label>区分</label>
      <div class="roles">
        <label><input type="radio" name="role" value="coach" <?= $keepRole !== 'player' ? 'checked' : '' ?>><span>コーチ<small>全機能</small></span></label>
        <label><input type="radio" name="role" value="player" <?= $keepRole === 'player' ? 'checked' : '' ?>><span>プレイヤー<small>参照＋出欠</small></span></label>
      </div>
      <div id="grade-wrap" style="display:none">
        <label>学年</label>
        <select name="grade"><?= $gradeOptions($keepGrade) ?></select>
      </div>
      <label>招待コード</label>
      <input name="invite" required autocomplete="off">
      <button type="submit">チームに参加する</button>
    </form>

  <?php elseif ($mode === 'register'): ?>
    <form method="post" id="reg-form">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="register">
      <label>区分</label>
      <div class="roles">
        <label><input type="radio" name="role" value="coach" <?= $keepRole !== 'player' ? 'checked' : '' ?>><span>コーチ<small>全機能が使える</small></span></label>
        <label><input type="radio" name="role" value="player" <?= $keepRole === 'player' ? 'checked' : '' ?>><span>プレイヤー<small>参照＋自分の出欠</small></span></label>
      </div>
      <label>お名前（表示用）</label>
      <input name="name" required maxlength="50" placeholder="例：さとうコーチ／たろう" value="<?= h($keepName) ?>">
      <div id="grade-wrap" style="display:none">
        <label>学年</label>
        <select name="grade"><?= $gradeOptions($keepGrade) ?></select>
      </div>
      <label>メールアドレス</label>
      <input name="email" type="email" required autocomplete="email" value="<?= h($keepEmail) ?>">
      <label>パスワード（8文字以上）</label>
      <input name="password" type="password" required minlength="8" autocomplete="new-password">
      <label>招待コード</label>
      <input name="invite" required autocomplete="off">
      <p class="note">招待コードはチームの代表者・コーチに確認してください。コーチ用とプレイヤー用でコードが異なります。</p>
      <button type="submit">登録してはじめる</button>
    </form>
    <?php if (google_enabled()): ?>
      <div class="or">または</div>
      <form action="auth_google.php" method="get">
        <button type="submit" class="g-btn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.9c4.4-4.1 7.1-10.1 7.1-17.6z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.4-5.9l-7.5-5.9c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-3.9-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Googleで登録・ログイン</button>
      </form>
    <?php endif; ?>
    <p class="switch">アカウントをお持ちの方は <a href="login.php">ログイン</a></p>

  <?php else: ?>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="login">
      <label>メールアドレス</label>
      <input name="email" type="email" required autocomplete="email" value="<?= h($keepEmail) ?>">
      <label>パスワード</label>
      <input name="password" type="password" required autocomplete="current-password">
      <p class="forgot"><a href="forgot.php">パスワードをお忘れですか？</a></p>
      <button type="submit">ログイン</button>
    </form>
    <?php if (google_enabled()): ?>
      <div class="or">または</div>
      <form action="auth_google.php" method="get">
        <button type="submit" class="g-btn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.9c4.4-4.1 7.1-10.1 7.1-17.6z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.4-5.9l-7.5-5.9c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-3.9-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Googleでログイン</button>
      </form>
    <?php endif; ?>
    <p class="switch">初めての方は <a href="login.php?mode=register">新規登録</a></p>
  <?php endif; ?>
</div>
<script>
  // 区分（コーチ/プレイヤー）で学年欄の表示を切り替え
  (function () {
    var form = document.getElementById('reg-form');
    if (!form) return;
    var wrap = document.getElementById('grade-wrap');
    var sel = wrap ? wrap.querySelector('select') : null;
    function update() {
      var r = form.querySelector('input[name=role]:checked');
      var isPlayer = r && r.value === 'player';
      if (wrap) wrap.style.display = isPlayer ? 'block' : 'none';
      if (sel) sel.required = !!isPlayer;
    }
    form.querySelectorAll('input[name=role]').forEach(function (el) { el.addEventListener('change', update); });
    update();
  })();
</script>
</body>
</html>
