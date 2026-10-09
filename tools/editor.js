const $ = id => document.getElementById(id);
let rooms = [], graph = {version:1,nodes:[],edges:[]}, floor = 1, selected = [];
const text = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const report = message => { $('status').textContent = message; };
async function init() {
  [rooms,graph] = await Promise.all([fetch('/data/rooms.json').then(r=>r.json()),fetch('/data/graph.json').then(r=>r.json())]);
  $('floor').innerHTML = Array.from({length:6},(_,i)=>`<option value="${i+1}">${i+1}F</option>`).join('');
  render();
}
function render() {
  $('map').src = `/maps/${floor}f.webp`;
  $('floor').value = String(floor);
  $('rooms').innerHTML = rooms.filter(r=>r.floor===floor).map(r=>`<option value="${text(r.id)}"></option>`).join('');
  const current = rooms.find(r=>r.id===$('room').value);
  $('overlay').innerHTML = graph.edges.filter(e=>{const a=graph.nodes.find(n=>n.id===e.from),b=graph.nodes.find(n=>n.id===e.to);return a&&b&&a.floor===floor&&b.floor===floor}).map(e=>{const a=graph.nodes.find(n=>n.id===e.from),b=graph.nodes.find(n=>n.id===e.to);return `<line x1="${a.x*1000}" y1="${a.y*1000}" x2="${b.x*1000}" y2="${b.y*1000}" stroke="${e.verified?'#1686d2':'#e6a846'}" stroke-dasharray="${e.verified?'':'7 5'}"/>`}).join('')+
    rooms.filter(r=>r.floor===floor&&(r.id===current?.id||r.entrancePosition)).map(r=>`<circle cx="${r.labelPosition.x*1000}" cy="${r.labelPosition.y*1000}" r="${r.id===current?.id?9:5}" fill="#e95662"/><text x="${r.labelPosition.x*1000+12}" y="${r.labelPosition.y*1000-8}">${text(r.id)}</text>${r.entrancePosition?`<circle cx="${r.entrancePosition.x*1000}" cy="${r.entrancePosition.y*1000}" r="7" fill="#16a16e"/>`:''}`).join('')+
    graph.nodes.filter(n=>n.floor===floor).map(n=>`<circle data-node="${text(n.id)}" cx="${n.x*1000}" cy="${n.y*1000}" r="9" fill="${selected.includes(n.id)?'#f16b3b':n.type==='stairs'?'#9353c6':n.type==='elevator'?'#d32945':'#2079c2'}"/><text x="${n.x*1000+12}" y="${n.y*1000+4}">${text(n.label||n.id)}</text>`).join('');
  $('nodes').innerHTML = graph.nodes.filter(n=>n.floor===floor).map(n=>`<button data-node-list="${text(n.id)}">${text(n.id)} · ${text(n.type)} · ${n.verified?'已验证':'待验证'}</button>`).join('')||'<p>本层暂无节点</p>';
  $('edges').innerHTML = graph.edges.filter(e=>selected.some(id=>id===e.from||id===e.to)).map(e=>`<button data-edge="${text(e.id)}">${text(e.from)} ↔ ${text(e.to)} · ${e.verified?'已验证':'待验证'}</button>`).join('');
  $('selection').textContent = selected.length?`已选择：${selected.join('、')}`:'未选择节点';
  $('counts').textContent = `${rooms.length} 房间 · ${graph.nodes.length} 节点 · ${graph.edges.length} 连接`;
}
function selectNode(id){selected=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id].slice(-2);render();}
$('floor').addEventListener('change',e=>{floor=Number(e.target.value);render()});
$('room').addEventListener('change',()=>{const r=rooms.find(r=>r.id===$('room').value);if(r)floor=r.floor;render()});
$('overlay').addEventListener('click',e=>{
  const node=e.target.closest('[data-node]');if(node&&$('mode').value==='inspect'){selectNode(node.dataset.node);return;}
  const bounds=$('overlay').getBoundingClientRect(), x=Math.max(0,Math.min(1,(e.clientX-bounds.left)/bounds.width)), y=Math.max(0,Math.min(1,(e.clientY-bounds.top)/bounds.height));
  const mode=$('mode').value, room=rooms.find(r=>r.id===$('room').value);
  if(mode==='label'||mode==='entrance'){
    if(!room||room.floor!==floor){report('请先选择本层房间。');return;}
    if(mode==='label'){room.labelPosition={x,y};report(`${room.id} 标签位置已修正；房门位置未因此验证。`)}
    else {room.entrancePosition={x,y};room.verified=$('verified').checked;report(`${room.id} 入口已记录。请在节点连接后设置 accessNode。`)}
  }else if(mode==='node'){
    const type=$('node-type').value,id=`${floor}F-${type}-${Date.now().toString(36)}`;
    graph.nodes.push({id,floor,x,y,type,label:id,verified:$('verified').checked});
    if(type==='entrance'&&room&&room.floor===floor){room.accessNode=id;room.entrancePosition={x,y};room.verified=$('verified').checked;}
    selected=[id];report(`已添加 ${id}。新节点仅在标记为已验证后可参与正式导航。`);
  }else report(`坐标：x=${x.toFixed(4)}, y=${y.toFixed(4)}`);
  render();
});
document.addEventListener('click',e=>{const id=e.target.dataset?.nodeList;if(id)selectNode(id);const edge=e.target.dataset?.edge;if(edge){selected=[graph.edges.find(x=>x.id===edge)?.from,graph.edges.find(x=>x.id===edge)?.to].filter(Boolean);render()}});
$('add-edge').addEventListener('click',()=>{
  if(selected.length!==2){report('请选择两个节点。');return;}
  const [a,b]=selected.map(id=>graph.nodes.find(n=>n.id===id));
  if(a.floor!==b.floor&&!(a.type===b.type&&['stairs','elevator'].includes(a.type))){report('跨楼层只能连接同类楼梯或电梯节点。');return;}
  if(graph.edges.some(e=>(e.from===a.id&&e.to===b.id)||(e.from===b.id&&e.to===a.id))){report('这条连接已存在。');return;}
  const distance=Number($('distance').value),edge={id:`edge-${Date.now().toString(36)}`,from:a.id,to:b.id,verified:$('verified').checked&&a.verified&&b.verified};
  if(distance>0)edge.distance=distance;
  graph.edges.push(edge);report(`连接已添加：${a.id} ↔ ${b.id}。`);render();
});
$('remove-edge').addEventListener('click',()=>{
  if(selected.length!==2){report('请先选择连接两端。');return;}
  const count=graph.edges.length;graph.edges=graph.edges.filter(e=>!((e.from===selected[0]&&e.to===selected[1])||(e.from===selected[1]&&e.to===selected[0])));report(count===graph.edges.length?'未找到这条连接。':'连接已删除。');render();
});
$('update-verification').addEventListener('click',()=>{
  const value=$('verified').checked;
  for(const id of selected){const node=graph.nodes.find(n=>n.id===id);if(node)node.verified=value;}
  if(selected.length===2){
    const edge=graph.edges.find(e=>(e.from===selected[0]&&e.to===selected[1])||(e.from===selected[1]&&e.to===selected[0]));
    if(edge){edge.verified=value&&selected.every(id=>graph.nodes.find(n=>n.id===id)?.verified);const distance=Number($('distance').value);if(distance>0)edge.distance=distance;}
  }
  const room=rooms.find(r=>r.id===$('room').value);
  if(room){room.verified=value&&!!room.entrancePosition&&!!room.accessNode&&!!graph.nodes.find(n=>n.id===room.accessNode)?.verified;}
  report(`选中项已更新为${value?'已验证':'待验证'}。房间只有在入口及关联节点齐备并验证后才能成为已验证。`);render();
});
function save(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('export-rooms').addEventListener('click',()=>save('rooms.json',rooms));$('export-graph').addEventListener('click',()=>save('graph.json',graph));
for(const [id,kind] of [['import-rooms','rooms'],['import-graph','graph']])$(id).addEventListener('change',async e=>{try{const value=JSON.parse(await e.target.files[0].text());if(kind==='rooms'){if(!Array.isArray(value))throw Error('房间数据应为数组');rooms=value}else{if(!Array.isArray(value.nodes)||!Array.isArray(value.edges))throw Error('路径图缺少 nodes/edges');graph=value}selected=[];report(`${kind==='rooms'?'房间':'路径图'}数据已导入，请检查后导出。`);render()}catch(error){report(`导入失败：${error.message}`)}});
init().catch(error=>report(`初始数据加载失败：${error.message}`));
