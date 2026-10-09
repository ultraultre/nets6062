import './styles.css';
import type { DownloadFile, Floor, Graph, Notice, Room } from './types';
import { assetUrl, escapeHtml as h, humanSize } from './utils/paths';
import { floorAt, parseRoomId, routeForRooms, searchRooms, segmentRoute, toSvgPoint, type Route } from './navigation/core';

type Page = 'home' | 'notices' | 'files' | 'map';
const app = document.querySelector<HTMLDivElement>('#app')!;
const state: { page: Page; floor: number; zoom: number; start: string; end: string; route: Route | null; noticeQuery: string; fileQuery: string; fileCategory: string; noticeId: string | null; noticeError: string | null; fileError: string | null } = {
  page: 'home', floor: 1, zoom: 1, start: '', end: '', route: null, noticeQuery: '', fileQuery: '', fileCategory: '全部', noticeId: null, noticeError: null, fileError: null,
};
let notices: Notice[] = [], files: DownloadFile[] = [], rooms: Room[] = [], floors: Floor[] = [], graph: Graph = { version: 1, nodes: [], edges: [] };
const pathMap: Record<string, Page> = { home: 'home', notices: 'notices', files: 'files', map: 'map' };

async function json<T>(path: string): Promise<T> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`${path} 加载失败（${response.status}）`);
  return response.json() as Promise<T>;
}

