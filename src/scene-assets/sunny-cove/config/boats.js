// Pure metadata: the selector and saved preferences can use this without Three.js.
// Paths are relative to the scene's assetBaseUrl; the shared loader selects the
// optimized scene variant. Length and draft are display settings in metres,
// not specifications of the real vessels. Local navigation points toward -Z.
export const DEFAULT_BOAT_ID = 'riva-aquarama';

export const BOATS = Object.freeze([
  Object.freeze({
    id: 'riva-aquarama',
    label: 'Riva Aquarama',
    subtitle: '桃花心木经典游艇',
    path: 'library/riva-aquarama/model.glb',
    length: 2.4,
    draft: 0.11,
    forward: '+X',
    yaw: Math.PI / 2,
    finish: 'riva-varnish',
    contact: Object.freeze({ sternWidth: 0.79, bowTaper: 0.58, sternOffset: 0.44, wakeStrength: 1 }),
  }),
  Object.freeze({
    id: 'maverick-gt',
    label: 'MAVERICK GT',
    subtitle: '现代运动摩托艇',
    path: 'library/maverick-gt/model.glb',
    length: 2.6,
    draft: 0.10,
    forward: '-X',
    yaw: -Math.PI / 2,
    finish: 'authored',
    contact: Object.freeze({ sternWidth: 0.72, bowTaper: 0.5, sternOffset: 0.46, wakeStrength: 0.85 }),
  }),
  Object.freeze({
    id: 'motor-whaleboat',
    label: 'Motor Whaleboat',
    subtitle: '白漆木甲板交通艇',
    path: 'library/motor-whaleboat/model.glb',
    length: 2.65,
    // The author's white/dark hull boundary is y=0. Its keel is 0.743
    // source units below that line, across a full length of 8.399 units.
    draft: 0.234,
    forward: '+X',
    yaw: Math.PI / 2,
    finish: 'authored',
    contact: Object.freeze({ sternWidth: 0.36, bowTaper: 0.62, sternOffset: 0.4, wakeStrength: 0.62 }),
  }),
  Object.freeze({
    id: 'assault-boat',
    label: 'Assault Boat',
    subtitle: '近岸轻型充气艇',
    path: 'library/assault-boat/model.glb',
    length: 2.4,
    // Full boat including the outboard; y=0 meets the base of the tubes.
    draft: 0.107,
    forward: '+Z',
    yaw: Math.PI,
    finish: 'authored',
    contact: Object.freeze({ sternWidth: 0.83, bowTaper: 0.8, sternOffset: 0.43, wakeStrength: 0.68 }),
  }),
]);

/** Reject stale or misspelled IDs; callers decide whether to restore a default. */
export function getBoatDefinition(id) {
  if (typeof id !== 'string' || !id) throw new TypeError('Boat ID must be a non-empty string');
  const definition = BOATS.find(boat => boat.id === id);
  if (!definition) throw new RangeError(`Unknown Sunny Cove boat: ${id}`);
  return definition;
}
