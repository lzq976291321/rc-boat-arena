import * as THREE from 'three';
import { WORLD } from '../gameplay/config.js';
import { loadSceneryModel, instanceSceneryModel } from './scenery-assets.js';

export const inClubClearing = (x, z) => x > -96 && x < -8 && z > 130 && z < 187;

/** Small, mixed patches leave bare soil between shore, woodland and path planting. */
function addGrassPatches({ heightAt, pointAt, islandHeightAt, trees, stumps, groundcover, ferns }) {
  const weeds = [], nettles = [], occupied = [];
  // A separate sequence keeps the existing trees and shoreline rocks in place.
  let seed = 0x51a71e;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const kinds = {
    sorrel: { plants: groundcover, minHeight: 0.20, variation: 0.15, width: 1.02, radiusRatio: 0.96 },
    weed: { plants: weeds, minHeight: 0.27, variation: 0.24, width: 0.94, radiusRatio: 1.85 },
    nettle: { plants: nettles, minHeight: 0.62, variation: 0.40, width: 0.96, radiusRatio: 0.45 },
    fern: { plants: ferns, minHeight: 0.78, variation: 0.30, width: 0.82, radiusRatio: 1.57 },
  };
  const rotation = new THREE.Quaternion(), yawRotation = new THREE.Quaternion(), euler = new THREE.Euler();
  const normal = new THREE.Vector3();
  const canPlant = (x, z, radius, island, clubBed) => {
    if (island) return Math.hypot(x - WORLD.islet.x, z - WORLD.islet.z) + radius < WORLD.islet.r - 3;
    // Keep the full leaf footprint outside both the physical lake and the wet beach.
    if (Math.hypot(x / (WORLD.lakeA - 4 + radius + 0.5), z / (WORLD.lakeB - 4 + radius + 0.5)) < 1) return false;
    const shore = pointAt(Math.atan2(z / WORLD.lakeB, x / WORLD.lakeA), 1);
    const scale = Math.hypot(x / WORLD.lakeA, z / WORLD.lakeB) / Math.hypot(shore.x / WORLD.lakeA, shore.z / WORLD.lakeB);
    if (scale < 1.045) return false;
    // The rear pavers end below z=163.1; this bed starts beyond their leaf clearance.
    // All other club ground, including terrace stairs and the lake-facing opening, stays clear.
    if (inClubClearing(x, z) && (!clubBed || x - radius < -92 || x + radius > -12 || z - radius < 164.8 || z + radius > 175)) return false;
    if (clubBed && Math.hypot(x + 47, z - 165) < 2.1 + radius) return false;
    return true;
  };
  const plant = (kind, x, z, { island = false, clubBed = false } = {}) => {
    const spec = kinds[kind], height = spec.minHeight + random() * spec.variation;
    const width = spec.width * (0.92 + random() * 0.16), radius = height * width * spec.radiusRatio;
    if (!canPlant(x, z, radius, island, clubBed)) return;
    if (occupied.some(p => Math.hypot(p.x - x, p.z - z) < (p.radius + radius) * 0.70)) return;
    if (trees.some(p => Math.hypot(p.x - x, p.z - z) < 0.65 + radius * 0.45)) return;
    if (stumps.some(p => Math.hypot(p.x - x, p.z - z) < 2.0 + radius)) return;
    const ground = island ? islandHeightAt : heightAt;
    // Low plants follow the slope instead of forming horizontal shelves over it.
    const dx = (ground(x + 0.3, z) - ground(x - 0.3, z)) / 0.6;
    const dz = (ground(x, z + 0.3) - ground(x, z - 0.3)) / 0.6;
    normal.set(-dx, 1, -dz).normalize();
    rotation.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, normal);
    yawRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, random() * Math.PI * 2);
    euler.setFromQuaternion(rotation.multiply(yawRotation));
    spec.plants.push({ x, z, y: ground(x, z) - Math.min(0.08, height * 0.12), height, width,
      leanX: euler.x, yaw: euler.y, leanZ: euler.z });
    occupied.push({ x, z, radius });
  };
  const patch = (x, z, spread, count, palette, options) => {
    const stretch = 0.55 + random() * 0.30, yaw = random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, r = spread * Math.sqrt(random());
      const px = Math.cos(angle) * r, pz = Math.sin(angle) * r * stretch;
      plant(palette[i % palette.length], x + px * Math.cos(yaw) - pz * Math.sin(yaw),
        z + px * Math.sin(yaw) + pz * Math.cos(yaw), options);
    }
  };
  // Irregular shore pockets, with generous gaps rather than a continuous green ring.
  for (let i = 0; i < 26; i++) {
    if (i % 7 === 2) continue;
    const angle = i / 26 * Math.PI * 2 + (random() - 0.5) * 0.08;
    const point = pointAt(angle, 1.065 + random() * 0.045);
    patch(point.x, point.z, 2.3 + random() * 1.5, 10, ['weed', 'sorrel', 'weed', 'sorrel', 'nettle']);
  }
  for (let i = 0; i < trees.length; i += 5) {
    const tree = trees[i];
    if (Math.hypot(tree.x / WORLD.lakeA, tree.z / WORLD.lakeB) < 1 || inClubClearing(tree.x, tree.z)) continue;
    patch(tree.x + 2.5, tree.z - 0.9, 2.6, 8, ['sorrel', 'weed', 'sorrel', 'fern', 'nettle']);
  }
  // These five beds sit behind the path, away from platform entrances and the direction sign.
  for (const [x, z] of [[-84,166.2],[-71,166.8],[-58,166.4],[-35,166.6],[-22,166.5]])
    patch(x, z, 2.2, 13, ['sorrel', 'weed', 'sorrel', 'weed', 'nettle'], { clubBed: true });
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.39996 + 0.5, radius = 10 + (i % 3) * 3.5;
    patch(WORLD.islet.x + Math.cos(angle) * radius, WORLD.islet.z + Math.sin(angle) * radius,
      2.5, 9, ['sorrel', 'weed', 'sorrel', 'fern'], { island: true });
  }
  return { weeds, nettles, count: occupied.length };
}

