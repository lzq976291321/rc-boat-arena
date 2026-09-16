// 比赛规则：倒计时、顺序检查点、三圈计时、脱困与罚时（纯逻辑，可在 Node 测试）
// 计时口径：this.time 是纯比赛时钟；officialTime = time + penalty 才是成绩。
// 显示、结算、最好成绩一律用 officialTime，罚时不会被吞掉。
import { RACE, BASE } from './config.js';
import { crossedGate } from './course.js';

export const RaceState = { IDLE: 'idle', COUNTDOWN: 'countdown', RACING: 'racing', FINISHED: 'finished' };

export class Race {
  constructor(course, { laps = RACE.laps, countdown = RACE.countdown } = {}) {
    this.course = course;
    this.laps = laps;
    this.countdownTime = countdown;
    this.reset();
  }
  reset() {
    this.state = RaceState.IDLE;
    this.countdown = this.countdownTime;
    this.time = 0;              // 纯比赛时钟（秒，不含罚时）
    this.lap = 1;
    this.nextSeq = 0;           // 本圈下一个必须通过的门（course.sequence 下标）
    this.lapTimes = [];
    this.lapStart = 0;
    this.penalty = 0;           // 全程罚时合计（秒）
    this.lapPenalty = 0;        // 本圈罚时（秒）
    this.rescues = 0;
    this.cpPassed = 0;          // 本圈已通过检查点数（不含终点）
    this.lastGate = null;
    this.prevX = null; this.prevZ = null;
    this.message = '';
    this.splits = [];
    this.finishedAt = null;
    this.finalTime = null;
    this.lastLapTime = 0;
  }
  start() {
    this.reset();
    this.state = RaceState.COUNTDOWN;
    this.countdown = this.countdownTime;
  }
  /** 官方成绩口径：比赛时钟 + 罚时 */
  get officialTime() { return this.time + this.penalty; }
  /** 本圈用时（含本圈已产生的罚时） */
  get lapTime() {
    if (this.state === RaceState.FINISHED) return this.lastLapTime;
    return this.time - this.lapStart + this.lapPenalty;
  }
  get totalLaps() { return this.laps; }
  /** 检查点数量（不含终点线） */
  get checkpointTotal() { return this.course.checkpoints.length; }
  /** 判定门总数（检查点 + 终点线） */
  get gateTotal() { return this.course.sequence.length; }
  /** 当前是否处于"最后一道：终点线" */
  get onFinishGate() { return this.nextSeq === this.course.sequence.length - 1; }

