import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadGLTF } from '../../shared/assets/gltf.js';
import { disposeObjects } from '../../shared/rendering/resources.js';

/** Internal cove loader: parsed scenes own all originals; instances borrow them. */
export async function loadCoveModel(url, { signal, nodeName } = {}) {
  const gltf = await loadGLTF(url, { signal });
  try {
    gltf.scene.updateMatrixWorld(true);
    const selected = nodeName ? gltf.scene.getObjectByName(nodeName) : gltf.scene;
    if (!selected) throw new Error(`Missing cove model node: ${nodeName}`);
    const bounds = new THREE.Box3().setFromObject(selected, true);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    if (![size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0))
      throw new Error(`Invalid cove model bounds: ${url}`);
    const origin = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
    const parts = [];
    selected.traverse(mesh => {
      if (!mesh.isMesh || mesh.isSkinnedMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.envMapIntensity = 0.85;
        for (const texture of Object.values(material)) if (texture?.isTexture) texture.anisotropy = 4;
        if (material.alphaTest > 0) { material.transparent = false; material.side = THREE.DoubleSide; }
      }
      parts.push({ geometry: mesh.geometry, material: mesh.material, matrix: origin.clone().multiply(mesh.matrixWorld), name: mesh.name });
    });
    return { roots: gltf.scenes, parts, size, source: url };
  } catch (error) { disposeObjects(gltf.scenes); throw error; }
}

