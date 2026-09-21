// 无渲染整局模拟：验证自动驾驶能稳定跑完三圈，并统计碰标/脱困
import { buildCourse } from '../../src/arena/gameplay/course.js';
import { createBoat, stepBoat } from '../../src/arena/gameplay/physics.js';
import { Race, RaceState } from '../../src/arena/gameplay/race.js';
import { Autopilot } from '../../src/arena/gameplay/autopilot.js';
import { DEFAULT_PARAMS, RACE } from '../../src/arena/gameplay/config.js';

const DT = 1 / 120;
export function simulateRace({ params = DEFAULT_PARAMS, maxSeconds = 400, autopilot = new Autopilot(buildCourse()), verbose = false } = {}) {
  const course = buildCourse();
  const start = course.finish;
  const boat = createBoat(start.x - start.dirX * 26, start.z - start.dirZ * 26, Math.atan2(start.dirX, start.dirZ));
  const race = new Race(course, { laps: RACE.laps });
  race.start();
  let t = 0, lastLap = 0;
  const events = [];
  let stuckPeak = 0, rescues = 0;
  while (race.state !== RaceState.FINISHED && t < maxSeconds) {
    const cmd = race.state === RaceState.RACING ? autopilot.drive(boat) : { throttle: 0, steer: 0, boost: false };
    stepBoat(boat, cmd, params, DT, course.world, t);
    const ev = race.update(DT, boat);
    if (ev) {
      events.push({ t: +t.toFixed(2), ...ev });
      if (verbose) console.log(`  [${t.toFixed(1)}s] ${ev.event} ${ev.gate || ''} ${ev.lapTime ? 'lap=' + ev.lapTime.toFixed(2) : ''}`);
    }
    stuckPeak = Math.max(stuckPeak, boat.stuckTime);
    if (boat.stuckTime > 3 && race.state === RaceState.RACING) { race.rescue(boat); rescues++; }
    t += DT;
  }
  return { finished: race.state === RaceState.FINISHED, total: race.time, lapTimes: race.lapTimes.map((x) => +x.toFixed(2)),
    collisions: boat.collisions, rescues, stuckPeak: +stuckPeak.toFixed(2), events };
}

if (process.argv[1]?.endsWith('sim-race.mjs')) {
  const r = simulateRace({ verbose: process.argv.includes('-v') });
  console.log('完赛:', r.finished, '| 总用时:', r.total.toFixed(2) + 's', '| 单圈:', r.lapTimes.join(' / '),
    '| 碰标:', r.collisions, '| 自动脱困:', r.rescues, '| 最长卡住时间:', r.stuckPeak + 's');
}