  /** 固定步长更新；boat 会被就地修改（脱困） */
  update(dt, boat) {
    if (this.state === RaceState.COUNTDOWN) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = RaceState.RACING;
        this.time = 0;
        this.lapStart = 0;
        this.prevX = boat.x; this.prevZ = boat.z;
        return { event: 'go' };
      }
      this.prevX = boat.x; this.prevZ = boat.z;
      return null;
    }
    if (this.state !== RaceState.RACING) return null;

    this.time += dt;
    if (this.prevX === null) { this.prevX = boat.x; this.prevZ = boat.z; }
    const gate = this.course.sequence[this.nextSeq];
    const hit = crossedGate(gate, this.prevX, this.prevZ, boat.x, boat.z);
    this.prevX = boat.x; this.prevZ = boat.z;
    if (!hit) return null;

    this.lastGate = gate;
    this.splits.push({ gate: gate.id, t: this.officialTime });
    if (gate.kind === 'finish') {
      const lt = this.time - this.lapStart + this.lapPenalty;   // 含本圈罚时
      this.lapTimes.push(lt);
      this.lastLapTime = lt;
      this.lapStart = this.time;
      this.lapPenalty = 0;
      const done = this.lap >= this.laps;
      if (done) {
        this.state = RaceState.FINISHED;
        this.finishedAt = this.officialTime;
        this.finalTime = this.officialTime;
        return { event: 'finish', lapTime: lt, total: this.officialTime, rawTotal: this.time, penalty: this.penalty };
      }
      this.lap++;
      this.nextSeq = 0;
      this.cpPassed = 0;
      return { event: 'lap', lapTime: lt, lap: this.lap - 1, total: this.officialTime };
    }
    this.cpPassed++;
    this.nextSeq = (this.nextSeq + 1) % this.course.sequence.length;
    return { event: 'checkpoint', gate: gate.id, cpPassed: this.cpPassed, cpTotal: this.checkpointTotal };
  }

  /**
   * 传送/脱困后同步"上一帧位置"。
   * 不这样做的话，下一帧的位移线段会被当成一次穿门判定（会被用来刷检查点）。
   */
  resync(boat) { this.prevX = boat.x; this.prevZ = boat.z; }

  /** 仅测试/调试用：按正常口径强制结算（含罚时），走和真实完赛同一条路径 */
  forceFinish() {
    if (this.state !== RaceState.RACING) return null;
    const lt = this.lapTime;
    this.lastLapTime = lt;
    this.state = RaceState.FINISHED;
    this.finishedAt = this.officialTime;
    this.finalTime = this.officialTime;
    return { event: 'finish', lapTime: lt, total: this.officialTime, rawTotal: this.time, penalty: this.penalty };
  }

  /** 脱困：回到上一个已通过的门，+2 秒罚时（计入成绩） */
  rescue(boat) {
    if (this.state !== RaceState.RACING) {
      const start = this.course.finish;
      boat.x = start.x - start.dirX * 18; boat.z = start.z - start.dirZ * 18;
      boat.heading = Math.atan2(start.dirX, start.dirZ);
      boat.vx = boat.vz = 0; boat.yawRate = 0;
      this.resetBoatMotion(boat);
      this.resync(boat);
      return { penalty: 0 };
    }
    const gate = this.lastGate || this.course.finish;
    boat.x = gate.x - gate.dirX * 12;
    boat.z = gate.z - gate.dirZ * 12;
    boat.heading = Math.atan2(gate.dirX, gate.dirZ);
    boat.vx = boat.vz = 0; boat.yawRate = 0;
    this.resetBoatMotion(boat);
    this.resync(boat);                 // 脱困是传送：不能算作穿门
    const p = BASE.RESCUE_PENALTY / 1000;
    this.penalty += p;
    this.lapPenalty += p;
    this.rescues++;
    this.splits.push({ gate: 'rescue', t: this.officialTime, penalty: p });
    return { penalty: p, gate: gate.id, totalPenalty: this.penalty };
  }

  resetBoatMotion(boat) {
    boat.speed = boat.forwardSpeed = boat.slipAngle = 0;
    boat.longAccel = boat.latAccel = boat.stuckTime = 0;
    boat.spool = boat.roll = boat.pitch = 0;
    boat.lastHit = null;
    boat.hitCooldown = 0;
  }

  /** 供 HUD 使用的快照（时间口径统一为含罚时的成绩） */
  snapshot() {
    return {
      state: this.state,
      time: this.officialTime,
      rawTime: this.time,
      lap: this.lap,
      laps: this.laps,
      lapTime: this.lapTime,
      penalty: this.penalty,
      lapPenalty: this.lapPenalty,
      rescues: this.rescues,
      cpPassed: this.cpPassed,
      cpTotal: this.checkpointTotal,
      gateTotal: this.gateTotal,
      gatePassed: this.onFinishGate ? this.checkpointTotal : this.cpPassed,
      onFinishGate: this.onFinishGate,
      nextSeq: this.nextSeq,
      nextGateId: this.course.sequence[this.nextSeq]?.id ?? null,
      nextGateKind: this.course.sequence[this.nextSeq]?.kind ?? null,
      lapTimes: this.lapTimes.slice(),
      lastLapTime: this.lastLapTime,
      finalTime: this.finalTime,
    };
  }
}
