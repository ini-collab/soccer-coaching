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
const GRADES = ['年少', '年中', '年長', '小1', '小2', '小3', '小4', '小5', '小6', 'その他'];
const EVENT_TYPES = { practice: '練習', match: '試合', other: 'その他' };
const ATT_STATES = {
  present: { label: '出席', mark: '○', cls: 'att-present' },
  absent:  { label: '欠席', mark: '×', cls: 'att-absent' },
  maybe:   { label: '未定', mark: '△', cls: 'att-maybe' },
  '':      { label: '未回答', mark: '−', cls: 'att-none' },
};

/* ---- 権限（標準版は常にコーチ＝フル機能。チーム共有版が上書き）---- */
function appRole() { return window.APP_ROLE || 'coach'; }
function canEdit() { return appRole() !== 'player'; }
function isPlayer() { return appRole() === 'player'; }
function myMemberId() { return window.APP_MEMBER_ID || null; }
/** その出欠行を編集できるか（コーチは全員、プレイヤーは自分のみ）*/
function canMarkAttendance(memberId) { return canEdit() || (memberId && memberId === myMemberId()); }

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
const ROLES = ['GK', 'DF', 'MF', 'FW'];

function presetPositions(format, preset) {
  const def = (FORMATION_FORMATS[format] || {}).presets || {};
  const list = def[preset] || Object.values(def)[0] || [];
  return list.map((p, i) => ({ x: p[0], y: p[1], role: p[2], num: i + 1, name: '', memberId: '' }));
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
    members: [
      { id: 'p1', name: 'たろう', grade: '小2', number: '7', note: '', userId: '' },
      { id: 'p2', name: 'はなこ', grade: '小1', number: '10', note: '', userId: '' },
      { id: 'p3', name: 'けんた', grade: '年長', number: '4', note: '', userId: '' },
    ],
    events: [
      {
        id: 'e1', type: 'practice', title: '土曜練習', date: futureDate(3), start: '09:00', end: '11:00',
        place: '第2グラウンド', opponent: '', note: 'スパイク・すね当てを忘れずに', menuId: 'm1', result: null,
      },
      {
        id: 'e2', type: 'match', title: '練習試合 vs さくらFC', date: futureDate(10), start: '10:00', end: '12:00',
        place: 'さくら小学校', opponent: 'さくらFC', note: '集合はキックオフの30分前', menuId: '',
        result: { us: 2, them: 1, memo: '前半に2点先制。最後まで走り切れた。' },
      },
    ],
    attendance: [
      { id: 'e1__p1', eventId: 'e1', memberId: 'p1', status: 'present', by: '' },
      { id: 'e1__p2', eventId: 'e1', memberId: 'p2', status: 'maybe', by: '' },
      { id: 'e2__p1', eventId: 'e2', memberId: 'p1', status: 'present', by: '' },
    ],
  };
}

/** 今日からn日後の YYYY-MM-DD */
function futureDate(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeDB(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    drills: Array.isArray(d.drills) ? d.drills : [],
    menus: Array.isArray(d.menus) ? d.menus : [],
    boards: Array.isArray(d.boards) ? d.boards : [],
    formations: Array.isArray(d.formations) ? d.formations : [],
    members: Array.isArray(d.members) ? d.members : [],
    events: Array.isArray(d.events) ? d.events : [],
    attendance: Array.isArray(d.attendance) ? d.attendance : [],
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

/* サーバー同期版（team/js/remote.js）が現在のDBを参照するためのアクセサ */
window.getAppDB = () => DB;

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

/* ---- スケジュール・出欠・結果 ---- */
function attForEvent(eventId) {
  const map = {};
  DB.attendance.forEach(a => { if (a.eventId === eventId) map[a.memberId] = a.status || ''; });
  return map;
}
function attStatus(eventId, memberId) {
  const a = DB.attendance.find(x => x.id === eventId + '__' + memberId);
  return a ? (a.status || '') : '';
}
function attCounts(eventId) {
  const map = attForEvent(eventId);
  const c = { present: 0, absent: 0, maybe: 0, none: 0 };
  DB.members.forEach(m => {
    const s = map[m.id] || '';
    c[s === '' ? 'none' : s]++;
  });
  return c;
}
function eventDateLabel(e) {
  if (!e.date) return '日付未定';
  const d = new Date(e.date + 'T00:00:00');
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()] || '';
  const time = [e.start, e.end].filter(Boolean).join('〜');
  return `${e.date}（${w}）${time ? '　' + time : ''}`;
}
function resultLabel(e) {
  if (e.type !== 'match' || !e.result || (e.result.us === '' && e.result.them === '')) return '';
  const us = e.result.us === '' ? '-' : e.result.us;
  const them = e.result.them === '' ? '-' : e.result.them;
  let wl = '';
  if (e.result.us !== '' && e.result.them !== '') {
    wl = e.result.us > e.result.them ? '○勝ち' : e.result.us < e.result.them ? '●負け' : '△引分';
  }
  return `${us} - ${them} ${wl}`.trim();
}
function sortedEvents() {
  return DB.events.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.start || '').localeCompare(b.start || ''));
}

