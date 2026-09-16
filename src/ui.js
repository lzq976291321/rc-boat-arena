// HUD 与面板绑定：左上数据 / 中上目标 / 右上暂停 / 左下小地图 / 右下速度 / 暂停菜单 / 遥测
import { PARAM_RANGES, PRESETS, DEFAULT_PARAMS, WORLD } from './config.js';
import { formatTime } from './storage.js';

const $ = (id) => document.getElementById(id);
// 绑定助手：元素缺失时跳过，避免一个 DOM 改动让整个游戏起不来
const on = (el, ev, fn) => { if (el && el.addEventListener) el.addEventListener(ev, fn); };

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      lap: $('hud-lap'), lapTime: $('hud-lapTime'), total: $('hud-totalTime'), best: $('hud-bestTime'),
      cp: $('hud-cp'), next: $('hud-next-name'), nextTag: $('hud-next-tag'), nextDist: $('hud-next-dist'),
      nextBox: $('hud-next'),
      speed: $('hud-speed'), barSpeed: $('bar-speed'),
      countdown: $('countdown'), card: $('center-card'), title: $('center-title'), sub: $('center-sub'),
      actions: $('center-actions'), toast: $('center-toast'), fxRing: $('fx-ring'),
      panelTune: $('panel-tune'), panelReplay: $('panel-replay'), panelHelp: $('panel-help'),
      panelPause: $('panel-pause'), panelTelemetry: $('panel-telemetry'),
      tuneReadout: $('tune-readout'), replayInfo: $('replay-info'), replaySeek: $('replay-seek'),
      camBtn: $('btn-cam'), btnStart: $('btn-start'), rescue: $('btn-rescue'),
      minimap: $('minimap'), minimapCanvas: $('minimap-canvas'),
      telSpeed: $('tel-speed'), telThrottle: $('tel-throttle'), telSlip: $('tel-slip'),
      telYaw: $('tel-yaw'), telHits: $('tel-hits'), telFps: $('tel-fps'),
      touch: $('touch'), pauseBtn: $('btn-pause'),
    };
    this.sliders = {
      thrust: { input: $('s-thrust'), label: $('v-thrust') },
      steerSensitivity: { input: $('s-steer'), label: $('v-steer') },
      waterDrag: { input: $('s-drag'), label: $('v-drag') },
      lateralSlip: { input: $('s-slip'), label: $('v-slip') },
    };
    this.minimapCtx = this.el.minimapCanvas ? this.el.minimapCanvas.getContext('2d') : null;
    this.course = null;
    this._bind();
    this._toastTimer = 0;
  }

  setCourse(course) { this.course = course; }

  _bind() {
    on(this.el.btnStart, 'click', () => this.h.onStart?.());
    on($('btn-demo'), 'click', () => this.h.onDemo?.());
    on($('btn-home'), 'click', () => this.h.onHome?.());
    on($('btn-replay-race'), 'click', () => this.h.onStart?.());
    for (const btn of document.querySelectorAll('[data-panel]')) on(btn, 'click', () => this.togglePanel(btn.dataset.panel));
    on($('btn-restart'), 'click', () => this.h.onRestart?.());
    on(this.el.rescue, 'click', () => this.h.onRescue?.());
    on(this.el.pauseBtn, 'click', () => this.h.onPause?.());
    on($('btn-resume'), 'click', () => this.h.onResume?.());
    on($('btn-tune'), 'click', () => this.togglePanel('panel-tune'));
    on($('btn-telemetry'), 'click', () => this.togglePanel('panel-telemetry'));
    on($('btn-replay'), 'click', () => this.h.onToggleReplay?.());
    on($('btn-help'), 'click', () => this.togglePanel('panel-help'));
    on(this.el.camBtn, 'click', () => this.h.onToggleCamera?.());
    on($('btn-ai'), 'click', () => this.h.onToggleAi?.());
    for (const btn of document.querySelectorAll('[data-close]')) {
      btn.addEventListener('click', () => this.h.onResume?.());
    }
    for (const btn of document.querySelectorAll('[data-preset]')) {
      btn.addEventListener('click', () => this.h.onPreset?.(btn.dataset.preset));
    }
    for (const [key, s] of Object.entries(this.sliders)) {
      if (!s.input) continue;
      s.input.value = String(DEFAULT_PARAMS[key]);
      on(s.input, 'input', () => {
        const v = parseFloat(s.input.value);
        this.setSlider(key, v);
        this.h.onParam?.(key, v);
        this.setPresetLabel('自定义');
      });
    }
    on($('btn-replay-play'), 'click', () => this.h.onReplayPlay?.());
    on($('btn-replay-pause'), 'click', () => this.h.onReplayPause?.());
    on($('btn-replay-restart'), 'click', () => this.h.onReplayRestart?.());
    on($('btn-replay-exit'), 'click', () => this.h.onToggleReplay?.());
    on(this.el.replaySeek, 'input', () => {
      this.h.onReplaySeek?.(parseFloat(this.el.replaySeek.value) / 1000);
    });
    this._bindTouch();
    on(window, 'keydown', (e) => {
      if (e.key !== 'Tab' || !this.panelId || $('modal-shade').classList.contains('hidden')) return;
      const items = [...$(this.panelId).querySelectorAll('button:not(:disabled), input, summary')];
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
  }

  setScreen(screen) {
    $('app').dataset.screen = screen;
    if (screen !== 'race') { this.el.countdown.classList.remove('show'); this.el.toast.classList.remove('show'); this.el.toast.textContent = ''; this._toastTimer = 0; }
  }
  togglePanel(id, force) {
    const el = $(id);
    if (!el) return false;
    const show = force === undefined ? el.classList.contains('hidden') : force;
    const modal = show && ['panel-pause', 'panel-tune', 'panel-help'].includes(id);
    if (show && !this.panelId) this.returnFocus = document.activeElement;
    for (const p of document.querySelectorAll('.panel')) p.classList.add('hidden');
    if (show) el.classList.remove('hidden');
    this.panelId = show ? id : null;
    $('modal-shade').classList.toggle('hidden', !modal);
    this.h.onPanelChange?.({ id: this.panelId, modal });
    if (show && modal) el.querySelector('button')?.focus({ preventScroll: true });
    else if (!show && this.returnFocus?.offsetParent) this.returnFocus.focus({ preventScroll: true });
    return show;
  }
  closePanels() { if (this.panelId) this.togglePanel(this.panelId, false); }
  panelVisible(id) { return !$(id).classList.contains('hidden'); }
  showPauseMenu(show) { if (show) this.togglePanel('panel-pause', true); else this.closePanels(); }
  pauseMenuVisible() { return this.panelVisible('panel-pause'); }
  setPresetLabel(label) {
    $('preset-current').textContent = label || '默认';
    for (const btn of document.querySelectorAll('[data-preset]')) {
      btn.setAttribute('aria-pressed', String((PRESETS[btn.dataset.preset]?.label || '默认') === label));
    }
  }

  setSlider(key, v) {
    const s = this.sliders[key];
    if (!s) return;
    s.input.value = String(v);
    s.label.textContent = v.toFixed(2);
  }
  syncParams(params, label) { for (const key of Object.keys(this.sliders)) this.setSlider(key, params[key]); this.setPresetLabel(label); }

  countdown(text) {
    const el = this.el.countdown;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // 中央卡片：内容为空时整块隐藏，避免留下空的深色方块
  center(title, sub, actions = []) {
    const hasContent = !!(title || sub || (actions && actions.length));
    this.el.card.classList.toggle('hidden', !hasContent);
    if (!hasContent) {
      this.el.title.textContent = '';
      this.el.sub.innerHTML = '';
      this.el.actions.innerHTML = '';
      return;
    }
    this.el.title.textContent = title || '';
    this.el.sub.innerHTML = sub || '';
    this.el.actions.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.primary ? 'primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      this.el.actions.appendChild(b);
    }
  }
  hideCenter() { this.center('', ''); }

  toast(text, ms = 1200) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this._toastTimer = ms / 1000;
  }
  pulse() {
    this.el.fxRing.classList.add('pulse');
    setTimeout(() => this.el.fxRing.classList.remove('pulse'), 190);
  }

  updateHud(snap, hud, extras = {}) {
    this.el.lap.textContent = String(Math.min(snap.lap, snap.laps)) + '/' + String(snap.laps);
    this.el.lapTime.textContent = formatTime(snap.lapTime);
    this.el.total.textContent = formatTime(snap.time);
    $('hud-penalty').textContent = snap.penalty > 0 ? `含罚时 +${snap.penalty.toFixed(0)}s` : '';
    $('home-best').textContent = extras.bestTotal ? formatTime(extras.bestTotal) : '等待你的第一场完赛';
    this.el.best.textContent = formatTime(extras.bestTotal);
    this.el.cp.textContent = String(snap.cpPassed) + '/' + String(snap.cpTotal);
    const isFinish = extras.nextKind === 'finish';
    const completed = snap.state === 'finished';
    this.el.next.textContent = completed ? '三圈挑战完成' : isFinish ? '终点线' : (typeof extras.nextKind === 'number' ? '检查点 ' + extras.nextKind : '—');
    this.el.nextTag.textContent = completed ? 'FINISHED' : extras.replayTag ? '回放' : (isFinish ? '冲刺' : '下一目标');
    this.el.nextDist.textContent = completed ? '' : extras.nextDist != null ? Math.round(extras.nextDist) + ' m' : '';
    this.el.nextBox.classList.toggle('hot', isFinish);
    const kmh = hud.speed * 3.6;
    this.el.speed.textContent = String(Math.round(kmh));
    this.el.barSpeed.style.width = Math.min(100, (hud.speed / 34) * 100) + '%';
    if (extras.telemetry) {
      this.el.telSpeed.textContent = kmh.toFixed(0) + ' km/h · ' + hud.speed.toFixed(1) + ' m/s';
      this.el.telThrottle.textContent = Math.round(Math.abs(hud.throttle) * 100) + '%';
      this.el.telSlip.textContent = Math.abs(hud.slipDeg).toFixed(1) + '°';
      this.el.telYaw.textContent = ((hud.yawRate || 0) * 180 / Math.PI).toFixed(0) + ' °/s';
      this.el.telHits.textContent = String(hud.collisions ?? 0) + ' / ' + String(hud.rescues ?? 0);
      this.el.telFps.textContent = String(Math.round(hud.fps ?? 0));
    }
    if (extras.tune) this.el.tuneReadout.innerHTML = extras.tune;
    if (extras.minimap !== false) this.drawMinimap(extras.boat, extras.nextGate);
  }

  // 简洁赛道图：湖岸、中心线、门（当前目标高亮）、船
  drawMinimap(boat, nextGate) {
    const c = this.minimapCtx;
    if (!c || !this.course) return;
    const W = this.el.minimapCanvas.width, H = this.el.minimapCanvas.height;
    const s = Math.min((W - 24) / (2 * WORLD.lakeA), (H - 24) / (2 * WORLD.lakeB));
    const toX = (x) => W / 2 + x * s, toY = (z) => H / 2 + z * s;
    c.clearRect(0, 0, W, H);
    // 湖面
    c.beginPath();
    c.ellipse(W / 2, H / 2, WORLD.lakeA * s, WORLD.lakeB * s, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(59,118,113,.28)'; c.fill();
    c.strokeStyle = 'rgba(157,198,175,.2)'; c.lineWidth = 1.4; c.stroke();
    // 赛道中心线
    const cl = this.course.centerline;
    c.beginPath();
    cl.forEach((p, i) => { const X = toX(p.x), Y = toY(p.z); if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y); });
    c.closePath();
    c.strokeStyle = 'rgba(218,232,208,.48)'; c.lineWidth = 2.4; c.setLineDash([5, 5]); c.stroke(); c.setLineDash([]);
    // 门
    for (const gate of this.course.sequence) {
      const isNext = nextGate && gate.id === nextGate.id;
      const X = toX(gate.x), Y = toY(gate.z);
      c.beginPath();
      c.moveTo(toX(gate.x - gate.perpX * gate.halfWidth), toY(gate.z - gate.perpZ * gate.halfWidth));
      c.lineTo(toX(gate.x + gate.perpX * gate.halfWidth), toY(gate.z + gate.perpZ * gate.halfWidth));
      c.strokeStyle = isNext ? '#ffc38e' : (gate.kind === 'finish' ? 'rgba(255,190,135,.7)' : 'rgba(167,201,184,.5)');
      c.lineWidth = isNext ? 3.4 : 2;
      c.stroke();
    }
    // 船（三角形，朝船头方向）
    if (boat) {
      const X = toX(boat.x), Y = toY(boat.z);
      const fx = Math.sin(boat.heading), fz = Math.cos(boat.heading);
      const rx = -Math.cos(boat.heading), rz = Math.sin(boat.heading);
      const L = 7, Wd = 4;
      c.beginPath();
      c.moveTo(X + fx * L, Y + fz * L);
      c.lineTo(X - fx * L * 0.6 + rx * Wd, Y - fz * L * 0.6 + rz * Wd);
      c.lineTo(X - fx * L * 0.6 - rx * Wd, Y - fz * L * 0.6 - rz * Wd);
      c.closePath();
      c.fillStyle = '#ff5a3c'; c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
    }
  }

  setCamLabel(mode) {
    this.el.camBtn.textContent = mode === 'top' ? '镜头: 俯视 (C)' : (mode === 'showcase' ? '镜头: 展示 (C)' : '镜头: 跟随 (C)');
  }
  setStartLabel(text) { /* 首页按钮始终表示开始新一局。 */ }
  setAiLabel(on) { $('btn-ai').textContent = on ? '关闭 AI 演示' : 'AI 演示'; $('assist-badge').classList.toggle('hidden', !on); }
  setRescueEnabled(on) {
    if (!this.el.rescue) return;
    this.el.rescue.disabled = !on;
    this.el.rescue.classList.toggle('warn', !!on);
  }
  setMinimapVisible(v) { this.el.minimap.classList.toggle('hidden', !v); }

  _bindTouch() {
    const touchy = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    if (!touchy || !this.el.touch) return;
    this.el.touch.classList.remove('hidden');
    $('app').classList.add('has-touch');
    const state = { left: false, right: false, throttle: false, reverse: false };
    const sync = () => {
      let steer = 0, throttle = 0;
      if (state.left) steer -= 1;
      if (state.right) steer += 1;
      if (state.throttle) throttle += 1;
      if (state.reverse) throttle -= 1;
      if (steer === 0 && throttle === 0) this.h.onTouch?.(null);
      else this.h.onTouch?.({ steer, throttle, boost: false });
    };
    on(window, 'blur', () => { for (const k of Object.keys(state)) state[k] = false; for (const btn of this.el.touch.querySelectorAll('button')) btn.classList.remove('active'); sync(); });
    for (const btn of this.el.touch.querySelectorAll('[data-touch]')) {
      const key = btn.dataset.touch;
      const on = (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); state[key] = true; btn.classList.add('active'); sync(); };
      const off = (e) => { e.preventDefault(); state[key] = false; btn.classList.remove('active'); sync(); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', off);
    }
  }

  update(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) { this.el.toast.classList.remove('show'); this.el.toast.textContent = ''; }
    }
  }
}
