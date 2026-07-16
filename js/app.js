'use strict';

/* =========================================================
 * サッカーコーチノート アプリ本体
 * 練習メニュー / ドリル集 / 戦術ボード / ポジション / データ管理
 * ======================================================= */

const byId = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const STORE_KEY = 'soccerCoachNote.v1';
const AGE_GROUPS = ['年中・年長（U-6）', '低学年（U-8）', '中学年（U-10）', '高学年（U-12）', '全学年'];
const CATEGORIES = ['ウォーミングアップ', 'ドリブル', 'パス・コントロール', 'シュート', '守備', 'ゲーム形式', 'コーディネーション', 'クールダウン', 'その他'];

/* ---- フォーメーション定義 ---- */
const FORMATION_FORMATS = {
  '5': {
    label: '5人制（園児・低学年向け）',
    presets: {
      '1-2-1': [[340, 970, 'GK'], [340, 800, 'DF'], [170, 620, 'MF'], [510, 620, 'MF'], [340, 450, 'FW']],
      '2-2':   [[340, 970, 'GK'], [220, 790, 'DF'], [460, 790, 'DF'], [220, 540, 'FW'], [460, 540, 'FW']],
    },
  },
  '8': {
    label: '8人制（小学生公式）',
    presets: {
      '3-3-1': [[340, 970, 'GK'], [150, 810, 'DF'], [340, 835, 'DF'], [530, 810, 'DF'], [150, 610, 'MF'], [340, 645, 'MF'], [530, 610, 'MF'], [340, 420, 'FW']],
      '2-4-1': [[340, 970, 'GK'], [230, 820, 'DF'], [450, 820, 'DF'], [110, 630, 'MF'], [260, 660, 'MF'], [420, 660, 'MF'], [570, 630, 'MF'], [340, 420, 'FW']],
      '3-2-2': [[340, 970, 'GK'], [150, 810, 'DF'], [340, 835, 'DF'], [530, 810, 'DF'], [230, 630, 'MF'], [450, 630, 'MF'], [230, 430, 'FW'], [450, 430, 'FW']],
      '2-3-2': [[340, 970, 'GK'], [230, 820, 'DF'], [450, 820, 'DF'], [130, 620, 'MF'], [340, 655, 'MF'], [550, 620, 'MF'], [230, 430, 'FW'], [450, 430, 'FW']],
    },
  },
  '11': {
    label: '11人制',
    presets: {
      '4-4-2': [[340, 985, 'GK'], [110, 840, 'DF'], [260, 860, 'DF'], [420, 860, 'DF'], [570, 840, 'DF'], [110, 640, 'MF'], [260, 665, 'MF'], [420, 665, 'MF'], [570, 640, 'MF'], [250, 430, 'FW'], [430, 430, 'FW']],
      '4-3-3': [[340, 985, 'GK'], [110, 840, 'DF'], [260, 860, 'DF'], [420, 860, 'DF'], [570, 840, 'DF'], [190, 650, 'MF'], [340, 680, 'MF'], [490, 650, 'MF'], [130, 430, 'FW'], [340, 395, 'FW'], [550, 430, 'FW']],
    },
  },
};
const ROLE_COLORS = { GK: '#e8a614', DF: '#1f6fe0', MF: '#7048e8', FW: '#e02f2f' };

function presetPositions(format, preset) {
  const def = (FORMATION_FORMATS[format] || {}).presets || {};
  const list = def[preset] || Object.values(def)[0] || [];
  return list.map((p, i) => ({ x: p[0], y: p[1], role: p[2], num: i + 1, name: '' }));
}

/* =========================================================
 * データ保存（localStorage）
 * ======================================================= */
let DB;

