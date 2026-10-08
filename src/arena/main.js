// 入口：渲染器、场景装配、主循环、回放与调试接口
import * as THREE from 'three';
import { pixelRatio } from '../shared/rendering/pixel-budget.js';
import { WORLD, BASE, DEFAULT_PARAMS, PRESETS, RACE } from './gameplay/config.js';
import { buildCourse } from './gameplay/course.js';
import { createBoat, stepBoat, waveHeight } from './gameplay/physics.js';
import { buildSky, buildLights, buildShore, buildIslet, buildScenery, shoreHeightAt } from './rendering/environment.js';
import { buildWater } from './rendering/water.js';
import { buildBuoys, buildFinishArch, buildGateHints, buildGateSigns } from './rendering/props.js';
import { buildBoat, HULL, Wake, Spray } from './rendering/boat.js';
import { Input } from './ui/input.js';
import { CameraRig } from './rendering/camera.js';
import { Race, RaceState } from './gameplay/race.js';
import { Recorder, ReplayPlayer } from './gameplay/replay.js';
import { loadRecords, saveResult, formatTime, clearRecords } from './gameplay/storage.js';
import { Autopilot } from './gameplay/autopilot.js';
import { UI } from './ui/ui.js';

const FIXED = 1 / 120;
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + String(e.reason)));

// ---------- 渲染器 ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Bound fragment work on Retina/4K displays; DOM text retains native resolution.
const renderPixelRatio = (width, height) => pixelRatio(width, height, { maxPixels: 2600000 });
renderer.setPixelRatio(renderPixelRatio(window.innerWidth, window.innerHeight));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb8ceca, 280, 850);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 2000);

// ---------- 场景装配 ----------
const sky = buildSky(scene);
const lights = buildLights(scene);
const water = buildWater(scene);
water.resize(window.innerWidth, window.innerHeight);
const shore = buildShore(scene);
const islet = buildIslet(scene);

const course = buildCourse();
const buoys = buildBuoys(scene, course);
const arch = buildFinishArch(scene, course);
const gateHints = buildGateHints(scene);
const gateSigns = buildGateSigns(scene, course);

const boatVis = buildBoat();
let boatModelReady = false;
scene.add(boatVis.group);
const coreAssetsReady = Promise.all([boatVis.ready, buoys.ready]);
// Give the usable boat/course a painted frame before decorative model requests.
const scenery = buildScenery(scene, { shore, islet, after: coreAssetsReady.then(() =>
  new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))) });
const wake = new Wake(scene, { points: 110 });
const spray = new Spray(scene, 1100);
water.excludeFromReflection(boatVis.jet, wake.center.mesh,
  ...wake.arms.map(arm => arm.mesh), spray.points, gateHints.group,
  ...gateSigns.signs.flatMap(sign => [sign.sign, sign.back]));

// ---------- 游戏对象 ----------
const params = { ...DEFAULT_PARAMS };
let presetLabel = '默认';
const startGate = course.finish;
const boat = createBoat(startGate.x - startGate.dirX * 26, startGate.z - startGate.dirZ * 26, Math.atan2(startGate.dirX, startGate.dirZ));
const race = new Race(course, { laps: RACE.laps });
const recorder = new Recorder(30);
const replay = new ReplayPlayer(null);
const input = new Input(window);
const rig = new CameraRig(camera, { mode: 'chase' });
rig.snapTo(boat);
const autopilot = new Autopilot(course);
let autopilotOn = false;
let mode = 'live';   // live | replay
let paused = false;
let telemetryOn = false;
let savedBoatState = null;
let savedCmd = null;
let records = loadRecords();
let lastCmd = { throttle: 0, steer: 0, boost: false };

const ui = new UI({
  onStart: () => { autopilotOn = false; ui.setAiLabel(false); startRace(); },
  onDemo: () => { autopilotOn = true; ui.setAiLabel(true); startRace(); },
  onHome: () => goHome(),
  onPanelChange: ({ modal }) => { paused = modal; input.clear(); },
  onRestart: () => startRace(),
  onRescue: () => doRescue(),
  onPause: () => openPauseMenu(),
  onResume: () => closePauseMenu(),
  onTouch: (v) => input.setOverride(v),
  onToggleCamera: () => { const m = rig.toggle(); ui.setCamLabel(m); },
  onToggleAi: () => {
    autopilotOn = !autopilotOn;
    autopilot.reset();
    ui.setAiLabel(autopilotOn);
    if (autopilotOn && race.state !== RaceState.RACING) startRace();
    else ui.closePanels();
    hudFlash(autopilotOn ? 'AI 演示圈：开启（AI 成绩不计入个人纪录；你一按驾驶键就会接管）' : 'AI 演示圈：关闭', 2000);
  },
  onToggleReplay: () => { mode === 'replay' ? exitReplay() : enterReplay(); },
  onPreset: (name) => applyPreset(name),
  onParam: (k, v) => { params[k] = v; presetLabel = '自定义'; persistParams(); updateTuneReadout(); },
  onReplayPlay: () => { const ok = replay.play(); if (!ok) ui.toast('没有可播放的回放'); updateReplayInfo(); },
  onReplayPause: () => { replay.pause(); updateReplayInfo(); },
  onReplayRestart: () => { wake.reset(); replay.restart(); updateReplayInfo(); },
  onReplaySeek: (k) => { wake.reset(); replay.seek(k * replay.duration); replay.pause(); updateReplayInfo(); },
});

