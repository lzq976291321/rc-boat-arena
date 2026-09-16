// 纯 JS 操控物理（不依赖 three.js，可在 Node 中直接测试）
// 模型：喷水推进推力 + 速度相关阻力 + 前向/横向分解的抓地力
import { BASE } from './config.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** 与水面着色器一致的程序化波浪高度 */
export function waveHeight(x, z, t = 0) {
  return 0.34 * Math.sin(x * 0.052 + t * 1.30)
       + 0.24 * Math.sin(z * 0.068 - t * 1.02)
       + 0.13 * Math.sin((x + z) * 0.121 + t * 2.05);
}

/**
 * 方向约定（全项目统一，改这里之前先读）：
 * - 朝向 h：forward = (sin h, cos h)，three.js 里 rotation.y = h。
 *   R_y(h) 把 +Z 转向 +X，所以 **h 增大 = 左转**（俯视逆时针）。
 * - 右向量（真正的右手侧）：right = forward × up = (-cos h, sin h)；
 *   (cos h, -sin h) 是左侧。早期版本把它当右向量，导致按 D 实际左转。
 * - 玩家输入 steer=+1 始终表示「右」。
 * - 偏航：yawRate = dh/dt，右转时 yawRate < 0。
 * - 侧倾：roll > 0 表示「向右压弯（右舷下沉）」，对应 mesh 的 rotation.z > 0。
 */
export function createBoat(x, z, heading = 0) {
  return {
    x, z, heading,
    vx: 0, vz: 0,
    yawRate: 0,
    throttle: 0, steer: 0, boost: false,
    spool: 0,            // 喷水推进建压 0..1
    forwardSpeed: 0, speed: 0, slipAngle: 0,
    longAccel: 0, latAccel: 0,
    bob: 0, pitch: 0, roll: 0,
    hitCooldown: 0, lastHit: null, collisions: 0,
    stuckTime: 0,
  };
}

/**
 * 物理积分一步。
 * @param {object} b 船状态（原地修改）
 * @param {{throttle:number,steer:number,boost:boolean}} cmd 输入
 * @param {object} params 可调参数 {thrust, steerSensitivity, waterDrag, lateralSlip}
 * @param {number} dt 固定步长
 * @param {object} world 世界（岸线/浮标/小岛）
 */