function seedDB() {
  return {
    drills: [
      {
        id: 'd1', name: 'しっぽとりゲーム', category: 'ウォーミングアップ', age: '年中・年長（U-6）',
        duration: 10, players: '4人〜', equipment: 'ビブス（しっぽ用）',
        description: 'ズボンにビブスをはさんで「しっぽ」にする。\nコートの中を自由に動き、友だちのしっぽを取り合う。\n取られても、ほかの子のしっぽを取れば復活OK。',
        points: '・顔を上げて周りを見る\n・急な方向転換、ストップ＆ゴー\n・楽しく体を温めることが目的',
        boardId: '',
      },
      {
        id: 'd2', name: 'コーンドリブル（スラローム）', category: 'ドリブル', age: '低学年（U-8）',
        duration: 15, players: '2人1組〜', equipment: 'コーン5個×レーン数、ボール1人1個',
        description: 'コーンをジグザグにドリブルで通過し、折り返して次の人にパス。\nチーム対抗リレーにすると盛り上がる。',
        points: '・ボールを足から離しすぎない\n・両足のインサイド・アウトサイドを使う\n・慣れてきたら顔を上げる',
        boardId: 'b1',
      },
      {
        id: 'd3', name: '2対1 突破からシュート', category: 'ゲーム形式', age: '中学年（U-10）',
        duration: 15, players: '3人1組＋GK', equipment: 'ボール、ゴール、ビブス',
        description: '攻撃2人・守備1人でスタート。\nパスとドリブルを使い分けて守備を突破し、シュートまで行く。\n守備にボールを取られたら交代。',
        points: '・ボールを持っていない選手の動き出し\n・パスかドリブルかの判断\n・最後（シュート）までやり切る',
        boardId: 'b2',
      },
      {
        id: 'd4', name: 'ミニゲーム（4対4）', category: 'ゲーム形式', age: '全学年',
        duration: 20, players: '8人（4対4）', equipment: 'ビブス、ミニゴール2台',
        description: '小さいコートで4対4のゲーム。\n人数や学年に合わせてコートの広さを調整する。\nコーチは笛を吹きすぎず、プレーを見守る。',
        points: '・練習したことをゲームで試す\n・ポジティブな声かけを中心に\n・全員がボールにさわれる人数設定にする',
        boardId: '',
      },
    ],
    menus: [
      {
        id: 'm1', title: '土曜日の練習メニュー（サンプル）', date: '', age: '低学年（U-8）', note: '',
        items: [
          { drillId: 'd1', min: 10, note: '' },
          { drillId: 'd2', min: 15, note: '2チーム対抗リレー' },
          { drillId: '', min: 5, note: '水分補給・休憩' },
          { drillId: 'd3', min: 15, note: '' },
          { drillId: 'd4', min: 20, note: '最後はミニゲーム' },
        ],
      },
    ],
    boards: [
      {
        id: 'b1', name: 'コーンドリブル（スラローム）配置', field: 'half',
        elements: [
          { type: 'cone', x: 340, y: 180 }, { type: 'cone', x: 340, y: 240 }, { type: 'cone', x: 340, y: 300 },
          { type: 'cone', x: 340, y: 360 }, { type: 'cone', x: 340, y: 420 },
          { type: 'player', team: 'home', x: 300, y: 480, label: '1' },
          { type: 'player', team: 'home', x: 380, y: 480, label: '2' },
          { type: 'ball', x: 340, y: 497 },
          { type: 'pen', color: '#ffd23f', points: [[340, 470], [308, 390], [372, 330], [308, 270], [372, 210], [340, 150]] },
          { type: 'text', x: 520, y: 300, text: 'ジグザグドリブル', color: '#ffffff' },
        ],
      },
      {
        id: 'b2', name: '2対1 突破からシュート', field: 'half',
        elements: [
          { type: 'player', team: 'home', x: 250, y: 460, label: '1' },
          { type: 'player', team: 'home', x: 430, y: 460, label: '2' },
          { type: 'player', team: 'away', x: 340, y: 320, label: '1' },
          { type: 'ball', x: 268, y: 478 },
          { type: 'arrow', dash: true, color: '#ffd23f', x1: 275, y1: 448, x2: 410, y2: 448 },
          { type: 'arrow', dash: false, color: '#e02f2f', x1: 250, y1: 435, x2: 290, y2: 250 },
          { type: 'arrow', dash: false, color: '#e02f2f', x1: 430, y1: 435, x2: 400, y2: 250 },
          { type: 'arrow', dash: true, color: '#ffd23f', x1: 400, y1: 230, x2: 355, y2: 110 },
          { type: 'text', x: 530, y: 140, text: 'シュート！', color: '#ffffff' },
        ],
      },
    ],
    formations: [
      { id: 'f1', name: '8人制 基本（3-3-1）サンプル', format: '8', preset: '3-3-1', positions: presetPositions('8', '3-3-1') },
    ],
  };
}

function normalizeDB(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    drills: Array.isArray(d.drills) ? d.drills : [],
    menus: Array.isArray(d.menus) ? d.menus : [],
    boards: Array.isArray(d.boards) ? d.boards : [],
    formations: Array.isArray(d.formations) ? d.formations : [],
  };
}

/* 保存先ストア（標準：この端末のlocalStorage）
 * チーム共有版では window.AppStore（team/js/remote.js）がサーバー同期版に差し替える */
const LocalStore = {
  async load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('データ読み込みに失敗:', e); }
    return null;
  },
  save(db) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) { console.warn('データ保存に失敗:', e); }
  },
};

function store() { return window.AppStore || LocalStore; }

function saveDB() { store().save(DB); }

/* =========================================================
 * ダウンロード・PNG書き出し
 * ======================================================= */
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function downloadJSON(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}

