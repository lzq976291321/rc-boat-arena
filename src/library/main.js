import { categories, stages, licenses, KEY, webUrl, validateLibrary, emptyLibrary, mergeLibrary } from './store.js';
import { setupPreview } from './preview.js';
import { SCENE_ASSETS } from '../scene-assets/catalog.js';

const $ = selector => document.querySelector(selector);
let selectedCategory = 'all';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
let library = emptyLibrary(), builtins = [], retiredAssets = [], selectedId = null, editingId = null, onlyFavorites = false, toastTimeout, persistenceBlocked = false;
const stats = new Map();
const form = $('#asset-form'), editor = $('#editor');
const preview = setupPreview({
  container: $('#viewport'), message: $('#preview-message'), open: $('#load-preview'),
  reset: $('#reset-view'), wireframe: $('#wireframe'),
  onStats(id, values) { stats.set(id, values); if (selectedId === id) renderDetail(); },
});
function toast(message) { clearTimeout(toastTimeout); $('#toast').textContent = message; $('#toast').hidden = false; toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 6000); }
function options(select, values) { for (const [value, label] of Object.entries(values)) select.add(new Option(label, value)); }
options($('#stage'), stages);
const tabLabels = { all: '全部', boat: '船艇', prop: '道具', nature: '植被', structure: '建筑', material: '其他', scene: '观赏资产' };
$('#categories').innerHTML = Object.entries(tabLabels).map(([id, label]) => `<button id="tab-${id}" role="tab" aria-controls="model-panel" aria-selected="${id === 'all'}" tabindex="${id === 'all' ? 0 : -1}" data-category="${id}">${label}</button>`).join('');
function activateCategory(tab) {
  selectedCategory = tab.dataset.category;
  for (const item of $('#categories').children) { item.setAttribute('aria-selected', item === tab); item.tabIndex = item === tab ? 0 : -1; }
  $('#model-panel').setAttribute('aria-labelledby', tab.id);
  syncFilter();
}
$('#categories').onclick = event => { const tab = event.target.closest('[role=tab]'); if (tab) activateCategory(tab); };
$('#categories').onkeydown = event => {
  const tabs = [...$('#categories').children], index = tabs.indexOf(document.activeElement);
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus(); activateCategory(tabs[next]);
};
$('#manage-open').onclick = () => $('#manage').showModal();
$('#info-open').onclick = () => $('#info').showModal();
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => $('#' + button.dataset.close).close();
options(form.elements.category, categories); options(form.elements.stage, { candidate: stages.candidate, shortlist: stages.shortlist, ready: stages.ready }); options(form.elements.license, licenses);
function records() {
  // Keep the saved candidate as a backup, but show its downloaded catalog entry once available.
  const sourceKey = source => source?.split(/[?#]/)[0].replace(/\/$/, '') || '';
  const hiddenSources = new Set([...builtins.filter(item => item.path), ...retiredAssets].filter(item => item.source).map(item => sourceKey(item.source)));
  const retiredIds = new Set(retiredAssets.map(item => item.id));
  return [...builtins.map(item => ({ ...item, ...library.annotations[item.id] })), ...library.candidates.filter(item => !retiredIds.has(item.id) && !hiddenSources.has(sourceKey(item.source)))];
}
function commit(next) {
  try {
    if (persistenceBlocked) throw new Error('原有收藏无法读取，为保护数据，本页暂停写入。请先保留浏览器数据。');
    const validated = validateLibrary(next);
    localStorage.setItem(KEY, JSON.stringify(validated)); library = validated; return true;
  } catch (error) { toast('未保存：' + error.message); return false; }
}
function saveAnnotation(id, changes) {
  const old = library.annotations[id] || { favorite: false, notes: builtins.find(item => item.id === id)?.notes || '' };
  return commit({ ...library, annotations: { ...library.annotations, [id]: { ...old, ...changes } } });
}
function filters() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  return records().filter(item => (!query || [item.name, item.author, item.tags, item.notes].join(' ').toLocaleLowerCase().includes(query))
    && (selectedCategory === 'all' || item.category === selectedCategory)
    && ($('#stage').value === 'all' || item.stage === $('#stage').value)
    && ($('#license-filter').value === 'all' || ($('#license-filter').value === 'other' ? !['unknown', 'CC0-1.0'].includes(item.license) : item.license === $('#license-filter').value))
    && (!onlyFavorites || item.favorite));
}
function renderList() {
  const items = filters();
  $('#count').textContent = items.length ? `${Math.max(0, items.findIndex(item => item.id === selectedId)) + 1} / ${items.length}` : '';
  $('#empty').hidden = items.length > 0;
  $('#list').innerHTML = items.map(item => `<div class="asset-card${item.id === selectedId ? ' selected' : ''}"><button class="asset-open" data-open="${escape(item.id)}" aria-pressed="${item.id === selectedId}" title="${escape(item.name)}">${escape(item.name)}</button><button class="star" data-star="${escape(item.id)}" aria-label="${item.favorite ? '取消星标' : '标星'} ${escape(item.name)}" aria-pressed="${!!item.favorite}">${item.favorite ? '★' : '☆'}</button></div>`).join('');

}
function syncFilter() {
  const items = filters();
  if (!items.some(item => item.id === selectedId)) select(items[0]?.id || null);
  else renderList();
}
function link(url, label) { return webUrl(url) ? `<a href="${escape(webUrl(url))}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>` : escape(label); }
function renderDetail() {
  const item = records().find(asset => asset.id === selectedId);
  $('#model-name').textContent = item?.name || '';
  $('#info-open').disabled = !item;
  if (!item) { $('#reset-view').hidden = $('#wireframe').hidden = true; return; }
  const measured = stats.get(item.id), triangles = measured?.triangles ?? item.triangles;
  const detailFacts = item.kind === 'scene'
    ? [['类型', '观赏场景'], ['观看方式', '自动巡游']]
    : [['文件大小', item.bytes ? (item.bytes / 1048576).toFixed(2) + ' MB' : '—'], ['三角面', triangles != null ? triangles.toLocaleString() : '—'], ['类型', item.path ? 'GLB 模型' : item.kind === 'procedural' ? '程序生成' : '候选链接']];
  const sourceUrl = webUrl(item.source);
  const sourceLabel = sourceUrl ? new URL(sourceUrl).hostname : item.source || (['procedural', 'scene'].includes(item.kind) ? '本项目制作' : '待补充原始链接');
  $('#detail-content').innerHTML = `<div class="detail-title"><div><span class="detail-kicker">${escape(categories[item.category])} / ${stages[item.stage]}</span><h2>${escape(item.name)}</h2></div><button id="edit">${item.id.startsWith('builtin-') ? '编辑备注' : '编辑收藏'} ↗</button></div><div class="tags">${String(item.tags || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean).map(tag => `<span>${escape(tag)}</span>`).join('')}${item.aiGenerated ? '<span>来源标记：AI 辅助</span>' : ''}</div><dl class="facts">${detailFacts.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl><dl class="provenance"><dt>作者</dt><dd>${escape(item.author || '待补充')}</dd><dt>使用许可</dt><dd>${link(item.licenseUrl, licenses[item.license] || item.license)}${item.license === 'unknown' ? ' · 尚未确认' : ''}</dd><dt>来源</dt><dd>${link(sourceUrl, sourceLabel)}</dd><dt>使用位置</dt><dd>${escape(item.usage || '尚未接入场景')}</dd>${item.kind !== 'scene' && (item.path || item.code) ? `<dt>项目路径</dt><dd>${escape(item.path || item.code)}</dd>` : ''}${measured ? `<dt>模型实测</dt><dd>${measured.meshes} 个网格 · ${measured.materials} 个材质 · ${measured.animations} 段动画</dd>` : ''}</dl><p class="notes">${escape(item.notes || '还没有备注。记下你喜欢它的理由，以及接入前要处理的事项。')}</p>`;
  $('#edit').onclick = () => openEditor(item.id);
}
function select(id) { const changed = selectedId !== id; selectedId = id; renderList(); renderDetail(); if (changed) preview.select(records().find(item => item.id === id)); }
function openEditor(id = null) {
  $('#info').close(); $('#manage').close();
  editingId = id; const item = records().find(item => item.id === id); const builtin = id?.startsWith('builtin-');
  form.reset(); $('#form-error').textContent = '';
  $('#editor-title').textContent = builtin ? '记录接入备注' : item ? '编辑素材收藏' : '收藏一件好素材';
  $('#editor-note').textContent = builtin ? '项目资产来源与状态来自清单。这里可修改个人备注，修改正式记录请更新项目清单。' : '先存下链接，再慢慢挑选。标为待接入后，仍需处理模型并在场景中验收。';
  for (const key of ['name', 'category', 'stage', 'source', 'author', 'license', 'licenseUrl', 'tags', 'notes']) {
    const field = form.elements[key]; field.disabled = !!builtin && key !== 'notes';
    field.value = item?.[key] ?? ({ category: 'boat', stage: 'candidate', license: 'unknown' }[key] || '');
  }
  form.elements.stage.querySelector('[value="integrated"]')?.remove();
  if (builtin) {
    if (item.stage === 'integrated') form.elements.stage.add(new Option('已接入（来自项目清单）', 'integrated'));
    form.elements.stage.value = item.stage;
  }
  else form.elements.stage.querySelector('[value="integrated"]')?.remove();
  $('#delete').hidden = !item || builtin; $('#delete').textContent = '删除收藏'; $('#delete').dataset.confirm = '';
  editor.showModal(); (builtin ? form.elements.notes : form.elements.name).focus();
}
form.onsubmit = event => {
  event.preventDefault(); $('#form-error').textContent = '';
  if (editingId?.startsWith('builtin-')) { if (saveAnnotation(editingId, { notes: form.elements.notes.value.trim() })) { editor.close(); renderDetail(); renderList(); toast('备注已保存在当前浏览器'); } return; }
  const input = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(input)) input[key] = input[key].trim();
  if (!input.name) { $('#form-error').textContent = '请填写素材名称'; return; }
  for (const key of ['source', 'licenseUrl']) if (input[key] && !webUrl(input[key])) { $('#form-error').textContent = '链接只支持 http / https 地址'; return; }
  const item = { ...input, id: editingId || 'user-' + crypto.randomUUID(), favorite: library.candidates.find(asset => asset.id === editingId)?.favorite || false };
  const candidates = library.candidates.filter(asset => asset.id !== item.id).concat(item);
  if (commit({ ...library, candidates })) { editor.close(); clearFilters(); select(item.id); toast('素材已收藏到当前浏览器'); }
};
$('#delete').onclick = () => {
  if (!$('#delete').dataset.confirm) { $('#delete').dataset.confirm = 'yes'; $('#delete').textContent = '再次点击确认删除'; return; }
  if (commit({ ...library, candidates: library.candidates.filter(item => item.id !== editingId) })) { editor.close(); syncFilter(); toast('已删除收藏'); }
};
$('#add').onclick = () => openEditor(); $('#close-editor').onclick = () => editor.close();
$('#list').onclick = event => {
  const open = event.target.closest('[data-open]'), star = event.target.closest('[data-star]');
  if (open) select(open.dataset.open);
  if (star) {
    const id = star.dataset.star, item = records().find(asset => asset.id === id);
    const saved = id.startsWith('builtin-') ? saveAnnotation(id, { favorite: !item.favorite }) : commit({ ...library, candidates: library.candidates.map(asset => asset.id === id ? { ...asset, favorite: !asset.favorite } : asset) });
    if (saved) syncFilter();
  }
};
function clearFilters() { selectedCategory = 'all'; for (const tab of $('#categories').children) { const active = tab.dataset.category === 'all'; tab.setAttribute('aria-selected', active); tab.tabIndex = active ? 0 : -1; } $('#model-panel').setAttribute('aria-labelledby', 'tab-all'); $('#search').value = ''; for (const id of ['stage', 'license-filter']) $('#' + id).value = 'all'; onlyFavorites = false; $('#favorites').setAttribute('aria-pressed', false); }
$('#clear-filters').onclick = () => { clearFilters(); syncFilter(); };
$('#reset-filters').onclick = () => { clearFilters(); syncFilter(); };
$('#search').oninput = syncFilter;
for (const id of ['stage', 'license-filter']) $('#' + id).onchange = syncFilter;
$('#favorites').onclick = () => { onlyFavorites = !onlyFavorites; $('#favorites').setAttribute('aria-pressed', onlyFavorites); syncFilter(); };
$('#export').onclick = () => {
  if (persistenceBlocked) { toast('原有数据无法读取，不能导出空备份。请先保留浏览器原始数据。'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `rc-assets-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出收藏与备注；模型文件仍保留在项目中');
};
$('#import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('备份文件不能超过 5 MB');
    const incoming = validateLibrary(JSON.parse(await file.text()));
    const merged = mergeLibrary(library, incoming), added = merged.candidates.length - library.candidates.length;
    if (commit(merged)) { syncFilter(); renderDetail(); toast(`导入完成，新增 ${added} 件；相同编号保留当前记录`); }
  } catch (error) { toast('导入失败：' + error.message); }
  event.target.value = '';
};
window.addEventListener('storage', event => {
  if (event.key !== KEY && event.key !== null) return;
  try { library = event.newValue ? validateLibrary(JSON.parse(event.newValue)) : emptyLibrary(); persistenceBlocked = false; syncFilter(); renderDetail(); if (editor.open) { editor.close(); toast('收藏已在另一个页面更新，请重新打开编辑'); } }
  catch { persistenceBlocked = true; toast('其他页面的收藏数据格式有误，已暂停写入'); }
});
async function init() {
  try { const saved = localStorage.getItem(KEY); if (saved) library = validateLibrary(JSON.parse(saved)); }
  catch { persistenceBlocked = true; toast('原有收藏无法读取，已保留原始数据并暂停写入。'); }
  try {
    const fetchJson = async path => { const response = await fetch(new URL(path, document.baseURI)); if (!response.ok) throw new Error('清单读取失败'); return response.json(); };
    const [catalog, swamp] = await Promise.all([fetchJson('../assets/library/catalog.json'), fetchJson('../assets/swamp/asset-manifest.json')]);
    retiredAssets = catalog.retiredAssets || [];
    builtins = [catalog.assets[0], ...swamp.assets.map(item => ({ ...item, id: 'builtin-' + item.id, category: item.role === 'boat' ? 'boat' : 'nature', stage: 'integrated', kind: 'model', usage: item.usage || (item.role === 'boat' ? '月下湿地 · 探索艇' : '月下湿地 · 岸景'), tags: item.tags || (item.role === 'boat' ? '探索艇, 湿地' : '自然, 湿地, 岸景'), notes: item.changes.join('\n'), favorite: false })), ...catalog.assets.slice(1), ...SCENE_ASSETS];
    select(builtins[0]?.id || library.candidates[0]?.id || null);
  } catch { $('#preview-message').textContent = '项目素材清单加载失败，请刷新重试。'; toast('项目清单读取失败；个人收藏仍可使用。'); select(library.candidates[0]?.id || null); }
}
init();
