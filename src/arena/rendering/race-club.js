import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObjects } from '../../shared/rendering/resources.js';
import { loadSceneryModel, instanceSceneryModel } from './scenery-assets.js';

const CLUB_MODELS = [
  { key: 'pier', id: 'modular-wooden-pier', nodeNames: ['modular_wooden_pier_planks'] },
  { key: 'bench', id: 'painted-wooden-bench' },
  { key: 'picnic', id: 'wooden-picnic-table' },
  { key: 'crate', id: 'wooden-crate-02' },
  { key: 'tyre', id: 'old-tyre' },
  { key: 'bucket', id: 'wooden-bucket-01' },
  { key: 'lifebuoy', id: 'lifebuoy' },
];

/** A shore-side club: timber launch terrace, boat preparation and a shaded rest area. */
export function buildRaceClub(shoreHeightAt) {
  const group = new THREE.Group();
  group.name = 'Songlan Lake racing club';
  group.userData.assetState = { status: 'loading', loaded: 0, total: CLUB_MODELS.length };
  group.userData.assets = CLUB_MODELS.map(({ key, id, nodeNames }) => ({
    key, path: `assets/library/${id}/model.glb`, nodeNames: nodeNames ?? null, count: 0,
  }));
  group.ready = populateClub(group, shoreHeightAt).then(() => {
    group.userData.assetState.status = 'ready';
    return group;
  }).catch(error => {
    group.userData.assetState = { ...group.userData.assetState, status: 'error', message: error.message };
    throw error;
  });
  return group;
}

async function populateClub(group, shoreHeightAt) {
  const results = await Promise.allSettled(group.userData.assets.map(async record => {
    const model = await loadSceneryModel(record.path, { nodeNames: record.nodeNames ?? undefined });
    record.sourceSize = { ...model.userData.size };
    group.userData.assetState.loaded++;
    return model;
  }));
  const models = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') models[CLUB_MODELS[i].key] = result.value;
  });
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    disposeObjects(Object.values(models));
    throw failure.reason;
  }
  try {
    assembleClub(group, models, shoreHeightAt);
  } catch (error) {
    disposeObjects([group, ...Object.values(models)]);
    group.clear();
    throw error;
  }
}