function safeName(s, fallback) {
  const v = String(s || '').trim().replace(/[\\/:*?"<>|]/g, '_');
  return v || fallback;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function svgStringToPNG(svgStr, w, h, filename) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    c.toBlob(b => { if (b) downloadBlob(b, filename); }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('画像の書き出しに失敗しました'); };
  img.src = url;
}

function downloadBoardPNG(data, name) {
  const d = FIELD_DEFS[data.field] || FIELD_DEFS.full;
  svgStringToPNG(boardSVG(data, 'screen'), d.w, d.h, safeName(name, 'board') + '.png');
}

/* =========================================================
 * 印刷
 * ======================================================= */
function printHTML(html, landscape) {
  const area = byId('print-area');
  area.innerHTML = `<style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}</style>` + html;
  document.body.classList.add('printing');
  // レイアウト反映後に印刷ダイアログを開く
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
window.addEventListener('afterprint', () => document.body.classList.remove('printing'));

function menuTotal(menu) {
  return (menu.items || []).reduce((a, it) => a + (parseInt(it.min, 10) || 0), 0);
}

function menuPrintHTML(menu) {
  let html = `<div class="p-doc">
    <h1 class="p-title">${esc(menu.title || '練習メニュー')}</h1>
    <div class="p-meta">${menu.date ? `日付：${esc(menu.date)}　` : ''}${menu.age ? `対象：${esc(menu.age)}　` : ''}合計：約${menuTotal(menu)}分${menu.note ? `　備考：${esc(menu.note)}` : ''}</div>`;
  (menu.items || []).forEach((it, idx) => {
    const drill = DB.drills.find(d => d.id === it.drillId);
    const title = drill ? drill.name : (it.note || '（自由項目）');
    html += `<div class="p-drill">
      <div class="p-drill-head"><span class="p-num">${idx + 1}</span><span class="p-drill-name">${esc(title)}</span><span class="p-min">${it.min ? esc(it.min) + '分' : ''}</span></div>`;
    if (drill) {
      const tags = [drill.category, drill.age, drill.players ? `人数：${drill.players}` : '', drill.equipment ? `用具：${drill.equipment}` : '']
        .filter(Boolean).map(esc).join('　／　');
      if (tags) html += `<div class="p-tags">${tags}</div>`;
      if (it.note) html += `<div class="p-note">メモ：${esc(it.note)}</div>`;
      const parts = [];
      if (drill.description) parts.push(`<div class="p-desc"><b>やり方</b><br>${nl2br(drill.description)}</div>`);
      if (drill.points) parts.push(`<div class="p-desc"><b>コーチングポイント</b><br>${nl2br(drill.points)}</div>`);
      const board = DB.boards.find(b => b.id === drill.boardId);
      html += `<div class="p-body">${board ? `<div class="p-fig">${boardSVG(board, 'print')}</div>` : ''}<div class="p-texts">${parts.join('')}</div></div>`;
    }
    html += `</div>`;
  });
  html += `<div class="p-foot">サッカーコーチノートで作成</div></div>`;
  return html;
}

function boardPrintHTML(board) {
  return `<div class="p-doc">
    <h1 class="p-title">${esc(board.name || '戦術ボード')}</h1>
    <div class="p-board-fig">${boardSVG(board, 'print')}</div>
  </div>`;
}

function formationPrintHTML(f) {
  const fmt = FORMATION_FORMATS[f.format];
  const rows = (f.positions || []).map(p =>
    `<tr><td>${p.num}</td><td>${esc(p.role)}</td><td>${esc(p.name || '')}</td></tr>`
  ).join('');
  return `<div class="p-doc">
    <h1 class="p-title">${esc(f.name || 'ポジション表')}</h1>
    <div class="p-meta">${fmt ? esc(fmt.label) : ''}　${f.preset ? `フォーメーション：${esc(f.preset)}` : ''}</div>
    <div class="p-form-row">
      <div class="p-form-fig"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 1050">${formationSVG(f, 'print')}</svg></div>
      <table class="p-table"><thead><tr><th>番号</th><th>役割</th><th>名前</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

/* =========================================================
 * タブ切り替え
 * ======================================================= */
function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'menus') renderMenus();
  if (name === 'drills') renderDrills();
  if (name === 'board') renderBoardList();
  if (name === 'formation') renderFormationList();
  if (name === 'data') renderDataTab();
}

/* =========================================================
 * 練習メニュー
 * ======================================================= */
let currentMenuId = null;

function renderMenus() {
  const list = byId('menu-list');
  list.innerHTML = DB.menus.map(m =>
    `<button class="chip ${m.id === currentMenuId ? 'active' : ''}" data-id="${m.id}">${esc(m.title || '（無題）')}</button>`
  ).join('') || '<p class="hint">「＋ 新しいメニュー」から作成できます。</p>';
  const editor = byId('menu-editor');
  editor.classList.toggle('hidden', !currentMenuId);
  if (currentMenuId) fillMenuEditor();
}

function currentMenu() {
  return DB.menus.find(m => m.id === currentMenuId) || null;
}

function fillMenuEditor() {
  const m = currentMenu();
  if (!m) return;
  byId('menu-title').value = m.title || '';
  byId('menu-date').value = m.date || '';
  byId('menu-age').value = m.age || '';
  byId('menu-note').value = m.note || '';
  renderMenuItems();
}

function drillOptions(selected) {
  const opts = [`<option value=""${!selected ? ' selected' : ''}>（自由記入・休憩など → メモ欄へ）</option>`];
  DB.drills.forEach(d => {
    opts.push(`<option value="${d.id}"${d.id === selected ? ' selected' : ''}>${esc(d.name)}【${esc(d.category || '')}】</option>`);
  });
  return opts.join('');
}

function renderMenuItems() {
  const m = currentMenu();
  if (!m) return;
  const wrap = byId('menu-items');
  wrap.innerHTML = (m.items || []).map((it, i) => `
    <div class="menu-item" data-idx="${i}">
      <span class="mi-num">${i + 1}.</span>
      <select class="mi-drill" data-idx="${i}">${drillOptions(it.drillId)}</select>
      <span class="mi-time"><input class="mi-min" data-idx="${i}" type="number" min="0" max="180" value="${esc(it.min ?? '')}" inputmode="numeric">分</span>
      <input class="mi-note" data-idx="${i}" value="${esc(it.note || '')}" placeholder="メモ・自由記入">
      <span class="mi-btns">
        <button class="icon-btn mi-up" data-idx="${i}" title="上へ">▲</button>
        <button class="icon-btn mi-down" data-idx="${i}" title="下へ">▼</button>
        <button class="icon-btn danger mi-del" data-idx="${i}" title="削除">✕</button>
      </span>
    </div>`).join('') || '<p class="hint">「＋ 項目を追加」でドリルを組み込みます。</p>';
  byId('menu-total').textContent = `（合計 約${menuTotal(m)}分）`;
}

function initMenusTab() {
  byId('menu-new').addEventListener('click', () => {
    const m = { id: uid('m'), title: '新しい練習メニュー', date: '', age: '', note: '', items: [] };
    DB.menus.push(m);
    currentMenuId = m.id;
    saveDB();
    renderMenus();
    byId('menu-title').focus();
    byId('menu-title').select();
  });

  byId('menu-list').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    currentMenuId = b.dataset.id;
    renderMenus();
  });

  // 基本情報の自動保存
  [['menu-title', 'title'], ['menu-date', 'date'], ['menu-age', 'age'], ['menu-note', 'note']].forEach(([id, key]) => {
    byId(id).addEventListener('input', () => {
      const m = currentMenu();
      if (!m) return;
      m[key] = byId(id).value;
      saveDB();
      if (key === 'title') {
        const chip = byId('menu-list').querySelector(`[data-id="${m.id}"]`);
        if (chip) chip.textContent = m.title || '（無題）';
      }
    });
  });

  byId('menu-add-item').addEventListener('click', () => {
    const m = currentMenu();
    if (!m) return;
    m.items.push({ drillId: '', min: 10, note: '' });
    saveDB();
    renderMenuItems();
  });

  const items = byId('menu-items');
  items.addEventListener('change', e => {
    const m = currentMenu();
    if (!m) return;
    const i = +e.target.dataset.idx;
    const it = m.items[i];
    if (!it) return;
    if (e.target.classList.contains('mi-drill')) {
      it.drillId = e.target.value;
      const d = DB.drills.find(x => x.id === it.drillId);
      if (d && d.duration) { it.min = d.duration; }
      saveDB();
      renderMenuItems();
    }
  });
  items.addEventListener('input', e => {
    const m = currentMenu();
    if (!m) return;
    const i = +e.target.dataset.idx;
    const it = m.items[i];
    if (!it) return;
    if (e.target.classList.contains('mi-min')) {
      it.min = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
      byId('menu-total').textContent = `（合計 約${menuTotal(m)}分）`;
      saveDB();
    } else if (e.target.classList.contains('mi-note')) {
      it.note = e.target.value;
      saveDB();
    }
  });
  items.addEventListener('click', e => {
    const m = currentMenu();
    if (!m) return;
    const btn = e.target.closest('button');
    if (!btn) return;
    const i = +btn.dataset.idx;
    if (btn.classList.contains('mi-up') && i > 0) {
      [m.items[i - 1], m.items[i]] = [m.items[i], m.items[i - 1]];
    } else if (btn.classList.contains('mi-down') && i < m.items.length - 1) {
      [m.items[i + 1], m.items[i]] = [m.items[i], m.items[i + 1]];
    } else if (btn.classList.contains('mi-del')) {
      m.items.splice(i, 1);
    } else {
      return;
    }
    saveDB();
    renderMenuItems();
  });

  byId('menu-print').addEventListener('click', () => {
    const m = currentMenu();
    if (m) printHTML(menuPrintHTML(m), false);
  });

  byId('menu-export').addEventListener('click', () => {
    const m = currentMenu();
    if (!m) return;
    const drillIds = new Set(m.items.map(it => it.drillId).filter(Boolean));
    const drills = DB.drills.filter(d => drillIds.has(d.id));
    const boardIds = new Set(drills.map(d => d.boardId).filter(Boolean));
    const boards = DB.boards.filter(b => boardIds.has(b.id));
    downloadJSON(
      { app: 'soccer-coach-note', version: 1, kind: 'menu', menu: m, drills, boards },
      `メニュー_${safeName(m.title, 'menu')}_${today()}.json`
    );
  });

  byId('menu-delete').addEventListener('click', () => {
    const m = currentMenu();
    if (!m) return;
    if (!confirm(`メニュー「${m.title || '（無題）'}」を削除しますか？`)) return;
    DB.menus = DB.menus.filter(x => x.id !== m.id);
    currentMenuId = null;
    saveDB();
    renderMenus();
  });
}

/* =========================================================
 * ドリル集
 * ======================================================= */
let editingDrillId = null;

function renderDrills() {
  const list = byId('drill-list');
  list.innerHTML = DB.drills.map(d => {
    const board = DB.boards.find(b => b.id === d.boardId);
    return `<div class="card drill-card">
      ${board ? `<div class="b-thumb">${boardSVG(board, 'screen')}</div>` : ''}
      <div class="drill-card-body">
        <div class="drill-card-head">
          <b>${esc(d.name)}</b>
          <span class="tag">${esc(d.category || '')}</span>
        </div>
        <div class="drill-card-meta">${esc(d.age || '')}${d.duration ? `・約${esc(d.duration)}分` : ''}${d.players ? `・${esc(d.players)}` : ''}</div>
        ${d.description ? `<div class="drill-card-desc">${nl2br(d.description)}</div>` : ''}
        <div class="btn-row">
          <button class="btn small drill-edit" data-id="${d.id}">✎ 編集</button>
          <button class="btn small danger drill-del" data-id="${d.id}">削除</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<p class="hint">「＋ 新しいドリル」から登録できます。</p>';
}

function openDrillForm(drill) {
  editingDrillId = drill ? drill.id : null;
  byId('drill-form-title').textContent = drill ? 'ドリルを編集' : '新しいドリル';
  byId('df-name').value = drill?.name || '';
  byId('df-category').value = drill?.category || CATEGORIES[0];
  byId('df-age').value = drill?.age || AGE_GROUPS[0];
  byId('df-duration').value = drill?.duration ?? 10;
  byId('df-players').value = drill?.players || '';
  byId('df-equipment').value = drill?.equipment || '';
  byId('df-desc').value = drill?.description || '';
  byId('df-points').value = drill?.points || '';
  const sel = byId('df-board');
  sel.innerHTML = '<option value="">（図なし）</option>' +
    DB.boards.map(b => `<option value="${b.id}"${drill && drill.boardId === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
  byId('df-delete').classList.toggle('hidden', !drill);
  byId('drill-form').classList.remove('hidden');
  byId('drill-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initDrillsTab() {
  byId('drill-new').addEventListener('click', () => openDrillForm(null));

  byId('drill-list').addEventListener('click', e => {
    const edit = e.target.closest('.drill-edit');
    const del = e.target.closest('.drill-del');
    if (edit) {
      openDrillForm(DB.drills.find(d => d.id === edit.dataset.id));
    } else if (del) {
      const d = DB.drills.find(x => x.id === del.dataset.id);
      if (d && confirm(`ドリル「${d.name}」を削除しますか？`)) {
        DB.drills = DB.drills.filter(x => x.id !== d.id);
        saveDB();
        renderDrills();
      }
    }
  });

  byId('df-save').addEventListener('click', () => {
    const name = byId('df-name').value.trim();
    if (!name) { alert('ドリル名を入力してください'); return; }
    const data = {
      name,
      category: byId('df-category').value,
      age: byId('df-age').value,
      duration: parseInt(byId('df-duration').value, 10) || 0,
      players: byId('df-players').value.trim(),
      equipment: byId('df-equipment').value.trim(),
      description: byId('df-desc').value.trim(),
      points: byId('df-points').value.trim(),
      boardId: byId('df-board').value,
    };
    if (editingDrillId) {
      const d = DB.drills.find(x => x.id === editingDrillId);
      if (d) Object.assign(d, data);
    } else {
      DB.drills.push(Object.assign({ id: uid('d') }, data));
    }
    saveDB();
    byId('drill-form').classList.add('hidden');
    renderDrills();
  });

  byId('df-cancel').addEventListener('click', () => byId('drill-form').classList.add('hidden'));

  byId('df-delete').addEventListener('click', () => {
    if (!editingDrillId) return;
    const d = DB.drills.find(x => x.id === editingDrillId);
    if (d && confirm(`ドリル「${d.name}」を削除しますか？`)) {
      DB.drills = DB.drills.filter(x => x.id !== d.id);
      saveDB();
      byId('drill-form').classList.add('hidden');
      renderDrills();
    }
  });
}

/* =========================================================
 * 戦術ボード
 * ======================================================= */
let editor = null;
let currentBoardId = null;

function renderBoardList() {
  const list = byId('board-list');
  list.innerHTML = DB.boards.map(b => `
    <div class="card board-item ${b.id === currentBoardId ? 'active' : ''}">
      <div class="b-thumb">${boardSVG(b, 'screen')}</div>
      <div class="board-item-name">${esc(b.name)}</div>
      <div class="btn-row">
        <button class="btn small b-open" data-id="${b.id}">開く</button>
        <button class="btn small b-png" data-id="${b.id}">PNG</button>
        <button class="btn small b-print" data-id="${b.id}">🖨</button>
        <button class="btn small danger b-del" data-id="${b.id}">✕</button>
      </div>
    </div>`).join('') || '<p class="hint">保存したボードがここに並びます。</p>';
}

function initBoardTab() {
  editor = new BoardEditor(byId('board-svg'), { prefix: 'main' });

  const tools = byId('board-tools');
  tools.addEventListener('click', e => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    editor.tool = b.dataset.tool;
    tools.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('active', x === b));
  });

  const colors = byId('board-colors');
  colors.innerHTML = PALETTE.map((c, i) =>
    `<button class="swatch ${i === 0 ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
  ).join('');
  colors.addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    editor.color = b.dataset.color;
    colors.querySelectorAll('.swatch').forEach(x => x.classList.toggle('active', x === b));
  });

  const fieldSel = byId('board-field');
  fieldSel.innerHTML = ['full', 'half', 'vfull', 'blank'].map(f =>
    `<option value="${f}">${FIELD_DEFS[f].label}</option>`
  ).join('');
  fieldSel.addEventListener('change', () => editor.setField(fieldSel.value));

  byId('board-undo').addEventListener('click', () => editor.undo());
  byId('board-clear').addEventListener('click', () => {
    if (editor.elements.length && confirm('ボード上のすべての駒・線を消しますか？')) editor.clearAll();
  });

  byId('board-save').addEventListener('click', () => {
    const name = byId('board-name').value.trim() || '無題のボード';
    const data = editor.serialize();
    if (currentBoardId) {
      const b = DB.boards.find(x => x.id === currentBoardId);
      if (b) Object.assign(b, { name, field: data.field, elements: data.elements });
    } else {
      const b = Object.assign({ id: uid('b'), name }, data);
      DB.boards.push(b);
      currentBoardId = b.id;
    }
    saveDB();
    byId('board-name').value = name;
    renderBoardList();
    byId('board-status').textContent = '保存しました ✓';
    setTimeout(() => { byId('board-status').textContent = ''; }, 2000);
  });

  byId('board-newbtn').addEventListener('click', () => {
    currentBoardId = null;
    byId('board-name').value = '';
    editor.load({ field: fieldSel.value, elements: [] });
    renderBoardList();
  });

  byId('board-png').addEventListener('click', () => {
    downloadBoardPNG(editor.serialize(), byId('board-name').value.trim() || `戦術ボード_${today()}`);
  });

  byId('board-print').addEventListener('click', () => {
    const data = editor.serialize();
    printHTML(boardPrintHTML(Object.assign({ name: byId('board-name').value.trim() }, data)), data.field !== 'vfull');
  });

  byId('board-list').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const b = DB.boards.find(x => x.id === btn.dataset.id);
    if (!b) return;
    if (btn.classList.contains('b-open')) {
      currentBoardId = b.id;
      byId('board-name').value = b.name;
      fieldSel.value = b.field || 'full';
      editor.load(b);
      renderBoardList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (btn.classList.contains('b-png')) {
      downloadBoardPNG(b, b.name);
    } else if (btn.classList.contains('b-print')) {
      printHTML(boardPrintHTML(b), (b.field || 'full') !== 'vfull');
    } else if (btn.classList.contains('b-del')) {
      if (confirm(`ボード「${b.name}」を削除しますか？`)) {
        DB.boards = DB.boards.filter(x => x.id !== b.id);
        if (currentBoardId === b.id) currentBoardId = null;
        saveDB();
        renderBoardList();
      }
    }
  });
}

