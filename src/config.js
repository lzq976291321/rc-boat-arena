// 集中配置：物理基准值、可调参数、预设、赛道与比赛规则
export const WORLD = {
  lakeA: 178,          // 湖面椭圆半长轴 (x)
  lakeB: 132,          // 湖面椭圆半短轴 (z)
  waterLevel: 0,
  shoreWidth: 46,
  islet: { x: 0, z: -4, r: 26 },   // 内场小岛（障碍）
};

// 物理基准：所有可调参数都乘在这些基准之上
export const BASE = {
  MAX_SPEED: 42,        // 硬上限（安全阀）
  THRUST_FORCE: 21.5,   // 推力加速度 (u/s^2)
  REVERSE_FACTOR: 0.42,
  BOOST_FACTOR: 1.45,   // Shift 冲刺倍率
  DRAG_LINEAR: 0.10,
  DRAG_QUAD: 0.021,
  PLANING: 0.58,        // 滑行减阻比例（高速时阻力大幅下降 → 松油门后滑行更久）
  YAW_RATE: 1.45,       // 最大偏航角速度 rad/s
  YAW_RESPONSE: 5.2,    // 舵响应平滑速度
  TURN_SPEED_REF: 7.0,  // 达到此速度转向才完全有效
  TURN_HIGHSPEED_LOSS: 0.30,
  GRIP_MIN: 1.1,        // 横向抓地加速度下限（滑移=1）
  GRIP_MAX: 7.2,        // 横向抓地加速度上限（滑移=0）
  SLIP_DRAG: 0.9,       // 漂移导致的额外阻力
  SPOOL_TIME: 0.45,     // 喷水推进器建压时间
  COLLISION_RESTITUTION: 0.45,
  STUCK_SPEED: 1.2,
  STUCK_TIME: 2.2,
  RESCUE_PENALTY: 2000, // 脱困罚时 (ms)
};

export const PARAM_RANGES = {
  thrust:           { min: 0.40, max: 2.00, step: 0.01, def: 1.00 },
  steerSensitivity: { min: 0.30, max: 2.50, step: 0.01, def: 1.00 },
  waterDrag:        { min: 0.40, max: 2.50, step: 0.01, def: 1.00 },
  lateralSlip:      { min: 0.00, max: 1.00, step: 0.01, def: 0.45 },
};

export const DEFAULT_PARAMS = {
  thrust: PARAM_RANGES.thrust.def,
  steerSensitivity: PARAM_RANGES.steerSensitivity.def,
  waterDrag: PARAM_RANGES.waterDrag.def,
  lateralSlip: PARAM_RANGES.lateralSlip.def,
};

// 两套预设：数值差异刻意放大，保证手感可感知
export const PRESETS = {
  stable: { label: '稳定', thrust: 0.88, steerSensitivity: 0.78, waterDrag: 1.42, lateralSlip: 0.12 },
  agile:  { label: '灵活', thrust: 1.22, steerSensitivity: 1.55, waterDrag: 0.72, lateralSlip: 0.78 },
};

export const RACE = {
  laps: 3,
  countdown: 3.6,      // 倒计时秒数（含 GO）
  buoyRadius: 1.35,
  gateHitWidthPad: 1.0,
};

// 赛道中心线（逆时针），闭合折线；gateIndex 处设置门
export const TRACK = {
  waypoints: [
    { x:    0, z:  112, gate: 'finish' },
    { x:   74, z:  108 },
    { x:  132, z:   80, gate: 'cp' },
    { x:  158, z:   18 },
    { x:  140, z:  -52, gate: 'cp' },
    { x:   82, z: -100 },
    { x:    0, z: -112, gate: 'cp' },
    { x:  -82, z: -100 },
    { x: -140, z:  -52, gate: 'cp' },
    { x: -158, z:   18 },
    { x: -132, z:   80, gate: 'cp' },
    { x:  -74, z:  108 },
  ],
  gateHalfWidth: 15,
  halfWidth: 30,       // 航道半宽（浮标布置）
};
