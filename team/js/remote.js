'use strict';

/* =========================================================
 * サーバー同期ストア（チーム共有版）
 * window.AppStore を定義して js/app.js の保存先を差し替える。
 *  - 保存操作は約1.2秒デバウンスして差分だけをサーバーへ送信
 *  - 約20秒ごとに他メンバーの変更を取得して画面へ反映
 * ======================================================= */
(function () {
  const KINDS = ['drills', 'menus', 'boards', 'formations'];
  const clone = o => JSON.parse(JSON.stringify(o));
  const emptyDB = () => ({ drills: [], menus: [], boards: [], formations: [] });
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  let snapshot = emptyDB();  // サーバーと同期済みの状態
  let current = null;        // アプリの現在のDB（app.jsのDBへの参照）
  let lastTs = 0;            // 差分取得用タイムスタンプ
  let syncTimer = null;
  let syncing = false;
  let queued = false;

  function setStatus(text, isError) {
    const el = document.getElementById('sync-status');
    if (el) {
      el.textContent = text;
      el.classList.toggle('error', !!isError);
    }
  }

  async function api(method, params, body) {
    const url = 'api/data.php' + (params ? '?' + new URLSearchParams(params) : '');
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (body) {
      opt.headers['Content-Type'] = 'application/json';
      opt.headers['X-CSRF'] = window.CSRF_TOKEN || '';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(url, opt);
    if (res.status === 401) {
      location.href = 'login.php';
      throw new Error('unauthorized');
    }
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'api_error');
    return j;
  }

  /* snapshotとcurrentを比較して差分（upsert/delete）を作る */
  function diff() {
    const upserts = {}, deletes = {};
    let any = false;
    KINDS.forEach(k => {
      const olds = new Map((snapshot[k] || []).map(x => [x.id, JSON.stringify(x)]));
      const news = new Map();
      (current[k] || []).forEach(x => { if (x && x.id) news.set(x.id, x); });
      news.forEach((item, id) => {
        if (olds.get(id) !== JSON.stringify(item)) {
          (upserts[k] = upserts[k] || []).push(item);
          any = true;
        }
      });
      olds.forEach((_, id) => {
        if (!news.has(id)) {
          (deletes[k] = deletes[k] || []).push(id);
          any = true;
        }
      });
    });
    return { upserts, deletes, any };
  }

  function isDirty() {
    return !!current && diff().any;
  }

  function schedule() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(doSync, 1200);
  }

  async function doSync() {
    if (!current) return;
    if (syncing) { queued = true; return; }
    const d = diff();
    if (!d.any) { setStatus('同期済み ✓'); return; }
    syncing = true;
    setStatus('保存中…');
    try {
      const r = await api('POST', null, { upserts: d.upserts, deletes: d.deletes });
      snapshot = clone(current);
      lastTs = Math.max(lastTs, r.ts || 0);
      setStatus('同期済み ✓');
    } catch (e) {
      setStatus('⚠ 通信エラー（自動で再試行します）', true);
      clearTimeout(syncTimer);
      syncTimer = setTimeout(doSync, 5000);
    } finally {
      syncing = false;
      if (queued) { queued = false; schedule(); }
    }
  }

  /* 他メンバーの変更を取得して画面に反映する */
  async function poll() {
    if (!current || syncing || isDirty()) return; // 自分の未送信変更があるときは後回し
    try {
      const r = await api('GET', { mode: 'changes', since: lastTs });
      lastTs = Math.max(lastTs, r.ts || 0);
      if (!r.changes || !r.changes.length) return;
      let changed = false;
      const applyTo = (list, ch) => {
        const i = list.findIndex(x => x && x.id === ch.id);
        if (ch.deleted) {
          if (i >= 0) { list.splice(i, 1); return true; }
          return false;
        }
        const js = JSON.stringify(ch.item);
        if (i >= 0) {
          if (JSON.stringify(list[i]) !== js) { list[i] = clone(ch.item); return true; }
          return false;
        }
        list.push(clone(ch.item));
        return true;
      };
      r.changes.forEach(ch => {
        if (!KINDS.includes(ch.kind)) return;
        if (!ch.deleted && (!ch.item || !ch.item.id)) return;
        const a = applyTo(current[ch.kind], ch);
        applyTo(snapshot[ch.kind], ch);
        changed = changed || a;
      });
      if (changed && window.applyExternalDB) {
        window.applyExternalDB(current);
        setStatus('他のメンバーの変更を反映しました ✓');
      }
    } catch (e) { /* 次回のポーリングで再試行 */ }
  }

  /* app.js が使う保存先ストア */
  window.AppStore = {
    async load() {
      setStatus('読み込み中…');
      const r = await api('GET', { mode: 'full' });
      lastTs = r.ts || 0;
      snapshot = clone(r.data || emptyDB());
      setStatus('同期済み ✓');
      // まだ誰も使っていないサーバーならnullを返し、app.js側でサンプルデータを投入
      if (!r.initialized) return null;
      return r.data;
    },
    save(db) {
      current = db;
      setStatus('保存中…');
      schedule();
    },
  };

  /* 送信前の離脱をなるべく防ぐ */
  window.addEventListener('beforeunload', e => {
    if (isDirty()) {
      doSync();
      e.preventDefault();
      e.returnValue = '';
    }
  });

  setInterval(poll, 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });

  /* ヘッダーにユーザー名・ログアウト・同期状態を表示 */
  document.addEventListener('DOMContentLoaded', () => {
    const h1 = document.querySelector('.app-header h1');
    if (h1 && window.TEAM_USER) {
      const el = document.createElement('span');
      el.className = 'user-chip';
      el.innerHTML =
        `<span id="sync-status" title="タップで今すぐ同期"></span>　` +
        `👤 ${escapeHtml(window.TEAM_USER.name)}　` +
        `<a href="logout.php">ログアウト</a>`;
      h1.appendChild(el);
      el.querySelector('#sync-status').addEventListener('click', () => { doSync(); poll(); });
    }
    // データタブの説明を共有版向けに書き換え
    const hint = document.querySelector('#tab-data .hint');
    if (hint) {
      hint.innerHTML =
        '・データはサーバーに保存され、<b>登録メンバー全員で共有</b>されます。変更は自動で保存・同期されます。<br>' +
        '・他のメンバーの変更も自動で取り込まれます（約20秒ごと）。<br>' +
        '・「書き出す」でバックアップ用JSONを保存できます。<br>' +
        '・「読み込む」「全データを削除」は<b>チーム全員のデータ</b>に反映されるのでご注意ください。';
    }
  });

  /* テスト・デバッグ用フック */
  window.RemoteSync = { sync: doSync, poll };
})();