// ---------- 参数持久化 ----------
const PKEY = 'rc-boat-arena.params.v1';
function persistParams() {
  try { localStorage.setItem(PKEY, JSON.stringify({ params, preset: presetLabel })); } catch (e) {}
}
function restoreParams() {
  try {
    const raw = localStorage.getItem(PKEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d && d.params) {
      for (const k of Object.keys(DEFAULT_PARAMS)) {
        const v = Number(d.params[k]);
        if (isFinite(v)) params[k] = Math.min(PARAM_MAX(k), Math.max(PARAM_MIN(k), v));
      }
      presetLabel = d.preset || '自定义';
    }
  } catch (e) {}
}
const PARAM_MIN = (k) => ({ thrust: 0.4, steerSensitivity: 0.3, waterDrag: 0.4, lateralSlip: 0 }[k] ?? 0);
const PARAM_MAX = (k) => ({ thrust: 2, steerSensitivity: 2.5, waterDrag: 2.5, lateralSlip: 1 }[k] ?? 2);

function applyPreset(name) {
  if (name === 'default') { Object.assign(params, DEFAULT_PARAMS); presetLabel = '默认'; }
  else if (PRESETS[name]) { Object.assign(params, PRESETS[name]); presetLabel = PRESETS[name].label; }
  ui.syncParams(params, presetLabel);
  persistParams();
  updateTuneReadout();
}
function updateTuneReadout() {
  const p = params;
  const rows = [
    `推力 <b>${p.thrust.toFixed(2)}</b> → 理论极速约 ${(26.5 * Math.pow(p.thrust / p.waterDrag, 0.5)).toFixed(1)} m/s`,
    `转向 <b>${p.steerSensitivity.toFixed(2)}</b> → 回转半径约 ${(14.2 / p.steerSensitivity).toFixed(1)} m（18 m/s）`,
    `水阻 <b>${p.waterDrag.toFixed(2)}</b> → 滑行更${p.waterDrag < 1 ? '轻松' : '吃力'}`,
    `滑移 <b>${p.lateralSlip.toFixed(2)}</b> → 漂移角上限约 ${(8 + p.lateralSlip * 42).toFixed(0)}°`,
    `当前预设：<b>${presetLabel}</b>`,
  ];
  ui.el.tuneReadout.innerHTML = rows.join('<br>');
}

// ---------- 比赛流程 ----------
/** 统一的重开入口：先彻底退出回放（状态、角标、面板、结算层），再开新的一局 */
function startRace() {
  if (!boatModelReady) {
    const failed = [boatVis.loadState, buoys.loadState].some(state => state?.status === 'error');
    ui.toast(failed ? '船艇或航标未能载入，请重新载入页面' : '船艇与航标正在准备，请稍候');
    return;
  }
  if (mode === 'replay') exitReplay();
  replay.pause();
  replay.seek(0);
  input.clear();
  assistUsed = false;
  finishSummary = null;
  race.start();
  recorder.start({ laps: RACE.laps, preset: presetLabel, params: { ...params } });
  boat.x = startGate.x - startGate.dirX * 26;
  boat.z = startGate.z - startGate.dirZ * 26;
  boat.heading = Math.atan2(startGate.dirX, startGate.dirZ);
  boat.vx = boat.vz = 0; boat.yawRate = 0; boat.speed = 0; boat.forwardSpeed = 0;
  boat.collisions = 0; boat.stuckTime = 0; boat.spool = 0;
  boat.roll = boat.pitch = boat.bob = boat.slipAngle = 0;
  boat.hitCooldown = 0; boat.lastHit = null;
  wake.reset(); spray.burst(boat.x, boat.z, 10, 0.5);
  race.resync(boat);
  autopilot.reset();
  paused = false;
  ui.showPauseMenu(false);
  if (rig.mode === 'showcase') { rig.mode = 'chase'; ui.setCamLabel('chase'); }
  lastCountdownShown = null;
  ui.hideCenter();
  ui.setStartLabel('重新开始');
  ui.setRescueEnabled(false);
  mode = 'live';
  ui.setScreen('race');
  rig.snapTo(boat);
  hudFlash(autopilotOn ? 'AI 演示 · 按驾驶键即可接管' : '穿过浮标门，挑战你的最佳三圈', 1800);
}
let assistUsed = false;
let lastCountdownShown = null;