function scheduleListPrintHTML(events) {
  const rows = events.map(e => {
    const c = attCounts(e.id);
    return `<tr>
      <td>${esc(eventDateLabel(e))}</td>
      <td>${esc(EVENT_TYPES[e.type] || '')}</td>
      <td>${esc(e.title || '')}${e.opponent ? '<br><small>vs ' + esc(e.opponent) + '</small>' : ''}</td>
      <td>${esc(e.place || '')}</td>
      <td>${esc(resultLabel(e))}</td>
      <td>出${c.present}／欠${c.absent}／未定${c.maybe}</td>
    </tr>`;
  }).join('');
  return `<div class="p-doc">
    <h1 class="p-title">スケジュール一覧</h1>
    <table class="p-table wide">
      <thead><tr><th>日時</th><th>種別</th><th>内容</th><th>場所</th><th>結果</th><th>出欠</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">予定はありません</td></tr>'}</tbody>
    </table>
    <div class="p-foot">サッカーコーチノートで作成</div>
  </div>`;
}

function eventSheetPrintHTML(e) {
  const rows = DB.members.map((m, i) => {
    const s = attStatus(e.id, m.id);
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(m.name)}</td>
      <td>${esc(m.grade || '')}</td>
      <td class="att-cell">${ATT_STATES[s] ? ATT_STATES[s].mark : '−'}</td>
      <td></td>
    </tr>`;
  }).join('');
  const c = attCounts(e.id);
  let result = '';
  if (e.type === 'match') {
    const r = e.result || {};
    result = `<div class="p-desc"><b>結果</b>　${esc(resultLabel(e) || '未記録')}${r.memo ? '<br>' + nl2br(r.memo) : ''}</div>`;
  }
  return `<div class="p-doc">
    <h1 class="p-title">${esc(EVENT_TYPES[e.type] || '')}　${esc(e.title || '')}</h1>
    <div class="p-meta">${esc(eventDateLabel(e))}${e.place ? '　場所：' + esc(e.place) : ''}${e.opponent ? '　対戦：' + esc(e.opponent) : ''}</div>
    ${e.note ? `<div class="p-note">${nl2br(e.note)}</div>` : ''}
    ${result}
    <div class="p-desc"><b>参加状況</b>　出席 ${c.present}名／欠席 ${c.absent}名／未定 ${c.maybe}名／未回答 ${c.none}名</div>
    <table class="p-table wide">
      <thead><tr><th>No.</th><th>名前</th><th>学年</th><th>出欠</th><th>メモ</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">メンバーが登録されていません</td></tr>'}</tbody>
    </table>
    <div class="p-foot">○出席／×欠席／△未定　・　サッカーコーチノートで作成</div>
  </div>`;
}

function rosterPrintHTML() {
  const rows = DB.members.map((m, i) =>
    `<tr><td>${i + 1}</td><td>${esc(m.number || '')}</td><td>${esc(m.name)}</td><td>${esc(m.grade || '')}</td><td>${esc(m.note || '')}</td></tr>`
  ).join('');
  return `<div class="p-doc">
    <h1 class="p-title">メンバー名簿</h1>
    <div class="p-meta">全 ${DB.members.length} 名</div>
    <table class="p-table wide">
      <thead><tr><th>No.</th><th>背番号</th><th>名前</th><th>学年</th><th>メモ</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">メンバーが登録されていません</td></tr>'}</tbody>
    </table>
    <div class="p-foot">サッカーコーチノートで作成</div>
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
  if (name === 'schedule') renderSchedule();
  if (name === 'roster') renderRoster();
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

/* ---- ポジション枠の編集（登録メンバーから選択 or 自由入力／役割設定）---- */
let fmSlotIndex = null;

function openFmSlot(i) {
  const pos = FM.positions[i];
  if (!pos) return;
  fmSlotIndex = i;
  byId('fm-slot-title').textContent = `${i + 1} 人目の枠を設定`;

  // 登録メンバーの選択肢
  const sel = byId('fm-slot-member');
  const opts = ['<option value="">（自由入力）</option>'];
  DB.members.forEach(m => {
    const label = esc(m.name) + (m.grade ? '（' + esc(m.grade) + '）' : '') + (m.number ? ' #' + esc(m.number) : '');
    opts.push(`<option value="${m.id}">${label}</option>`);
  });
  sel.innerHTML = opts.join('');
  // 紐づけ済みメンバーが今も名簿にいれば選択、いなければ自由入力扱い
  sel.value = (pos.memberId && DB.members.some(m => m.id === pos.memberId)) ? pos.memberId : '';

  byId('fm-slot-name').value = pos.name || '';
  byId('fm-slot-num').value = pos.num != null ? pos.num : '';

  // 役割ボタン
  byId('fm-slot-roles').innerHTML = ROLES.map(r =>
    `<button type="button" class="role-btn ${r === pos.role ? 'on' : ''}" data-role="${r}" style="--rc:${roleColor(r)}">${r}</button>`
  ).join('');

  updateFmSlotMemberUI();
  byId('fm-slot-modal').classList.remove('hidden');
}

function updateFmSlotMemberUI() {
  const mid = byId('fm-slot-member').value;
  const m = DB.members.find(x => x.id === mid);
  // メンバー選択時は自由入力の名前欄を隠す
  byId('fm-slot-name-wrap').classList.toggle('hidden', !!mid);
  if (m && m.number) byId('fm-slot-num').value = m.number;
}

function saveFmSlot() {
  const i = fmSlotIndex;
  if (i == null || !FM.positions[i]) { closeFmSlot(); return; }
  const pos = FM.positions[i];
  const mid = byId('fm-slot-member').value;
  const m = DB.members.find(x => x.id === mid);
  if (m) {
    pos.memberId = m.id;
    pos.name = m.name;
  } else {
    pos.memberId = '';
    pos.name = byId('fm-slot-name').value.trim();
  }
  pos.num = byId('fm-slot-num').value.trim();
  const roleBtn = byId('fm-slot-roles').querySelector('.role-btn.on');
  if (roleBtn) pos.role = roleBtn.dataset.role;
  closeFmSlot();
  renderFormationSVG();
}

function clearFmSlot() {
  const i = fmSlotIndex;
  if (i != null && FM.positions[i]) {
    FM.positions[i].name = '';
    FM.positions[i].memberId = '';
  }
  closeFmSlot();
  renderFormationSVG();
}

function closeFmSlot() {
  fmSlotIndex = null;
  byId('fm-slot-modal').classList.add('hidden');
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
    // 入力済みの選手（名前・メンバー紐付け・背番号）は順番にできるだけ引き継ぐ
    FM.positions.forEach((p, i) => {
      if (old[i]) { p.name = old[i].name; p.memberId = old[i].memberId || ''; p.num = old[i].num; }
    });
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
    if (!d.moved && canEdit()) openFmSlot(d.i); // タップ＝枠の設定（メンバー・役割）
  };
  svg.addEventListener('pointerup', fmUp);
  svg.addEventListener('pointercancel', fmUp);

  // 枠編集モーダルのイベント
  byId('fm-slot-member').addEventListener('change', updateFmSlotMemberUI);
  byId('fm-slot-roles').addEventListener('click', e => {
    const b = e.target.closest('.role-btn');
    if (!b) return;
    byId('fm-slot-roles').querySelectorAll('.role-btn').forEach(x => x.classList.toggle('on', x === b));
  });
  byId('fm-slot-save').addEventListener('click', saveFmSlot);
  byId('fm-slot-clear').addEventListener('click', clearFmSlot);
  byId('fm-slot-cancel').addEventListener('click', closeFmSlot);
  byId('fm-slot-modal').addEventListener('click', e => {
    if (e.target === byId('fm-slot-modal')) closeFmSlot(); // 背景タップで閉じる
  });

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
    `登録データ：ドリル <b>${DB.drills.length}</b> 件　／　練習メニュー <b>${DB.menus.length}</b> 件　／　戦術ボード <b>${DB.boards.length}</b> 件　／　ポジション表 <b>${DB.formations.length}</b> 件` +
    `　／　メンバー <b>${DB.members.length}</b> 名　／　予定 <b>${DB.events.length}</b> 件`;
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
          currentEventId = null;
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
        } else if (obj && obj.kind === 'schedule') {
          (obj.members || []).forEach(m => upsert(DB.members, m));
          (obj.events || []).forEach(ev => upsert(DB.events, ev));
          (obj.attendance || []).forEach(a => upsert(DB.attendance, a));
          saveDB();
          renderDataTab();
          alert('スケジュールを取り込みました。');
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
    currentEventId = null;
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
 * メンバー（名簿）
 * ======================================================= */
let editingMemberId = null;

function renderRoster() {
  const list = byId('roster-list');
  const canE = canEdit();
  byId('roster-new').classList.toggle('hidden', !canE);
  list.innerHTML = DB.members.map(m => `
    <div class="card member-card">
      <div class="member-main">
        <span class="member-num">${m.number ? '#' + esc(m.number) : ''}</span>
        <b>${esc(m.name)}</b>
        <span class="tag">${esc(m.grade || '学年未設定')}</span>
      </div>
      ${m.note ? `<div class="drill-card-meta">${esc(m.note)}</div>` : ''}
      ${canE ? `<div class="btn-row">
        <button class="btn small member-edit" data-id="${m.id}">✎ 編集</button>
        <button class="btn small danger member-del" data-id="${m.id}">削除</button>
      </div>` : ''}
    </div>`).join('') || `<p class="hint">${canE ? '「＋ メンバーを追加」から選手を登録できます。' : 'メンバーはまだ登録されていません。'}</p>`;
}

function openMemberForm(m) {
  editingMemberId = m ? m.id : null;
  byId('member-form-title').textContent = m ? 'メンバーを編集' : '新しいメンバー';
  byId('mf-name').value = m?.name || '';
  byId('mf-grade').value = m?.grade || GRADES[0];
  byId('mf-number').value = m?.number || '';
  byId('mf-note').value = m?.note || '';
  byId('mf-delete').classList.toggle('hidden', !m);
  byId('member-form').classList.remove('hidden');
  byId('member-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---- メンバーのCSV書き出し／読み込み ---- */
const CSV_HEADERS = ['ID', '名前', '学年', '背番号', 'メモ'];

function csvCell(s) {
  s = String(s ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function membersToCSV() {
  const rows = DB.members.map(m => [m.id, m.name, m.grade || '', m.number || '', m.note || ''].map(csvCell).join(','));
  // 先頭にBOMを付けてExcelで文字化けしないようにする
  return '\ufeff' + [CSV_HEADERS.join(','), ...rows].join('\r\n') + '\r\n';
}

function parseCSV(text) {
  text = String(text).replace(/^\ufeff/, '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function importMembersCSV(text) {
  const rows = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length) { alert('CSVにデータがありません。'); return; }

  const norm = s => String(s || '').trim().toLowerCase();
  const head = rows[0].map(norm);
  const isHeader = head.some(h => ['id', '名前', '氏名', 'name', '学年', 'grade', '背番号', '番号', 'number', 'no', 'メモ', 'note', '備考'].includes(h));
  let map = { id: -1, name: 0, grade: 1, number: 2, note: 3 };
  let start = 0;
  if (isHeader) {
    start = 1;
    map = { id: -1, name: -1, grade: -1, number: -1, note: -1 };
    head.forEach((h, i) => {
      if (h === 'id') map.id = i;
      else if (['名前', '氏名', 'name'].includes(h)) map.name = i;
      else if (['学年', 'grade'].includes(h)) map.grade = i;
      else if (['背番号', '番号', 'number', 'no'].includes(h)) map.number = i;
      else if (['メモ', 'note', '備考'].includes(h)) map.note = i;
    });
  }
  if (map.name < 0) { alert('「名前」の列が見つかりません。1行目の見出しをご確認ください。'); return; }

  const get = (r, idx) => (idx >= 0 && r[idx] != null ? String(r[idx]).trim() : '');
  let added = 0, updated = 0;
  rows.slice(start).forEach(r => {
    const name = get(r, map.name);
    if (!name) return;
    const data = { name, grade: get(r, map.grade), number: get(r, map.number), note: get(r, map.note) };
    const gid = get(r, map.id);
    let m = gid ? DB.members.find(x => x.id === gid) : null;
    if (!m) m = DB.members.find(x => x.name === name);
    if (m) { Object.assign(m, data); updated++; }
    else { DB.members.push(Object.assign({ id: gid || uid('p'), userId: '' }, data)); added++; }
  });
  saveDB();
  renderRoster();
  alert(`CSVを読み込みました。\n追加：${added}名／更新：${updated}名`);
}

function initRosterTab() {
  byId('roster-new').addEventListener('click', () => openMemberForm(null));
  byId('roster-print').addEventListener('click', () => printHTML(rosterPrintHTML(), false));

  byId('roster-csv-export').addEventListener('click', () => {
    downloadBlob(new Blob([membersToCSV()], { type: 'text/csv;charset=utf-8' }), `メンバー名簿_${today()}.csv`);
  });
  byId('roster-csv-import').addEventListener('click', () => byId('roster-csv-file').click());
  byId('roster-csv-file').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { importMembersCSV(reader.result); }
      catch (err) { alert('CSVを読み込めませんでした：' + err.message); }
    };
    reader.readAsText(file);
  });
  byId('roster-list').addEventListener('click', e => {
    const edit = e.target.closest('.member-edit');
    const del = e.target.closest('.member-del');
    if (edit) {
      openMemberForm(DB.members.find(m => m.id === edit.dataset.id));
    } else if (del) {
      const m = DB.members.find(x => x.id === del.dataset.id);
      if (m && confirm(`「${m.name}」を名簿から削除しますか？`)) {
        DB.members = DB.members.filter(x => x.id !== m.id);
        DB.attendance = DB.attendance.filter(a => a.memberId !== m.id);
        saveDB();
        renderRoster();
      }
    }
  });
  byId('mf-save').addEventListener('click', () => {
    const name = byId('mf-name').value.trim();
    if (!name) { alert('名前を入力してください'); return; }
    const data = {
      name,
      grade: byId('mf-grade').value,
      number: byId('mf-number').value.trim(),
      note: byId('mf-note').value.trim(),
    };
    if (editingMemberId) {
      const m = DB.members.find(x => x.id === editingMemberId);
      if (m) Object.assign(m, data);
    } else {
      DB.members.push(Object.assign({ id: uid('p'), userId: '' }, data));
    }
    saveDB();
    byId('member-form').classList.add('hidden');
    renderRoster();
  });
  byId('mf-cancel').addEventListener('click', () => byId('member-form').classList.add('hidden'));
  byId('mf-delete').addEventListener('click', () => {
    if (!editingMemberId) return;
    const m = DB.members.find(x => x.id === editingMemberId);
    if (m && confirm(`「${m.name}」を名簿から削除しますか？`)) {
      DB.members = DB.members.filter(x => x.id !== m.id);
      DB.attendance = DB.attendance.filter(a => a.memberId !== m.id);
      saveDB();
      byId('member-form').classList.add('hidden');
      renderRoster();
    }
  });
}

/* =========================================================
 * スケジュール（練習・試合／出欠／結果）
 * ======================================================= */
let currentEventId = null;

function currentEvent() {
  return DB.events.find(e => e.id === currentEventId) || null;
}

function renderSchedule() {
  const canE = canEdit();
  byId('event-new').classList.toggle('hidden', !canE);
  const todayStr = futureDate(0);
  const list = byId('event-list');
  list.innerHTML = sortedEvents().map(e => {
    const past = (e.date || '') && e.date < todayStr;
    const c = attCounts(e.id);
    return `<button class="event-chip ${e.id === currentEventId ? 'active' : ''} ${past ? 'past' : ''} type-${e.type}" data-id="${e.id}">
      <span class="ev-date">${esc(eventDateLabel(e))}</span>
      <span class="ev-title"><span class="ev-badge">${esc(EVENT_TYPES[e.type] || '')}</span>${esc(e.title || '（無題）')}</span>
      <span class="ev-sub">${e.place ? esc(e.place) : ''}${resultLabel(e) ? '　結果 ' + esc(resultLabel(e)) : ''}　<span class="ev-att">出${c.present}/欠${c.absent}/未定${c.maybe}</span></span>
    </button>`;
  }).join('') || '<p class="hint">予定はまだありません。</p>';
  const detail = byId('event-detail');
  detail.classList.toggle('hidden', !currentEventId);
  if (currentEventId) renderEventDetail();
}

function renderEventDetail() {
  const e = currentEvent();
  if (!e) { byId('event-detail').classList.add('hidden'); return; }
  const canE = canEdit();

  const menu = DB.menus.find(m => m.id === e.menuId);
  const info = [
    `<span class="ev-badge type-${e.type}">${esc(EVENT_TYPES[e.type] || '')}</span>`,
    esc(eventDateLabel(e)),
    e.place ? '📍' + esc(e.place) : '',
    e.opponent ? '🆚' + esc(e.opponent) : '',
  ].filter(Boolean).join('　');

  let result = '';
  if (e.type === 'match') {
    const r = e.result || { us: '', them: '', memo: '' };
    result = `<div class="ev-result">
      <h4>試合結果</h4>
      ${canE ? `<div class="score-row">
        <span>自チーム</span>
        <input id="ev-us" type="number" min="0" max="99" inputmode="numeric" value="${esc(r.us ?? '')}">
        <span>-</span>
        <input id="ev-them" type="number" min="0" max="99" inputmode="numeric" value="${esc(r.them ?? '')}">
        <span>相手</span>
      </div>
      <textarea id="ev-memo" rows="2" placeholder="試合の振り返り・得点者など">${esc(r.memo || '')}</textarea>
      <button id="ev-save-result" class="btn small primary">結果を保存</button>`
      : `<p class="score-view">${esc(resultLabel(e) || '結果は未記録です')}</p>${r.memo ? `<p>${nl2br(r.memo)}</p>` : ''}`}
    </div>`;
  }

  const c = attCounts(e.id);
  const rows = DB.members.map(m => {
    const s = attStatus(e.id, m.id);
    const mine = m.id === myMemberId();
    const editable = canMarkAttendance(m.id);
    const btns = Object.keys(ATT_STATES).filter(k => k !== '').map(k =>
      `<button class="att-btn ${ATT_STATES[k].cls} ${s === k ? 'on' : ''}" data-mid="${m.id}" data-st="${k}" ${editable ? '' : 'disabled'}>${ATT_STATES[k].mark}${ATT_STATES[k].label}</button>`
    ).join('');
    return `<div class="att-row ${mine ? 'mine' : ''}">
      <span class="att-name">${m.number ? '#' + esc(m.number) + ' ' : ''}${esc(m.name)}<small>${esc(m.grade || '')}</small>${mine ? '<span class="you">あなた</span>' : ''}</span>
      <span class="att-btns">${btns}</span>
    </div>`;
  }).join('') || '<p class="hint">「メンバー」タブで選手を登録すると出欠をつけられます。</p>';

  byId('event-detail').innerHTML = `
    <div class="event-head">
      <h3>${esc(e.title || '（無題）')}</h3>
      <div id="event-edit-btns" class="btn-row ${canE ? '' : 'hidden'}">
        <button id="ev-edit" class="btn small">✎ 編集</button>
        <button id="ev-print" class="btn small">🖨 出欠表</button>
        <button id="ev-del" class="btn small danger">削除</button>
      </div>
    </div>
    <div class="ev-info">${info}</div>
    ${e.note ? `<div class="ev-note">${nl2br(e.note)}</div>` : ''}
    ${menu ? `<div class="ev-note">📋 練習メニュー：<b>${esc(menu.title)}</b></div>` : ''}
    ${result}
    <div class="att-block">
      <h4>参加状況　<small>出席 ${c.present}／欠席 ${c.absent}／未定 ${c.maybe}／未回答 ${c.none}</small></h4>
      ${isPlayer() ? '<p class="hint">自分の欄をタップして出欠を回答してください。</p>' : ''}
      <div id="att-rows">${rows}</div>
    </div>`;

  bindEventDetail();
}

function bindEventDetail() {
  const e = currentEvent();
  if (!e) return;
  const editBtns = byId('event-edit-btns');
  if (editBtns) {
    const ed = byId('ev-edit'); if (ed) ed.onclick = () => openEventForm(e);
    const pr = byId('ev-print'); if (pr) pr.onclick = () => printHTML(eventSheetPrintHTML(e), false);
    const dl = byId('ev-del'); if (dl) dl.onclick = () => {
      if (confirm(`「${e.title || ''}」を削除しますか？`)) {
        DB.events = DB.events.filter(x => x.id !== e.id);
        DB.attendance = DB.attendance.filter(a => a.eventId !== e.id);
        currentEventId = null;
        saveDB();
        renderSchedule();
      }
    };
  }
  const sr = byId('ev-save-result');
  if (sr) sr.onclick = () => {
    const us = byId('ev-us').value;
    const them = byId('ev-them').value;
    e.result = {
      us: us === '' ? '' : Math.max(0, parseInt(us, 10) || 0),
      them: them === '' ? '' : Math.max(0, parseInt(them, 10) || 0),
      memo: byId('ev-memo').value.trim(),
    };
    saveDB();
    renderSchedule();
  };
  const rows = byId('att-rows');
  if (rows) rows.addEventListener('click', ev => {
    const b = ev.target.closest('.att-btn');
    if (!b || b.disabled) return;
    const mid = b.dataset.mid;
    if (!canMarkAttendance(mid)) return;
    setAttendance(e.id, mid, b.dataset.st);
  });
}

function setAttendance(eventId, memberId, status) {
  const id = eventId + '__' + memberId;
  let a = DB.attendance.find(x => x.id === id);
  const cur = a ? a.status : '';
  const next = (cur === status) ? '' : status; // 同じボタンで解除
  if (!a) {
    a = { id, eventId, memberId, status: next, by: (window.TEAM_USER && window.TEAM_USER.name) || '' };
    DB.attendance.push(a);
  } else {
    a.status = next;
    a.by = (window.TEAM_USER && window.TEAM_USER.name) || a.by || '';
  }
  saveDB();
  renderEventDetail();
  // 一覧の集計も更新
  const chip = byId('event-list').querySelector(`.event-chip[data-id="${eventId}"] .ev-att`);
  if (chip) { const c = attCounts(eventId); chip.textContent = `出${c.present}/欠${c.absent}/未定${c.maybe}`; }
}

function openEventForm(e) {
  const isNew = !e;
  const ev = e || { id: uid('e'), type: 'practice', title: '', date: futureDate(0), start: '', end: '', place: '', opponent: '', note: '', menuId: '', result: null };
  byId('event-form-title').textContent = isNew ? '新しい予定' : '予定を編集';
  byId('ef-type').value = ev.type;
  byId('ef-title').value = ev.title;
  byId('ef-date').value = ev.date;
  byId('ef-start').value = ev.start;
  byId('ef-end').value = ev.end;
  byId('ef-place').value = ev.place;
  byId('ef-opponent').value = ev.opponent;
  byId('ef-note').value = ev.note;
  byId('ef-menu').innerHTML = '<option value="">（なし）</option>' +
    DB.menus.map(m => `<option value="${m.id}"${m.id === ev.menuId ? ' selected' : ''}>${esc(m.title || '（無題）')}</option>`).join('');
  byId('event-form').dataset.id = ev.id;
  byId('event-form').dataset.new = isNew ? '1' : '';
  updateEventFormType();
  byId('event-form').classList.remove('hidden');
  byId('event-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateEventFormType() {
  byId('ef-opponent-wrap').classList.toggle('hidden', byId('ef-type').value !== 'match');
}

function initScheduleTab() {
  byId('event-new').addEventListener('click', () => openEventForm(null));
  byId('schedule-print').addEventListener('click', () => printHTML(scheduleListPrintHTML(sortedEvents()), true));
  byId('schedule-export').addEventListener('click', () => {
    downloadJSON(
      { app: 'soccer-coach-note', version: 1, kind: 'schedule', events: DB.events, attendance: DB.attendance, members: DB.members },
      `スケジュール_${today()}.json`
    );
  });
  byId('event-list').addEventListener('click', e => {
    const b = e.target.closest('.event-chip');
    if (!b) return;
    currentEventId = b.dataset.id;
    renderSchedule();
    byId('event-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  byId('ef-type').addEventListener('change', updateEventFormType);
  byId('ef-save').addEventListener('click', () => {
    const form = byId('event-form');
    const id = form.dataset.id;
    const title = byId('ef-title').value.trim();
    if (!title) { alert('内容（タイトル）を入力してください'); return; }
    const type = byId('ef-type').value;
    const data = {
      type, title,
      date: byId('ef-date').value,
      start: byId('ef-start').value,
      end: byId('ef-end').value,
      place: byId('ef-place').value.trim(),
      opponent: type === 'match' ? byId('ef-opponent').value.trim() : '',
      note: byId('ef-note').value.trim(),
      menuId: byId('ef-menu').value,
    };
    const existing = DB.events.find(x => x.id === id);
    if (existing) {
      Object.assign(existing, data);
    } else {
      DB.events.push(Object.assign({ id, result: null }, data));
    }
    currentEventId = id;
    saveDB();
    form.classList.add('hidden');
    renderSchedule();
  });
  byId('ef-cancel').addEventListener('click', () => byId('event-form').classList.add('hidden'));
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
  if (currentEventId && !DB.events.some(e => e.id === currentEventId)) currentEventId = null;
  const active = document.querySelector('.tab-btn.active');
  showTab(active ? active.dataset.tab : 'menus');
};

/** 権限に応じて画面の表示・初期タブを整える（チーム共有版で呼ばれる）*/
function applyRoleUI() {
  document.body.classList.toggle('role-player', isPlayer());
}

document.addEventListener('DOMContentLoaded', async () => {
  let loaded = null;
  try { loaded = await store().load(); } catch (e) { console.warn('初期データの読み込みに失敗:', e); }
  DB = normalizeDB(loaded || seedDB());
  if (!loaded) saveDB();

  applyRoleUI();

  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab-btn');
    if (b) showTab(b.dataset.tab);
  });

  fillSelect('menu-age', [''].concat(AGE_GROUPS));
  fillSelect('df-category', CATEGORIES);
  fillSelect('df-age', AGE_GROUPS);
  fillSelect('mf-grade', GRADES);

  initMenusTab();
  initDrillsTab();
  initBoardTab();
  initFormationTab();
  initScheduleTab();
  initRosterTab();
  initDataTab();

  if (DB.menus.length) currentMenuId = DB.menus[0].id;
  // プレイヤーはまずスケジュール（出欠回答）を開く
  showTab(isPlayer() ? 'schedule' : 'menus');
});
