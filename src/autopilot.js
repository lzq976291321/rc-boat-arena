// 简易 AI 领航：用于演示圈与自动化验证（沿中心线追踪下一个门）
import { clamp } from './physics.js';

export class Autopilot {
  constructor(course) {
    this.course = course;
    this.target = 0;
    this.lookahead = 16;
  }
  reset() { this.target = 0; }
  /** 返回 {throttle, steer, boost} */
  drive(boat) {
    const seq = this.course.centerline;
    // 选择最近的、位于前方的中心线点作为追踪目标
    let best = this.target, bestD = Infinity;
    for (let k = -1; k <= 4; k++) {
      const i = (this.target + k + seq.length) % seq.length;
      const p = seq[i];
      const d = Math.hypot(p.x - boat.x, p.z - boat.z);
      if (d < bestD) { bestD = d; best = i; }
    }
    this.target = best;
    const p = seq[(this.target + 1) % seq.length];
    const dx = p.x - boat.x, dz = p.z - boat.z;
    // 角度误差（右转为正）
    const desired = Math.atan2(dx, dz);
    let err = desired - boat.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    // err>0 = 目标在 heading 增大的一侧 = 船的左侧（见 physics.js 约定），需要负 steer
    const steer = clamp(-err * 1.55, -1, 1);
    const sharp = Math.abs(err);
    let throttle = 1;
    if (sharp > 0.85) throttle = 0.32;
    else if (sharp > 0.5) throttle = 0.62;
    else if (sharp > 0.28) throttle = 0.85;
    const dist = Math.hypot(dx, dz);
    if (dist < 12 && sharp > 1.0) throttle = 0.2;
    return { throttle, steer, boost: sharp < 0.22 && boat.speed < 26 };
  }
}