function onFinish(res) {
  const official = res.total;                 // 已含罚时
  const saved = saveResult({
    total: official, laps: RACE.laps, lapTimes: race.lapTimes,
    params, preset: presetLabel, collisions: boat.collisions, rescues: race.rescues,
    assisted: assistUsed,
  });
  records = loadRecords();
  recorder.stop({ total: official, rawTotal: res.rawTotal, penalty: res.penalty, lapTimes: race.lapTimes.slice(), assisted: assistUsed });
  Object.assign(boat, { vx: 0, vz: 0, speed: 0, forwardSpeed: 0, yawRate: 0, stuckTime: 0, spool: 0, lastHit: null });
  lastCmd = { throttle: 0, steer: 0, boost: false };
  replay.recording = recorder.serialize();
  replay.frames = replay.recording.frames;
  const title = assistUsed ? '漂亮的一场演示。' : (saved.isNewTotal ? '新的个人纪录。' : '三圈，尽兴而归。');
  finishSummary = { title, sub:
    `<div class="result-label">TOTAL TIME / 总用时${res.penalty > 0 ? ` · 含罚时 ${res.penalty.toFixed(0)}s` : ''}</div>` +
    `<div class="result-time">${formatTime(official)}</div>` +
    `<div class="result-laps">${race.lapTimes.map((t, i) => `<div><span>LAP 0${i + 1}</span><b>${formatTime(t)}</b></div>`).join('')}</div>` +
    `<div class="result-note">${assistUsed ? 'AI 辅助演示 · 不计入个人最佳' : `个人最佳 ${formatTime(records.bestTotal)}`}<br>碰撞 ${boat.collisions} 次 · 脱困 ${race.rescues} 次</div>` };
  ui.setRescueEnabled(false);
  showFinishOverlay();
}
let finishSummary = null;
function showFinishOverlay() {
  if (!finishSummary) return;
  ui.setScreen('results');
  ui.center(finishSummary.title, finishSummary.sub, [
    { label: '查看回放', primary: true, onClick: () => enterReplay() },
    { label: '亲自挑战', onClick: () => { autopilotOn = false; ui.setAiLabel(false); startRace(); } },
    { label: '返回首页', onClick: () => goHome() },
  ]);
}

function hudFlash(text, ms) { ui.toast(text, ms); }

// ---------- 回放 ----------
function enterReplay() {
  if (!replay.frames || !replay.frames.length) { ui.toast('还没有可回放的一局'); return; }
  if (mode !== 'replay') {
    savedBoatState = { ...boat }; savedCmd = { ...lastCmd };
    mode = 'replay';
  }
  ui.closePanels();
  paused = false; input.clear(); wake.reset();
  replay.seek(0); replay.play();
  ui.setScreen('replay');
  ui.hideCenter();                       // V4：不让完赛大字挡住回放
  ui.togglePanel('panel-replay', true);
  updateReplayInfo();
  const tag = document.createElement('div');
  tag.className = 'replay-tag'; tag.id = 'replay-tag'; tag.textContent = 'REPLAY / 本场回放';
  if (!document.getElementById('replay-tag')) document.getElementById('ui').appendChild(tag);
}
function exitReplay() {
  mode = 'live';
  paused = false; wake.reset();
  replay.pause();
  document.getElementById('replay-tag')?.remove();
  ui.togglePanel('panel-replay', false);
  if (savedBoatState) { Object.assign(boat, savedBoatState); savedBoatState = null; }
  if (savedCmd) { lastCmd = savedCmd; savedCmd = null; }
  rig.snapTo(boat);
  ui.setScreen(race.state === RaceState.IDLE ? 'home' : 'race');
  if (race.state === RaceState.FINISHED) showFinishOverlay();   // 退出回放后恢复结算层
}
function updateReplayInfo() {
  const m = replay.meta;
  ui.el.replayInfo.innerHTML = replay.empty ? '还没有本场回放。' :
    `<b>${formatTime(replay.t)}</b> / ${formatTime(replay.duration)} · ${replay.playing ? '播放中' : replay.t >= replay.duration ? '播放结束' : '已暂停'} · 本场 ${formatTime(m?.total ?? replay.duration)}${m?.assisted ? ' · AI 演示' : ''}`;
}
function goHome() {
  if (mode === 'replay') exitReplay();
  ui.closePanels(); input.clear();
  recorder.stop(); replay.pause();
  autopilotOn = false; ui.setAiLabel(false); paused = false;
  race.reset();
  Object.assign(boat, createBoat(startGate.x - startGate.dirX * 26, startGate.z - startGate.dirZ * 26, Math.atan2(startGate.dirX, startGate.dirZ)));
  race.resync(boat); wake.reset();
  rig.mode = 'showcase'; rig.snapTo(boat); rig.update(boat, 10); ui.setCamLabel(rig.mode);
  ui.hideCenter(); ui.setScreen('home');
  document.getElementById('dir-arrow').classList.add('hidden');
  document.getElementById('center-toast').classList.remove('show');
}