/** All placements share the model's geometry/materials; the composition owns disposal. */
export function instanceCoveModel(model, placements, name, { shadows = true } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  for (const part of model.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    mesh.name = `${name} / ${part.name}`;
    placements.forEach((placement, index) => {
      const s = placement.scale ?? 1;
      position.set(placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
      scale.set(s * (placement.width ?? 1), s * (placement.height ?? 1), s * (placement.depth ?? 1));
      rotation.setFromEuler(new THREE.Euler(placement.leanX ?? 0, placement.yaw ?? 0, placement.leanZ ?? 0));
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale).multiply(part.matrix));
    });
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

const MODELS = [
  { key: 'pier', id: 'modular-wooden-pier', nodeName: 'modular_wooden_pier_planks' },
  { key: 'bench', id: 'painted-wooden-bench' },
  { key: 'crate', id: 'wooden-crate-02' },
  { key: 'lifebuoy', id: 'lifebuoy' },
];

/** A standalone, eight-metre timber dock. Coordinates and anchors are in metres. */
export async function createCoveDock(scene, {
  assetBaseUrl, signal, position = [-7, 0, 0.25], rotation = 0, furniture = true,
} = {}) {
  if (!assetBaseUrl) throw new Error('Cove dock requires assetBaseUrl');
  signal?.throwIfAborted();
  const group = new THREE.Group();
  group.name = 'Sunny Cove / weathered timber dock';
  group.position.fromArray(Array.isArray(position) ? position : [position.x, position.y, position.z]);
  group.rotation.y = rotation;
  const models = {}, resources = [], warnings = [], anchors = {};
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; signal?.removeEventListener('abort', dispose); group.removeFromParent();
    disposeObjects([group, ...resources]); group.clear(); resources.length = 0;
  };
  try {
    const selectedModels = furniture ? MODELS : MODELS.slice(0, 1);
    const results = await Promise.allSettled(selectedModels.map(async ({ key, id, nodeName }) => {
      const model = await loadCoveModel(new URL(`library/${id}/model.glb`, assetBaseUrl).href, { signal, nodeName });
      models[key] = model; resources.push(...model.roots);
    }));
    signal?.throwIfAborted();
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    const deckTop = 0.56, deckWidth = 8, deckScale = deckWidth / (3 * models.pier.size.x);
    const deckDepth = models.pier.size.z * deckScale;
    group.userData.bounds = { width: deckWidth, depth: deckDepth, deckTop };
    group.userData.sources = selectedModels.map(({ id, nodeName }) => ({ path: `library/${id}/model.glb`, nodeName }));
    group.add(instanceCoveModel(models.pier, [-1, 0, 1].map(column => ({
      x: column * deckWidth / 3, y: deckTop - models.pier.size.y * deckScale * 1.65, z: 0, scale: deckScale, height: 1.65,
    })), 'Three selected deck panels'));

    // Scanned board edges remain irregular. Structural members have their own
    // continuous grain rather than stretching the source model's texture atlas
    // over an unrelated cylinder or box.
    const timberTexture = createTimberTexture();
    const timberMaterial = new THREE.MeshStandardMaterial({ map: timberTexture, bumpMap: timberTexture,
      bumpScale: 0.016, color: '#f2e8d5', roughness: 0.84, metalness: 0, vertexColors: true });
    for (const part of models.pier.parts) for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      material.metalness = 0; material.roughness = 0.86; material.envMapIntensity = 0.6;
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #include <map_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.31, .265, .20), .18);`);
      };
      material.customProgramCacheKey = () => 'sunny-cove-sun-washed-scanned-planks-v2';
    }
    const timber = [], ropes = [], hardware = [], endGrain = [], hems = [];
    const place = (geometry, x, y, z, angle = [0, 0, 0], batch = timber) => {
      if (batch === timber) {
        const p = geometry.attributes.position, uv = geometry.attributes.uv, normal = geometry.attributes.normal;
        for (let i = 0; i < p.count; i++) {
          if (geometry.type === 'CylinderGeometry') uv.setXY(i, uv.getX(i), p.getY(i) * 0.42);
          else uv.setXY(i, (Math.abs(normal.getZ(i)) > 0.5 ? p.getY(i) : p.getZ(i)) * 1.8, p.getX(i) * 0.38);
        }
      }
      geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...angle)), new THREE.Vector3(1, 1, 1)));
      if (batch === timber) {
        const p = geometry.attributes.position, colors = new Float32Array(p.count * 3);
        const wet = new THREE.Color('#647059'), dry = new THREE.Color('#f1eadb'), color = new THREE.Color();
        const variation = 0.91 + Math.sin(x * 3.1 + z * 9.7) * 0.07;
        for (let i = 0; i < p.count; i++) {
          color.lerpColors(wet, dry, THREE.MathUtils.smoothstep(p.getY(i), -0.1, 0.4)).multiplyScalar(variation);
          color.toArray(colors, i * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      batch.push(geometry);
    };
    const pole = (x, z, top, radius = 0.125, base = -2.6) => {
      const geometry = new THREE.CylinderGeometry(radius * 0.94, radius, top - base, 14, 6);
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const warp = 1 + Math.sin(p.getY(i) * 11 + x) * 0.025;
        p.setX(i, p.getX(i) * warp); p.setZ(i, p.getZ(i) * warp);
      }
      geometry.computeVertexNormals();
      place(geometry, x, (top + base) / 2, z);
      place(new THREE.CircleGeometry(radius * 0.94, 24), x, top + 0.001, z, [-Math.PI / 2, 0, 0], endGrain);
    };
    const beam = (w, h, d, x, y, z) => place(new RoundedBoxGeometry(w, h, d, 2, 0.016), x, y, z);
    const rope = (points, radius = 0.018, batch = ropes, steps = 32) => {
      const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
      batch.push(new THREE.TubeGeometry(curve, steps, radius, 6, false));
    };
    // Piles remain below the sand where the shallow water makes their base visible.
    for (const x of [-3.82, -1.28, 1.28, 3.82]) for (const z of [-0.94, 0.94]) pole(x, z, 1.08 + Math.sin(x * 4) * 0.025);
    for (const z of [-0.98, 0.98]) beam(7.96, 0.21, 0.18, 0, 0.325, z);
    for (const x of [-2.63, 0, 2.63]) beam(0.16, 0.22, deckDepth, x, 0.3, 0);
    // A low horizontal edge at the rear keeps the foreground berth unobstructed.
    rope([[-3.82, 0.94, -0.94], [-2.55, 0.8, -0.94], [-1.28, 0.94, -0.94]]);
    rope([[-1.28, 0.94, -0.94], [0, 0.8, -0.94], [1.28, 0.94, -0.94]]);
    rope([[1.28, 0.94, -0.94], [2.55, 0.8, -0.94], [3.82, 0.94, -0.94]]);
    for (const x of [-3.82, 1.28, 3.82]) {
      const turns = Array.from({ length: 81 }, (_, i) => {
        const angle = i / 80 * Math.PI * 8;
        return [x + Math.cos(angle) * 0.126, 0.76 + i / 80 * 0.125, 0.94 + Math.sin(angle) * 0.126];
      });
      rope(turns, 0.014, ropes, 112);
      rope([[x + 0.12, 0.84, 0.95], [x + 0.18, 0.72, 1.02], [x + 0.13, 0.68, 1.06], [x + 0.06, 0.73, 1.09], [x + 0.12, 0.78, 1.01]], 0.014);
      rope([[x + 0.13, 0.71, 1.06], [x + 0.19, 0.54, 1.1], [x + 0.12, 0.44, 1.09]], 0.011);
    }
    // Visible washers, hex bolt heads and the two deck cleats follow actual
    // support joints. All small metal fittings share one draw call.
    for (const x of [-3.82, -1.28, 1.28, 3.82]) {
      place(new THREE.BoxGeometry(0.14, 0.22, 0.012), x, 0.34, 1.078, [0, 0, 0], hardware);
      for (const y of [0.29, 0.39]) {
        place(new THREE.TorusGeometry(0.032, 0.006, 5, 12), x, y, 1.09, [0, 0, 0], hardware);
        place(new THREE.CylinderGeometry(0.023, 0.023, 0.016, 6), x, y, 1.095, [Math.PI / 2, 0, 0], hardware);
      }
    }
    for (const x of [1.85, 3.1]) {
      place(new RoundedBoxGeometry(0.23, 0.026, 0.09, 2, 0.012), x, deckTop + 0.015, 0.66, [0, 0, 0], hardware);
      place(new THREE.CylinderGeometry(0.032, 0.042, 0.075, 10), x, deckTop + 0.05, 0.66, [0, 0, 0], hardware);
      place(new THREE.CylinderGeometry(0.026, 0.023, 0.29, 10), x, deckTop + 0.09, 0.66, [0, 0, Math.PI / 2], hardware);
    }
    const coil = Array.from({ length: 181 }, (_, i) => {
      const angle = i / 180 * Math.PI * 10, radius = 0.10 + i / 180 * 0.21;
      return [2.25 + Math.cos(angle) * radius, deckTop + 0.023, 0.18 + Math.sin(angle) * radius * 0.73];
    });
    rope(coil, 0.014, ropes, 180);
    rope([[2.56, deckTop + 0.023, 0.18], [2.82, deckTop + 0.025, 0.30], [3.03, deckTop + 0.10, 0.61], [3.15, deckTop + 0.10, 0.68]], 0.014);

    // Tensioned, slightly sagging canvas: a thin fabric surface rather than a solid roof.
    const clothGeometry = new THREE.PlaneGeometry(3.55, 2.55, 48, 32);
    clothGeometry.rotateX(-Math.PI / 2);
    const vertices = clothGeometry.attributes.position;
    const clothHeight = (x, z) => {
      const nx = x / 1.775, nz = z / 1.275;
      const crease = Math.sin(x * 15 + z * 4) * 0.018 * (0.3 + Math.abs(nx) ** 3);
      return 2.78 + nx * 0.11 - nz * 0.08 - 0.27 * (1 - nx * nx) * (1 - nz * nz) + crease;
    };
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i);
      vertices.setY(i, clothHeight(x, z));
    }
    clothGeometry.computeVertexNormals();
    const clothTexture = createCanvasTexture();
    const clothMaterial = new THREE.MeshPhysicalMaterial({ color: '#f4e7c9', map: clothTexture,
      bumpMap: clothTexture, bumpScale: 0.007, roughness: 0.96, metalness: 0, side: THREE.DoubleSide,
      sheen: 0.35, sheenColor: new THREE.Color('#e8d8b9'), sheenRoughness: 0.85 });
    const cloth = new THREE.Mesh(clothGeometry, clothMaterial);
    cloth.name = 'Cream woven canvas shade'; cloth.position.x = -2.12; cloth.position.z = -0.12;
    cloth.castShadow = cloth.receiveShadow = true; group.add(cloth);
    for (const x of [-3.9, -0.35]) for (const z of [-1.39, 1.16]) pole(x, z, 3.08, 0.065, deckTop - 0.12);
    // Rolled hems and sewn panel seams follow the exact sagging cloth surface.
    for (const edge of [-1, 1]) {
      rope(Array.from({ length: 33 }, (_, i) => {
        const x = -1.775 + i / 32 * 3.55, z = edge * 1.275;
        return [x - 2.12, clothHeight(x, z), z - 0.12];
      }), 0.019, hems);
      rope(Array.from({ length: 25 }, (_, i) => {
        const x = edge * 1.775, z = -1.275 + i / 24 * 2.55;
        return [x - 2.12, clothHeight(x, z), z - 0.12];
      }), 0.019, hems);
    }
    for (const x of [-0.59, 0.59]) rope(Array.from({ length: 25 }, (_, i) => {
      const z = -1.275 + i / 24 * 2.55;
      return [x - 2.12, clothHeight(x, z) + 0.004, z - 0.12];
    }), 0.006, hems);
    for (const x of [-1.775, 1.775]) for (const z of [-1.275, 1.275]) {
      const px = x - 2.12, pz = z - 0.12, y = clothHeight(x, z);
      place(new THREE.TorusGeometry(0.027, 0.006, 6, 14), px, y, pz, [Math.PI / 2, 0, 0], hardware);
      rope([[px, y, pz], [px + 0.07, y + 0.09, pz], [px + 0.045, 3.02, pz + 0.035], [px - 0.055, 3.00, pz - 0.035], [px, y + 0.01, pz]], 0.01);
    }
    // Consolidate by finish; instances and source textures retain one owner.
    const timberGeometry = mergeParts(timber);
    const structure = new THREE.Mesh(timberGeometry, timberMaterial);
    structure.name = 'Shared textured timber piles and beams'; structure.castShadow = structure.receiveShadow = true;
    group.add(structure);
    const ropeGeometry = mergeParts(ropes);
    const ropeTexture = createRopeTexture();
    const ropeMesh = new THREE.Mesh(ropeGeometry, new THREE.MeshStandardMaterial({ color: '#d2c0a0', map: ropeTexture,
      bumpMap: ropeTexture, bumpScale: 0.012, roughness: 0.94 }));
    ropeMesh.name = 'Mooring rope and canvas ties'; ropeMesh.castShadow = true; group.add(ropeMesh);
    const mergeDetails = (geometries, material, name) => {
      const geometry = mergeParts(geometries);
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    };
    mergeDetails(endGrain, new THREE.MeshStandardMaterial({ map: createEndGrainTexture(), roughness: 0.9 }), 'Exposed annual rings on cut post tops');
    mergeDetails(hardware, new THREE.MeshStandardMaterial({ color: '#8f8d7d', metalness: 0.78, roughness: 0.44 }), 'Galvanised brackets, bolts, cleats and canvas eyelets');
    mergeDetails(hems, clothMaterial, 'Rolled canvas hems and raised stitched seams');
    if (furniture) {
      group.add(instanceCoveModel(models.bench, [{ x: -0.55, y: deckTop, z: -0.46, scale: 1.24, yaw: Math.PI }], 'Wooden bench beside the canvas shade'));
      group.add(instanceCoveModel(models.crate, [
        { x: 0.85, y: deckTop, z: -0.15, scale: 0.74, yaw: Math.PI / 2 },
        { x: 1.08, y: deckTop, z: 0.45, scale: 0.51, yaw: 0.18 },
      ], 'Two small rope-handled timber crates'));
      group.add(instanceCoveModel(models.lifebuoy, [{ x: 1.35, y: 0.3, z: 1.08, scale: 0.8 }], 'Life ring on the inner front timber pile'));
      createCrateDetails(group, 0.85, deckTop + models.crate.size.y * 0.74, -0.15, clothTexture);
    }
    for (const [name, point] of Object.entries({ berth: [2, 0, 3.25], approach: [5.2, 0, 5.95], launch: [2.4, 0, 5.75] })) {
      const anchor = new THREE.Object3D(); anchor.name = `Dock anchor / ${name}`;
      anchor.position.fromArray(point); anchor.rotation.y = -Math.PI / 2; group.add(anchor); anchors[name] = anchor;
    }
    signal?.throwIfAborted(); scene.add(group); signal?.addEventListener('abort', dispose, { once: true });
    return {
      group, anchors, warnings, update() {}, dispose,
      getAnchor(name) {
        if (!anchors[name]) throw new Error(`Unknown cove dock anchor: ${name}`);
        group.updateMatrixWorld(true);
        const quaternion = anchors[name].getWorldQuaternion(new THREE.Quaternion());
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
        return { position: anchors[name].getWorldPosition(new THREE.Vector3()), heading: Math.atan2(-forward.x, -forward.z) };
      },
    };
  } catch (error) { dispose(); throw error; }
}

function createCanvasTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ded8c9'; context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    context.fillStyle = i % 4 ? 'rgba(114,101,77,.05)' : 'rgba(255,252,241,.12)';
    context.fillRect(i, 0, 1, 128); context.fillRect(0, i, 128, 1);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5, 4); texture.anisotropy = 4;
  return texture;
}

function randomFrom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

function mergeParts(parts) {
  // RoundedBoxGeometry is non-indexed; cylinders and tubes are indexed.
  // Give each batch one topology before merging, then release source buffers.
  const geometries = parts.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
  const merged = mergeGeometries(geometries);
  for (const geometry of new Set([...parts, ...geometries])) geometry.dispose();
  return merged;
}

/** Self-authored, seamless lengthwise grain, independent of any model atlas. */
function createTimberTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 1024;
  const context = canvas.getContext('2d'), image = context.createImageData(256, 1024), random = randomFrom(1187);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 256; x++) {
    const grainX = x + Math.sin(y * 0.008 + x * 0.023) * 2.8;
    const grain = Math.sin(grainX * 0.83) * 8 + Math.sin(grainX * 2.1) * 3.5 + Math.sin(grainX * 0.12) * 11;
    const value = 151 + grain + (random() - 0.5) * 13;
    const index = (y * 256 + x) * 4;
    image.data[index] = value * 1.06; image.data[index + 1] = value * 0.98;
    image.data[index + 2] = value * 0.83; image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  for (let i = 0; i < 70; i++) {
    const x = random() * 256, y = random() * 1024;
    context.strokeStyle = `rgba(59,51,39,${0.09 + random() * 0.16})`; context.lineWidth = 0.5 + random();
    context.beginPath(); context.moveTo(x, y);
    context.bezierCurveTo(x + 1, y + 35, x - 1.5, y + 100, x + 0.8, y + 145); context.stroke();
  }
  for (const [x, y] of [[63, 294], [181, 752]]) for (let ring = 1; ring < 7; ring++) {
    context.strokeStyle = `rgba(69,54,37,${0.22 - ring * 0.018})`; context.lineWidth = 1;
    context.beginPath(); context.ellipse(x, y, ring * 1.3, ring * 4.8, 0, 0, Math.PI * 2); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  return texture;
}

function createEndGrainTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d'), image = context.createImageData(128, 128), random = randomFrom(225);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = x - 58, dy = y - 67, angle = Math.atan2(dy, dx);
    const radius = Math.hypot(dx, dy) + Math.sin(angle * 5) * 1.5;
    const value = 150 + Math.sin(radius * 0.72) * 15 + (random() - 0.5) * 14;
    const i = (y * 128 + x) * 4;
    image.data[i] = value * 1.07; image.data[i + 1] = value; image.data[i + 2] = value * 0.84; image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.strokeStyle = 'rgba(50,45,33,.55)'; context.lineWidth = 1;
  for (const angle of [0.4, 2.7, 4.8]) {
    context.beginPath(); context.moveTo(58 + Math.cos(angle) * 17, 67 + Math.sin(angle) * 17);
    context.lineTo(58 + Math.cos(angle + 0.08) * 42, 67 + Math.sin(angle + 0.08) * 42);
    context.lineTo(58 + Math.cos(angle) * 68, 67 + Math.sin(angle) * 68); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function createRopeTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e3d7bc'; context.fillRect(0, 0, 128, 64);
  for (let i = -64; i < 192; i += 13) {
    context.strokeStyle = 'rgba(105,91,65,.26)'; context.lineWidth = 3;
    context.beginPath(); context.moveTo(i, 0); context.lineTo(i + 34, 64); context.stroke();
    context.strokeStyle = 'rgba(255,250,229,.45)'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(i + 4, 0); context.lineTo(i + 38, 64); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(10, 1); texture.anisotropy = 4;
  return texture;
}

function createCrateDetails(group, x, y, z, linenTexture) {
  const enamel = new THREE.MeshStandardMaterial({ color: '#eee4cb', metalness: 0.12, roughness: 0.31 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.095, 20, 1, true), enamel);
  cup.position.set(x - 0.10, y + 0.048, z); cup.name = 'Small enamel cup on the timber crate';
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.007, 6, 16), enamel);
  handle.position.set(-0.057, 0.004, 0); cup.add(handle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.044, 20), new THREE.MeshStandardMaterial({ color: '#574731', roughness: 0.2 }));
  tea.rotation.x = -Math.PI / 2; tea.position.y = 0.031; cup.add(tea);
  const towel = new THREE.Mesh(new RoundedBoxGeometry(0.23, 0.034, 0.19, 3, 0.01),
    new THREE.MeshStandardMaterial({ color: '#779b99', map: linenTexture, roughness: 0.95 }));
  towel.position.set(x + 0.11, y + 0.018, z + 0.03); towel.rotation.y = -0.16;
  towel.name = 'Folded sea-coloured linen beside the cup';
  cup.castShadow = towel.castShadow = true; cup.receiveShadow = towel.receiveShadow = true;
  group.add(cup, towel);
}