/* =========================================================
 * ポジション（フォーメーション）
 * ======================================================= */
const FM = { id: null, name: '', format: '8', preset: '3-3-1', positions: presetPositions('8', '3-3-1') };
let fmDrag = null;

function roleColor(role) { return ROLE_COLORS[role] || '#1f6fe0'; }

function formationSVG(f, theme) {
  const print = theme === 'print';
  const body = (f.positions || []).map((p, i) => `
    <g data-p="${i}" style="cursor:grab">
      <circle cx="${p.x}" cy="${p.y}" r="26" fill="${roleColor(p.role)}" stroke="#ffffff" stroke-width="3"/>
      <text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="20" font-weight="800" fill="#ffffff">${p.num}</text>
      <text x="${p.x}" y="${p.y + 46}" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="700" fill="${print ? '#333333' : '#ffffff'}" stroke="${print ? 'none' : 'rgba(0,0,0,0.45)'}" stroke-width="3" paint-order="stroke">${escXML(p.name || p.role)}</text>
    </g>`).join('');
  return fieldSVG('vfull', theme) + body;
}

function renderFormationSVG() {
  const svg = byId('formation-svg');
  svg.setAttribute('viewBox', '0 0 680 1050');
  svg.innerHTML = formationSVG(FM, 'screen');
}