// ---------- 主循环 ----------
let acc = 0, lastT = performance.now() / 1000, simTime = 0;
let timeScale = 1;   // 调试/自动化用：加速模拟（物理步长不变）
let frameCount = 0, firstReadyFrameAt = 0;
let fpsAcc = 0, fpsFrames = 0, fps = 0;

function simulate(dt) {
  simTime += dt;
  if (mode === 'replay') {
    const pose = replay.update(dt);
    if (pose) applyPose(pose, dt);
    return;
  }
  if (race.state === RaceState.FINISHED) { boat.bob = waveHeight(boat.x, boat.z, simTime); return; }
  const cmd = input.read();
  // 玩家一动手就交还控制权
  if (autopilotOn && (cmd.throttle !== 0 || cmd.steer !== 0 || cmd.boost || input.has(' '))) { autopilotOn = false; ui.setAiLabel(false); }
  if (paused || race.state === RaceState.IDLE) { cmd.throttle = 0; cmd.steer = 0; cmd.boost = false; }
  lastCmd = cmd;
  if (race.state === RaceState.COUNTDOWN) { cmd.throttle = 0; }
  if (autopilotOn && race.state === RaceState.RACING) { assistUsed = true; Object.assign(cmd, autopilot.drive(boat)); }
  if (race.state === RaceState.FINISHED) { cmd.throttle = 0; }

  stepBoat(boat, cmd, params, dt, course.world, simTime);
  const ev = race.update(dt, boat);
  if (ev) {
    if (ev.event === 'checkpoint') {
      hudFlash(ev.cpPassed >= race.checkpointTotal
        ? `检查点 ${ev.cpPassed}/${ev.cpTotal} ✓ 最后一道：终点线！`
        : `检查点 ${ev.cpPassed}/${ev.cpTotal} ✓`, 1100);
    } else if (ev.event === 'lap') hudFlash(`第 ${ev.lap} 圈完成：${formatTime(ev.lapTime)}`, 1600);
    else if (ev.event === 'finish') { recorder.sample(race.time, boat, cmd, race, { force: true }); onFinish(ev); }
  }
  ui.setRescueEnabled(race.state === RaceState.RACING);
  if (race.state === RaceState.RACING || race.state === RaceState.COUNTDOWN) {
    recorder.sample(race.time, boat, cmd, race);
  }
  // 尾流与浪花
  wake.push(boat.x - Math.sin(boat.heading) * HULL.stern, boat.z - Math.cos(boat.heading) * HULL.stern, 0.1, boat.heading, boat.speed, simTime);
  emitSpray(dt, cmd);
  // 碰撞反馈
  if (boat.lastHit && boat.hitCooldown > 0.35) {
    if (boat.lastHit.kind === 'buoy') { spray.burst(boat.lastHit.x, boat.lastHit.z, 16, 0.8); hudFlash('碰标！', 700); }
    else if (boat.lastHit.kind === 'shore') { spray.burst(boat.x, boat.z, 26, 1.1); rig.addShake(0.9); hudFlash('触底了 · 按 R 脱困，罚时 +2 秒', 1400); }
    else if (boat.lastHit.kind === 'islet') { spray.burst(boat.x, boat.z, 22, 1.0); rig.addShake(0.8); hudFlash('碰到小岛 · 按 R 脱困，罚时 +2 秒', 1400); }
  }
  boat.lastHit = null;
  if (boat.stuckTime > BASE.STUCK_TIME && race.state === RaceState.RACING) hudFlash('卡住了？按 R 或点「脱困」（+2 秒罚时，会计入成绩）', 800);
}

