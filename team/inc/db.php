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
    $pdo->exec('CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        pass_hash TEXT,
        google_sub TEXT UNIQUE,
        created_at TEXT NOT NULL
    )');
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
}

function db_init_mysql(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS users(
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        pass_hash VARCHAR(255) NULL,
        google_sub VARCHAR(64) NULL UNIQUE,
        created_at VARCHAR(32) NOT NULL
    ) CHARACTER SET utf8mb4');
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
