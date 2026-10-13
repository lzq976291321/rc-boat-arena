import { createHullMotion } from './motion.js';
import { createWakeHistory, normalizeBoatState } from './trail.js';
import { sampleWaterSurface } from './surface.js';

export { createHullMotion, sampleWaterSurface };
export { waterSurfaceGLSL } from './surface.js';
export { hullUniformsGLSL, hullSurfaceGLSL, boatContactGLSL } from './surface-shader.js';

/** No renderer, RAF, model or global cache. The consumer owns its frame loop and
 * binds uniforms to its water shader; all mutable history belongs to this instance. */
export function createBoatWaterInteraction({ length = 2.4, beam = .738, draft = .11,
  sternWidth = .79, bowTaper = .58, wakeStrength = 1, sternOffset = .4,
  sampleSurface = sampleWaterSurface } = {}) {
  if (![length, beam, draft].every(value => Number.isFinite(value) && Number.isFinite(Math.fround(value)))
    || Math.fround(length) <= 0 || Math.fround(beam) <= 0)
    throw new TypeError('Contact dimensions must fit positive GPU floats (draft may be zero)');
  if (!Number.isFinite(sternWidth) || sternWidth <= 0 || sternWidth > 1
    || !Number.isFinite(bowTaper) || bowTaper < .2 || bowTaper > .9
    || !Number.isFinite(wakeStrength) || wakeStrength < 0 || wakeStrength > 2)
    throw new TypeError('Contact shape must stay within the supported hull envelope');
  const motion = createHullMotion({ length, beam, draft, sampleSurface });
  const history = createWakeHistory({ length, sternOffset, wakeStrength });
  const uniforms = {
    uContactHull: { value: new Float32Array(4) },
    uContactSize: { value: new Float32Array([length, beam, draft]) },
    uContactShape: { value: new Float32Array([sternWidth, bowTaper, wakeStrength]) },
    uContactEnabled: { value: 1 },
    uWakePoints: { value: history.points },
    uWakeBounds: { value: history.bounds },
    uWakeCount: { value: 0 },
  };
  let disposed = false;
  const sync = boat => {
    uniforms.uContactHull.value.set([boat.x, boat.z, boat.heading, boat.speed]);
    uniforms.uWakeCount.value = history.count;
  };
  return {
    pose: motion.pose, uniforms,
    update(dt, time, boat) {
      if (disposed || !Number.isFinite(time) || !Number.isFinite(dt) || dt <= 0) return motion.pose;
      const state = normalizeBoatState(boat);
      if (!state) return motion.pose;
      motion.update(dt, time, state); history.update(dt, time, state); sync(state);
      return motion.pose;
    },
    // No previous position leaks into a reset; omitted/bad fields use zero.
    reset(time = 0, boat = {}) {
      if (disposed) return motion.pose;
      const state = normalizeBoatState(boat, true);
      history.reset(); motion.reset(Number.isFinite(time) ? time : 0, state); sync(state); return motion.pose;
    },
    snapshot() { return { motion: motion.snapshot(), trail: history.snapshot(), disposed }; },
    dispose() {
      if (disposed) return; disposed = true;
      uniforms.uContactEnabled.value = 0; uniforms.uWakeCount.value = 0;
      history.dispose(); motion.dispose();
    },
  };
}