function emitSpray(dt, cmd) {
  const sp = boat.speed;
  if (sp < 3) return;
  const fwdX = Math.sin(boat.heading), fwdZ = Math.cos(boat.heading);
  const rgtX = -Math.cos(boat.heading), rgtZ = Math.sin(boat.heading);   // 真正的右向量
  const bowX = boat.x + fwdX * HULL.bowSpray, bowZ = boat.z + fwdZ * HULL.bowSpray;
  const slipK = Math.min(1, Math.abs(boat.slipAngle) * 1.6);
  const rate = (sp / 30) * (1 + slipK * 2.2);
  const n = Math.random() < rate ? Math.ceil(rate * 1.6) : 0;
  for (let i = 0; i < n; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const outward = 0.6 + Math.random() * 1.4;
    spray.emit(
      bowX + rgtX * side * HULL.width * 0.42 + (Math.random() - 0.5) * 0.4, 0.35, bowZ + rgtZ * side * HULL.width * 0.42 + (Math.random() - 0.5) * 0.4,
      fwdX * sp * 0.35 + rgtX * side * outward * 1.6, 1.6 + Math.random() * 2.6, fwdZ * sp * 0.35 + rgtZ * side * outward * 1.6,
      0.35 + Math.random() * 0.5, 0.4 + Math.random() * 0.6,
    );
  }
  // 喷水推进尾喷
  if (cmd.throttle > 0.35 && sp > 6) {
    const sternX = boat.x - fwdX * HULL.stern, sternZ = boat.z - fwdZ * HULL.stern;
    for (let i = 0; i < 2; i++) {
      spray.emit(sternX + (Math.random() - 0.5), 0.5, sternZ + (Math.random() - 0.5),
        -fwdX * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2, 2.2 + Math.random() * 3.4,
        -fwdZ * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.4, 0.5);
    }
  }
}

let lastReplayRescues = 0;
function applyPose(pose, dt) {
  if ((pose.rc ?? 0) !== lastReplayRescues) wake.reset();
  lastReplayRescues = pose.rc ?? 0;
  lastCmd = { throttle: pose.th ?? 0, steer: pose.st ?? 0, boost: !!pose.boost };
  boat.x = pose.x; boat.z = pose.z; boat.heading = pose.h;
  boat.speed = pose.v; boat.forwardSpeed = pose.vf ?? pose.v; boat.yawRate = pose.yaw ?? 0; boat.slipAngle = pose.slip;
  boat.collisions = pose.hits ?? 0;
  boat.roll = pose.roll; boat.pitch = pose.pitch; boat.bob = pose.bob ?? 0;
  boat.lastHit = null;
  wake.push(boat.x - Math.sin(pose.h) * HULL.stern, boat.z - Math.cos(pose.h) * HULL.stern, 0.1, pose.h, pose.v, simTime);
}

function renderVisuals(dtReal) {
  const bob = mode === 'replay' ? waveHeight(boat.x, boat.z, simTime) : boat.bob;
  boatVis.group.position.set(boat.x, bob - 0.08, boat.z);
  boatVis.group.rotation.y = boat.heading;
  // roll > 0 = 向右压弯（见 physics.js 顶部约定）
  boatVis.visual.rotation.set(boat.pitch * 0.55, 0, boat.roll * 0.85);
  const throttleAbs = Math.abs(lastCmd.throttle);
  boatVis.jet.visible = throttleAbs > 0.15 && boat.speed > 2 && (mode === 'replay' || race.state === RaceState.RACING);
  if (boatVis.jet.visible) {
    const k = throttleAbs * (0.4 + Math.min(1, boat.speed / 20));
    boatVis.jet.scale.set(1, 0.6 + k * 1.6, 1);
    boatVis.jet.material.opacity = 0.25 + k * 0.4;
  }
  boatVis.rudder.rotation.y = -lastCmd.steer * 0.42;
  // 目标门指引
  const displaySeq = mode === 'replay' ? (replay.poseAt(replay.t)?.nextSeq ?? 0) : race.nextSeq;
  const gate = course.sequence[Math.min(displaySeq, course.sequence.length - 1)];
  if (gate && (mode === 'replay' || race.state === RaceState.RACING || race.state === RaceState.COUNTDOWN)) {
    gateHints.group.visible = rig.mode !== 'showcase';
    gateHints.group.position.set(gate.x, 0, gate.z);
    const pulse = 1 + Math.sin(simTime * 3.2) * 0.08;
    gateHints.ring.scale.setScalar(pulse);
    gateHints.arrow.position.y = 8 + Math.sin(simTime * 2.1) * 0.8;
    gateHints.arrow.rotation.y = simTime * 1.2;
    const c = gate.kind === 'finish' ? 0xe3be75 : 0xa5d8c8;
    gateHints.beam.material.color.setHex(c);
    gateHints.ring.material.color.setHex(c);
    gateHints.arrow.material.color.setHex(c);
  } else if (gateHints.group) {
    gateHints.group.visible = false;
  }
  buoys.update(simTime, race.state !== RaceState.IDLE ? gate?.id : null);
  water.material.uniforms.uTime.value = simTime;
  water.update(boat);
  lights.update?.(boat.x, boat.z);
  sky.material.uniforms.uTime.value = simTime;
  wake.mat.uniforms.uTime.value = simTime;
  // U2：目标门编号牌；V-新：限制屏幕尺寸，靠近后淡出，交给实体门架引导
  for (const s of gateSigns.signs) {
    const isNext = gate && s.gate.id === gate.id;
    const d = Math.hypot(s.gate.x - boat.x, s.gate.z - boat.z);
    const k = Math.min(1.5, Math.max(0.45, d / 55));
    s.sign.scale.setScalar(k);
    s.back.scale.setScalar(k);
    const fade = d < 32 ? Math.max(0, (d - 16) / 16) : 1;
    s.mat.opacity = (isNext ? 1 : 0.42) * fade;
    const vis = s.mat.opacity > 0.02;
    s.sign.visible = vis;
    s.back.visible = vis;
  }
  updateOffscreenArrow(gate);
  if (rig.mode === 'showcase' || race.state === RaceState.IDLE) for (const s of gateSigns.signs) { s.sign.visible = false; s.back.visible = false; }
  wake._flush();
  spray.update(dtReal, simTime);
}

