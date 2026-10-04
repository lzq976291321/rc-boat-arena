export const KEY = 'rc-asset-library-v1';
export const categories = { boat: '船艇', prop: '道具', nature: '自然植被', structure: '场景建筑', material: '材质 / 其他', scene: '观赏资产' };
export const stages = { candidate: '待筛选', shortlist: '已优选', ready: '待接入', integrated: '已接入' };
export const licenses = { unknown: '待确认', 'CC0-1.0': 'CC0', 'CC-BY-4.0': 'CC BY 4.0', purchased: '已购许可', custom: '自定义许可' };
export function webUrl(value) {
  if (!value) return '';
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function validateLibrary(data) {
  if (data?.version !== 1 || !Array.isArray(data.candidates) || data.candidates.length > 1000 || !data.annotations || typeof data.annotations !== 'object' || Array.isArray(data.annotations)) throw new Error('不是有效的素材库备份（version: 1）');
  const ids = new Set();
  const candidates = data.candidates.map(item => {
    if (!item || typeof item.id !== 'string' || !/^user-[a-zA-Z0-9-]+$/.test(item.id) || ids.has(item.id)) throw new Error('素材编号重复或无效');
    ids.add(item.id);
    for (const field of ['name', 'source', 'author', 'license', 'licenseUrl', 'notes', 'tags']) if (typeof item[field] !== 'string' || item[field].length > 5000) throw new Error('素材字段缺失或过长');
    if (!item.name.trim() || !Object.hasOwn(categories, item.category) || !['candidate', 'shortlist', 'ready'].includes(item.stage) || !Object.hasOwn(licenses, item.license) || typeof item.favorite !== 'boolean') throw new Error('素材分类或状态无效');
    if ((item.source && !webUrl(item.source)) || (item.licenseUrl && !webUrl(item.licenseUrl))) throw new Error('来源和许可地址必须是 http / https 链接');
    return Object.fromEntries(['id', 'name', 'category', 'stage', 'source', 'author', 'license', 'licenseUrl', 'notes', 'tags', 'favorite'].map(key => [key, item[key]]));
  });
  const annotations = Object.create(null);
  for (const [id, item] of Object.entries(data.annotations)) {
    if (!/^builtin-[a-z0-9-]+$/.test(id) || typeof item?.favorite !== 'boolean' || typeof item.notes !== 'string' || item.notes.length > 5000) throw new Error('项目资产备注无效');
    annotations[id] = { favorite: item.favorite, notes: item.notes };
  }
  return { version: 1, candidates, annotations };
}
export function emptyLibrary() { return { version: 1, candidates: [], annotations: {} }; }
export function mergeLibrary(current, incoming) {
  const candidates = new Map(current.candidates.map(item => [item.id, item]));
  // Existing records win: importing an older backup cannot silently overwrite recent edits.
  for (const item of incoming.candidates) if (!candidates.has(item.id)) candidates.set(item.id, item);
  return validateLibrary({ version: 1, candidates: [...candidates.values()], annotations: { ...incoming.annotations, ...current.annotations } });
}