function fmPresetOptions() {
  const presets = FORMATION_FORMATS[FM.format].presets;
  byId('fm-preset').innerHTML = Object.keys(presets).map(k =>
    `<option value="${k}"${k === FM.preset ? ' selected' : ''}>${k}</option>`
  ).join('');
}

function renderFormationList() {
  const list = byId('formation-list');
  list.innerHTML = DB.formations.map(f => `
    <div class="card board-item ${f.id === FM.id ? 'active' : ''}">
      <div class="b-thumb tall"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 1050">${formationSVG(f, 'screen')}</svg></div>
      <div class="board-item-name">${esc(f.name)}<br><small>${esc((FORMATION_FORMATS[f.format] || {}).label || '')} ${esc(f.preset || '')}</small></div>
      <div class="btn-row">
        <button class="btn small f-open" data-id="${f.id}">開く</button>
        <button class="btn small f-print" data-id="${f.id}">🖨</button>
        <button class="btn small danger f-del" data-id="${f.id}">✕</button>
      </div>
    </div>`).join('') || '<p class="hint">保存したポジション表がここに並びます。</p>';
}

function fmPoint(e, svg) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  const m = svg.getScreenCTM();
  return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}

function initFormationTab() {
  const svg = byId('formation-svg');
  svg.style.touchAction = 'none';

  const fmtSel = byId('fm-format');
  fmtSel.innerHTML = Object.keys(FORMATION_FORMATS).map(k =>
    `<option value="${k}"${k === FM.format ? ' selected' : ''}>${FORMATION_FORMATS[k].label}</option>`
  ).join('');

  fmtSel.addEventListener('change', () => {
    FM.format = fmtSel.value;
    FM.preset = Object.keys(FORMATION_FORMATS[FM.format].presets)[0];
    FM.positions = presetPositions(FM.format, FM.preset);
    fmPresetOptions();
    renderFormationSVG();
  });

  byId('fm-preset').addEventListener('change', () => {
    FM.preset = byId('fm-preset').value;
    const old = FM.positions;
    FM.positions = presetPositions(FM.format, FM.preset);
    // 入力済みの名前は番号順にできるだけ引き継ぐ
    FM.positions.forEach((p, i) => { if (old[i]) p.name = old[i].name; });
    renderFormationSVG();
  });

  byId('fm-name').addEventListener('input', () => { FM.name = byId('fm-name').value; });

  svg.addEventListener('pointerdown', e => {
    e.preventDefault();
    const g = e.target.closest ? e.target.closest('[data-p]') : null;
    if (!g) return;
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    const i = +g.getAttribute('data-p');
    const p = fmPoint(e, svg);
    fmDrag = { i, sx: p.x, sy: p.y, ox: FM.positions[i].x, oy: FM.positions[i].y, moved: false };
  });
  svg.addEventListener('pointermove', e => {
    if (!fmDrag) return;
    const p = fmPoint(e, svg);
    const dx = p.x - fmDrag.sx, dy = p.y - fmDrag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) fmDrag.moved = true;
    const pos = FM.positions[fmDrag.i];
    pos.x = Math.min(655, Math.max(25, fmDrag.ox + dx));
    pos.y = Math.min(1025, Math.max(25, fmDrag.oy + dy));
    renderFormationSVG();
  });
  const fmUp = () => {
    if (!fmDrag) return;
    const d = fmDrag;
    fmDrag = null;
    if (!d.moved) {
      const pos = FM.positions[d.i];
      const v = prompt(`${pos.role}（${pos.num}番）の選手名を入力`, pos.name || '');
      if (v !== null) {
        pos.name = v.trim();
        renderFormationSVG();
      }
    }
  };
  svg.addEventListener('pointerup', fmUp);
  svg.addEventListener('pointercancel', fmUp);

  byId('fm-save').addEventListener('click', () => {
    FM.name = byId('fm-name').value.trim() || `${FORMATION_FORMATS[FM.format].label} ${FM.preset}`;
    byId('fm-name').value = FM.name;
    const data = { name: FM.name, format: FM.format, preset: FM.preset, positions: JSON.parse(JSON.stringify(FM.positions)) };
    if (FM.id) {
      const f = DB.formations.find(x => x.id === FM.id);
      if (f) Object.assign(f, data);
    } else {
      FM.id = uid('f');
      DB.formations.push(Object.assign({ id: FM.id }, data));
    }
    saveDB();
    renderFormationList();
    byId('fm-status').textContent = '保存しました ✓';
    setTimeout(() => { byId('fm-status').textContent = ''; }, 2000);
  });

  byId('fm-new').addEventListener('click', () => {
    FM.id = null;
    FM.name = '';
    byId('fm-name').value = '';
    FM.positions = presetPositions(FM.format, FM.preset);
    renderFormationSVG();
    renderFormationList();
  });

  byId('fm-png').addEventListener('click', () => {
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 1050">${formationSVG(FM, 'screen')}</svg>`;
    svgStringToPNG(svgStr, 680, 1050, safeName(byId('fm-name').value.trim() || FM.name, 'formation') + '.png');
  });

  byId('fm-print').addEventListener('click', () => {
    printHTML(formationPrintHTML(Object.assign({}, FM, { name: byId('fm-name').value.trim() || FM.name })), false);
  });

  byId('formation-list').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const f = DB.formations.find(x => x.id === btn.dataset.id);
    if (!f) return;
    if (btn.classList.contains('f-open')) {
      FM.id = f.id;
      FM.name = f.name;
      FM.format = f.format;
      FM.preset = f.preset;
      FM.positions = JSON.parse(JSON.stringify(f.positions || []));
      byId('fm-name').value = f.name;
      byId('fm-format').value = f.format;
      fmPresetOptions();
      renderFormationSVG();
      renderFormationList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (btn.classList.contains('f-print')) {
      printHTML(formationPrintHTML(f), false);
    } else if (btn.classList.contains('f-del')) {
      if (confirm(`「${f.name}」を削除しますか？`)) {
        DB.formations = DB.formations.filter(x => x.id !== f.id);
        if (FM.id === f.id) FM.id = null;
        saveDB();
        renderFormationList();
      }
    }
  });

  fmPresetOptions();
  renderFormationSVG();
}