function updateCamera(dtReal) {
  rig.update(boat, dtReal, { boost: lastCmd.boost });
}

function loop(nowMs) {
  const now = nowMs / 1000;
  let dtReal = Math.min(0.1, Math.max(0, now - lastT));
  lastT = now;
  if (document.hidden) { acc = 0; requestAnimationFrame(loop); return; }
  if (paused) acc = 0;                 // 暂停：冻结模拟，画面继续渲染
  else acc += dtReal * timeScale;
  const maxSteps = 14 * Math.max(1, timeScale);
  let steps = 0;
  while (acc >= FIXED && steps < maxSteps) { simulate(FIXED); acc -= FIXED; steps++; }
  if (acc > FIXED * maxSteps) acc = 0;

  updateCamera(dtReal);
  renderVisuals(dtReal);
  renderer.render(scene, camera);
  if (boatModelReady && !firstReadyFrameAt) firstReadyFrameAt = performance.now();
  ui.update(dtReal);
  frameCount++;
  fpsAcc += dtReal; fpsFrames++;
  if (fpsAcc > 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }

  // HUD：回放时改用录像里的比赛状态，仪表跟着录像走（F3）
  let snap, hud, hudExtra = { bestTotal: records.bestTotal };
  if (mode === 'replay') {
    const pose = replay.poseAt(replay.t) || {};
    snap = {
      state: 'replay', time: pose.rt ?? replay.t, lap: pose.lap ?? 1, laps: RACE.laps,
      lapTime: pose.lt ?? 0, penalty: pose.pen ?? 0, rescues: pose.rc ?? 0,
      cpPassed: pose.cp ?? 0, cpTotal: race.checkpointTotal, gateTotal: race.gateTotal,
      onFinishGate: false, nextSeq: 0, lapTimes: [], replay: true,
    };
    hud = { speed: pose.v ?? 0, throttle: pose.th ?? 0, slipDeg: (pose.slip ?? 0) * 180 / Math.PI, yawRate: pose.yaw ?? 0, collisions: pose.hits ?? 0, rescues: pose.rc ?? 0, fps };
    hudExtra.replayTag = `回放 ${replay.t.toFixed(1)}s / ${replay.duration.toFixed(1)}s`;
    hudExtra.nextKind = (pose.cp ?? 0) >= race.checkpointTotal ? 'finish' : (pose.cp ?? 0) + 1;
    hudExtra.boat = { x: pose.x, z: pose.z, heading: pose.h };
    hudExtra.nextGate = course.sequence[Math.min(pose.cp ?? 0, course.sequence.length - 1)];
    hudExtra.nextDist = hudExtra.nextGate ? Math.hypot(hudExtra.nextGate.x - pose.x, hudExtra.nextGate.z - pose.z) : null;
    hudExtra.telemetry = ui.panelVisible('panel-telemetry');
  } else {
    snap = race.snapshot();
    hud = { speed: boat.speed, throttle: lastCmd.throttle, slipDeg: boat.slipAngle * 180 / Math.PI };
    hudExtra.nextKind = race.onFinishGate ? 'finish' : race.cpPassed + 1;
    hudExtra.boat = { x: boat.x, z: boat.z, heading: boat.heading };
    hudExtra.nextGate = course.sequence[Math.min(race.nextSeq, course.sequence.length - 1)];
    hudExtra.nextDist = hudExtra.nextGate ? Math.hypot(hudExtra.nextGate.x - boat.x, hudExtra.nextGate.z - boat.z) : null;
    hudExtra.telemetry = ui.panelVisible('panel-telemetry');
    Object.assign(hud, { yawRate: boat.yawRate, collisions: boat.collisions, rescues: race.rescues, fps });
  }
  ui.updateHud(snap, hud, hudExtra);

  if (race.state === RaceState.COUNTDOWN) {
    const c = Math.ceil(race.countdown - 0.6);
    const label = c <= 0 ? 'GO!' : String(Math.min(3, c));
    if (label !== lastCountdownShown) { lastCountdownShown = label; ui.countdown(label); }
  }
  if (mode === 'replay') {
    ui.el.replaySeek.value = String(Math.round((replay.t / Math.max(1e-3, replay.duration)) * 1000));
    updateReplayInfo();
  }
  requestAnimationFrame(loop);
}