export function stepBoat(b, cmd, params, dt, world, time) {
  const thrust = params.thrust, steerSens = params.steerSensitivity;
  const dragK = params.waterDrag, slip = params.lateralSlip;

  // --- 推进器建压（有滞后，产生加速抬头感）
  const tgtSpool = Math.abs(cmd.throttle) > 0.01 ? 1 : 0;
  const rate = dt / (tgtSpool > b.spool ? BASE.SPOOL_TIME : BASE.SPOOL_TIME * 1.6);
  b.spool = clamp(b.spool + Math.sign(tgtSpool - b.spool) * rate, 0, 1);

  b.throttle = cmd.throttle; b.steer = cmd.steer; b.boost = !!cmd.boost;

  // --- 基向量
  const sh = Math.sin(b.heading), ch = Math.cos(b.heading);
  const fwdX = sh, fwdZ = ch;      // 前向
  const rgtX = -ch, rgtZ = sh;           // 右向（真正的右侧）
  let vf = b.vx * fwdX + b.vz * fwdZ;   // 前向速度
  let vl = b.vx * rgtX + b.vz * rgtZ;    // 横向速度（正 = 向右侧滑）

  // --- 推力：喷水推进，高速时效率下降
  const boostMul = cmd.boost && cmd.throttle > 0 ? BASE.BOOST_FACTOR : 1;
  const dir = cmd.throttle >= 0 ? 1 : BASE.REVERSE_FACTOR;
  const speedFade = 1 - 0.72 * clamp(Math.abs(vf) / BASE.MAX_SPEED, 0, 1);
  const thrustAcc = cmd.throttle * BASE.THRUST_FORCE * thrust * dir * boostMul * b.spool * speedFade;

  // --- 阻力：线性 + 二次，高速进入滑行状态后减阻
  const planing = 1 - BASE.PLANING * clamp(Math.abs(vf) / 24, 0, 1);
  const dragF = -(BASE.DRAG_LINEAR * vf + BASE.DRAG_QUAD * vf * Math.abs(vf) * planing) * dragK;
  // 漂移时额外掉速
  // 横滑只消耗前向动能；不能用横滑方向决定前向力，否则一侧转弯会凭空加速。
  const slipLoss = -Math.sign(vf) * BASE.SLIP_DRAG * vl * vl * 0.35 * dragK;

  // --- 横向抓地：slip=0 抓地强，slip=1 甩尾
  const grip = lerp(BASE.GRIP_MAX, BASE.GRIP_MIN, clamp(slip, 0, 1));
  const gripAcc = -grip * vl;

  b.longAccel = thrustAcc + dragF + slipLoss;
  b.latAccel = gripAcc;

  // --- 舵：低速转向弱，高速略收敛；倒车反向
  const spdFactor = clamp(Math.abs(vf) / BASE.TURN_SPEED_REF, 0, 1)
    * (1 - BASE.TURN_HIGHSPEED_LOSS * clamp(Math.abs(vf) / BASE.MAX_SPEED, 0, 1));
  const dirSign = vf < -0.4 ? -1 : 1;
  // steer=+1 是右舵；h 增大是左转，所以取负号
  const yawTarget = -cmd.steer * BASE.YAW_RATE * steerSens * spdFactor * dirSign;
  b.yawRate += (yawTarget - b.yawRate) * clamp(BASE.YAW_RESPONSE * dt, 0, 1);

  // --- 积分
  b.vx += (fwdX * b.longAccel + rgtX * b.latAccel) * dt;
  b.vz += (fwdZ * b.longAccel + rgtZ * b.latAccel) * dt;
  b.heading += b.yawRate * dt;

  const sp = Math.hypot(b.vx, b.vz);
  if (sp > BASE.MAX_SPEED) { const k = BASE.MAX_SPEED / sp; b.vx *= k; b.vz *= k; }

  const px = b.x, pz = b.z;
  b.x += b.vx * dt;
  b.z += b.vz * dt;

  // --- 重新分解速度用于反馈
  const sh2 = Math.sin(b.heading), ch2 = Math.cos(b.heading);
  b.forwardSpeed = b.vx * sh2 + b.vz * ch2;
  b.speed = Math.hypot(b.vx, b.vz);
  const latNow = b.vx * -ch2 + b.vz * sh2;   // 正 = 向右侧滑
  b.slipAngle = Math.atan2(latNow, Math.max(0.001, Math.abs(b.forwardSpeed))) * (b.forwardSpeed < 0 ? -1 : 1);

  // --- 世界碰撞
  b.hitCooldown = Math.max(0, b.hitCooldown - dt);
  collideWorld(b, world, dt, px, pz);
  // 碰撞会直接改变速度，HUD、回放和卡住判定必须读取碰撞后的值。
  b.forwardSpeed = b.vx * sh2 + b.vz * ch2;
  b.speed = Math.hypot(b.vx, b.vz);

  // --- 卡住检测
  if (b.speed < BASE.STUCK_SPEED && Math.abs(cmd.throttle) > 0.1) b.stuckTime += dt;
  else b.stuckTime = Math.max(0, b.stuckTime - dt * 2);

  // --- 姿态：波浪起伏 + 加速抬头 + 转弯侧倾
  const h = waveHeight(b.x, b.z, time);
  const hf = waveHeight(b.x + sh2 * 1.4, b.z + ch2 * 1.4, time);
  const hr = waveHeight(b.x - ch2 * 1.4, b.z + sh2 * 1.4, time);
  b.bob = h;
  const wavePitch = Math.atan2(h - hf, 1.4);
  const waveRoll = Math.atan2(h - hr, 1.4);
  const accelPitch = clamp(-b.longAccel / 90, -0.16, 0.20);   // 加速抬头
  // 右转：yawRate<0、向外侧滑 latNow<0 → 两项都取负号后为正，即 roll>0 = 向右压弯
  const turnRoll = clamp(-(b.yawRate * Math.max(b.forwardSpeed, 0)) / 34, -0.34, 0.34)
                 + clamp(-latNow / 26, -0.22, 0.22);
  b.pitch = wavePitch * 0.8 + accelPitch;
  b.roll = waveRoll * 0.8 + turnRoll;
  return b;
}

