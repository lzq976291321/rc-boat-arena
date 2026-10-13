const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/** Curated positions are dock-local metres. The walking strip stays clear,
 * rubber fenders face the berth, and tools belong beside the rope/crate. */
export const DOCK_DRESSING = freeze({
  models: [
    { key: 'pier', id: 'modular-wooden-pier', nodeName: 'modular_wooden_pier_planks' },
    { key: 'bench', id: 'painted-wooden-bench' },
    { key: 'crate', id: 'wooden-crate-02' },
    { key: 'lifebuoy', id: 'lifebuoy' },
    { key: 'tyre', id: 'old-tyre' },
    { key: 'bucket', id: 'wooden-bucket-01' },
    { key: 'lantern', id: 'lantern-01' },
  ],
  bench: { x: -2.1, z: -.36, scale: 1.24, yaw: Math.PI },
  crate: { x: .92, z: -.48, scale: .74, yaw: Math.PI / 2 },
  bucket: { x: .25, z: -.49, scale: .95, yaw: -.35 },
  lantern: { x: .96, z: -.49, scale: 1.45, yaw: -.24 },
  lifebuoy: { x: 1.35, y: .3, z: 1.08, scale: .8 },
  fenders: [
    { x: -2.64, y: -.08, z: 1.14, scale: .83, yaw: -.035 },
    { x: -.1, y: -.06, z: 1.14, scale: .83, yaw: .025 },
    { x: 2.65, y: -.09, z: 1.14, scale: .83, yaw: -.045 },
  ],
  lanternIntensity: { afternoon: .08, sunset: .36, bluehour: .66 },
});

/** Single plants from source display collections. Each [side,z,inland,height]
 * stays on the dry rock shoulder; these are accents, not a second tree layer. */
export const SHORE_DRESSING = freeze({
  models: [
    { key: 'shrubAccent', path: 'library/shrub-03/model.glb', nodeName: 'shrub_03_a' },
    { key: 'sorrel', path: 'library/shrub-sorrel-01/model.glb', nodeName: 'shrub_sorrel_01_d' },
  ],
  shrubAccents: [[-1, 5.6, .9, .85], [-1, -7.5, 1.6, 1.05], [-1, -19.8, 1.2, .95],
    [1, 6.2, 1.1, .65], [1, -4.5, 1.4, .85], [1, -22.1, 1.3, 1.05]],
  sorrelPockets: [[-1, 6.7, 1.6, .2], [-1, 5.9, 1.5, .23], [-1, -.7, 1.1, .22],
    [-1, -8.4, 1.3, .18], [1, 8.9, 1.6, .22], [1, 7.8, 1.4, .25], [1, .4, 1.1, .2], [1, -5.5, 1.4, .23]],
});