/* =========================================================
 * データ管理
 * ======================================================= */
function renderDataTab() {
  byId('data-stats').innerHTML =
    `登録データ：ドリル <b>${DB.drills.length}</b> 件　／　練習メニュー <b>${DB.menus.length}</b> 件　／　戦術ボード <b>${DB.boards.length}</b> 件　／　ポジション表 <b>${DB.formations.length}</b> 件`;
}

function initDataTab() {
  byId('data-export').addEventListener('click', () => {
    downloadJSON(
      { app: 'soccer-coach-note', version: 1, exportedAt: new Date().toISOString(), data: DB },
      `サッカーコーチノート_全データ_${today()}.json`
    );
  });

  byId('data-import').addEventListener('click', () => byId('data-file').click());

  byId('data-file').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj && obj.data && Array.isArray(obj.data.drills)) {
          if (!confirm('全データの読み込みです。現在のデータをファイルの内容で置き換えますか？')) return;
          DB = normalizeDB(obj.data);
          currentMenuId = null;
          currentBoardId = null;
          saveDB();
          renderDataTab();
          alert('データを読み込みました。');
        } else if (obj && obj.kind === 'menu' && obj.menu) {
          [obj.menu].forEach(m => upsert(DB.menus, m));
          (obj.drills || []).forEach(d => upsert(DB.drills, d));
          (obj.boards || []).forEach(b => upsert(DB.boards, b));
          saveDB();
          renderDataTab();
          alert(`メニュー「${obj.menu.title || ''}」を取り込みました。`);
        } else {
          alert('このアプリで書き出したJSONファイルを選んでください。');
        }
      } catch (err) {
        alert('ファイルを読み込めませんでした：' + err.message);
      }
    };
    reader.readAsText(file);
  });

  byId('data-reset').addEventListener('click', () => {
    if (!confirm('すべてのデータを削除して初期状態（サンプルデータ）に戻します。よろしいですか？')) return;
    if (!confirm('本当に削除しますか？　この操作は取り消せません。')) return;
    DB = seedDB();
    currentMenuId = null;
    currentBoardId = null;
    saveDB();
    renderDataTab();
    alert('初期状態に戻しました。');
  });
}