function currentPage(): Page { return pathMap[location.hash.slice(1)] || 'home'; }
function setPage(page: Page) { location.hash = page; state.page = page; state.noticeId = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function icon(ext: string) { return ({ pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', ppt: 'PPT', pptx: 'PPT', zip: 'ZIP' } as Record<string, string>)[ext] || ext.slice(0, 4).toUpperCase(); }

function layout(content: string) {
  const nav: [Page, string][] = [['home', '首页'], ['notices', '通知公告'], ['files', '文件下载'], ['map', '躬行楼导航']];
  app.innerHTML = `<header class="site-header"><div class="header-inner"><a class="brand" href="#home" aria-label="班级信息服务平台首页"><span class="brand-mark">班</span><span><strong>班级信息服务平台</strong><small>CLASS SERVICE HUB</small></span></a><nav class="nav" aria-label="主导航">${nav.map(([id, label]) => `<a href="#${id}" class="${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><button class="theme-button" id="theme-toggle" aria-label="切换明暗模式">◐</button></div></header><main>${content}</main><footer class="footer"><div class="footer-inner"><div><strong>班级信息服务平台</strong><p>让通知、资料与校园空间触手可及。</p></div><p>地图路线须经人工校对 · 本系统不用于紧急疏散<br>公开站点请勿上传含隐私的资料</p></div></footer>`;
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; localStorage.setItem('theme', next);
  });
}

function pageHead(eyebrow: string, title: string, desc: string) { return `<div class="page-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>`; }
function empty(message: string) { return `<div class="empty"><span>◎</span><p>${message}</p></div>`; }
function noticeCard(n: Notice) { return `<button class="notice-card" data-notice="${h(n.id)}"><span class="notice-date">${h(n.date)} <b>·</b> ${h(n.category)}</span><strong>${h(n.title)}</strong><span class="notice-tail">${n.important ? '<em>重要</em>' : ''}<span>查看详情 ↗</span></span></button>`; }

function home() {
  const pinned = notices.filter(n => n.important).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  const latest = [...notices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  layout(`<section class="hero"><div class="hero-content"><span class="hero-kicker"><i></i> 校园信息，一站获取</span><h1>班级日常，<br><span>在这里更从容。</span></h1><p>查看最新通知、下载常用资料，快速定位躬行楼房间。把需要的信息，放在触手可及的地方。</p><div class="hero-actions"><button class="btn btn-primary" data-page="notices">查看通知 <span>↗</span></button><button class="btn btn-light" data-page="map">探索楼宇地图 <span>→</span></button></div></div><div class="hero-art" aria-hidden="true"><div class="art-ring ring-a"></div><div class="art-ring ring-b"></div><div class="art-card art-card-1"><span>◈</span><div>通知公告<small>重要消息及时掌握</small></div></div><div class="art-card art-card-2"><span>⌖</span><div>躬行楼地图<small>六层空间一目了然</small></div></div><div class="art-card art-card-3"><span>⇩</span><div>文件中心<small>常用资料随时下载</small></div></div></div></section>
  <section class="overview"><div class="metric"><span>01</span><strong>${notices.length}</strong><small>通知公告</small></div><div class="metric"><span>02</span><strong>${files.length}</strong><small>可下载文件</small></div><div class="metric"><span>03</span><strong>${floors.length || 6}</strong><small>楼层地图</small></div><div class="metric"><span>04</span><strong>${rooms.length.toLocaleString()}</strong><small>识别房间标签</small></div></section>
  <section class="section two-col"><div><div class="section-title"><div><span>STAY INFORMED</span><h2>重要通知</h2></div><button class="text-link" data-page="notices">全部通知 →</button></div>${pinned.length ? pinned.map(noticeCard).join('') : empty('暂无重要通知')}</div><div class="feature-card"><span class="feature-icon">⌖</span><span class="feature-label">CAMPUS NAVIGATION</span><h2>躬行楼<br>室内地图</h2><p>基于真实建筑图纸，可搜索房间编号并查看 1F 至 6F 地图。通行路线将在校对后开放。</p><button class="btn btn-white" data-page="map">打开地图 <span>→</span></button><div class="feature-lines"></div></div></section>
  <section class="section"><div class="section-title"><div><span>RECENT UPDATES</span><h2>最新动态</h2></div><button class="text-link" data-page="notices">查看更多 →</button></div><div class="card-grid">${latest.length ? latest.map(noticeCard).join('') : empty('暂无通知')}</div></section>
  <section class="section"><div class="section-title"><div><span>RESOURCES</span><h2>最近更新的文件</h2></div><button class="text-link" data-page="files">前往下载中心 →</button></div><div class="file-preview">${files.length ? files.slice(0, 3).map(f => `<div class="preview-row"><span class="file-icon">${icon(f.extension)}</span><span><strong>${h(f.name)}</strong><small>${h(f.category)} · ${humanSize(f.size)}</small></span><a href="${assetUrl(`downloads/${f.relativePath}`)}" download="${h(f.name)}" aria-label="下载${h(f.name)}">⇩</a></div>`).join('') : empty('暂无可公开的文件')}</div></section>
  <section class="howto"><div><span class="eyebrow">GET STARTED</span><h2>简单三步，快速使用</h2></div><div class="howto-grid"><article><b>01</b><h3>查看公告</h3><p>按标题或内容搜索班级消息。</p></article><article><b>02</b><h3>获取资料</h3><p>按类型筛选并下载公开文件。</p></article><article><b>03</b><h3>查找房间</h3><p>输入房间编号，在原始地图上定位。</p></article></div></section>`);
}

function noticesPage() {
  const sorted = [...notices].sort((a, b) => Number(b.important) - Number(a.important) || b.date.localeCompare(a.date));
  const filtered = sorted.filter(n => `${n.title} ${n.body} ${n.category}`.toLowerCase().includes(state.noticeQuery.toLowerCase()));
  layout(`<div class="container">${pageHead('NOTICE BOARD', '通知公告', '重要消息及时掌握，班级动态清晰可见。')}<div class="toolbar"><label class="search"><span>⌕</span><input id="notice-search" type="search" placeholder="搜索标题、分类或正文" value="${h(state.noticeQuery)}" /></label><span class="count">共 ${filtered.length} 条通知 · 重要置顶，按时间排序</span></div><div id="notice-list" class="notice-list">${state.noticeError ? empty(h(state.noticeError)) : filtered.length ? filtered.map(noticeCard).join('') : empty('没有找到匹配的通知')}</div></div>${state.noticeId ? noticeDialog() : ''}`);
  document.querySelector<HTMLInputElement>('#notice-search')?.addEventListener('input', e => {
    state.noticeQuery = (e.target as HTMLInputElement).value;
    const matches = sorted.filter(n => `${n.title} ${n.body} ${n.category}`.toLowerCase().includes(state.noticeQuery.toLowerCase()));
    document.querySelector('.count')!.textContent = `共 ${matches.length} 条通知 · 重要置顶，按时间排序`;
    document.querySelector('#notice-list')!.innerHTML = state.noticeError ? empty(h(state.noticeError)) : matches.length ? matches.map(noticeCard).join('') : empty('没有找到匹配的通知');
  });
}

function noticeDialog() { const n = notices.find(item => item.id === state.noticeId); return n ? `<div class="modal-backdrop" id="notice-backdrop"><article class="modal" role="dialog" aria-modal="true" aria-labelledby="notice-title"><button id="close-notice" class="close" aria-label="关闭">×</button><span class="notice-date">${h(n.date)} · ${h(n.category)}</span><h2 id="notice-title">${h(n.title)}</h2><p>${h(n.body).replace(/\n/g, '<br>')}</p></article></div>` : ''; }

function filesPage() {
  const categories = ['全部', ...new Set(files.map(f => f.category))];
  const filtered = files.filter(f => (state.fileCategory === '全部' || f.category === state.fileCategory) && f.name.toLowerCase().includes(state.fileQuery.toLowerCase()));
  layout(`<div class="container">${pageHead('RESOURCE LIBRARY', '文件下载', '常用资料集中管理，按需查找、随时获取。')}<div class="toolbar"><label class="search"><span>⌕</span><input id="file-search" type="search" placeholder="搜索文件名称" value="${h(state.fileQuery)}" /></label><span class="count">${filtered.length} 个文件</span></div><div class="tabs" role="group" aria-label="文件分类">${categories.map(c => `<button data-category="${h(c)}" class="${state.fileCategory === c ? 'selected' : ''}">${h(c)}</button>`).join('')}</div><div class="file-list">${state.fileError ? empty(h(state.fileError)) : filtered.length ? filtered.map(f => `<article class="file-row"><div class="file-icon">${icon(f.extension)}</div><div class="file-info"><h3>${h(f.name)}</h3><p>${h(f.category)} <span>·</span> ${f.extension.toUpperCase()} <span>·</span> ${humanSize(f.size)}</p></div><a class="download" href="${assetUrl(`downloads/${f.relativePath}`)}" download="${h(f.name)}">下载 <span>↓</span></a></article>`).join('') : empty('该分类下暂无文件')}</div><p class="privacy-note">本站文件均可公开访问。涉及个人信息的资料须先审查，再加入下载中心。</p></div>`);
  document.querySelector<HTMLInputElement>('#file-search')?.addEventListener('input', e => {
    state.fileQuery = (e.target as HTMLInputElement).value;
    const matches = files.filter(f => (state.fileCategory === '全部' || f.category === state.fileCategory) && f.name.toLowerCase().includes(state.fileQuery.toLowerCase()));
    document.querySelector('.count')!.textContent = `${matches.length} 个文件`;
    document.querySelector('.file-list')!.innerHTML = matches.length ? matches.map(f => `<article class="file-row"><div class="file-icon">${icon(f.extension)}</div><div class="file-info"><h3>${h(f.name)}</h3><p>${h(f.category)} <span>·</span> ${f.extension.toUpperCase()} <span>·</span> ${humanSize(f.size)}</p></div><a class="download" href="${assetUrl(`downloads/${f.relativePath}`)}" download="${h(f.name)}">下载 <span>↓</span></a></article>`).join('') : empty('该分类下暂无文件');
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
  layout(`<div class="container map-container">${pageHead('GONGXING BUILDING', '躬行楼室内导航', '真实六层地图 · 房间搜索定位 · 已校对路线规划')}<div class="map-layout"><aside class="map-sidebar"><div class="panel-head"><span class="step">01</span><div><h2>查找房间</h2><p>输入原图上的完整编号</p></div></div><label class="field-label" for="start-room">起点房间</label><div class="input-wrap"><span class="dot green"></span><input id="start-room" list="room-suggestions" placeholder="例如 1-001" value="${h(state.start)}" autocomplete="off" /></div><button class="swap" id="swap-rooms" title="交换起终点" aria-label="交换起终点">⇅ 交换起终点</button><label class="field-label" for="end-room">目标房间</label><div class="input-wrap"><span class="dot red"></span><input id="end-room" list="room-suggestions" placeholder="例如 2-001" value="${h(state.end)}" autocomplete="off" /></div><datalist id="room-suggestions">${suggestions.map(r => `<option value="${h(r.id)}"></option>`).join('')}</datalist><div class="map-buttons"><button class="btn btn-primary" id="navigate">开始导航 →</button><button class="btn btn-outline" id="clear-route">清除</button></div><div class="map-help" id="map-status"><strong>${state.route ? '已校对路线' : selected.length ? '房间定位' : '使用提示'}</strong><p>${state.route ? routeDescription() : selected.length ? `已找到 ${selected.map(r => r.id).join('、')}。房间标记是 PDF 文字位置，尚未确认房门入口；当前区域路线尚未校对。` : '输入房间编号可快速定位。自动路线仅使用人工验证的入口和通行边。'}</p></div><div class="common"><h3>快速试试</h3><div><button data-quick="1-001">1-001</button><button data-quick="3-092A">3-092A</button><button data-quick="5F-015">5F-015</button><button data-quick="6-090A">6-090A</button></div></div></aside><section class="map-panel"><div class="map-toolbar"><div class="floor-pills" role="group" aria-label="选择楼层">${floors.map(f => `<button data-floor="${f.floor}" class="${state.floor === f.floor ? 'selected' : ''}">${f.floor}F</button>`).join('')}</div><div class="map-tools"><button id="zoom-out" aria-label="缩小地图">−</button><span>${Math.round(state.zoom * 100)}%</span><button id="zoom-in" aria-label="放大地图">＋</button><button id="export-map" aria-label="下载当前定位或路线图">↓ 导出 PNG</button></div></div><div class="map-view" id="map-view">${floor ? `<div class="map-stage" style="width:${state.zoom * 100}%"><img src="${assetUrl(floor.image)}" alt="躬行楼 ${floor.floor}F 原始平面图" draggable="false" />${mapOverlay()}</div>` : empty('地图数据加载失败，请刷新页面')}</div><div class="map-foot"><span>⌖ ${state.floor}F · ${floor?.roomCount || 0} 个识别房间</span><span>来源：躬行楼原始 PDF · 文字标注位置仅供定位</span></div><div id="export-status" class="export-status" role="status" aria-live="polite"></div></section></div><div class="map-disclaimer"><span>ℹ</span><p>图上房间标签由 PDF 自动提取，尚未等同于房门位置。未经人工核验的走廊、楼梯和电梯连接不参与路线规划。请以现场标识为准；本系统不用于消防疏散。</p></div></div>`);
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
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#f0f5fb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 24;
  exportFloors.forEach((floor, index) => {
    ctx.fillStyle = '#123d73'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(`躬行楼 ${floor}F · ${state.route ? '已校对导航路线' : '房间定位示意图（非导航路线）'}`, 32, y + 43);
    y += header; ctx.drawImage(images[index], 0, y, width, heights[index]);
    if (state.route) {
      const segment = routeSegments.find(s => s.floor === floor);
      if (segment && segment.nodes.length > 1) { ctx.strokeStyle = '#1476d4'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); segment.nodes.forEach((n, i) => { const px = n.x * width, py = y + n.y * heights[index]; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
    }
    for (const [id, color] of [[state.start, '#12a36a'], [state.end, '#e85454']]) {
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

function render() { state.page = currentPage(); if (state.page === 'notices') noticesPage(); else if (state.page === 'files') filesPage(); else if (state.page === 'map') mapPage(); else home(); }

document.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  const pageButton = target.closest<HTMLElement>('[data-page]'); if (pageButton) { setPage(pageButton.dataset.page as Page); return; }
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
  const results = await Promise.allSettled([json<Notice[]>('data/notices.json'), json<DownloadFile[]>('data/files.json'), json<Room[]>('data/rooms.json'), json<Floor[]>('data/floors.json'), json<Graph>('data/graph.json')]);
  if (results[0].status === 'fulfilled') notices = results[0].value;
  if (results[1].status === 'fulfilled') files = results[1].value;
  if (results[2].status === 'fulfilled') rooms = results[2].value;
  if (results[3].status === 'fulfilled') floors = results[3].value;
  if (results[4].status === 'fulfilled') graph = results[4].value;
  if (results[0].status === 'rejected') state.noticeError = String(results[0].reason);
  if (results[1].status === 'rejected') state.fileError = String(results[1].reason);
  render();
}
init();
