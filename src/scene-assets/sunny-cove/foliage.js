import * as THREE from 'three';
import { instanceCoveModel } from './dock.js';
import { coveShoreX, shoreHeight } from './coast.js';

function randomFrom(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Retain complete source triangles and their shared vertices. De-indexing these
 * dense crowns duplicates normals/UVs and needlessly expands the GPU buffers. */
function selectedGeometry(original, selected) {
  const geometry = new THREE.BufferGeometry(), vertices = [], remap = new Map();
  const indices = selected.map(vertex => {
    if (!remap.has(vertex)) { remap.set(vertex, vertices.length); vertices.push(vertex); }
    return remap.get(vertex);
  });
  for (const [name, attribute] of Object.entries(original.attributes)) {
    const array = new attribute.array.constructor(vertices.length * attribute.itemSize);
    for (let i = 0; i < vertices.length; i++) for (let item = 0; item < attribute.itemSize; item++)
      array[i * attribute.itemSize + item] = attribute.array[vertices[i] * attribute.itemSize + item];
    geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(indices);
  return geometry;
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
    const geometry = selectedGeometry(original, selected);
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
    const fragment = selectedGeometry(geometry, selected);
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
  // Alternate plants on the lip and just behind it, so orbit views see rooted
  // pockets across the rock shoulder rather than one thin hedge beside bare land.
  const pockets = [
    [-1, 7.2, 2.0, 1.0], [-1, .1, 4.1, 1.25], [-1, -6.9, 1.7, 1.4],
    [-1, -13.5, 3.4, 1.5], [-1, -23.8, 1.7, 1.65], [-1, -32, 4.2, 1.4],
    [-1, -40.4, 1.8, 1.45], [-1, -54, 2.7, 1.1],
    [1, 7.4, 2.4, 1.0], [1, .4, 4.6, 1.2], [1, -7.8, 2.1, 1.4],
    [1, -17.2, 5.0, 1.7], [1, -26.8, 2.4, 1.4], [1, -37.4, 4.4, 1.3], [1, -51, 1.8, 1.1],
  ];
  for (let pocket = 0; pocket < pockets.length; pocket++) {
    const [side, z, radial, height] = pockets[pocket];
    const count = quality === 'low' ? 1 : 2;
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
    [-1, -4.7, 3.6, 1.7], [-1, -22.5, 3.2, 2.2], [-1, -42, 2.5, 1.85],
    [1, 1.2, 3.5, 1.6], [1, -12.8, 4.3, 1.95], [1, -33.5, 3.2, 2.1],
  ];
  thickets.forEach(([side, z, radial, height], i) => {
    if (quality === 'low' && (i === 2 || i === 5)) return;
    const variant = i % fragments.length, x = coveShoreX(side, z) + side * radial;
    crowns[variant].push({ x, y: plantHeight(x, z, shoreHeight(radial, z, side)) - .12,
      z, scale: height / fragments[variant].size.y,
      width: i % 2 ? 2.2 : 2.45, depth: i % 2 ? 1.7 : 1.9, yaw: random() * 6.28 });
  });
  fragments.forEach((variant, index) => group.add(instanceCoveModel(variant, crowns[index], 'Dense natural leaf thickets along visible rock shoulders')));
  const triangleCount = model => model.parts.reduce((count, part) =>
    count + (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3, 0);
  return { trees: trees.length, shrubPlants: placements.reduce((count, items) => count + items.length, 0),
    shrubVariants: variants.length, thickets: crowns.reduce((count, items) => count + items.length, 0),
    triangles: triangleCount(coastalTree) * trees.length
      + variants.reduce((count, variant, i) => count + triangleCount(variant) * placements[i].length, 0)
      + fragments.reduce((count, fragment, i) => count + triangleCount(fragment) * crowns[i].length, 0) };
}
