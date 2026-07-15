'use strict';

/* =========================================================
 * 戦術ボード 描画エンジン
 * SVGでコートと駒(選手・ボール・コーン等)を描画し、
 * タッチ/マウスで配置・移動・矢印・フリーハンド描画ができる。
 * ======================================================= */

/* ---- コート定義 ---- */
const FIELD_DEFS = {
  full:  { w: 1050, h: 680,  label: 'コート全面（横）' },
  half:  { w: 680,  h: 525,  label: 'ハーフコート' },
  blank: { w: 1050, h: 680,  label: 'フリースペース（線なし）' },
  vfull: { w: 680,  h: 1050, label: 'コート全面（縦）' },
};

const PALETTE = ['#e02f2f', '#1f6fe0', '#ffd23f', '#ffffff', '#111111'];
const TEAM_COLORS = { home: '#1f6fe0', away: '#e02f2f' };

function escXML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---- コート(ピッチ)のSVG文字列 ---- */
function fieldSVG(type, theme) {
  const d = FIELD_DEFS[type] || FIELD_DEFS.full;
  const print = theme === 'print';
  const grass = print ? '#ffffff' : '#2f8a4e';
  const line = print ? '#8a8a8a' : '#ffffff';
  const lw = 3;
  const R = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${line}" stroke-width="${lw}"/>`;
  const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${line}" stroke-width="${lw}"/>`;
  const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${line}" stroke-width="${lw}"/>`;
  const DOT = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="4" fill="${line}"/>`;
  const ARC = (path) => `<path d="${path}" fill="none" stroke="${line}" stroke-width="${lw}"/>`;
  const GOAL = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${line}" stroke-width="${lw}"/>`;

  let s = `<rect x="0" y="0" width="${d.w}" height="${d.h}" rx="10" fill="${grass}"/>`;

  // 芝の縞模様（画面表示のみ）
  if (!print && type !== 'blank') {
    const n = 10;
    if (d.w >= d.h) {
      const sw = (d.w - 50) / n;
      for (let i = 0; i < n; i += 2) s += `<rect x="${25 + sw * i}" y="25" width="${sw}" height="${d.h - 50}" fill="rgba(255,255,255,0.055)"/>`;
    } else {
      const sh = (d.h - 50) / n;
      for (let i = 0; i < n; i += 2) s += `<rect x="25" y="${25 + sh * i}" width="${d.w - 50}" height="${sh}" fill="rgba(255,255,255,0.055)"/>`;
    }
  }

  if (type === 'full') {
    // 横向きフルコート 1050x680（外枠 25,25 1000x630）
    s += R(25, 25, 1000, 630);
    s += L(525, 25, 525, 655);
    s += C(525, 340, 92) + DOT(525, 340);
    // ペナルティエリア・ゴールエリア（左右）
    s += R(25, 138.5, 165, 403) + R(25, 248.5, 55, 183);
    s += R(860, 138.5, 165, 403) + R(970, 248.5, 55, 183);
    s += DOT(135, 340) + DOT(915, 340);
    s += ARC('M190 266.3 A92 92 0 0 1 190 413.7');
    s += ARC('M860 266.3 A92 92 0 0 0 860 413.7');
    s += GOAL(17, 303, 8, 74) + GOAL(1025, 303, 8, 74);
  } else if (type === 'half') {
    // 縦向きハーフコート 680x525（ゴールが上）
    s += R(25, 25, 630, 475);
    s += R(154, 25, 372, 152) + R(255.5, 25, 169, 51);
    s += DOT(340, 135);
    s += ARC('M258.1 177 A92 92 0 0 0 421.9 177');
    s += GOAL(303, 17, 74, 8);
    // 下端＝ハーフウェーライン、センターサークル半分
    s += ARC('M248 500 A92 92 0 0 1 432 500');
    s += DOT(340, 500);
  } else if (type === 'vfull') {
    // 縦向きフルコート 680x1050（外枠 25,25 630x1000）
    s += R(25, 25, 630, 1000);
    s += L(25, 525, 655, 525);
    s += C(340, 525, 92) + DOT(340, 525);
    s += R(138.5, 25, 403, 165) + R(248.5, 25, 183, 55);
    s += R(138.5, 860, 403, 165) + R(248.5, 970, 183, 55);
    s += DOT(340, 135) + DOT(340, 915);
    s += ARC('M266.3 190 A92 92 0 0 0 413.7 190');
    s += ARC('M266.3 860 A92 92 0 0 1 413.7 860');
    s += GOAL(303, 17, 74, 8) + GOAL(303, 1025, 74, 8);
  } else if (type === 'blank') {
    s += `<rect x="25" y="25" width="${d.w - 50}" height="${d.h - 50}" fill="none" stroke="${line}" stroke-width="${lw}" stroke-dasharray="16 14" rx="8"/>`;
  }
  return s;
}