/** U2：目标门离开画面时，在屏幕边缘给出方向箭头与距离 */
const arrowEl = document.getElementById('dir-arrow');
const arrowDist = document.getElementById('dir-distance');
const _v = new THREE.Vector3();
function updateOffscreenArrow(gate) {
  if (!arrowEl) return;
  if (!gate || ![RaceState.RACING, RaceState.COUNTDOWN].includes(race.state) || mode === 'replay') { arrowEl.classList.add('hidden'); return; }
  _v.set(gate.x, 2, gate.z).project(camera);
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
  const behind = _v.z > 1;
  const margin = 74;
  const onScreen = !behind && sx > margin && sx < w - margin && sy > margin && sy < h - margin;
  if (onScreen) { arrowEl.classList.add('hidden'); return; }
  // 屏幕中心指向目标的屏幕向量；在相机背后时用相机右向量兜底
  let dx = sx - w / 2, dy = sy - h / 2;
  if (behind) { dx = -dx; dy = -dy; }
  const ang = Math.atan2(dy, dx);
  const rx = Math.min(w / 2 - 54, h / 2 - 54);
  const ax = w / 2 + Math.cos(ang) * rx, ay = h / 2 + Math.sin(ang) * rx;
  arrowEl.classList.remove('hidden');
  arrowEl.style.left = ax + 'px';
  arrowEl.style.top = ay + 'px';
  arrowEl.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
  if (arrowDist) {
    const d = Math.hypot(gate.x - boat.x, gate.z - boat.z);
    arrowDist.textContent = `${Math.round(d)} m`;
    arrowDist.style.transform = `translateX(-50%) rotate(${-ang}rad)`;
  }
}

function openPauseMenu() {
  input.clear();
  paused = true;
  ui.showPauseMenu(true);
}

function closePauseMenu() {
  paused = false;
  ui.showPauseMenu(false);
  if (mode === 'replay') ui.togglePanel('panel-replay', true);
}

// ---------- 事件 ----------
window.addEventListener('blur', () => { if (race.state === RaceState.RACING || race.state === RaceState.COUNTDOWN) openPauseMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && race.state === RaceState.RACING) openPauseMenu(); });
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(renderPixelRatio(w, h));
  renderer.setSize(w, h, false);
  water.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const editing = e.target?.matches?.('input, textarea, select, [contenteditable=true]');
  if (editing && e.key !== 'Escape') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'r') {
    if (paused || mode === 'replay') return;
    // 比赛中 = 脱困；比赛外 = 重新开始（按钮标签与此一致）
    if (race.state === RaceState.RACING) doRescue();
    else startRace();
  } else if (k === 'c') { const m = rig.toggle(); ui.setCamLabel(m); }
  else if (k === 't') { if (ui.panelVisible('panel-tune')) closePauseMenu(); else ui.togglePanel('panel-tune', true); }
  else if (k === '+' || k === '=' || k === '-' || k === '_') {
    const h = rig.zoom(k === '-' || k === '_' ? -1 : 1);
    hudFlash(`俯视距离 ${Math.round(h)} m`, 900);
  }
  else if (k === 'p') { mode === 'replay' ? exitReplay() : enterReplay(); }
  else if (k === 'Escape') {
    if (ui.panelId && ui.panelId !== 'panel-replay') closePauseMenu();
    else if (mode === 'replay') exitReplay();
    else openPauseMenu();
  }
  else if (k === 'y') { telemetryOn = ui.togglePanel('panel-telemetry'); }
});

/** 脱困：回到上一个检查点，罚时计入成绩 */
function doRescue() {
  if (mode !== 'live' || race.state !== RaceState.RACING) { hudFlash('当前无需脱困', 1200); return; }
  const r = race.rescue(boat);
  recorder.sample(race.time, boat, lastCmd, race, { force: true });
  ui.closePanels();
  wake.reset();
  spray.burst(boat.x, boat.z, 14, 0.7);
  const gateLabel = r.gate === 'finish' ? '起终点' : '检查点 ' + String(r.gate).replace('cp', '');
  hudFlash(`脱困完成：回到 ${gateLabel}，罚时 +${r.penalty.toFixed(1)} 秒（累计 ${r.totalPenalty.toFixed(1)} 秒，已计入成绩）`, 2000);
}

// ---------- 初始化 ----------
restoreParams();
ui.setCourse(course);
ui.syncParams(params, presetLabel);
rig.mode = 'showcase';
rig.update(boat, 10);
ui.setCamLabel(rig.mode);
updateTuneReadout();
ui.setScreen('home');
requestAnimationFrame((t) => { lastT = t / 1000; requestAnimationFrame(loop); });

