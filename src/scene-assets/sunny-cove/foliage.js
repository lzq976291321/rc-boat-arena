import * as THREE from 'three';
import { instanceCoveModel } from './dock.js';
import { coveShoreX, shoreHeight } from './coast.js';

function randomFrom(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** shrub_04 is four plants laid out for display. Two real gaps isolate intact
 * plants; equal-width cuts would slice leaves and keep the display-row shape. */
function individualShrubs(source) {
  const part = source.parts[0], original = part.geometry;
  const position = original.getAttribute('position'), index = original.index;
  const count = index?.count ?? position.count, variants = [];
  for (const [lower, upper] of [[-Infinity, -.4160713], [-.4160713, -.2668494]]) {
    const selected = [];
    for (let offset = 0; offset < count; offset += 3) {
      const triangle = [0, 1, 2].map(corner => index ? index.getX(offset + corner) : offset + corner);
      if (triangle.every(vertex => position.getX(vertex) > lower && position.getX(vertex) < upper)) selected.push(...triangle);
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(original.attributes)) {
      const array = new attribute.array.constructor(selected.length * attribute.itemSize);
      for (let i = 0; i < selected.length; i++) for (let item = 0; item < attribute.itemSize; item++)
        array[i * attribute.itemSize + item] = attribute.array[selected[i] * attribute.itemSize + item];
      geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    geometry.applyMatrix4(part.matrix); geometry.computeBoundingBox();
    const bounds = geometry.boundingBox, center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    geometry.translate(-center.x, -bounds.min.y, -center.z); geometry.computeBoundingSphere();
    variants.push({ size, parts: [{ geometry, material: part.material, matrix: new THREE.Matrix4(), name: `individual shrub ${variants.length + 1}` }] });
  }
  return variants;
}

/** Reuse a few spatially connected portions of the original dense leaf crown.
 * Whole triangles keep the photographed leaf edges and UVs intact. */
function crownFragments(tree) {
  const source = tree.parts.find(part => part.material.name === 'jacaranda_tree_leaves');
  const geometry = source.geometry, position = geometry.attributes.position, index = geometry.index;
  const regions = [
    { x: [-12, -4], y: [8, 15], z: [-8, -.5] },
    { x: [3, 11], y: [9, 17], z: [-2, 7] },
  ];
  return regions.map((region, number) => {
    const selected = [];
    for (let offset = 0; offset < index.count; offset += 3) {
      const vertices = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
      const x = vertices.reduce((sum, i) => sum + position.getX(i), 0) / 3;
      const y = vertices.reduce((sum, i) => sum + position.getY(i), 0) / 3;
      const z = vertices.reduce((sum, i) => sum + position.getZ(i), 0) / 3;
      if (x > region.x[0] && x < region.x[1] && y > region.y[0] && y < region.y[1] && z > region.z[0] && z < region.z[1]) selected.push(...vertices);
    }
    const fragment = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const array = new attribute.array.constructor(selected.length * attribute.itemSize);
      for (let i = 0; i < selected.length; i++) for (let item = 0; item < attribute.itemSize; item++)
        array[i * attribute.itemSize + item] = attribute.array[selected[i] * attribute.itemSize + item];
      fragment.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    fragment.computeBoundingBox();
    const bounds = fragment.boundingBox, size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    fragment.translate(-center.x, -bounds.min.y, -center.z); fragment.computeBoundingSphere();
    return { size, parts: [{ geometry: fragment, material: source.material, matrix: new THREE.Matrix4(), name: `natural leaf crown fragment ${number + 1}` }] };
  });
}

/** Dense original leaf geometry supplies both the silhouette and light/shadow. */
export function createCoastalFoliage(group, { tree, bush }, quality) {
  const random = randomFrom(79194);
  for (const model of [tree, bush]) for (const part of model.parts)
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      material.alphaToCoverage = true; material.envMapIntensity = .72;
      if (material.alphaTest > 0) material.alphaTest = Math.min(material.alphaTest, .42);
      if (material.name === 'jacaranda_tree_leaves') material.color.set('#ddebab');
    }
  // This GLB's three meshes are leaves, fine branches and trunk, not LODs.
  // The trunk already contains the supporting boughs. Omitting fine branches
  // saves 123,128 triangles per instance without thinning the leaf silhouette.
  const coastalTree = { ...tree, parts: tree.parts.filter(part => part.material.name !== 'jacaranda_tree_branches') };
  const solids = [];
  group.traverse(object => {
    if (object.isInstancedMesh && /Scanned fractures|Individual fallen/.test(object.name)) solids.push(object);
  });
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const plantHeight = (x, z, fallback) => {
    ray.ray.origin.set(x, 30, z);
    return Math.max(fallback, ray.intersectObjects(solids, false)[0]?.point.y ?? fallback) - .08;
  };
  // Positions are on the visible rock shoulder, not the hidden inland slope.
  // Their dense crowns fit inside the standard dock camera's upper corners.
  const treeSites = [[-1, -17.6, .75, 5.9], [1, -28.5, .6, 5.8]];
  const trees = treeSites.map(([side, z, radial, height]) => {
    const x = coveShoreX(side, z) + side * radial;
    return { x, y: plantHeight(x, z, shoreHeight(radial, z, side)),
      z, scale: height / tree.size.y, yaw: random() * 6.28, leanZ: side * .025 };
  });
  group.add(instanceCoveModel(coastalTree, trees, 'Dense Jacaranda crowns with natural branching'));
  const variants = individualShrubs(bush), placements = variants.map(() => []);
  // Unequal clusters occupy rock pockets and overlap at their bases; the
  // irregular leaf tips stay separate against the sky instead of a flat hedge.
  const pockets = [
    [-1, 6.7, 1.1, 1.25], [-1, .7, 1.4, 1.8], [-1, -7.7, 1.3, 1.7],
    [-1, -14.2, 1.1, 1.5], [-1, -22.5, 1.1, 1.65], [-1, -31, 1.3, 1.4],
    [-1, -41, 1.2, 1.45], [-1, -55, .8, 1.1],
    [1, 6, .8, 1.1], [1, -1.8, 1.2, 1.4], [1, -9.7, 1.1, 1.6],
    [1, -18.1, 1.3, 1.7], [1, -29, 1.3, 1.4], [1, -40, 1.1, 1.3], [1, -53, .8, 1.1],
  ];
  for (let pocket = 0; pocket < pockets.length; pocket++) {
    const [side, z, radial, height] = pockets[pocket];
    const count = quality === 'low' ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const variant = (i + pocket) % variants.length;
      const r = radial + (random() - .5) * 1.8, rz = z + (random() - .5) * 2.4;
      const h = height * (.65 + random() * .45);
      const x = coveShoreX(side, rz) + side * r;
      placements[variant].push({ x,
        y: plantHeight(x, rz, shoreHeight(r, rz, side)), z: rz, scale: h / variants[variant].size.y,
        width: 1.15, depth: 1.15, yaw: random() * 6.28, leanZ: (random() - .5) * .24 });
    }
  }
  variants.forEach((variant, index) => group.add(instanceCoveModel(variant, placements[index], 'Broad-leaf shrubs in irregular rock pockets')));
  const fragments = crownFragments(tree), crowns = fragments.map(() => []);
  const thickets = [
    [-1, -5.5, 1.4, 2.35], [-1, -10.2, 1.1, 2.5], [-1, -15.2, 1.25, 2.3],
    [-1, -22.5, 1.25, 2.55], [-1, -32, 1.15, 2.3], [-1, -43, .9, 2.0],
    [1, -9.5, 1.0, 1.95], [1, -17.5, 1.25, 2.3], [1, -26.1, 1.1, 2.1], [1, -36.5, 1.0, 2.2],
  ];
  thickets.forEach(([side, z, radial, height], i) => {
    if (quality === 'low' && (i === 4 || i === 5)) return;
    const variant = i % fragments.length, x = coveShoreX(side, z) + side * radial;
    crowns[variant].push({ x, y: plantHeight(x, z, shoreHeight(radial, z, side)) - .12,
      z, scale: height / fragments[variant].size.y, width: 1.7, depth: 1.35, yaw: random() * 6.28 });
  });
  fragments.forEach((variant, index) => group.add(instanceCoveModel(variant, crowns[index], 'Dense natural leaf thickets along visible rock shoulders')));
  return { trees: trees.length, shrubPlants: placements.reduce((count, items) => count + items.length, 0),
    shrubVariants: variants.length, thickets: crowns.reduce((count, items) => count + items.length, 0) };
}
