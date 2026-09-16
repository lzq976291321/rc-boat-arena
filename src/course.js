// 赛道构建：中心线、门（起点/终点 + 检查点）、浮标布置、世界碰撞体
// 纯 JS，可在 Node 中测试
import { TRACK, WORLD, RACE } from './config.js';

const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };

export function buildCourse() {
  const wp = TRACK.waypoints;
  const gates = [];
  const centerline = [];

  for (let i = 0; i < wp.length; i++) {
    const prev = wp[(i - 1 + wp.length) % wp.length];
    const next = wp[(i + 1) % wp.length];
    const dir = norm(next.x - prev.x, next.z - prev.z);   // 行进方向
    const perp = { x: -dir.z, z: dir.x };
    centerline.push({ x: wp[i].x, z: wp[i].z, dirX: dir.x, dirZ: dir.z, index: i });
    if (wp[i].gate) {
      gates.push({
        id: wp[i].gate === 'finish' ? 'finish' : `cp${gates.length}`,
        kind: wp[i].gate, index: i, order: gates.length,
        x: wp[i].x, z: wp[i].z,
        dirX: dir.x, dirZ: dir.z,
        perpX: perp.x, perpZ: perp.z,
        halfWidth: TRACK.gateHalfWidth,
      });
    }
  }

  // 比赛顺序：先按行进方向依次通过所有检查点，最后冲过终点线
  const cps = gates.filter((g) => g.kind === 'cp').sort((a, b) => {
    // 按沿中心线从起点出发的前进顺序排列
    const s = (g) => ((g.index - 0 + wp.length) % wp.length);
    return s(a) - s(b);
  });
  const finish = gates.find((g) => g.kind === 'finish');
  const sequence = [...cps, finish];
  sequence.forEach((g, i) => { g.seq = i; });

  // 浮标：航道两侧 + 门柱
  const buoys = [];
  const halfW = TRACK.halfWidth;
  const push = (x, z, kind, extra = {}) => {
    buoys.push({ x, z, r: kind === 'gate' ? RACE.buoyRadius * 1.15 : RACE.buoyRadius, kind, ...extra });
  };
  for (let i = 0; i < centerline.length; i++) {
    const c = centerline[i];
    const perpX = -c.dirZ, perpZ = c.dirX;
    for (const side of [1, -1]) {
      push(c.x + perpX * halfW * side, c.z + perpZ * halfW * side, 'lane');
    }
    // 中点补标，增强速度感
    const nxt = centerline[(i + 1) % centerline.length];
    const mx = (c.x + nxt.x) / 2, mz = (c.z + nxt.z) / 2;
    const md = norm(nxt.x - c.x, nxt.z - c.z);
    for (const side of [1, -1]) push(mx - md.z * halfW * side * 1, mz + md.x * halfW * side * 1, 'lane');
  }
  // 门柱（比赛用，带编号）
  sequence.forEach((g, i) => {
    push(g.x - g.perpX * g.halfWidth, g.z - g.perpZ * g.halfWidth, 'gate', { gateId: g.id, side: -1, seq: i });
    push(g.x + g.perpX * g.halfWidth, g.z + g.perpZ * g.halfWidth, 'gate', { gateId: g.id, side: 1, seq: i });
  });

  const world = {
    shore: { a: WORLD.lakeA, b: WORLD.lakeB, margin: 4 },
    islet: { x: WORLD.islet.x, z: WORLD.islet.z, r: WORLD.islet.r },
    buoys,
  };

  return { centerline, gates, sequence, buoys, world, finish, checkpoints: cps, waypoints: wp };
}

/** 2D 线段相交（用于过门检测），返回交点参数或 null */
export function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rX = bx - ax, rZ = bz - az;
  const sX = dx - cx, sZ = dz - cz;
  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((cx - ax) * sZ - (cz - az) * sX) / denom;
  const u = ((cx - ax) * rZ - (cz - az) * rX) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + t * rX, z: az + t * rZ };
}

/** 判断一次位移是否沿正确方向通过某个门 */
export function crossedGate(gate, x0, z0, x1, z1) {
  const hit = segIntersect(
    x0, z0, x1, z1,
    gate.x - gate.perpX * gate.halfWidth, gate.z - gate.perpZ * gate.halfWidth,
    gate.x + gate.perpX * gate.halfWidth, gate.z + gate.perpZ * gate.halfWidth,
  );
  if (!hit) return null;
  const mvX = x1 - x0, mvZ = z1 - z0;
  const dot = mvX * gate.dirX + mvZ * gate.dirZ;
  if (dot <= 0) return null;   // 方向错误（倒着穿门）不算
  return { ...hit, dot };
}

export function gateWorldNormal(gate) { return { x: gate.perpX, z: gate.perpZ }; }
