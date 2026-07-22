<?php
declare(strict_types=1);

/** PDO接続（初回にテーブルも自動作成） */
function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    global $CONFIG;
    $c = $CONFIG['db'] ?? ['driver' => 'sqlite'];

    if (($c['driver'] ?? 'sqlite') === 'mysql') {
        $m = $c['mysql'];
        $pdo = new PDO(
            "mysql:host={$m['host']};dbname={$m['dbname']};charset=" . ($m['charset'] ?? 'utf8mb4'),
            $m['user'],
            $m['pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
        db_init_mysql($pdo);
    } else {
        $path = $c['sqlite_path'] ?? (dirname(__DIR__) . '/data/app.db');
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        // データディレクトリをWebから直接読めないようにする（Apache）
        $ht = $dir . '/.htaccess';
        if (!file_exists($ht)) {
            file_put_contents($ht, "Require all denied\n");
        }
        $pdo = new PDO('sqlite:' . $path, null, null,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA busy_timeout=5000');
        db_init_sqlite($pdo);
    }
    return $pdo;
}

function db_init_sqlite(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        pass_hash TEXT,
        google_sub TEXT UNIQUE,
        role TEXT NOT NULL DEFAULT 'coach',
        grade TEXT NOT NULL DEFAULT '',
        member_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    )");
    $pdo->exec('CREATE TABLE IF NOT EXISTS items(
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        json TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        updated_by TEXT,
        PRIMARY KEY(kind, id)
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS password_resets(
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
    )');
    db_migrate_add_columns($pdo, 'sqlite');
}

function db_init_mysql(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS users(
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        pass_hash VARCHAR(255) NULL,
        google_sub VARCHAR(64) NULL UNIQUE,
        role VARCHAR(16) NOT NULL DEFAULT 'coach',
        grade VARCHAR(20) NOT NULL DEFAULT '',
        member_id VARCHAR(64) NOT NULL DEFAULT '',
        created_at VARCHAR(32) NOT NULL
    ) CHARACTER SET utf8mb4");
    $pdo->exec('CREATE TABLE IF NOT EXISTS items(
        kind VARCHAR(20) NOT NULL,
        id VARCHAR(64) NOT NULL,
        json MEDIUMTEXT NOT NULL,
        deleted TINYINT NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL,
        updated_by VARCHAR(100),
        PRIMARY KEY(kind, id),
        INDEX idx_items_updated(updated_at)
    ) CHARACTER SET utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS meta(k VARCHAR(64) PRIMARY KEY, v TEXT) CHARACTER SET utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS password_resets(
        token_hash VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        expires_at BIGINT NOT NULL,
        used TINYINT NOT NULL DEFAULT 0
    ) CHARACTER SET utf8mb4');
    db_migrate_add_columns($pdo, 'mysql');
}

/** 既存DBに新しい列がなければ追加する（バージョンアップ時の移行）*/
function db_migrate_add_columns(PDO $pdo, string $driver): void
{
    $cols = [
        'role'      => "VARCHAR(16) NOT NULL DEFAULT 'coach'",
        'grade'     => "VARCHAR(20) NOT NULL DEFAULT ''",
        'member_id' => "VARCHAR(64) NOT NULL DEFAULT ''",
    ];
    // 既存列の一覧を取得
    $existing = [];
    try {
        if ($driver === 'sqlite') {
            foreach ($pdo->query('PRAGMA table_info(users)') as $r) {
                $existing[$r['name']] = true;
            }
        } else {
            foreach ($pdo->query('SHOW COLUMNS FROM users') as $r) {
                $existing[$r['Field']] = true;
            }
        }
    } catch (Throwable $e) {
        return;
    }
    // 旧バージョンのユーザーは全員コーチなので role の既定は 'coach'
    foreach ($cols as $name => $def) {
        if (empty($existing[$name])) {
            try {
                $pdo->exec("ALTER TABLE users ADD COLUMN $name $def");
            } catch (Throwable $e) { /* 既にある等は無視 */ }
        }
    }
}

/** items の updated_at を単調増加させて次の値を返す */
function next_item_ts(): int
{
    $now = (int)floor(microtime(true) * 1000);
    $max = (int)db()->query('SELECT COALESCE(MAX(updated_at), 0) FROM items')->fetchColumn();
    return $now <= $max ? $max + 1 : $now;
}

/** サーバー側から共有データ項目を1件保存する（メンバー自動登録など）*/
function put_item(string $kind, string $id, array $data, string $by = ''): void
{
    $st = db()->prepare('REPLACE INTO items (kind, id, json, deleted, updated_at, updated_by) VALUES (?, ?, ?, 0, ?, ?)');
    $st->execute([$kind, $id, json_encode($data, JSON_UNESCAPED_UNICODE), next_item_ts(), $by]);
    set_meta('initialized', '1');
}

/**
 * 新しいチームに、練習の見本（ドリル・メニュー・戦術ボード・ポジション）を一度だけ投入する。
 * 架空の選手・予定は入れない（名簿は登録したコーチ／選手だけにする）。
 */
function maybe_seed_sample_content(): void
{
    if (get_meta('seeded') === '1') {
        return;
    }
    set_meta('seeded', '1');
    $file = dirname(__DIR__) . '/seed.json';
    if (!is_file($file)) {
        return;
    }
    $seed = json_decode((string)file_get_contents($file), true);
    if (!is_array($seed)) {
        return;
    }
    foreach (['drills', 'menus', 'boards', 'formations'] as $kind) {
        foreach (($seed[$kind] ?? []) as $item) {
            if (is_array($item) && isset($item['id']) && is_string($item['id'])) {
                put_item($kind, $item['id'], $item, '見本');
            }
        }
    }
}

function get_meta(string $k): ?string
{
    $st = db()->prepare('SELECT v FROM meta WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? null : (string)$v;
}

function set_meta(string $k, string $v): void
{
    $st = db()->prepare('REPLACE INTO meta (k, v) VALUES (?, ?)');
    $st->execute([$k, $v]);
}