/** Scanned library plants, shared by spatial batches so off-screen groves can be culled. */
export function buildShoreVegetation({ heightAt, pointAt, islandHeightAt, random }) {
  const group = new THREE.Group();
  group.name = 'Lakeside planting';
  const contacts = [], islandContacts = [], trees = [], shrubs = [], groundcover = [], ferns = [];
  const placement = (x, z, height, width = 1) => ({ x, z, y: heightAt(x, z, 0.18), height, width, yaw: random() * Math.PI * 2 });
  const addTree = (x, z, height, width = 0.85) => {
    if (trees.some(p => Math.hypot(p.x - x, p.z - z) < 10)) return;
    const tree = placement(x, z, height, width);
    tree.y = heightAt(x, z, 0.15 + height * 0.045);
    trees.push(tree);
    contacts.push({ x, z, radius: height * 0.23 });
  };
  for (let i = 0; i < 44; i++) {
    const angle = i / 44 * Math.PI * 2 + (random() - 0.5) * 0.075;
    const p = pointAt(angle, 1.115 + random() * 0.13);
    if (!inClubClearing(p.x, p.z)) addTree(p.x, p.z, 10 + random() * 8);
  }
  for (let i = 0; i < 22; i++) {
    const p = pointAt(i / 22 * Math.PI * 2 + 0.08, 1.39 + random() * 0.21);
    if (!inClubClearing(p.x, p.z)) addTree(p.x, p.z, 14 + random() * 10, 0.74);
  }
  for (const [x, z, height] of [[-101,149,15],[-93,169,16],[-76,177,18],[-56,180,21],[-35,176,17],[-14,170,16],[-5,149,14]]) {
    addTree(x, z, height);
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.39996, radius = 7 + (i % 3) * 3;
    const x = WORLD.islet.x + Math.cos(angle) * radius, z = WORLD.islet.z + Math.sin(angle) * radius;
    trees.push({ ...placement(x, z, 10 + (i % 3) * 2.5, 0.75), y: islandHeightAt(x, z) - 0.2 });
    islandContacts.push({ x, z, radius: 3 });
  }
  // Bushes grow in groups beside trees and rocks, with gaps along the beach.
  for (let i = 0; i < 92; i++) {
    const angle = random() * Math.PI * 2;
    if (Math.sin(angle * 8) < -0.5) continue;
    const p = pointAt(angle, 1.055 + random() * 0.12);
    if (inClubClearing(p.x, p.z)) continue;
    shrubs.push(placement(p.x, p.z, 1.6 + random() * 1.8, 1));
    groundcover.push(placement(p.x + 2, p.z - 0.3, 0.25 + random() * 0.2, 1.3));
  }
  for (const [x,z] of [[-91,155],[-88,168],[-71,173],[-61,170],[-43,169],[-20,165],[-13,154]]) {
    shrubs.push(placement(x,z,2.3));
    groundcover.push(placement(x+2,z-1,0.38,1.4));
    ferns.push(placement(x-2,z-0.5,1.3));
  }
  for (let i = 0; i < trees.length; i += 5) {
    const p = trees[i];
    if (Math.hypot(p.x / WORLD.lakeA, p.z / WORLD.lakeB) < 1) continue;
    ferns.push(placement(p.x + 1.8, p.z - 0.6, 1.1 + random() * 0.5));
  }
  const stumps = [[-98,143],[-9,162],[151,-78]].map(([x,z]) => ({ ...placement(x,z,1.25), y: heightAt(x,z,0.38) }));
  const bushes = shrubs.filter((_, i) => i % 3 === 0).map(p => ({ ...p, height: 2.2, width: 1.15 }));
  const smallShrubs = shrubs.filter((_, i) => i % 3 !== 0);
  const grasses = addGrassPatches({ heightAt, pointAt, islandHeightAt, trees, stumps, groundcover, ferns });
  const definitions = [
    { path: 'assets/swamp/island-tree.glb', name: 'Scanned lakeside trees', placements: trees },
    { path: 'assets/library/shrub-03/model.glb', nodeNames: ['shrub_03_b'], name: 'Scanned bank shrubs', placements: smallShrubs },
    { path: 'assets/library/shrub-02/model.glb', nodeNames: ['shrub_02_b'], name: 'Dense bankside bushes', placements: bushes },
    { path: 'assets/library/shrub-sorrel-01/model.glb', nodeNames: ['shrub_sorrel_01_b'], name: 'Wood sorrel groundcover', placements: groundcover, castShadow: false },
    { path: 'assets/swamp/fern.glb', name: 'Lakeside ferns', placements: ferns, castShadow: false },
    { path: 'assets/library/tree-stump-01/model.glb', name: 'Weathered stumps', placements: stumps },
    { path: 'assets/library/weed-plant-02/model.glb', nodeNames: ['weed_plant_02_c_LOD0'], name: 'Shore weed patches', placements: grasses.weeds, castShadow: false },
    { path: 'assets/library/nettle-plant/model.glb', nodeNames: ['nettle_plant_medium_a_LOD0'], name: 'Woodland nettle patches', placements: grasses.nettles, castShadow: false },
  ];
  group.userData.assetState = { status: 'loading', errors: [] };
  group.userData.assets = [];
  group.userData.counts = { trees: trees.length, shrubs: smallShrubs.length, bushes: bushes.length,
    groundcover: groundcover.length, ferns: ferns.length, stumps: stumps.length,
    weeds: grasses.weeds.length, nettles: grasses.nettles.length, addedGrassPlants: grasses.count };
  const load = async definition => {
    const model = await loadSceneryModel(definition.path, { nodeNames: definition.nodeNames });
    const sourceHeight = model.userData.size.y;
    const sectors = new Map();
    for (const site of definition.placements) {
      const p = { ...site, scale: site.height / sourceHeight };
      // Eight small spatial batches save geometry work in both the view and reflection pass.
      const sector = Math.hypot(p.x / WORLD.lakeA, p.z / WORLD.lakeB) < 0.8
        ? 'island'
        : Math.floor((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI / 4)) % 8;
      if (!sectors.has(sector)) sectors.set(sector, []);
      sectors.get(sector).push(p);
    }
    for (const [sector, placements] of sectors) {
      const instances = instanceSceneryModel(model, placements, `${definition.name} ${sector}`);
      if (definition.castShadow === false) instances.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
      group.add(instances);
    }
    group.userData.assets.push({ path: definition.path, nodeNames: definition.nodeNames, count: definition.placements.length, sourceSize: model.userData.size });
  };
  // Limit simultaneous image decoding; reuse the same GLB bytes as the asset library.
  const ready = (async () => {
    for (let i = 0; i < definitions.length; i += 2) {
      const results = await Promise.allSettled(definitions.slice(i, i + 2).map(load));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
    group.userData.assetState.status = 'ready';
    return group;
  })().catch(error => {
    group.userData.assetState.status = 'error';
    group.userData.assetState.errors.push(String(error));
    throw error;
  });
  return { group, contacts, islandContacts, ready };
}
