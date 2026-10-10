import './styles.css';
import type { DownloadFile, Floor, Graph, Notice, Room, SharedTool, Todo } from './types';
import { assetUrl, escapeHtml as h, humanSize } from './utils/paths';
import { isExpired, parseDeadline, partitionFiles, todoStatus } from './utils/deadlines.js';
import { floorAt, parseRoomId, routeForRooms, searchRooms, segmentRoute, toSvgPoint, type Route } from './navigation/core';

type Page = 'home' | 'notices' | 'files' | 'map' | 'todos' | 'todo' | 'tools';
const app = document.querySelector<HTMLDivElement>('#app')!;
const state: { page: Page; floor: number; zoom: number; start: string; end: string; route: Route | null; noticeQuery: string; fileQuery: string; fileCategory: string; noticeId: string | null; noticeError: string | null; fileError: string | null; todoError: string | null; toolsError: string | null } = {
  page: 'home', floor: 1, zoom: 1, start: '', end: '', route: null, noticeQuery: '', fileQuery: '', fileCategory: '全部', noticeId: null, noticeError: null, fileError: null, todoError: null, toolsError: null,
};
let notices: Notice[] = [], todos: Todo[] = [], sharedTools: SharedTool[] = [], files: DownloadFile[] = [], rooms: Room[] = [], floors: Floor[] = [], graph: Graph = { version: 1, nodes: [], edges: [] };
const pathMap: Record<string, Page> = { home: 'home', notices: 'notices', files: 'files', map: 'map', todos: 'todos', todo: 'todo', tools: 'tools' };

async function json<T>(path: string): Promise<T> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`${path} 加载失败（${response.status}）`);
  return response.json() as Promise<T>;
}