/** 岸线（椭圆）、内场小岛与浮标碰撞 */
export function collideWorld(b, world, dt, px, pz) {
  let hit = false, hitKind = null;

  // 椭圆岸线
  if (world && world.shore) {
    const { a, b: bb, margin } = world.shore;
    const ea = a - margin, eb = bb - margin;
    const k = (b.x * b.x) / (ea * ea) + (b.z * b.z) / (eb * eb);
    if (k > 1) {
      const s = 1 / Math.sqrt(k);
      const nx = b.x * s, nz = b.z * s;              // 边界点
      const nlen = Math.hypot(nx / (ea * ea), nz / (eb * eb)) || 1;
      const nX = -(nx / (ea * ea)) / nlen, nZ = -(nz / (eb * eb)) / nlen; // 指向湖心的法线
      b.x = nx + nX * 0.35; b.z = nz + nZ * 0.35;
      reflect(b, nX, nZ);
      hit = true; hitKind = 'shore';
    }
  }

  // 内场小岛
  if (world && world.islet) {
    const { x: ix, z: iz, r } = world.islet;
    const dx = b.x - ix, dz = b.z - iz, d = Math.hypot(dx, dz);
    if (d < r) {
      const nX = d > 0.001 ? dx / d : 1, nZ = d > 0.001 ? dz / d : 0;
      b.x = ix + nX * r; b.z = iz + nZ * r;
      reflect(b, nX, nZ);
      hit = true; hitKind = 'islet';
    }
  }

  // 浮标
  if (world && world.buoys) {
    for (let i = 0; i < world.buoys.length; i++) {
      const bu = world.buoys[i];
      const dx = b.x - bu.x, dz = b.z - bu.z;
      const rr = bu.r + 1.5;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2);
        // 正好撞到浮标中心也要有有效法线，优先沿来路退出。
        const fromX = (px ?? b.x) - bu.x, fromZ = (pz ?? b.z) - bu.z;
        const fromLength = Math.hypot(fromX, fromZ);
        const nX = d > 0.001 ? dx / d : fromLength > 0.001 ? fromX / fromLength : 1;
        const nZ = d > 0.001 ? dz / d : fromLength > 0.001 ? fromZ / fromLength : 0;
        // 软碰撞：只做部分位置修正 + 切向保留，允许把浮标蹭开而不是被钉住
        const push = rr - d;
        b.x += nX * push * 0.55; b.z += nZ * push * 0.55;
        const vn = b.vx * nX + b.vz * nZ;
        if (vn < 0) {
          const vtx = b.vx - vn * nX, vtz = b.vz - vn * nZ;
          b.vx = vtx * 0.94 - vn * 0.32 * nX;
          b.vz = vtz * 0.94 - vn * 0.32 * nZ;
          b.yawRate *= 0.85;
        }
        hit = true; hitKind = 'buoy';
        if (b.hitCooldown <= 0) {
          b.collisions++;
          b.lastHit = { kind: 'buoy', x: bu.x, z: bu.z, t: bu.t ?? 0, index: i };
          b.hitCooldown = 0.45;
          if (bu.onHit) bu.onHit();
        }
      }
    }
  }

  if (hit && hitKind !== 'buoy') {
    if (b.hitCooldown <= 0) {
      b.collisions++;
      b.lastHit = { kind: hitKind, x: b.x, z: b.z, t: 0 };
      b.hitCooldown = 0.5;
    }
  }
  return hit;
}

/** 碰撞响应：法向弹回 + 切向保留（可沿岸边蹭行，不会钉死在墙上） */
function reflect(b, nX, nZ) {
  const vn = b.vx * nX + b.vz * nZ;
  if (vn < 0) {
    const vtx = b.vx - vn * nX, vtz = b.vz - vn * nZ;   // 切向分量
    const newVn = -vn * BASE.COLLISION_RESTITUTION;      // 弹回一点
    b.vx = vtx * 0.86 + newVn * nX;
    b.vz = vtz * 0.86 + newVn * nZ;
    b.yawRate *= 0.6;
  }
}