function upsert(arr, item) {
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
}

/* =========================================================
 * 初期化
 * ======================================================= */
function fillSelect(id, values) {
  byId(id).innerHTML = values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

/* サーバー同期（チーム共有版）から呼ばれる：他メンバーの変更を画面に反映する */
window.applyExternalDB = function (newDb) {
  DB = normalizeDB(newDb);
  if (currentMenuId && !DB.menus.some(m => m.id === currentMenuId)) currentMenuId = null;
  if (currentBoardId && !DB.boards.some(b => b.id === currentBoardId)) currentBoardId = null;
  if (FM.id && !DB.formations.some(f => f.id === FM.id)) FM.id = null;
  const active = document.querySelector('.tab-btn.active');
  showTab(active ? active.dataset.tab : 'menus');
};

document.addEventListener('DOMContentLoaded', async () => {
  let loaded = null;
  try { loaded = await store().load(); } catch (e) { console.warn('初期データの読み込みに失敗:', e); }
  DB = normalizeDB(loaded || seedDB());
  if (!loaded) saveDB();

  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab-btn');
    if (b) showTab(b.dataset.tab);
  });

  fillSelect('menu-age', [''].concat(AGE_GROUPS));
  fillSelect('df-category', CATEGORIES);
  fillSelect('df-age', AGE_GROUPS);

  initMenusTab();
  initDrillsTab();
  initBoardTab();
  initFormationTab();
  initDataTab();

  if (DB.menus.length) currentMenuId = DB.menus[0].id;
  showTab('menus');
});
