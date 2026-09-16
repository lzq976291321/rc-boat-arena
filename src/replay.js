// 回放：记录一局的位置/朝向/时间与比赛状态，按记录数据播放（不重新模拟）
const SAMPLE_HZ = 30;

export class Recorder {
  constructor(hz = SAMPLE_HZ) { this.hz = hz; this.reset(); }
  reset() {
    this.frames = [];
    this.meta = null;
    this._next = 0;
    this._active = false;
  }
  start(meta = {}) {
    this.reset();
    this.meta = { ...meta, sampleHz: this.hz, startedAt: Date.now() };
    this._active = true;
  }
  stop(extra = {}) {
    this._active = false;
    if (this.meta) {
      const timeline = this.frames.at(-1)?.t ?? 0;
      const raceClockEnd = this.frames.at(-1)?.rt ?? timeline;
      this.meta = {
        ...this.meta, ...extra,
        endedAt: Date.now(),
        frames: this.frames.length,
        duration: timeline,                                    // 时间轴长度（比赛时钟）
        raceClock: raceClockEnd,                               // 同一时刻的官方成绩（含罚时）
        actualRate: timeline > 0 ? this.frames.length / timeline : 0,  // 实测采样率
      };
    }
    return this.frames.length;
  }
  get active() { return this._active; }
  /**
   * 按固定频率采样。
   * @param t 比赛时钟（单调，不含罚时）——用它做时间轴键，采样率才稳定
   * @param race 用于记录官方成绩（含罚时）与比赛状态
   */
  sample(t, boat, input, race, { force = false } = {}) {
    if (!this._active) return;
    const previous = this.frames.at(-1);
    const cut = previous && race && previous.rc !== race.rescues;
    const event = previous && race && (previous.nextSeq !== race.nextSeq || previous.lap !== race.lap || previous.state !== race.state);
    if (!force && !cut && !event && t < this._next - 1e-6) return;
    if (t >= this._next - 1e-6) this._next = t + 1 / this.hz;
    const frame = {
      t: +t.toFixed(4),
      rt: race ? +race.officialTime.toFixed(3) : +t.toFixed(3),
      x: +boat.x.toFixed(3), z: +boat.z.toFixed(3),
      h: +boat.heading.toFixed(4),
      v: +boat.speed.toFixed(2),
      vf: +(boat.forwardSpeed ?? boat.speed).toFixed(2),
      yaw: +(boat.yawRate ?? 0).toFixed(4),
      bob: +(boat.bob ?? 0).toFixed(3),
      slip: +boat.slipAngle.toFixed(3),
      roll: +boat.roll.toFixed(3), pitch: +boat.pitch.toFixed(3),
      th: input ? +input.throttle.toFixed(2) : 0,
      st: input ? +input.steer.toFixed(2) : 0,
      boost: input && input.boost ? 1 : 0,
      // 比赛状态：回放时仪表要跟着录像走
      lap: race ? race.lap : 1,
      cp: race ? race.cpPassed : 0,
      lt: race ? +race.lapTime.toFixed(2) : 0,
      pen: race ? race.penalty : 0,
      rc: race ? race.rescues : 0,
      hits: boat.collisions ?? 0,
      nextSeq: race ? race.nextSeq : 0,
      state: race ? race.state : 'racing',
      cut: !!cut,
    };
    // 同一个时钟点的最终状态覆盖旧值，保持二分查找的时间轴严格递增。
    if (previous?.t === frame.t) this.frames[this.frames.length - 1] = frame;
    else this.frames.push(frame);
  }
  serialize() { return { meta: this.meta, frames: this.frames }; }
}

const lerp = (a, b, k) => a + (b - a) * k;
function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class ReplayPlayer {
  constructor(recording) {
    this.recording = recording || { meta: null, frames: [] };
    this.frames = this.recording.frames || [];
    this.t = 0;
    this.playing = false;
    this.speed = 1;
  }
  /** 时间轴长度取自最后一帧的比赛时钟，不用"帧数 / 名义帧率"估算 */
  get duration() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }
  get meta() { return this.recording.meta; }
  get empty() { return this.frames.length === 0; }
  get sampleRate() {
    if (this.meta?.actualRate) return this.meta.actualRate;
    return this.duration > 0 ? this.frames.length / this.duration : 0;
  }
  play() { if (this.empty) return false; if (this.t >= this.duration) this.t = 0; this.playing = true; return true; }
  pause() { this.playing = false; }
  restart() { this.t = 0; return this.play(); }
  seek(t) { this.t = Math.max(0, Math.min(t, this.duration)); }
  update(dt) {
    if (this.playing) {
      this.t += dt * this.speed;
      if (this.t >= this.duration) { this.t = this.duration; this.playing = false; }
    }
    return this.poseAt(this.t);
  }
  /** 位置/朝向做插值；离散事件只在真正发生时生效，脱困不插值穿过赛道。 */
  poseAt(t) {
    const f = this.frames;
    if (!f.length) return null;
    if (t <= f[0].t) return { ...f[0] };
    if (t >= f[f.length - 1].t) return { ...f[f.length - 1] };
    let lo = 0, hi = f.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (f[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = f[lo], b = f[hi];
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    const blend = b.cut ? 0 : k;
    const sameLap = a.lap === b.lap;
    return {
      t,
      x: lerp(a.x, b.x, blend), z: lerp(a.z, b.z, blend),
      h: lerpAngle(a.h, b.h, blend),
      v: lerp(a.v, b.v, blend),
      vf: lerp(a.vf ?? a.v, b.vf ?? b.v, blend),
      yaw: lerp(a.yaw ?? 0, b.yaw ?? 0, blend),
      bob: lerp(a.bob ?? 0, b.bob ?? 0, blend),
      slip: lerp(a.slip, b.slip, blend),
      roll: lerp(a.roll, b.roll, blend), pitch: lerp(a.pitch, b.pitch, blend),
      th: a.th, st: a.st, boost: a.boost,
      lap: a.lap, cp: a.cp,
      lt: sameLap && a.pen === b.pen ? lerp(a.lt, b.lt, k) : a.lt + t - a.t,
      pen: a.pen, rc: a.rc, hits: a.hits ?? 0, nextSeq: a.nextSeq, state: a.state, cut: a.cut,
      // 罚时是离散事件，不能在脱困前就开始缓慢增加。
      rt: (a.rt ?? a.t) + t - a.t,
    };
  }
}