function currentPage(): Page { return pathMap[location.hash.slice(1).split('/')[0]] || 'home'; }
function setPage(page: Page) { location.hash = page; state.page = page; state.noticeId = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function icon(ext: string) { return ({ pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', ppt: 'PPT', pptx: 'PPT', zip: 'ZIP' } as Record<string, string>)[ext] || ext.slice(0, 4).toUpperCase(); }

function layout(content: string) {
  const nav: [Page, string][] = [['home', '首页'], ['todos', '待办清单'], ['notices', '通知公告'], ['tools', '工具分享'], ['files', '文件下载'], ['map', '躬行楼导航']];
  app.innerHTML = `<header class="site-header"><div class="header-inner"><a class="brand" href="#home" aria-label="班级信息服务平台首页"><span class="brand-mark">班</span><span><strong>班级信息服务平台</strong><small>早上中午晚上凌晨好~ (｡•ᴗ•｡)</small></span></a><nav class="nav" aria-label="主导航">${nav.map(([id, label]) => `<a href="#${id}" class="${state.page === id || (state.page === 'todo' && id === 'todos') ? 'active' : ''}" ${state.page === id || (state.page === 'todo' && id === 'todos') ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><button class="theme-button" id="theme-toggle" aria-label="切换明暗模式">◐</button></div></header><main>${content}</main><footer class="footer"><div class="footer-inner"><div><strong>班级信息服务平台</strong><p>摸鱼中。。。 ( ´ ▽ ｀ )ﾉ</p></div><p>待办 · 通知 · 工具 · 文件 · 地图</p></div></footer>`;
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; localStorage.setItem('theme', next);
  });
}

function pageHead(eyebrow: string, title: string, desc: string) { return `<div class="page-heading"><h1>${title}</h1><p>${desc}</p></div>`; }
function empty(message: string) { return `<div class="empty"><span>◎</span><p>${message}</p></div>`; }
function noticeCard(n: Notice) { return `<button class="notice-card" data-notice="${h(n.id)}"><span class="notice-date">${h(n.date)} <b>·</b> ${h(n.category)}</span><strong>${h(n.title)}</strong><span class="notice-tail">${n.important ? '<em>重要</em>' : ''}<span>查看 ↗</span></span></button>`; }
function sortedTodos() { const now = Date.now(); return [...todos].sort((a, b) => Number(isExpired(a.dueAt, now)) - Number(isExpired(b.dueAt, now)) || (parseDeadline(a.dueAt) ?? Infinity) - (parseDeadline(b.dueAt) ?? Infinity)); }
function todoBadge(todo: Todo, now = Date.now()) { return `<span class="deadline-badge ${isExpired(todo.dueAt, now) ? 'ended' : ''}" data-todo-status="${h(todo.id)}">${todoStatus(todo, now)}</span>`; }
function todoTable(items: Todo[]) {
  return `<div class="todo-table-wrap"><table class="todo-table"><thead><tr><th scope="col">内容</th><th scope="col">要求</th><th scope="col">开始时间 / 截止时间（UTC+8）</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>${items.map(todo => `<tr><td data-label="内容"><strong>${h(todo.content)}</strong>${todoBadge(todo)}</td><td data-label="要求">${h(todo.requirements)}</td><td data-label="时间"><span class="todo-dates"><span>开始 ${h(todo.startAt)}</span><span>截止 ${h(todo.dueAt)}</span></span></td><td class="todo-action"><button class="todo-detail-link" data-todo="${h(todo.id)}" aria-label="查看${h(todo.content)}详情">查看详情 →</button></td></tr>`).join('')}</tbody></table></div>`;
}
function toolUrl(value: string) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function toolCard(tool: SharedTool) {
  const url = toolUrl(tool.url);
  return `<article class="tool-card"><span class="notice-date">${h(tool.date)} · ${h(tool.category)}</span><h3>${h(tool.title)}</h3><p>${h(tool.description)}</p>${url ? `<a class="tool-open" href="${h(url)}" target="_blank" rel="noopener noreferrer">打开工具 ↗</a>` : '<span class="tool-unavailable">暂无有效链接</span>'}</article>`;
}

function home() {
  const pinned = notices.filter(n => n.important).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  const activeFiles = partitionFiles(files).active;
  layout(`<section class="hero"><div class="hero-content"><span class="hero-kicker"><i></i> S6062服务平台</span><h1>通知 · 文件<br><span>还有地图</span></h1><p>今天也别忘了看通知呀 ( •̀ ω •́ )✧</p><div class="hero-actions"><button class="btn btn-primary" data-page="notices">查看通知 <span>↗</span></button><button class="btn btn-light" data-page="map">打开地图 <span>→</span></button></div></div><div class="hero-art" aria-hidden="true"><div class="art-ring ring-a"></div><div class="art-ring ring-b"></div><div class="art-card art-card-1"><span>◈</span><div>通知公告<small>谁又没看通知 (¬‿¬)</small></div></div><div class="art-card art-card-2"><span>⌖</span><div>躬行楼地图<small>走走走，别迷路 (ง •̀_•́)ง</small></div></div><div class="art-card art-card-3"><span>⇩</span><div>文件中心<small>需要就拿走 (๑•̀ㅂ•́)و✧</small></div></div></div></section>
  <section class="section home-todos"><div class="section-title"><div><h2>你可能的待办清单</h2><p class="section-note">ddl战神出列！(｀・ω・´)ゞ</p></div><button class="text-link" data-page="todos">全部待办 →</button></div>${state.todoError ? empty(h(state.todoError)) : todos.length ? todoTable(sortedTodos().slice(0, 5)) : empty('暂无待办事项')}</section>
  <section class="section two-col"><div><div class="section-title"><div><h2>通知</h2><p class="section-note">谁又没看通知 (¬‿¬)</p></div><button class="text-link" data-page="notices">全部通知 →</button></div>${pinned.length ? pinned.map(noticeCard).join('') : empty('暂无重要通知')}</div><div class="feature-card"><span class="feature-icon">⌖</span><h2>躬行楼<br>室内地图</h2><p>别迷路啦 (ง •̀_•́)ง</p><button class="btn btn-white" data-page="map">打开地图 <span>→</span></button><div class="feature-lines"></div></div></section>
  <section class="section"><div class="section-title"><div><h2>文件下载</h2><p class="section-note">需要就拿走 (๑•̀ㅂ•́)و✧</p></div><button class="text-link" data-page="files">全部文件 →</button></div><div class="file-preview">${activeFiles.length ? activeFiles.slice(0, 3).map(f => `<div class="preview-row"><span class="file-icon">${icon(f.extension)}</span><span><strong>${h(f.name)}</strong><small>${h(f.category)} · ${humanSize(f.size)} &middot; ${fileDeadline(f)}</small></span><a href="${assetUrl(`downloads/${f.relativePath}`)}" download="${h(f.name)}" aria-label="下载${h(f.name)}">⇩</a></div>`).join('') : empty('暂无可公开的文件')}</div></section>
  <section class="section"><div class="section-title"><div><h2>工具分享</h2><p class="section-note">AI工具精选（真精选么）</p></div><button class="text-link" data-page="tools">全部工具 →</button></div>${state.toolsError ? empty(h(state.toolsError)) : sharedTools.length ? `<div class="tool-grid">${[...sharedTools].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map(toolCard).join('')}</div>` : empty('暂无工具分享')}</section>
  <div class="home-signoff">今天也辛苦啦 ( ´ ▽ ｀ )ﾉ</div>`);
}

function noticesPage() {
  const sorted = [...notices].sort((a, b) => Number(b.important) - Number(a.important) || b.date.localeCompare(a.date));
  const filtered = sorted.filter(n => `${n.title} ${n.body} ${n.category}`.toLowerCase().includes(state.noticeQuery.toLowerCase()));
  layout(`<div class="container">${pageHead('NOTICE BOARD', '通知公告', '谁又没看通知 (¬‿¬)')}<div class="toolbar"><label class="search"><span>⌕</span><input id="notice-search" type="search" placeholder="搜索通知" value="${h(state.noticeQuery)}" /></label><span class="count">共 ${filtered.length} 条通知</span></div><div id="notice-list" class="notice-list">${state.noticeError ? empty(h(state.noticeError)) : filtered.length ? filtered.map(noticeCard).join('') : empty('没有找到匹配的通知')}</div></div>${state.noticeId ? noticeDialog() : ''}`);
  document.querySelector<HTMLInputElement>('#notice-search')?.addEventListener('input', e => {
    state.noticeQuery = (e.target as HTMLInputElement).value;
    const matches = sorted.filter(n => `${n.title} ${n.body} ${n.category}`.toLowerCase().includes(state.noticeQuery.toLowerCase()));
    document.querySelector('.count')!.textContent = `共 ${matches.length} 条通知`;
    document.querySelector('#notice-list')!.innerHTML = state.noticeError ? empty(h(state.noticeError)) : matches.length ? matches.map(noticeCard).join('') : empty('没有找到匹配的通知');
  });
}

function noticeDialog() { const n = notices.find(item => item.id === state.noticeId); return n ? `<div class="modal-backdrop" id="notice-backdrop"><article class="modal" role="dialog" aria-modal="true" aria-labelledby="notice-title"><button id="close-notice" class="close" aria-label="关闭">×</button><span class="notice-date">${h(n.date)} · ${h(n.category)}</span><h2 id="notice-title">${h(n.title)}</h2><p>${h(n.body).replace(/\n/g, '<br>')}</p></article></div>` : ''; }

function todosPage() {
  layout(`<div class="container content-page">${pageHead('TO DO LIST', '你可能的待办清单', '按截止时间排列，点击“查看详情”了解完整安排。')}${state.todoError ? empty(h(state.todoError)) : todos.length ? todoTable(sortedTodos()) : empty('暂无待办事项')}</div>`);
}

function todoDetailPage() {
  let id = '';
  try { id = decodeURIComponent(location.hash.slice('#todo/'.length)); } catch { /* Invalid route shows the missing item state. */ }
  const todo = todos.find(item => item.id === id);
  layout(`<div class="container content-page"><button class="text-link back-link" data-page="todos">← 返回待办清单</button>${todo ? `<article class="todo-detail"><span class="detail-kicker">待办详情</span><h1>${h(todo.content)}</h1>${todoBadge(todo)}<div class="detail-grid"><div><span>开始时间（UTC+8）</span><strong>${h(todo.startAt)}</strong></div><div><span>截止时间（UTC+8）</span><strong>${h(todo.dueAt)}</strong></div></div><section><h2>要求</h2><p>${h(todo.requirements).replace(/\n/g, '<br>')}</p></section><section><h2>详细说明</h2><p>${h(todo.details).replace(/\n/g, '<br>')}</p></section></article>` : empty('未找到这条待办事项')}</div>`);
}

function toolsPage() {
  const sorted = [...sharedTools].sort((a, b) => b.date.localeCompare(a.date));
  layout(`<div class="container content-page">${pageHead('TOOL SHARING', '工具分享', '平日想分享给大家的工具，都在这里。')}${state.toolsError ? empty(h(state.toolsError)) : sorted.length ? `<div class="tool-grid">${sorted.map(toolCard).join('')}</div>` : empty('暂无工具分享')}</div>`);
}

function fileDeadline(file: DownloadFile, now = Date.now()) {
  if (!file.dueAt) return '长期有效';
  if (parseDeadline(file.dueAt) === null) return '截止时间待确认';
  return `${isExpired(file.dueAt, now) ? '已过期 · ' : ''}截止 ${h(file.dueAt)}（UTC+8）`;
}
function fileRow(file: DownloadFile, now: number) {
  return `<article class="file-row"><div class="file-icon">${icon(file.extension)}</div><div class="file-info"><h3>${h(file.name)}</h3><p>${h(file.category)} <span>·</span> ${file.extension.toUpperCase()} <span>·</span> ${humanSize(file.size)}</p><p class="file-deadline ${isExpired(file.dueAt, now) ? 'ended' : ''}">${fileDeadline(file, now)}</p></div><a class="download" href="${assetUrl(`downloads/${file.relativePath}`)}" download="${h(file.name)}">下载 <span>↓</span></a></article>`;
}
function updateFileList(now = Date.now()) {
  const groups = partitionFiles(files, now);
  const pool = state.fileCategory === '过期文件' ? groups.expired : groups.active;
  const matches = pool.filter(file => (['全部', '过期文件'].includes(state.fileCategory) || file.category === state.fileCategory) && file.name.toLowerCase().includes(state.fileQuery.toLowerCase()));
  document.querySelector('.count')!.textContent = `${matches.length} 个文件`;
  document.querySelector('.file-list')!.innerHTML = state.fileError ? empty(h(state.fileError)) : matches.length ? matches.map(file => fileRow(file, now)).join('') : empty(state.fileCategory === '过期文件' ? '暂无过期文件' : '没有找到符合条件的有效文件');
  const archiveButton = document.querySelector('[data-category="过期文件"]');
  if (archiveButton) archiveButton.textContent = `过期文件（${groups.expired.length}）`;
}
function filesPage() {
  const categories = ['全部', ...new Set(files.map(file => file.category)), '过期文件'];
  layout(`<div class="container">${pageHead('RESOURCE LIBRARY', '文件下载', '截止时间按 UTC+8 计算，到期文件自动归入“过期文件”。')}<div class="toolbar"><label class="search"><span>⌕</span><input id="file-search" type="search" placeholder="搜索文件名称" value="${h(state.fileQuery)}" /></label><span class="count"></span></div><div class="tabs" role="group" aria-label="文件目录">${categories.map(category => `<button data-category="${h(category)}" class="${state.fileCategory === category ? 'selected' : ''}">${h(category)}</button>`).join('')}</div><div class="file-list"></div><p class="privacy-note">过期文件保留下载，未设置截止时间的文件长期有效。</p></div>`);
  updateFileList();
  document.querySelector<HTMLInputElement>('#file-search')?.addEventListener('input', event => {
    state.fileQuery = (event.target as HTMLInputElement).value;
    updateFileList();
  });
}

function marker(room: Room, kind: 'start' | 'end') { const p = toSvgPoint(state.route && room.entrancePosition ? room.entrancePosition : room.labelPosition); return `<g class="map-marker ${kind}"><circle cx="${p.x}" cy="${p.y}" r="14"/><circle cx="${p.x}" cy="${p.y}" r="5"/></g>`; }
function mapOverlay() {
  const start = rooms.find(r => r.id === state.start); const end = rooms.find(r => r.id === state.end);
  const segment = state.route && segmentRoute(state.route).find(s => s.floor === state.floor);
  const polyline = segment && segment.nodes.length > 1 ? `<polyline class="route-line" points="${segment.nodes.map(n => `${n.x * 1000},${n.y * 1000}`).join(' ')}"/>` : '';
  return `<svg class="map-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${polyline}${start?.floor === state.floor ? marker(start, 'start') : ''}${end?.floor === state.floor ? marker(end, 'end') : ''}</svg>`;
}

function mapPage() {
  const floor = floors.find(f => f.floor === state.floor);
  const selected = [state.start, state.end].filter(Boolean).map(id => rooms.find(r => r.id === id)).filter(Boolean) as Room[];
  const suggestions = rooms.slice(0, 0);
  layout(`<div class="container map-container">${pageHead('GONGXING BUILDING', '躬行楼室内导航', '走走走，别迷路 (ง •̀_•́)ง')}<div class="map-layout"><aside class="map-sidebar"><div class="panel-head"><span class="step">01</span><div><h2>查找房间</h2><p>房号输进来 ( •̀ ω •́ )✧</p></div></div><label class="field-label" for="start-room">起点房间</label><div class="input-wrap"><span class="dot green"></span><input id="start-room" list="room-suggestions" placeholder="例如 1-001" value="${h(state.start)}" autocomplete="off" /></div><button class="swap" id="swap-rooms" title="交换起终点" aria-label="交换起终点">⇅ 交换起终点</button><label class="field-label" for="end-room">目标房间</label><div class="input-wrap"><span class="dot red"></span><input id="end-room" list="room-suggestions" placeholder="例如 2-001" value="${h(state.end)}" autocomplete="off" /></div><datalist id="room-suggestions">${suggestions.map(r => `<option value="${h(r.id)}"></option>`).join('')}</datalist><div class="map-buttons"><button class="btn btn-primary" id="navigate">开始导航 →</button><button class="btn btn-outline" id="clear-route">清除</button></div><div class="map-help" id="map-status"><strong>${state.route ? '已校对路线' : selected.length ? '房间定位' : '使用提示'}</strong><p>${state.route ? routeDescription() : selected.length ? `已找到 ${selected.map(r => r.id).join('、')}。标记仅供定位，路线待校对。` : '请输入房号(｡•ᴗ•｡)'}</p></div><div class="common"><h3>快速试试</h3><div><button data-quick="1-001">1-001</button><button data-quick="3-092A">3-092A</button><button data-quick="5F-015">5F-015</button><button data-quick="6-090A">6-090A</button></div></div></aside><section class="map-panel"><div class="map-toolbar"><div class="floor-pills" role="group" aria-label="选择楼层">${floors.map(f => `<button data-floor="${f.floor}" class="${state.floor === f.floor ? 'selected' : ''}">${f.floor}F</button>`).join('')}</div><div class="map-tools"><button id="zoom-out" aria-label="缩小地图">−</button><span>${Math.round(state.zoom * 100)}%</span><button id="zoom-in" aria-label="放大地图">＋</button><button id="export-map" aria-label="下载当前定位或路线图">↓ 导出 PNG</button></div></div><div class="map-view" id="map-view">${floor ? `<div class="map-stage" style="width:${state.zoom * 100}%"><img src="${assetUrl(floor.image)}" alt="躬行楼 ${floor.floor}F 原始平面图" draggable="false" />${mapOverlay()}</div>` : empty('地图数据加载失败，请刷新页面')}</div><div class="map-foot"><span>⌖ ${state.floor}F · ${floor?.roomCount || 0} 个识别房间</span><span>标记仅供定位</span></div><div id="export-status" class="export-status" role="status" aria-live="polite"></div></section></div><div class="map-disclaimer"><span>ℹ</span><p>房间标记仅供定位，路线待校对。请以现场标识为准。</p></div></div>`);
  const datalist = document.querySelector('#room-suggestions')!;
  for (const input of document.querySelectorAll<HTMLInputElement>('#start-room, #end-room')) input.addEventListener('input', () => { const found = searchRooms(rooms, input.value, 20); datalist.innerHTML = found.map(r => `<option value="${h(r.id)}"></option>`).join(''); });
}

function routeDescription() {
  if (!state.route) return '';
  const segments = segmentRoute(state.route);
  const change = segments.length > 1 ? `；经过 ${segments.map(s => `${s.floor}F`).join(' → ')}` : '';
  return `${state.start} 至 ${state.end}${change}${state.route.totalDistance !== undefined ? `；已校对距离 ${state.route.totalDistance.toFixed(1)} 米` : '；距离尚未校准'}`;
}

function normalizeInput(value: string): string { return parseRoomId(value) || value.trim().toUpperCase(); }
function navigate() {
  state.start = normalizeInput(document.querySelector<HTMLInputElement>('#start-room')!.value);
  state.end = normalizeInput(document.querySelector<HTMLInputElement>('#end-room')!.value);
  const start = rooms.find(r => r.id === state.start), end = rooms.find(r => r.id === state.end);
  state.route = start && end ? routeForRooms(graph, start, end) : null;
  state.floor = floorAt(start?.floor || end?.floor || state.floor);
  mapPage();
  const status = document.querySelector('#map-status p');
  if (status && ((!start && state.start) || (!end && state.end))) status.textContent = '有房间编号未在原图中找到，请检查输入。已找到的房间仍可定位。';
  if (start || end) focusRoomInMap(start || end!);
}

function focusRoomInMap(room: Room) {
  const view = document.querySelector<HTMLElement>('#map-view');
  const stage = document.querySelector<HTMLElement>('.map-stage');
  if (!view || !stage) return;
  requestAnimationFrame(() => {
    view.scrollTo({ left: Math.max(0, stage.clientWidth * room.labelPosition.x - view.clientWidth / 2),
      top: Math.max(0, stage.clientHeight * room.labelPosition.y - view.clientHeight / 2), behavior: 'smooth' });
  });
}

async function exportMap() {
  const routeSegments = state.route ? segmentRoute(state.route) : [];
  const exportFloors = routeSegments.length ? routeSegments.map(s => s.floor) : [...new Set([state.start, state.end].map(id => rooms.find(r => r.id === id)?.floor).filter(Boolean))] as number[];
  if (!exportFloors.length) { alert('请先输入并定位房间。'); return; }
  const width = 1600, header = 94, gap = 30;
  const images = await Promise.all(exportFloors.map(floor => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = assetUrl(`maps/${floor}f.webp`); })));
  const heights = images.map(img => Math.round(width * img.height / img.width));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = heights.reduce((a, b) => a + b + header + gap, 0) + 40;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff5f7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 24;
  exportFloors.forEach((floor, index) => {
    ctx.fillStyle = '#9f243a'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(`躬行楼 ${floor}F · ${state.route ? '已校对导航路线' : '房间定位示意图（非导航路线）'}`, 32, y + 43);
    y += header; ctx.drawImage(images[index], 0, y, width, heights[index]);
    if (state.route) {
      const segment = routeSegments.find(s => s.floor === floor);
      if (segment && segment.nodes.length > 1) { ctx.strokeStyle = '#cf304b'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); segment.nodes.forEach((n, i) => { const px = n.x * width, py = y + n.y * heights[index]; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
    }
    for (const [id, color] of [[state.start, '#a52970'], [state.end, '#e85454']]) {
      const room = rooms.find(r => r.id === id && r.floor === floor); if (!room) continue;
      const point = state.route && room.entrancePosition ? room.entrancePosition : room.labelPosition;
      const px = point.x * width, py = y + point.y * heights[index];
      ctx.beginPath(); ctx.arc(px, py, 14, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = color; ctx.font = 'bold 25px sans-serif'; ctx.fillText(id, px + 20, py - 15);
    }
    y += heights[index] + gap;
  });
  canvas.toBlob(blob => {
    if (!blob || blob.type !== 'image/png') { alert('PNG 生成失败，请重试。'); return; }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
    a.download = state.route ? `躬行楼路线-${state.start}-${state.end}.png` : '躬行楼房间定位示意图.png'; a.click();
    const status = document.querySelector('#export-status'); if (status) status.textContent = `${state.route ? '导航路线图' : '房间定位示意图'} PNG 已生成（${humanSize(blob.size)}）`;
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

function render() { state.page = currentPage(); if (state.page === 'notices') noticesPage(); else if (state.page === 'todos') todosPage(); else if (state.page === 'todo') todoDetailPage(); else if (state.page === 'tools') toolsPage(); else if (state.page === 'files') filesPage(); else if (state.page === 'map') mapPage(); else home(); }

document.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  const pageButton = target.closest<HTMLElement>('[data-page]'); if (pageButton) { setPage(pageButton.dataset.page as Page); return; }
  const todoButton = target.closest<HTMLElement>('[data-todo]'); if (todoButton) { location.hash = `todo/${encodeURIComponent(todoButton.dataset.todo!)}`; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const noticeButton = target.closest<HTMLElement>('[data-notice]'); if (noticeButton) { state.noticeId = noticeButton.dataset.notice!; state.page = 'notices'; location.hash = 'notices'; noticesPage(); return; }
  if (target.id === 'close-notice' || target.id === 'notice-backdrop') { state.noticeId = null; noticesPage(); return; }
  const category = target.closest<HTMLElement>('[data-category]'); if (category) { state.fileCategory = category.dataset.category!; filesPage(); return; }
  const floor = target.closest<HTMLElement>('[data-floor]'); if (floor) { state.floor = Number(floor.dataset.floor); mapPage(); return; }
  const quick = target.closest<HTMLElement>('[data-quick]'); if (quick) { state.start = quick.dataset.quick!; state.floor = Number(state.start[0]); state.route = null; mapPage(); const room = rooms.find(r => r.id === state.start); if (room) focusRoomInMap(room); return; }
  if (target.id === 'navigate') navigate();
  if (target.id === 'clear-route') { state.start = ''; state.end = ''; state.route = null; mapPage(); }
  if (target.id === 'swap-rooms') { [state.start, state.end] = [document.querySelector<HTMLInputElement>('#end-room')!.value, document.querySelector<HTMLInputElement>('#start-room')!.value]; state.route = null; mapPage(); }
  if (target.id === 'zoom-in') { state.zoom = Math.min(3, +(state.zoom + 0.25).toFixed(2)); mapPage(); }
  if (target.id === 'zoom-out') { state.zoom = Math.max(1, +(state.zoom - 0.25).toFixed(2)); mapPage(); }
  if (target.id === 'export-map') exportMap().catch(() => alert('图片导出失败，请重试。'));
});
window.addEventListener('hashchange', render);
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'light';

async function init() {
  const results = await Promise.allSettled([json<Notice[]>('data/notices.json'), json<DownloadFile[]>('data/files.json'), json<Room[]>('data/rooms.json'), json<Floor[]>('data/floors.json'), json<Graph>('data/graph.json'), json<Todo[]>('data/todos.json'), json<SharedTool[]>('data/tools.json')]);
  if (results[0].status === 'fulfilled') notices = results[0].value;
  if (results[1].status === 'fulfilled') files = results[1].value;
  if (results[2].status === 'fulfilled') rooms = results[2].value;
  if (results[3].status === 'fulfilled') floors = results[3].value;
  if (results[4].status === 'fulfilled') graph = results[4].value;
  if (results[5].status === 'fulfilled') todos = results[5].value;
  if (results[6].status === 'fulfilled') sharedTools = results[6].value;
  if (results[0].status === 'rejected') state.noticeError = String(results[0].reason);
  if (results[1].status === 'rejected') state.fileError = String(results[1].reason);
  if (results[5].status === 'rejected') state.todoError = String(results[5].reason);
  if (results[6].status === 'rejected') state.toolsError = String(results[6].reason);
  render();
  let signature = deadlineSignature();
  let timer: ReturnType<typeof setTimeout>;
  function refreshDeadlines() {
    const next = deadlineSignature();
    if (next !== signature) {
      signature = next;
      if (state.page === 'files') updateFileList();
      else if (['home', 'todos', 'todo'].includes(state.page)) render();
    }
    clearTimeout(timer);
    const now = Date.now();
    const upcoming = [...todos.flatMap(todo => [todo.startAt, todo.dueAt]), ...files.map(file => file.dueAt)].map(parseDeadline).filter((time): time is number => time !== null && time > now);
    timer = setTimeout(refreshDeadlines, Math.min(60_000, Math.max(1, Math.min(...upcoming) - now)));
  }
  refreshDeadlines();
  window.addEventListener('focus', refreshDeadlines);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDeadlines(); });
}
function deadlineSignature() {
  const now = Date.now();
  return JSON.stringify([todos.map(todo => todoStatus(todo, now)), files.map(file => isExpired(file.dueAt, now))]);
}
init();
