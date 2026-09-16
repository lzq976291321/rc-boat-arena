// 物理参数体检：验证参数确实影响运动（Node 直接运行，无需浏览器）
// 自由空间测试（world=null）测性能；带世界测试测边界碰撞。
import { createBoat, stepBoat } from '../src/physics.js';
import { buildCourse } from '../src/course.js';
import { DEFAULT_PARAMS, PRESETS } from '../src/config.js';

const course = buildCourse();
const DT = 1 / 120;
const FREE = null;

function run(params, cmd, seconds, start = { x: 0, z: 0, h: 0 }, world = FREE) {
  const b = createBoat(start.x, start.z, start.h);
  const n = Math.round(seconds / DT);
  let t = 0; const track = [];
  for (let i = 0; i < n; i++) {
    stepBoat(b, typeof cmd === 'function' ? cmd(b, t) : cmd, params, DT, world, t);
    t += DT;
    if (i % 12 === 0) track.push({ t, x: b.x, z: b.z, v: b.speed, slip: b.slipAngle, yaw: b.yawRate });
  }
  return { b, track };
}

const topSpeed = (p) => run(p, { throttle: 1, steer: 0, boost: false }, 25).b.speed;
const topSpeedBoost = (p) => run(p, { throttle: 1, steer: 0, boost: true }, 25).b.speed;
const accelTime = (p, target) => {
  for (let i = 0; i < 25 / DT; i++) { /* noop */ }
  const { track } = run(p, { throttle: 1, steer: 0, boost: false }, 25);
  for (const s of track) if (s.v >= target) return s.t;
  return Infinity;
};
/** 定速转弯：用简单控制器把速度稳在 target，比较同等速度下的回转半径 */
function turnMetrics(p, target = 18) {
  const b = createBoat(0, 0, 0);
  let t = 0, sumYaw = 0, n = 0, sumSlip = 0;
  for (let i = 0; i < 24 / DT; i++) {
    const throttle = cap((target - b.speed) * 0.35 + 0.32, -1, 1);
    stepBoat(b, { throttle, steer: 1, boost: false }, p, DT, FREE, t); t += DT;
    if (i > 8 / DT) { sumYaw += b.yawRate; sumSlip += Math.abs(b.slipAngle); n++; }
  }
  const yaw = sumYaw / n;
  return { radius: Math.abs(target / (yaw || 1e-6)), yaw, slipDeg: (sumSlip / n) * 180 / Math.PI };
}
const cap = (v, a, b2) => (v < a ? a : v > b2 ? b2 : v);
function driftTest(p) {
  const b = createBoat(0, 0, 0);
  let t = 0;
  for (let i = 0; i < 10 / DT; i++) { stepBoat(b, { throttle: 1, steer: 0 }, p, DT, FREE, t); t += DT; }
  const vBefore = b.speed;
  let maxSlip = 0, lateral = 0;
  for (let i = 0; i < 1.4 / DT; i++) {
    stepBoat(b, { throttle: 1, steer: 1 }, p, DT, FREE, t); t += DT;
    const ch = Math.cos(b.heading), sh = Math.sin(b.heading);
    lateral = Math.abs(b.vx * ch - b.vz * sh);
    maxSlip = Math.max(maxSlip, Math.abs(b.slipAngle));
  }
  return { vBefore, vAfter: b.speed, loss: 1 - b.speed / vBefore, lateral, maxSlip: maxSlip * 180 / Math.PI };
}

const sets = { '默认 default': DEFAULT_PARAMS, '稳定 stable': PRESETS.stable, '灵活 agile': PRESETS.agile };
const rows = [];
for (const [name, p] of Object.entries(sets)) {
  const turn = turnMetrics(p), drift = driftTest(p);
  rows.push({
    参数组: name,
    极速: topSpeed(p).toFixed(1),
    冲刺极速: topSpeedBoost(p).toFixed(1),
    '0→15m/s': accelTime(p, 15).toFixed(2) + 's',
    稳态转弯半径: turn.radius.toFixed(1),
    稳态滑移角: turn.slipDeg.toFixed(1) + '°',
    急转横移速度: drift.lateral.toFixed(1),
    '急转1.4s掉速': (drift.loss * 100).toFixed(0) + '%',
  });
}
console.table(rows);

