// 键盘输入：WASD / 方向键、Shift 冲刺、空格收油
export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.override = null;   // 测试/自动驾驶注入
    this._onDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 在设置里用方向键调滑块、输入数字时，不同时驾驶船。
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.add(k);
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    };
    this._onUp = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    };
    this._onBlur = () => this.clear();
    target.addEventListener('keydown', this._onDown, { passive: false });
    target.addEventListener('keyup', this._onUp);
    target.addEventListener('blur', this._onBlur);
  }
  has(...keys) { return keys.some((k) => this.keys.has(k)); }
  /** 返回 {throttle:-1..1, steer:-1..1, boost:bool} */
  read() {
    if (this.override) return { ...this.override, boost: !!this.override.boost };
    let throttle = 0, steer = 0;
    if (this.has('w', 'ArrowUp')) throttle += 1;
    if (this.has('s', 'ArrowDown')) throttle -= 1;
    if (this.has('a', 'ArrowLeft')) steer -= 1;
    if (this.has('d', 'ArrowRight')) steer += 1;
    if (this.has(' ') && throttle > 0) throttle = 0;
    return { throttle, steer, boost: this.has('Shift') };
  }
  setOverride(v) { this.override = v; }
  clear() { this.keys.clear(); this.override = null; }
}

export const keyLabel = { w: 'W', a: 'A', s: 'S', d: 'D' };
