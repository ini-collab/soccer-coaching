<?php
/**
 * パスワード再設定（メールのリンクから）
 * ?token=... のトークンを検証し、新しいパスワードを設定する。
 */
require __DIR__ . '/inc/bootstrap.php';

$token = (string)($_GET['token'] ?? ($_POST['token'] ?? ''));
$err = '';

// まずトークンの有効性を確認（消費はしない）
$validUid = verify_reset_token($token, false);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $validUid !== null) {
    csrf_check_post();
    $pass = (string)($_POST['password'] ?? '');
    $pass2 = (string)($_POST['password2'] ?? '');
    if (strlen($pass) < 8) {
        $err = 'パスワードは8文字以上にしてください。';
    } elseif ($pass !== $pass2) {
        $err = '確認用パスワードが一致しません。';
    } else {
        // ここで消費（使用済みにする）
        $uid = verify_reset_token($token, true);
        if ($uid === null) {
            $err = 'リンクの有効期限が切れています。お手数ですが再度お試しください。';
        } else {
            update_password($uid, password_hash($pass, PASSWORD_DEFAULT));
            header('Location: login.php?reset=ok');
            exit;
        }
    }
}

$csrf = csrf_token();
?>
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>新しいパスワードの設定 - サッカーコーチノート</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9A%BD%3C/text%3E%3C/svg%3E">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
    background: linear-gradient(160deg, #1c7c44, #0e4a26); color: #22301f; padding: 20px; }
  .box { background: #fff; border-radius: 18px; padding: 28px 26px; width: 100%; max-width: 420px; box-shadow: 0 12px 40px rgba(0,0,0,.3); }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 14px; line-height: 1.8; color: #47543f; }
  label { display: block; font-size: 13px; font-weight: 700; color: #47543f; margin: 14px 0 4px; }
  input { width: 100%; font: inherit; border: 1.5px solid #dbe3d7; border-radius: 10px; padding: 12px; min-height: 48px; }
  input:focus { outline: 2px solid #1c7c44; border-color: #1c7c44; }
  button { width: 100%; margin-top: 18px; min-height: 50px; font: inherit; font-weight: 700; border: none; border-radius: 12px; background: #1c7c44; color: #fff; cursor: pointer; font-size: 16px; }
  .err { background: #fdeaea; color: #b03030; border: 1px solid #f2c7c7; border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
  .switch { text-align: center; font-size: 13px; margin-top: 16px; }
  .switch a { color: #1c7c44; font-weight: 700; }
</style>
</head>
<body>
<div class="box">
  <h1>⚽ 新しいパスワードの設定</h1>
  <?php if ($validUid === null): ?>
    <div class="err">このリンクは無効か、有効期限（1時間）が切れています。</div>
    <p class="switch"><a href="forgot.php">もう一度、再設定をリクエストする</a></p>
  <?php else: ?>
    <p>新しいパスワードを入力してください。</p>
    <?php if ($err !== ''): ?><div class="err"><?= h($err) ?></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="token" value="<?= h($token) ?>">
      <label>新しいパスワード（8文字以上）</label>
      <input name="password" type="password" required minlength="8" autocomplete="new-password" autofocus>
      <label>新しいパスワード（確認）</label>
      <input name="password2" type="password" required minlength="8" autocomplete="new-password">
      <button type="submit">パスワードを変更する</button>
    </form>
  <?php endif; ?>
</div>
</body>
</html>
