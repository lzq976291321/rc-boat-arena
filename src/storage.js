// 本地最好成绩（localStorage，刷新后仍可读取；不可用时自动降级为内存）
// AI 辅助局会计入历史，但不写入个人最好成绩（避免演示成绩污染纪录）。
const KEY = 'rc-boat-arena.records.v1';
const mem = { data: null };

function readRaw() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) { return mem.data; }
}
function writeRaw(data) {
  mem.data = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 隐私模式等：仅内存 */ }
}

export function loadRecords() {
  const d = readRaw();
  if (!d || typeof d !== 'object') return { bestTotal: null, bestLap: null, history: [] };
  return {
    bestTotal: typeof d.bestTotal === 'number' ? d.bestTotal : null,
    bestLap: typeof d.bestLap === 'number' ? d.bestLap : null,
    history: Array.isArray(d.history) ? d.history.slice(0, 20) : [],
  };
}

/**
 * 保存一局结果。
 * @param {object} r - { total, laps, lapTimes, params, preset, collisions, rescues, assisted }
 * @returns {{bestTotal:number|null, bestLap:number|null, isNewTotal:boolean, isNewLap:boolean, entry:object, personalBest:boolean}}
 */
export function saveResult({ total, laps, lapTimes, params, preset, collisions, rescues, assisted = false }) {
  const rec = loadRecords();
  const entry = {
    at: Date.now(), total, laps, lapTimes: lapTimes.slice(),
    preset: preset || null, params: { ...params },
    collisions: collisions ?? 0, rescues: rescues ?? 0,
    assisted: !!assisted,
  };
  const lapBest = lapTimes.length ? Math.min(...lapTimes) : null;
  let bestTotal = rec.bestTotal;
  let bestLap = rec.bestLap;
  let isNewTotal = false, isNewLap = false;
  if (!assisted) {
    if (bestTotal === null || total < bestTotal) { bestTotal = total; isNewTotal = true; }
    if (lapBest !== null && (bestLap === null || lapBest < bestLap)) { bestLap = lapBest; isNewLap = true; }
  }
  const history = [entry, ...rec.history].slice(0, 20);
  writeRaw({ bestTotal, bestLap, history });
  return { bestTotal, bestLap, isNewTotal, isNewLap, entry, personalBest: !assisted };
}

export function clearRecords() { writeRaw({ bestTotal: null, bestLap: null, history: [] }); }

export function formatTime(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '--.--';
  // 先按百分之一秒舍入再拆分，避免 59.999s 显示成 60.00 或 1:60.00。
  const hundredths = Math.max(0, Math.round(sec * 100));
  const m = Math.floor(hundredths / 6000);
  const s = ((hundredths % 6000) / 100).toFixed(2);
  return m > 0 ? `${m}:${s.padStart(5, '0')}` : s;
}
