<?php
/**
 * データ共有API
 *   GET  ?mode=full            … 全データ取得（初期ロード用）
 *   GET  ?mode=changes&since=T … T(ミリ秒)以降の変更差分（削除含む）
 *   POST {upserts, deletes}    … 差分保存（要 X-CSRF ヘッダー）
 *
 * データはチーム全体で共有（登録メンバー全員が同じデータを見る）。
 */
require __DIR__ . '/../inc/bootstrap.php';

$user = require_login_api();
$KINDS = ['drills', 'menus', 'boards', 'formations', 'members', 'events', 'attendance'];
$pdo = db();
$isPlayer = (($user['role'] ?? 'coach') === 'player');
$myMemberId = (string)($user['member_id'] ?? '');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $mode = $_GET['mode'] ?? 'full';

    if ($mode === 'changes') {
        $since = (int)($_GET['since'] ?? 0);
        $st = $pdo->prepare('SELECT kind, id, json, deleted, updated_at FROM items WHERE updated_at > ? ORDER BY updated_at ASC LIMIT 2000');
        $st->execute([$since]);
        $changes = [];
        $ts = $since;
        foreach ($st as $row) {
            if (!in_array($row['kind'], $KINDS, true)) {
                continue;
            }
            $ts = max($ts, (int)$row['updated_at']);
            $del = ((int)$row['deleted'] === 1);
            $changes[] = [
                'kind' => $row['kind'],
                'id' => $row['id'],
                'deleted' => $del,
                'item' => $del ? null : json_decode($row['json'], true),
            ];
        }
        json_out(['ok' => true, 'ts' => $ts, 'changes' => $changes]);
    }

    // mode=full
    $data = array_fill_keys($KINDS, []);
    $ts = 0;
    foreach ($pdo->query('SELECT kind, id, json, deleted, updated_at FROM items') as $row) {
        $ts = max($ts, (int)$row['updated_at']);
        if ((int)$row['deleted'] === 1 || !in_array($row['kind'], $KINDS, true)) {
            continue;
        }
        $item = json_decode($row['json'], true);
        if (is_array($item)) {
            $data[$row['kind']][] = $item;
        }
    }
    json_out([
        'ok' => true,
        'ts' => $ts,
        'initialized' => get_meta('initialized') === '1',
        'data' => $data,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_SERVER['HTTP_X_CSRF'] ?? '';
    if (!is_string($csrf) || !hash_equals($_SESSION['csrf'] ?? '', $csrf)) {
        json_out(['ok' => false, 'error' => 'csrf'], 400);
    }

    $raw = file_get_contents('php://input');
    if (strlen($raw) > 8 * 1024 * 1024) {
        json_out(['ok' => false, 'error' => 'too_large'], 413);
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        json_out(['ok' => false, 'error' => 'bad_json'], 400);
    }

    /* プレイヤーは「自分の出欠」だけ書き込める。それ以外の書き込み・削除は無視する。
       （画面側でも編集UIを出さないが、サーバー側でも二重に守る） */
    $allowUpsert = function (string $kind, array $item) use ($isPlayer, $myMemberId): bool {
        if (!$isPlayer) {
            return true;
        }
        return $kind === 'attendance'
            && $myMemberId !== ''
            && (string)($item['memberId'] ?? '') === $myMemberId;
    };

    // タイムスタンプは単調増加させる（差分取得の取りこぼし防止）
    $now = (int)floor(microtime(true) * 1000);
    $max = (int)$pdo->query('SELECT COALESCE(MAX(updated_at), 0) FROM items')->fetchColumn();
    if ($now <= $max) {
        $now = $max + 1;
    }

    $pdo->beginTransaction();
    try {
        $up = $pdo->prepare('REPLACE INTO items (kind, id, json, deleted, updated_at, updated_by) VALUES (?, ?, ?, 0, ?, ?)');
        $del = $pdo->prepare('REPLACE INTO items (kind, id, json, deleted, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)');
        $count = 0;
        foreach ($KINDS as $k) {
            $ups = $body['upserts'][$k] ?? [];
            foreach ((is_array($ups) ? $ups : []) as $item) {
                if (!is_array($item) || !isset($item['id']) || !is_string($item['id'])
                    || $item['id'] === '' || strlen($item['id']) > 64) {
                    continue;
                }
                if (!$allowUpsert($k, $item)) {
                    continue;
                }
                $js = json_encode($item, JSON_UNESCAPED_UNICODE);
                if ($js === false || strlen($js) > 1024 * 1024) {
                    continue;
                }
                $up->execute([$k, $item['id'], $js, $now, $user['name']]);
                if (++$count > 2000) {
                    break 2;
                }
            }
            // プレイヤーは削除不可
            $dels = $isPlayer ? [] : ($body['deletes'][$k] ?? []);
            foreach ((is_array($dels) ? $dels : []) as $id) {
                if (!is_string($id) || $id === '' || strlen($id) > 64) {
                    continue;
                }
                $del->execute([$k, $id, 'null', $now, $user['name']]);
                if (++$count > 2000) {
                    break 2;
                }
            }
        }
        set_meta('initialized', '1');
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_out(['ok' => false, 'error' => 'db_error'], 500);
    }
    json_out(['ok' => true, 'ts' => $now]);
}

json_out(['ok' => false, 'error' => 'method_not_allowed'], 405);