function assembleClub(group, models, shoreHeightAt) {
  const placements = Object.fromEntries(CLUB_MODELS.map(({ key }) => [key, []]));
  const placeModel = (key, x, y, z, scale, yaw = 0) => placements[key].push({ x, y, z, scale, yaw });
  const batches = { matte: [], metal: [], paint: [] };
  const colors = {
    wood: '#967b58', lightWood: '#ae936c', dark: '#244346', cream: '#e7dfc6',
    orange: '#c55336', blue: '#417c8e', stone: '#a79f83', white: '#eee6cc',
  };
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);

  // All pieces are owned by this group. Only the merged output survives construction.
  const add = (source, color, x, y, z, rotation = [0, 0, 0], batch = 'matte') => {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    const tint = new THREE.Color(color), count = geometry.attributes.position.count;
    const vertexColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) tint.toArray(vertexColors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    quaternion.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(position.set(x, y, z), quaternion, scale);
    geometry.applyMatrix4(matrix);
    batches[batch].push(geometry);
  };
  const box = (w, h, d, x, y, z, color = colors.wood, rotation = [0, 0, 0], batch = 'matte') =>
    add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rotation, batch);
  const post = (radius, height, x, base, z, color = colors.dark) =>
    add(new THREE.CylinderGeometry(radius, radius, height, 8), color, x, base + height / 2, z, [0, 0, 0], 'metal');
  const ground = (x, z) => shoreHeightAt(x, z);

  // A level terrace clears the uphill edge; piles continue down to the actual slope.
  const terrace = (x, z, width, requestedDepth) => {
    const size = models.pier.userData.size;
    const columns = width > 20 ? 5 : 3, moduleScale = width / (columns * size.x);
    const tileWidth = size.x * moduleScale, tileDepth = size.z * moduleScale;
    const rows = Math.max(1, Math.round(requestedDepth / tileDepth));
    // Keep each module's original proportions, including the photographed wood grain.
    const depth = rows * tileDepth;
    const corners = [-1, 1].flatMap(sx => [-1, 1].map(sz => ground(x + sx * width / 2, z + sz * depth / 2)));
    const top = Math.max(...corners) + 0.26;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++)
      placeModel('pier', x - width / 2 + tileWidth * (column + 0.5), top - size.y * moduleScale,
        z - depth / 2 + tileDepth * (row + 0.5), moduleScale);
    for (let dx = -width / 2 + 0.5; dx <= width / 2; dx += (width - 1) / 4) {
      for (const dz of [-depth / 2 + 0.4, depth / 2 - 0.4]) {
        const foot = ground(x + dx, z + dz) - 0.3;
        box(0.28, top - foot, 0.28, x + dx, (top + foot) / 2, z + dz, colors.dark, [0, 0, 0], 'metal');
      }
    }
    for (const side of [-1, 1]) box(width, 0.36, 0.18, x, top - 0.3, z + side * (depth / 2 - 0.13), colors.dark);
    return { top, depth };
  };

  const x = -53, z = 150;
  const mainTerrace = terrace(x, z, 28, 9), deck = mainTerrace.top;
  // A shallow pitched cream canopy keeps the familiar club silhouette.
  for (const dx of [-6.2, 6.2]) for (const dz of [-2.9, 2.9]) post(0.13, 5.7, x + dx, deck, z + dz);
  for (const side of [-1, 1]) {
    box(14.1, 0.16, 3.65, x, deck + 5.8, z + side * 1.65, colors.cream, [side * 0.15, 0, 0]);
    box(14.1, 0.3, 0.12, x, deck + 5.4, z + side * 3.4, colors.cream);
    box(12.5, 0.14, 0.14, x, deck + 5.15, z + side * 2.9, colors.dark, [0, 0, 0], 'metal');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.dark; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.cream; ctx.font = '600 58px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('LAKE  /  RACING CLUB', 512, 88);
  ctx.fillStyle = '#c9b98f'; ctx.font = '500 30px system-ui';
  ctx.fillText('SONGLAN LAKE   ·   RC BOATING', 512, 145);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.7, 2.2),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }));
  sign.name = 'Racing club sign';
  sign.position.set(x, deck + 4.08, z - 3.05); sign.rotation.y = Math.PI;
  group.add(sign);

  // Front rails are short, leaving a broad central opening toward the race course.
  for (const side of [-1, 1]) {
    const railX = x + side * 10.2;
    for (const dz of [-4.2, 4.2]) {
      box(6.4, 0.13, 0.13, railX, deck + 1.18, z + dz, colors.dark, [0, 0, 0], 'metal');
      for (const dx of [-2.9, 0, 2.9]) post(0.065, 1.2, railX + dx, deck, z + dz);
    }
  }
  // A broad stepped approach reaches the grass instead of ending in mid-air.
  const stepCount = 7, frontZ = z - mainTerrace.depth / 2;
  const stairEnd = frontZ - stepCount * 0.8;
  const bottom = Math.max(ground(x - 3, stairEnd), ground(x + 3, stairEnd)) + 0.12;
  for (let i = 0; i < stepCount; i++) {
    const stepZ = frontZ - (i + 0.5) * 0.8;
    const top = THREE.MathUtils.lerp(deck, bottom, (i + 1) / stepCount);
    const base = Math.min(ground(x - 3, stepZ), ground(x + 3, stepZ)) - 0.12;
    box(6, Math.max(0.24, top - base), 0.8, x, (top + base) / 2, stepZ, colors.wood);
    box(6, 0.08, 0.16, x, top + 0.02, stepZ - 0.32, colors.lightWood);
  }

  placeModel('bench', x + 8.9, deck, z + 2.25, 2.4);
  placeModel('bench', x - 8.9, deck, z + 2.25, 2.4);

  const workTable = (tx, tz, floor, width = 4.8) => {
    box(width, 0.22, 1.8, tx, floor + 1.52, tz, colors.lightWood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      box(0.15, 1.42, 0.15, tx + sx * (width / 2 - 0.3), floor + 0.71, tz + sz * 0.65, colors.dark, [0, 0, 0], 'metal');
    box(width - 0.6, 0.12, 1.3, tx, floor + 0.4, tz, colors.dark, [0, 0, 0], 'metal');
    return floor + 1.63;
  };

  // Faceted pointed hulls read as model boats, rather than anonymous storage boxes.
  const modelBoat = (bx, by, bz, color, yaw = Math.PI / 2) => {
    const outline = [[-0.48, -1.65], [0.48, -1.65], [0.61, 0.25], [0, 1.75], [-0.61, 0.25]];
    const positions = [], indices = [];
    for (const height of [0.02, 0.44]) for (const [px, pz] of outline)
      positions.push(px * (height < 0.1 ? 0.65 : 1), height, pz * (height < 0.1 ? 0.93 : 1));
    for (let i = 1; i < outline.length - 1; i++) indices.push(5, 5 + i + 1, 5 + i, 0, i, i + 1);
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      indices.push(i, 5 + next, next, i, 5 + i, 5 + next);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(geometry, color, bx, by, bz, [0, yaw, 0], 'paint');
    box(0.57, 0.32, 1.45, bx, by + 0.49, bz, colors.cream, [0, yaw, 0], 'paint');
    box(0.44, 0.12, 0.6, bx, by + 0.7, bz, colors.dark, [0, yaw, 0], 'paint');
  };
  const prepTop = workTable(x - 3.8, z - 0.5, deck);
  modelBoat(x - 3.8, prepTop, z - 0.5, colors.orange);
  const timingTop = workTable(x + 3.3, z - 0.15, deck, 3.6);
  box(1.25, 0.17, 0.78, x + 3.3, timingTop + 0.085, z - 0.15, colors.dark, [0, 0, 0], 'metal');
  box(1.25, 0.78, 0.09, x + 3.3, timingTop + 0.51, z + 0.22, colors.dark, [-0.14, 0, 0], 'metal');
  box(0.95, 0.55, 0.035, x + 3.3, timingTop + 0.53, z + 0.14, colors.blue, [-0.14, 0, 0], 'paint');

  // The adjacent rigging deck has two stacked racing hulls and a separate workbench.
  const rigX = -77, rigZ = 153, rigTerrace = terrace(rigX, rigZ, 12, 8), rigDeck = rigTerrace.top;
  const rackX = rigX - 2.5, rackZ = rigZ + 1.5;
  for (const dx of [-1.5, 1.5]) {
    post(0.11, 3.5, rackX + dx, rigDeck, rackZ);
    for (const height of [1.0, 2.35]) box(0.18, 0.18, 2.5, rackX + dx, rigDeck + height, rackZ, colors.dark, [0, 0, 0], 'metal');
  }
  box(3.3, 0.15, 0.15, rackX, rigDeck + 3.15, rackZ, colors.dark, [0, 0, 0], 'metal');
  modelBoat(rackX, rigDeck + 1.1, rackZ, colors.blue);
  modelBoat(rackX, rigDeck + 2.45, rackZ, colors.orange);
  const rigTop = workTable(rigX + 2.7, rigZ - 1.1, rigDeck, 4.4);
  modelBoat(rigX + 2.7, rigTop, rigZ - 1.1, colors.cream);
  const crateScale = 1.65;
  placeModel('crate', rigX - 1.3, rigDeck, rigZ - 2.3, crateScale, Math.PI / 2);
  placeModel('crate', rigX - 1.3, rigDeck + models.crate.userData.size.y * crateScale,
    rigZ - 2.3, crateScale * 0.88, Math.PI / 2 + 0.06);
  placeModel('crate', rigX + 0.8, rigDeck, rigZ + 2.1, crateScale, Math.PI / 2);
  placeModel('bucket', rigX + 4.8, rigDeck, rigZ + 2.2, 2.1, -0.35);
  placeModel('bucket', x - 11.4, deck, z + 2.1, 1.8, 0.5);
  for (const dx of [-11, -7, 7, 11])
    placeModel('tyre', x + dx, deck - 1.48, z - mainTerrace.depth / 2 - 0.15, 2.4);

  // A separate picnic terrace gives the clubhouse a recognisable social space.
  const restX = -28, restZ = 154, restTerrace = terrace(restX, restZ, 12, 9), restDeck = restTerrace.top;
  placeModel('picnic', restX, restDeck, restZ, 2.1, Math.PI / 2);
  // The side-mounted umbrella avoids drilling a pole through the scanned tabletop.
  const shadeX = restX + 3.9, shadeZ = restZ + 2.9;
  post(0.12, 5.7, shadeX, restDeck, shadeZ);
  const arm = new THREE.Vector3(-3.9, 0.35, -2.9), armLength = arm.length();
  const armRotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion()
    .setFromUnitVectors(THREE.Object3D.DEFAULT_UP, arm.normalize()));
  add(new THREE.CylinderGeometry(0.09, 0.09, armLength, 8), colors.dark,
    restX + 1.95, restDeck + 5.875, restZ + 1.45, [armRotation.x, armRotation.y, armRotation.z], 'metal');
  add(new THREE.ConeGeometry(4.8, 1.3, 8, 1, false), colors.cream, restX, restDeck + 5.32, restZ, [0, Math.PI / 8, 0]);
  add(new THREE.CylinderGeometry(4.8, 4.8, 0.2, 8), colors.orange, restX, restDeck + 4.73, restZ, [0, Math.PI / 8, 0]);
  post(0.24, 0.23, restX, restDeck + 5.97, restZ, colors.orange);

  // Safety and venue furniture use a few strong silhouettes, not scattered clutter.
  const lifeRing = (rx, rz, floor) => {
    post(0.12, 3.15, rx, floor, rz);
    box(1.65, 2.2, 0.2, rx, floor + 2.0, rz, colors.cream);
    placeModel('lifebuoy', rx, floor + 1.12, rz - 0.32, 1.8, Math.PI);
    box(0.5, 0.12, 0.03, rx, floor + 2.9, rz - 0.12, colors.orange);
  };
  lifeRing(x - 12.2, z - 3.8, deck);
  lifeRing(restX + 5.0, restZ - 2.8, restDeck);
  for (const fx of [-88, -16]) {
    const fz = 151, base = ground(fx, fz);
    post(0.09, 9.5, fx, base, fz);
    box(1.9, 4.7, 0.055, fx + 0.97, base + 6.8, fz, colors.orange, [0, 0.2, 0]);
    box(1.1, 0.17, 0.065, fx + 0.9, base + 7.8, fz - 0.11, colors.cream, [0, 0.2, 0]);
    box(1.1, 0.17, 0.065, fx + 0.9, base + 7.35, fz - 0.11, colors.cream, [0, 0.2, 0]);
  }

  // Individual pavers conform to the cross-slope and connect all three rear entrances.
  const paver = (px, pz, width, depth) => {
    const geometry = new THREE.BoxGeometry(width, 0.18, depth);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const wx = px + vertices.getX(i), wz = pz + vertices.getZ(i);
      vertices.setY(i, ground(wx, wz) + vertices.getY(i) + 0.06);
    }
    geometry.computeVertexNormals();
    add(geometry, colors.stone, px, 0, pz);
  };
  for (let i = 0; i < 30; i++) {
    const px = -83 + i * 2.1, pz = 161.1 + Math.sin(i * 0.15) * 0.8;
    paver(px, pz, 1.96, 2.25);
  }
  for (const [entranceX, rearZ] of [[rigX, rigZ + rigTerrace.depth / 2],
    [x, z + mainTerrace.depth / 2], [restX, restZ + restTerrace.depth / 2]]) {
    for (let pz = rearZ + 0.85; pz < 161.1; pz += 1.7) paver(entranceX, pz, 3.1, 1.58);
  }
  const wayX = -47, wayZ = 165, wayBase = ground(wayX, wayZ);
  post(0.12, 3.4, wayX, wayBase, wayZ);
  for (const [height, width, color] of [[2.8, 3.0, colors.dark], [2.1, 2.5, colors.orange]]) {
    box(width, 0.45, 0.2, wayX, wayBase + height, wayZ, color);
    box(0.43, 0.43, 0.18, wayX + width / 2, wayBase + height, wayZ, color, [0, 0, Math.PI / 4]);
  }

  const materialOptions = {
    matte: { roughness: 0.86, metalness: 0 },
    metal: { roughness: 0.58, metalness: 0.25 },
    paint: { roughness: 0.4, metalness: 0.12 },
  };
  for (const [name, geometries] of Object.entries(batches)) {
    const geometry = mergeGeometries(geometries, false);
    for (const part of geometries) part.dispose();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, ...materialOptions[name] }));
    mesh.name = `Race club ${name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const record of group.userData.assets) {
    const instances = instanceSceneryModel(models[record.key], placements[record.key], `Club ${record.key}`);
    record.count = placements[record.key].length;
    const bounds = new THREE.Box3().setFromObject(instances);
    record.bounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
    group.add(instances);
  }
}