// ---------- 调试/自动化接口 ----------
window.__RC__ = {
  version: '1.1.0',
  get ready() { return boatModelReady; },
  get firstReadyFrameAt() { return firstReadyFrameAt; },
  THREE, scene, camera, renderer, boat, race, course, params, rig, recorder, replay, wake, spray, water, buoys,
  props: { arch, gateHints, buoys, gateSigns }, boatVis, shore, islet, scenery,
  shoreHeightAt,
  state() {
    return {
      model: { ...boatVis.loadState },
      scenery: { ...scenery.userData.assetState, assets: scenery.userData.assets || [] },
      mode, race: race.snapshot(), raceState: race.state,
      boat: { x: boat.x, z: boat.z, heading: boat.heading, speed: boat.speed, forwardSpeed: boat.forwardSpeed, bob: boat.bob,
              slipDeg: boat.slipAngle * 180 / Math.PI, roll: boat.roll, pitch: boat.pitch,
              collisions: boat.collisions, stuckTime: boat.stuckTime, spool: boat.spool },
      params: { ...params }, preset: presetLabel,
      camera: { mode: rig.mode, x: camera.position.x, y: camera.position.y, z: camera.position.z },
      timeScale,
      replay: { frames: replay.frames.length, t: replay.t, playing: replay.playing, duration: replay.duration,
                sampleRate: replay.sampleRate, meta: replay.meta, pose: replay.poseAt(replay.t) },
      assisted: assistUsed,
      mode,
      paused,
      telemetryOn: ui.panelVisible('panel-telemetry'),
      rescueEnabled: !document.getElementById('btn-rescue')?.disabled,
      records, errors: errors.slice(), fps,
      ui: {
        lap: ui.el.lap.textContent, lapTime: ui.el.lapTime.textContent, total: ui.el.total.textContent,
        best: ui.el.best.textContent, cp: ui.el.cp.textContent, speed: ui.el.speed.textContent,
        countdown: ui.el.countdown.textContent, title: ui.el.title.textContent, sub: ui.el.sub.textContent,
      },
      canvas: { w: renderer.domElement.width, h: renderer.domElement.height, cssW: renderer.domElement.clientWidth, cssH: renderer.domElement.clientHeight },
    };
  },
  start: () => startRace(),
  restart: () => startRace(),
  setParam(k, v) { params[k] = v; persistParams(); updateTuneReadout(); ui.syncParams(params, presetLabel); },
  getParams: () => ({ ...params }),
  applyPreset: (n) => applyPreset(n),
  resetParams: () => applyPreset('default'),
  setInput(v) { input.setOverride(v); },
  clearInput() { input.setOverride(null); },
  autopilot(v) { autopilotOn = !!v; if (v) autopilot.reset(); return autopilotOn; },
  teleport(x, z, heading) {
    boat.x = x; boat.z = z;
    if (heading !== undefined) boat.heading = heading;
    boat.vx = boat.vz = 0;
    race.resync(boat);                 // 传送不算穿门
  },
  rescue: () => doRescue(),
  finishNow() {   // 测试用：按正常口径结算（含罚时），走真实完赛路径
    const ev = race.forceFinish();
    if (ev) { recorder.sample(race.time, boat, lastCmd, race, { force: true }); onFinish(ev); }
    return ev;
  },
  replayEnter: () => enterReplay(),
  replayExit: () => exitReplay(),
  replayPlay: () => { replay.play(); updateReplayInfo(); },
  replayPause: () => { replay.pause(); updateReplayInfo(); },
  replayRestart: () => { wake.reset(); replay.restart(); updateReplayInfo(); },
  replaySeek: (t) => { wake.reset(); replay.seek(t); updateReplayInfo(); },
  setCamera(m) { rig.mode = m; ui.setCamLabel(m); },
  setCountdownTime(sec) { race.countdownTime = sec; },
  setTimeScale(k) { timeScale = Math.max(0.1, Math.min(12, Number(k) || 1)); return timeScale; },
  clearRecords: () => { clearRecords(); records = loadRecords(); },
  ui: { togglePanel: (id, f) => ui.togglePanel(id, f), panelVisible: (id) => ui.panelVisible(id) },
  formatTime,
};

// 船艇与航标准备好后开放驾驶，岸景在后台继续载入。
document.getElementById('btn-model-retry').addEventListener('click', () => location.reload());
coreAssetsReady.then(() => {
  boatModelReady = true;
  document.getElementById('model-status').classList.add('hidden');
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-demo').disabled = false;
}).catch(() => {
  document.getElementById('model-status-text').textContent = '船艇或航标载入失败，请重新载入。';
  document.getElementById('btn-model-retry').classList.remove('hidden');
  document.getElementById('model-status').classList.add('load-error');
});