// 边界碰撞自检：全速直冲岸边 → 倒车脱困
const CLEAN = { shore: course.world.shore, islet: course.world.islet, buoys: [] };
function shoreTest() {
  const b = createBoat(0, 0, Math.PI / 2);
  let t = 0, hitT = null, maxK = 0, maxOutK = 0;
  for (let i = 0; i < 12 / DT; i++) {
    stepBoat(b, { throttle: 1, steer: 0 }, DEFAULT_PARAMS, DT, CLEAN, t); t += DT;
    const k = (b.x / course.world.shore.a) ** 2 + (b.z / course.world.shore.b) ** 2;
    maxK = Math.max(maxK, k);
    if (b.lastHit && b.lastHit.kind === 'shore' && hitT === null) hitT = t;
  }
  const pinned = b.speed;
  for (let i = 0; i < 4 / DT; i++) {   // 倒车
    stepBoat(b, { throttle: -1, steer: 0.4 }, DEFAULT_PARAMS, DT, CLEAN, t); t += DT;
    maxOutK = Math.max(maxOutK, (b.x / course.world.shore.a) ** 2 + (b.z / course.world.shore.b) ** 2);
  }
  return { hitT, maxK, pinned, escapedSpeed: b.speed, escapedAt: { x: +b.x.toFixed(1), z: +b.z.toFixed(1) }, maxOutK, collisions: b.collisions };
}
const st = shoreTest();
console.log('触岸时刻:', st.hitT ? st.hitT.toFixed(2) + 's' : '未触发(异常)',
  '| 顶岸速度:', st.pinned.toFixed(2), '| 倒车4s后速度:', st.escapedSpeed.toFixed(2), '位置', JSON.stringify(st.escapedAt),
  '| 碰撞后越界比(应≈1):', st.maxK.toFixed(3), st.maxOutK.toFixed(3), '| 碰撞次数:', st.collisions);

// 浮标软碰撞自检：撞上后应继续前进而不是被钉死
function buoyTest() {
  const g = course.buoys.find((x) => x.kind === 'lane');
  const b = createBoat(g.x, g.z - 40, 0);
  let t = 0, hit = null;
  for (let i = 0; i < 6 / DT; i++) {
    stepBoat(b, { throttle: 1, steer: 0 }, DEFAULT_PARAMS, DT, course.world, t); t += DT;
    if (b.lastHit && b.lastHit.kind === 'buoy' && !hit) hit = { t: +t.toFixed(2), speed: +b.speed.toFixed(1) };
  }
  return { hit, collisions: b.collisions, endSpeed: +b.speed.toFixed(1), endPos: { x: +b.x.toFixed(1), z: +b.z.toFixed(1) } };
}
const bt = buoyTest();
console.log('浮标软碰撞:', bt.hit ? `首次 t=${bt.hit.t}s 速度 ${bt.hit.speed}` : '未触发',
  `| 6s 后仍在行驶速度 ${bt.endSpeed} 位置 ${JSON.stringify(bt.endPos)} | 计数 ${bt.collisions}`);

// 内场小岛碰撞
function isletTest() {
  const b = createBoat(0, -70, 0);
  let t = 0, hit = null;
  for (let i = 0; i < 6 / DT; i++) {
    stepBoat(b, { throttle: 1, steer: 0 }, DEFAULT_PARAMS, DT, CLEAN, t); t += DT;
    if (b.lastHit && b.lastHit.kind === 'islet' && !hit) hit = +t.toFixed(2);
  }
  return { hit, endSpeed: +b.speed.toFixed(1) };
}
const it = isletTest();
console.log('小岛碰撞:', it.hit ? `t=${it.hit}s` : '未触发(异常)', '| 6s 后速度', it.endSpeed);
console.log('门序列:', course.sequence.map((g) => g.id + '@' + g.index).join(' -> '));
console.log('浮标数:', course.buoys.length, '检查点数:', course.checkpoints.length);