/* ---- 矢印マーカー(defs) ---- */
function markerIdFor(prefix, color) {
  return `ah-${prefix}-${String(color).replace('#', '')}`;
}

function boardDefs(prefix, els) {
  const colors = new Set(PALETTE);
  colors.add('#333333');
  (els || []).forEach(e => { if (e.color) colors.add(e.color); });
  const markers = [...colors].map(c =>
    `<marker id="${markerIdFor(prefix, c)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="20" markerHeight="20" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 Z" fill="${c}"/></marker>`
  ).join('');
  return `<defs>${markers}</defs>`;
}

/* 印刷（白背景）時に白い線が見えなくならないよう色を補正 */
function printableColor(color, print) {
  if (print && String(color).toLowerCase() === '#ffffff') return '#333333';
  return color;
}

/* ---- 駒1つ分のSVG ---- */
function renderElement(el, i, theme, prefix) {
  const print = theme === 'print';
  const g = (inner, cursor) => `<g data-i="${i}" style="cursor:${cursor || 'grab'}">${inner}</g>`;
  switch (el.type) {
    case 'player': {
      const c = TEAM_COLORS[el.team] || TEAM_COLORS.home;
      return g(
        `<circle cx="${el.x}" cy="${el.y}" r="18" fill="${c}" stroke="#ffffff" stroke-width="2.5"/>` +
        `<text x="${el.x}" y="${el.y}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="15" font-weight="700" fill="#ffffff">${escXML(el.label)}</text>`
      );
    }
    case 'ball':
      return g(
        `<circle cx="${el.x}" cy="${el.y}" r="11" fill="#ffffff" stroke="#222222" stroke-width="2"/>` +
        `<circle cx="${el.x}" cy="${el.y}" r="4" fill="#222222"/>`
      );
    case 'cone':
      return g(
        `<path d="M${el.x - 12} ${el.y + 10} L${el.x} ${el.y - 14} L${el.x + 12} ${el.y + 10} Z" fill="#ff8c1a" stroke="#b45309" stroke-width="2"/>`
      );
    case 'marker':
      return g(
        `<ellipse cx="${el.x}" cy="${el.y}" rx="12" ry="5.5" fill="#ffd23f" stroke="#c9a11a" stroke-width="2"/>`
      );
    case 'minigoal': {
      const c = print ? '#555555' : '#f2f2f2';
      return g(
        `<rect x="${el.x - 32}" y="${el.y - 9}" width="64" height="18" fill="none" stroke="${c}" stroke-width="4"/>` +
        `<line x1="${el.x - 16}" y1="${el.y - 9}" x2="${el.x - 16}" y2="${el.y + 9}" stroke="${c}" stroke-width="1.5"/>` +
        `<line x1="${el.x}" y1="${el.y - 9}" x2="${el.x}" y2="${el.y + 9}" stroke="${c}" stroke-width="1.5"/>` +
        `<line x1="${el.x + 16}" y1="${el.y - 9}" x2="${el.x + 16}" y2="${el.y + 9}" stroke="${c}" stroke-width="1.5"/>`
      );
    }
    case 'arrow': {
      const c = printableColor(el.color || PALETTE[0], print);
      const dash = el.dash ? ' stroke-dasharray="14 12"' : '';
      return g(
        `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="#000000" stroke-opacity="0" stroke-width="18"/>` +
        `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${c}" stroke-width="5" stroke-linecap="round"${dash} marker-end="url(#${markerIdFor(prefix, c)})"/>`
      );
    }
    case 'pen': {
      const c = printableColor(el.color || PALETTE[0], print);
      const pts = (el.points || []).map(p => `${p[0]},${p[1]}`).join(' ');
      return g(
        `<polyline points="${pts}" fill="none" stroke="#000000" stroke-opacity="0" stroke-width="18"/>` +
        `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
    case 'text': {
      const c = printableColor(el.color || '#111111', print);
      const halo = print ? '#ffffff' : 'rgba(255,255,255,0.9)';
      return g(
        `<text x="${el.x}" y="${el.y}" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="800" fill="${c}" stroke="${halo}" stroke-width="5" paint-order="stroke">${escXML(el.text)}</text>`
      );
    }
  }
  return '';
}

/* ---- ボードデータ → 完結したSVG文字列（プレビュー・印刷・PNG用）---- */
let _svgSeq = 0;
function boardSVG(data, theme) {
  theme = theme || 'screen';
  const d = FIELD_DEFS[data.field] || FIELD_DEFS.full;
  const prefix = 'v' + (++_svgSeq);
  const els = data.elements || [];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}">` +
    boardDefs(prefix, els) + fieldSVG(data.field, theme) +
    els.map((el, i) => renderElement(el, i, theme, prefix)).join('') +
    `</svg>`;
}

/* ---- 駒の移動（種類ごとの座標形式を吸収）---- */
function moveElement(el, dx, dy) {
  if (el.points) {
    el.points = el.points.map(p => [p[0] + dx, p[1] + dy]);
  } else if (el.x1 !== undefined) {
    el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy;
  } else {
    el.x += dx; el.y += dy;
  }
}

/* =========================================================
 * BoardEditor : SVG要素に対する編集操作（タッチ対応）
 * ======================================================= */
class BoardEditor {
  constructor(svg, opts) {
    opts = opts || {};
    this.svg = svg;
    this.prefix = opts.prefix || 'ed';
    this.elements = [];
    this.field = 'full';
    this.tool = 'select';
    this.color = PALETTE[0];
    this.undoStack = [];
    this.temp = null;
    this.drag = null;
    this.onChange = opts.onChange || (() => {});
    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', e => this.down(e));
    svg.addEventListener('pointermove', e => this.move(e));
    svg.addEventListener('pointerup', e => this.up(e));
    svg.addEventListener('pointercancel', e => this.up(e));
    this.render();
  }

  setField(f) { this.snapshot(); this.field = f; this.render(); this.onChange(); }

  load(data) {
    this.elements = JSON.parse(JSON.stringify(data.elements || []));
    this.field = data.field || 'full';
    this.undoStack = [];
    this.temp = null;
    this.drag = null;
    this.render();
  }

  serialize() {
    return { field: this.field, elements: JSON.parse(JSON.stringify(this.elements)) };
  }

  snapshot() {
    this.undoStack.push(JSON.stringify({ f: this.field, e: this.elements }));
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    const o = JSON.parse(s);
    this.field = o.f;
    this.elements = o.e;
    this.render();
    this.onChange();
  }

  clearAll() {
    if (!this.elements.length) return;
    this.snapshot();
    this.elements = [];
    this.render();
    this.onChange();
  }

  pt(e) {
    const p = this.svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const m = this.svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  hit(e) {
    const g = e.target.closest ? e.target.closest('[data-i]') : null;
    if (!g) return -1;
    const i = +g.getAttribute('data-i');
    return i >= 0 && i < this.elements.length ? i : -1;
  }

  nextLabel(team) {
    return String(this.elements.filter(el => el.type === 'player' && el.team === team).length + 1);
  }

  makeStamp(t, p) {
    switch (t) {
      case 'home':   return { type: 'player', team: 'home', x: p.x, y: p.y, label: this.nextLabel('home') };
      case 'away':   return { type: 'player', team: 'away', x: p.x, y: p.y, label: this.nextLabel('away') };
      case 'ball':   return { type: 'ball', x: p.x, y: p.y };
      case 'cone':   return { type: 'cone', x: p.x, y: p.y };
      case 'marker': return { type: 'marker', x: p.x, y: p.y };
      case 'goal':   return { type: 'minigoal', x: p.x, y: p.y };
    }
    return null;
  }

  down(e) {
    e.preventDefault();
    try { this.svg.setPointerCapture(e.pointerId); } catch (_) {}
    const p = this.pt(e);
    const t = this.tool;
    if (t === 'select') {
      const i = this.hit(e);
      if (i >= 0) {
        this.snapshot();
        this.drag = { i, sx: p.x, sy: p.y, orig: JSON.parse(JSON.stringify(this.elements[i])), moved: false };
      }
    } else if (t === 'erase') {
      const i = this.hit(e);
      if (i >= 0) {
        this.snapshot();
        this.elements.splice(i, 1);
        this.render();
        this.onChange();
      }
    } else if (t === 'arrow' || t === 'parrow') {
      this.temp = { type: 'arrow', dash: t === 'parrow', color: this.color, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    } else if (t === 'pen') {
      this.temp = { type: 'pen', color: this.color, points: [[p.x, p.y]] };
    } else if (t === 'text') {
      const v = prompt('テキストを入力してください');
      if (v && v.trim()) {
        this.snapshot();
        this.elements.push({ type: 'text', x: p.x, y: p.y, text: v.trim(), color: this.color });
        this.render();
        this.onChange();
      }
    } else {
      const el = this.makeStamp(t, p);
      if (el) {
        this.snapshot();
        this.elements.push(el);
        this.render();
        this.onChange();
      }
    }
  }

  move(e) {
    if (this.drag) {
      const p = this.pt(e);
      const dx = p.x - this.drag.sx, dy = p.y - this.drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      const el = JSON.parse(JSON.stringify(this.drag.orig));
      moveElement(el, dx, dy);
      this.elements[this.drag.i] = el;
      this.render();
    } else if (this.temp) {
      const p = this.pt(e);
      if (this.temp.type === 'arrow') {
        this.temp.x2 = p.x; this.temp.y2 = p.y;
      } else {
        const pts = this.temp.points;
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) > 4) pts.push([p.x, p.y]);
      }
      this.render();
    }
  }

  up() {
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (!d.moved) {
        this.undoStack.pop(); // 動かしていないので履歴は不要
        this.tapEdit(d.i);    // タップ＝ラベル編集
      } else {
        this.onChange();
      }
    }
    if (this.temp) {
      const t = this.temp;
      this.temp = null;
      const ok = t.type === 'arrow'
        ? Math.hypot(t.x2 - t.x1, t.y2 - t.y1) > 12
        : t.points.length > 1;
      if (ok) {
        this.snapshot();
        this.elements.push(t);
        this.onChange();
      }
      this.render();
    }
  }

  tapEdit(i) {
    const el = this.elements[i];
    if (!el) return;
    if (el.type === 'player') {
      const v = prompt('選手の番号・ラベルを入力（例: 7 / GK / たろう）', el.label);
      if (v !== null) {
        this.snapshot();
        el.label = v.trim();
        this.render();
        this.onChange();
      }
    } else if (el.type === 'text') {
      const v = prompt('テキストを編集', el.text);
      if (v !== null && v.trim()) {
        this.snapshot();
        el.text = v.trim();
        this.render();
        this.onChange();
      }
    }
  }

  render() {
    const d = FIELD_DEFS[this.field] || FIELD_DEFS.full;
    this.svg.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`);
    const els = this.elements.slice();
    if (this.temp) els.push(this.temp);
    this.svg.innerHTML =
      boardDefs(this.prefix, els) +
      fieldSVG(this.field, 'screen') +
      els.map((el, i) => renderElement(el, i, 'screen', this.prefix)).join('');
  }
}
