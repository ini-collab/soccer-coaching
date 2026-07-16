<?php
/**
 * パスワード再設定リクエスト
 * メールアドレスを入力 → 該当ユーザーがいれば再設定リンクをメール送信。
 * ユーザーの有無は画面に出さない（アカウント列挙対策）。
 */
require __DIR__ . '/inc/bootstrap.php';

$done = false;
$err = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check_post();
    $email = trim((string)($_POST['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $err = 'メールアドレスの形式が正しくありません。';
    } else {
        $u = find_user_by_email($email);
        // パスワードを持つ（＝メール登録の）ユーザーのみ対象
        if ($u && !empty($u['pass_hash'])) {
            $token = create_reset_token((int)$u['id']);
            $link = base_url() . '/reset.php?token=' . $token;
            $body = "サッカーコーチノート パスワード再設定\n\n"
                . ($u['name'] ? $u['name'] . " さん\n\n" : "")
                . "下のリンクを開いて、新しいパスワードを設定してください（1時間有効）。\n\n"
                . $link . "\n\n"
                . "※このメールに心当たりがない場合は破棄してください。パスワードは変更されません。\n";
            send_mail($email, 'パスワード再設定のご案内', $body);
        }
        // 送れても送れなくても同じ表示にする
        $done = true;
    }
}
$csrf = csrf_token();
$mailEnabled = !empty(($CONFIG['mail'] ?? [])['enabled']);
?>
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>パスワード再設定 - サッカーコーチノート</title>
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
  .notice { background: #e7f5ec; color: #1c6c3c; border: 1px solid #b9e0c7; border-radius: 10px; padding: 12px; font-size: 14px; line-height: 1.8; }
  .switch { text-align: center; font-size: 13px; margin-top: 16px; }
  .switch a { color: #1c7c44; font-weight: 700; }
  .warn { background: #fff7ed; border: 1px solid #f2d9b0; border-radius: 10px; padding: 10px 12px; font-size: 12px; color: #8a5a1a; line-height: 1.7; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="box">
  <h1>⚽ パスワード再設定</h1>
  <?php if ($done): ?>
    <div class="notice">
      ご入力のメールアドレスが登録されている場合、パスワード再設定のご案内メールをお送りしました。<br>
      メールのリンクから新しいパスワードを設定してください（有効期限は1時間です）。
    </div>
    <p class="switch"><a href="login.php">ログイン画面に戻る</a></p>
  <?php else: ?>
    <p>登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。</p>
    <?php if (!$mailEnabled): ?><div class="warn">現在、メール送信が無効に設定されています。管理者にお問い合わせください。</div><?php endif; ?>
    <?php if ($err !== ''): ?><div class="err"><?= h($err) ?></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <label>メールアドレス</label>
      <input name="email" type="email" required autocomplete="email" autofocus>
      <button type="submit">再設定リンクを送信</button>
    </form>
    <p class="switch"><a href="login.php">ログイン画面に戻る</a></p>
  <?php endif; ?>
</div>
</body>
</html>
