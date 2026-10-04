import * as THREE from "three";
import { loadGLTF } from '../../shared/assets/gltf.js';

import { disposeObjects } from "../../shared/rendering/resources.js";
import { riverCenter } from "./navigation.js";
export { riverCenter } from "./navigation.js";

export const riverHalfWidth = (z) =>
  20 + Math.sin(z * 0.027 + 0.4) * 1.1 + Math.sin(z * 0.071) * 0.6;

import { MOODS, MOOD_TRANSITION_SECONDS } from "./presets.js";
export { MOODS } from "./presets.js";

function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function bankHeight(x, z) {
  const distance = Math.max(
    0,
    Math.abs(x - riverCenter(z)) - riverHalfWidth(z),
  );
  return (
    -0.18 +
    1.8 * (1 - Math.exp(-distance / 6)) +
    (Math.sin(z * 0.071 + distance * 0.13) * 0.32 + Math.cos(z * 0.043) * 0.2) *
      Math.min(1, distance / 10)
  );
}

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3() },
      uMoon: { value: 1 },
      uCloud: { value: 0.64 },
    },
    vertexShader: `varying vec3 vDirection;
      void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 uZenith, uHorizon, uMoonDir;
      uniform float uTime, uMoon, uCloud;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + 1.0), f.x), f.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += noise(p) * a; p = mat2(1.62, 1.17, -1.17, 1.62) * p; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDirection), moonDir = normalize(uMoonDir);
        float horizon = pow(clamp(d.y, 0.0, 1.0), 0.48);
        vec3 color = mix(uHorizon, uZenith, horizon);
        float facing = max(0.0, dot(d, moonDir));
        vec3 glowColor = mix(vec3(1.0, 0.60, 0.32), vec3(0.55, 0.78, 0.87), uMoon);
        color += glowColor * pow(facing, 20.0) * mix(0.15, 0.032, uMoon);
        color += glowColor * pow(facing, 180.0) * 0.075;
        vec2 stars = vec2(atan(d.x, d.z), asin(clamp(d.y, -1.0, 1.0))) * 210.0;
        vec2 starCell = floor(stars); vec2 starUV = fract(stars) - 0.5;
        float seed = hash(starCell);
        float star = (1.0 - smoothstep(0.0, 0.075, length(starUV))) * step(0.986, seed);
        color += vec3(0.52, 0.69, 0.77) * star * uMoon * smoothstep(0.08, 0.3, d.y) * 0.6;
        vec3 moonRight = normalize(cross(vec3(0,1,0), moonDir));
        vec3 moonUp = normalize(cross(moonDir, moonRight));
        vec2 moonUV = vec2(dot(d, moonRight), dot(d, moonUp)) / 0.016;
        float moonRadius = length(moonUV);
        float disk = (1.0 - smoothstep(0.965, 1.0, moonRadius)) * step(0.95, facing);
        float craters = fbm(moonUV * 5.5 + 7.2) * 0.7 + noise(moonUV * 17.0) * 0.3;
        float sphere = sqrt(max(0.0, 1.0 - moonRadius * moonRadius));
        vec3 moonColor = vec3(0.88, 0.94, 0.87) * (1.2 + sphere * 1.1 - craters * 0.72);
        color = mix(color, moonColor, disk * uMoon);
        vec2 cloudUV = d.xz / max(0.12, d.y + 0.18) * 1.65 + vec2(uTime * 0.0018, uTime * 0.0007);
        float broad = fbm(cloudUV), detail = fbm(cloudUV * 2.9 + 11.0);
        float density = broad * 0.91 + detail * 0.31;
        float clouds = smoothstep(0.40, 0.73, density) * uCloud;
        clouds *= smoothstep(-0.06, 0.18, d.y);
        float thinEdge = smoothstep(0.39, 0.52, density) * (1.0 - smoothstep(0.56, 0.70, density));
        float silver = pow(facing, 65.0) * thinEdge * (0.12 + detail * 0.20);
        vec3 darkCloud = mix(vec3(0.25, 0.29, 0.34), vec3(0.012, 0.025, 0.034), uMoon);
        vec3 cloudColor = darkCloud + glowColor * silver;
        cloudColor += mix(vec3(0.14, 0.12, 0.10), vec3(0.014, 0.024, 0.028), uMoon) * detail;
        color = mix(color, cloudColor, clouds * (1.0 - disk * 0.6));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(800, 40, 24), material);
  mesh.name = "Moon, drifting clouds and distant stars";
  mesh.frustumCulled = false;
  return { mesh, material };
}

function createBanks(group) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
  });
  const distances = [0, 1.5, 4, 9, 18, 34, 60, 95];
  for (const side of [-1, 1]) {
    const positions = [],
      colors = [],
      indices = [],
      segments = 128;
    for (let row = 0; row <= segments; row++) {
      const z = 170 - (row / segments) * 500;
      for (let col = 0; col < distances.length; col++) {
        const offset = distances[col];
        const x = riverCenter(z) + side * (riverHalfWidth(z) + offset);
        positions.push(x, bankHeight(x, z), z);
        const color = new THREE.Color("#3d3c2d").lerp(
          new THREE.Color("#40533b"),
          Math.min(1, offset / 8),
        );
        color.multiplyScalar(0.83 + Math.sin(z * 0.17 + offset * 0.37) * 0.1);
        colors.push(color.r, color.g, color.b);
        if (row < segments && col < distances.length - 1) {
          const a = row * distances.length + col,
            b = a + 1,
            c = a + distances.length;
          if (side === 1) indices.push(a, b, c, b, c + 1, c);
          else indices.push(a, c, b, b, c, c + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = side < 0 ? "West moss bank" : "East moss bank";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function createLeafTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d"),
    random = randomFrom(1193);
  ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 155; i++) {
    const angle = random() * Math.PI * 2,
      radius = Math.sqrt(random()) * 105;
    const x = 128 + Math.cos(angle) * radius,
      y = 128 + Math.sin(angle) * radius;
    const size = 5 + random() * 11;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + random());
    ctx.fillStyle = `rgb(${88 + Math.floor(random() * 36)},${113 + Math.floor(random() * 42)},${77 + Math.floor(random() * 30)})`;
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(-size * 0.2, -size * 0.7, size, 0);
    ctx.quadraticCurveTo(size * 0.1, size * 0.7, -size, 0);
    ctx.fill();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function branchGeometry(points, radius, segments = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 7, false);
  const position = geometry.attributes.position;
  for (let row = 0; row <= segments; row++) {
    const center = curve.getPointAt(row / segments);
    const scale = 1 - (row / segments) * 0.72;
    for (let j = 0; j < 8; j++) {
      const i = row * 8 + j;
      position.setXYZ(
        i,
        center.x + (position.getX(i) - center.x) * scale,
        center.y + (position.getY(i) - center.y) * scale,
        center.z + (position.getZ(i) - center.z) * scale,
      );
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function combineGeometry(geometries) {
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  for (const geometry of geometries) {
    const offset = positions.length / 3;
    positions.push(...geometry.attributes.position.array);
    normals.push(...geometry.attributes.normal.array);
    if (geometry.attributes.uv) uvs.push(...geometry.attributes.uv.array);
    else uvs.push(...new Float32Array(geometry.attributes.position.count * 2));
    const source =
      geometry.index?.array ??
      Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
    for (const index of source) indices.push(index + offset);
    geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function fallbackTree(seed, leafTexture) {
  const random = randomFrom(seed),
    branches = [],
    foliage = [];
  const sway = (random() - 0.5) * 0.18;
  const trunk = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(sway, 0.25, 0.02),
    new THREE.Vector3(sway * 0.3, 0.53, -0.03),
    new THREE.Vector3(sway * 1.5, 0.83, 0.03),
  ];
  branches.push(branchGeometry(trunk, 0.034, 14));
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.39996 + random() * 0.35;
    const startY = 0.2 + i * 0.065,
      reach = 0.2 + random() * 0.15;
    const end = new THREE.Vector3(
      Math.cos(angle) * reach + sway,
      startY + 0.26,
      Math.sin(angle) * reach,
    );
    branches.push(
      branchGeometry(
        [
          new THREE.Vector3(sway * 0.5, startY, 0),
          new THREE.Vector3(end.x * 0.55, startY + 0.09, end.z * 0.5),
          end,
        ],
        0.012 + (1 - startY) * 0.006,
        7,
      ),
    );
    for (let fork = 0; fork < 2; fork++) {
      const tip = end
        .clone()
        .add(
          new THREE.Vector3(
            (random() - 0.5) * 0.19,
            0.09 + random() * 0.1,
            (random() - 0.5) * 0.19,
          ),
        );
      branches.push(
        branchGeometry([end.clone().multiplyScalar(0.91), end, tip], 0.0065, 4),
      );
      for (let card = 0; card < 3; card++) {
        const geometry = new THREE.PlaneGeometry(
          0.28 + random() * 0.13,
          0.27 + random() * 0.09,
        );
        geometry.rotateY(angle + (card * Math.PI) / 3);
        geometry.rotateX((random() - 0.5) * 1.4);
        geometry.translate(tip.x, tip.y, tip.z);
        foliage.push(geometry);
      }
    }
  }
  // Spreading buttress roots anchor mature swamp trees in the mud.
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    branches.push(
      branchGeometry(
        [
          new THREE.Vector3(0, 0.12, 0),
          new THREE.Vector3(
            Math.cos(angle) * 0.065,
            0.035,
            Math.sin(angle) * 0.065,
          ),
          new THREE.Vector3(
            Math.cos(angle) * 0.14,
            0.004,
            Math.sin(angle) * 0.14,
          ),
        ],
        0.021,
        5,
      ),
    );
  }
  return [
    {
      geometry: combineGeometry(branches),
      material: new THREE.MeshStandardMaterial({
        color: "#635e50",
        roughness: 0.98,
      }),
      foliage: false,
    },
    {
      geometry: combineGeometry(foliage),
      material: new THREE.MeshStandardMaterial({
        map: leafTexture,
        color: "#a9bea7",
        roughness: 0.95,
        alphaTest: 0.42,
        side: THREE.DoubleSide,
      }),
      foliage: true,
    },
  ];
}

async function loadTreeParts(url, signal) {
  const gltf = await loadGLTF(url, { signal });
  const parts = [];
  // Cloned materials still share the imported textures. Retain all textures,
  // including unused GLTF scenes, until their single owner releases the asset.
  parts.sourceTextures = new Set();
  try {
    for (const root of gltf.scenes) root.traverse((mesh) => {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(material ?? {}))
          if (value?.isTexture) parts.sourceTextures.add(value);
      }
    });
    gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gltf.scene, true),
      size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (size.y <= 0 || !Number.isFinite(size.y))
      throw new Error("Tree asset has invalid bounds");
    const normalize = new THREE.Matrix4()
      .makeScale(1 / size.y, 1 / size.y, 1 / size.y)
      .multiply(
        new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z),
      );
    gltf.scene.traverse((mesh) => {
      if (!mesh.isMesh || mesh.isSkinnedMesh) return;
      const geometry = mesh.geometry
        .clone()
        .applyMatrix4(normalize.clone().multiply(mesh.matrixWorld));
      const material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
      parts.push({ geometry, material, foliage: /leaf|foliage|leaves/i.test(mesh.name) });
      for (const mat of Array.isArray(material) ? material : [material]) {
        if (mat.alphaTest > 0 || /leaf|foliage|leaves/i.test(mat.name)) {
          mat.side = THREE.DoubleSide;
          mat.alphaTest = Math.max(0.35, mat.alphaTest);
          mat.transparent = false;
        }
      }
    });
    disposeObjects(gltf.scenes, { textures: false });
    return parts;
  } catch (error) {
    disposeObjects([...gltf.scenes, ...parts.map(part => new THREE.Mesh(part.geometry, part.material))]);
    throw error;
  }
}

function placeTrees(group, variants, quality, colliders, importedCount = 0) {
  const random = randomFrom(72342),
    count = quality === "low" ? 150 : quality === "high" ? 280 : 210;
  const heroCount = importedCount
    ? quality === "low"
      ? 20
      : quality === "high"
        ? 34
        : 28
    : 0;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const hero = i < heroCount;
    // Irregular clusters leave openings to the mist instead of a planted avenue.
    const cluster = Math.floor(Math.max(0, i - heroCount) / 3);
    const clusterZ = 132 - (cluster / Math.ceil((count - heroCount) / 3)) * 440;
    const z = hero
      ? 126 - ((i + random() * 1.65) / heroCount) * 405
      : clusterZ + (random() - 0.5) * 23;
    const side = random() < 0.48 ? -1 : 1;
    const depth = hero
      ? 2.7 + Math.pow(random(), 1.5) * 17
      : Math.pow(random(), 1.3) * 59 + (importedCount ? 24 : 3);
    const x = riverCenter(z) + side * (riverHalfWidth(z) + depth);
    const mature = i % 4 !== 1;
    const height = mature
      ? 12 + Math.pow(random(), 0.8) * 14
      : 5.5 + random() * 5.5;
    const widthRatio = hero ? 0.61 + random() * 0.48 : 0.72 + random() * 0.32;
    const scale = new THREE.Vector3(
      height * widthRatio,
      height,
      height * (widthRatio * (0.83 + random() * 0.31)),
    );
    const variant = hero
      ? i % importedCount
      : importedCount + (i % (variants.length - importedCount));
    positions.push({
      x,
      y: bankHeight(x, z) - 0.14,
      z,
      scale,
      yaw: random() * Math.PI * 2,
      leanX: (random() - 0.5) * 0.08,
      leanZ: (random() - 0.5) * 0.08,
      variant,
    });
    if (depth < 8)
      colliders.push({ type: "circle", x, z, radius: 0.035 * height });
  }
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  variants.forEach((parts, variant) => {
    const trees = positions.filter((p) => p.variant === variant);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        trees.length,
      );
      trees.forEach((tree, i) => {
        position.set(tree.x, tree.y, tree.z);
        rotation.setFromEuler(
          new THREE.Euler(tree.leanX, tree.yaw, tree.leanZ),
        );
        matrix.compose(position, rotation, tree.scale);
        mesh.setMatrixAt(i, matrix);
        const shade = 0.77 + ((i * 0.61803) % 1) * 0.23;
        mesh.setColorAt(
          i,
          new THREE.Color().setRGB(shade, shade, shade * 0.94),
        );
      });
      mesh.name = part.foliage
        ? "Irregular forest canopy"
        : "Rooted branching trees";
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  });
  return positions;
}

async function placeGroundAsset(group, url, kind, quality, warnings, signal, ownParts) {
  if (!url) return;
  let parts;
  try {
    parts = await loadTreeParts(url, signal);
    ownParts(parts);
  } catch (error) {
    if (signal?.aborted) throw error;
    warnings.push(
      `${kind} unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const random = randomFrom(kind === "fern" ? 5401 : 6722);
  const count =
    kind === "fern"
      ? quality === "low"
        ? 36
        : 72
      : quality === "low"
        ? 14
        : 24;
  const transforms = [],
    matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const z = 136 - random() * 432,
      side = i % 2 ? -1 : 1;
    const x =
      riverCenter(z) +
      side * (riverHalfWidth(z) + 0.9 + random() * (kind === "fern" ? 12 : 5));
    const height =
      kind === "fern" ? 0.65 + random() * 0.55 : 0.3 + random() * 0.16;
    matrix.compose(
      new THREE.Vector3(x, bankHeight(x, z) - 0.02, z),
      new THREE.Quaternion().setFromAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        random() * Math.PI * 2,
      ),
      new THREE.Vector3(height, height, height),
    );
    transforms.push(matrix.clone());
  }
  for (const part of parts) {
    const instances = new THREE.InstancedMesh(
      part.geometry,
      part.material,
      count,
    );
    transforms.forEach((transform, i) => instances.setMatrixAt(i, transform));
    instances.name =
      kind === "fern"
        ? "Scanned ferns along the bank"
        : "Fallen weathered logs";
    instances.castShadow = instances.receiveShadow = true;
    group.add(instances);
  }
}

function createUnderstory(group, quality) {
  const random = randomFrom(1844),
    count = quality === "low" ? 380 : 680;
  const reedPositions = [],
    reedIndices = [],
    reedColors = [];
  for (let i = 0; i < count; i++) {
    const z = 155 - random() * 470,
      side = i % 2 ? -1 : 1;
    const x =
      riverCenter(z) + side * (riverHalfWidth(z) + 0.1 + random() * 6.0);
    const baseY = bankHeight(x, z),
      angle = random() * Math.PI * 2;
    const height = 0.6 + random() * 1.8,
      width = 0.07 + random() * 0.07;
    for (let leaf = 0; leaf < 4; leaf++) {
      const a = angle + leaf * 1.52,
        bend = 0.2 + random() * 0.7;
      const offset = reedPositions.length / 3;
      for (let row = 0; row < 4; row++) {
        const t = row / 3,
          reach = t * t * bend;
        for (const edge of [-1, 1])
          reedPositions.push(
            x + Math.cos(a) * reach + Math.sin(a) * edge * width * (1 - t),
            baseY + t * height,
            z + Math.sin(a) * reach - Math.cos(a) * edge * width * (1 - t),
          );
        const color = new THREE.Color("#5f7050").multiplyScalar(
          0.64 + t * 0.36,
        );
        for (let j = 0; j < 2; j++) reedColors.push(color.r, color.g, color.b);
        if (row < 3) {
          const k = offset + row * 2;
          reedIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(reedPositions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(reedColors, 3),
  );
  geometry.setIndex(reedIndices);
  geometry.computeVertexNormals();
  const reeds = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    }),
  );
  reeds.name = "Bent reeds and shoreline grasses";
  reeds.receiveShadow = true;
  group.add(reeds);

  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#59655d",
    roughness: 0.98,
    flatShading: true,
  });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 80),
    matrix = new THREE.Matrix4();
  for (let i = 0; i < 80; i++) {
    const z = 142 - random() * 446,
      side = i % 2 ? -1 : 1;
    const x = riverCenter(z) + side * (riverHalfWidth(z) + random() * 10);
    const radius = 0.45 + random() * 1.2;
    matrix.compose(
      new THREE.Vector3(x, bankHeight(x, z) - radius * 0.08, z),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(random(), random() * 6, random()),
      ),
      new THREE.Vector3(radius, radius * 0.55, radius * 0.85),
    );
    rocks.setMatrixAt(i, matrix);
  }
  rocks.name = "Mossy river stones";
  rocks.castShadow = rocks.receiveShadow = true;
  group.add(rocks);
}

function createShoreDetails(group, trees, quality) {
  const random = randomFrom(87033),
    leaves = [],
    patches = quality === "low" ? 26 : 42;
  for (let patch = 0; patch < patches; patch++) {
    const z = 137 - random() * 434,
      side = random() < 0.5 ? -1 : 1;
    const inset = 0.7 + random() * 2.7;
    const x = riverCenter(z) + side * (riverHalfWidth(z) - inset);
    const count = 5 + Math.floor(random() * 9);
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2,
        radius = Math.sqrt(random()) * 1.8;
      const lx = x + Math.cos(a) * radius,
        lz = z + Math.sin(a) * radius;
      if (Math.abs(lx - riverCenter(lz)) < riverHalfWidth(lz) - 0.5)
        leaves.push({ x: lx, z: lz });
    }
  }
  // One notched leaf mesh, with radial cup and subtle veins expressed as vertex color.
  const leafGeometry = new THREE.CircleGeometry(
    1,
    30,
    0.14,
    Math.PI * 2 - 0.28,
  );
  leafGeometry.rotateX(-Math.PI / 2);
  const leafPosition = leafGeometry.attributes.position,
    colors = [];
  for (let i = 0; i < leafPosition.count; i++) {
    const x = leafPosition.getX(i),
      z = leafPosition.getZ(i),
      angle = Math.atan2(z, x);
    const radius = Math.hypot(x, z),
      irregular = 0.95 + Math.sin(angle * 3 + 0.8) * 0.045;
    leafPosition.setXYZ(
      i,
      x * irregular,
      radius * radius * 0.018,
      z * irregular,
    );
    const color = new THREE.Color("#718256").lerp(
      new THREE.Color("#405f42"),
      radius * 0.75,
    );
    color.multiplyScalar(i % 3 === 0 ? 1.08 : 0.94);
    colors.push(color.r, color.g, color.b);
  }
  leafGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  leafGeometry.computeVertexNormals();
  const pads = new THREE.InstancedMesh(
    leafGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.47,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
    leaves.length,
  );
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  leaves.forEach((leaf, i) => {
    const size = 0.18 + random() * 0.34;
    position.set(leaf.x, 0.018 + random() * 0.012, leaf.z);
    rotation.setFromAxisAngle(
      THREE.Object3D.DEFAULT_UP,
      random() * Math.PI * 2,
    );
    scale.set(size, 1, size * (0.82 + random() * 0.25));
    matrix.compose(position, rotation, scale);
    pads.setMatrixAt(i, matrix);
  });
  pads.name = "Scattered notched lily pads";
  pads.receiveShadow = true;
  group.add(pads);

  const roots = [];
  for (const tree of trees) {
    if (Math.abs(tree.x - riverCenter(tree.z)) > riverHalfWidth(tree.z) + 16)
      continue;
    for (let i = 0; i < 4; i++) {
      const angle = random() * Math.PI * 2,
        spread = 0.8 + random() * 1.5;
      const x = tree.x + Math.cos(angle) * spread,
        z = tree.z + Math.sin(angle) * spread;
      if (Math.abs(x - riverCenter(z)) > riverHalfWidth(z) + 0.15)
        roots.push({ x, z });
    }
  }
  const rootGeometry = branchGeometry(
    [
      new THREE.Vector3(0, -0.08, 0),
      new THREE.Vector3(0.04, 0.27, 0.025),
      new THREE.Vector3(-0.025, 0.59, 0),
    ],
    0.105,
    6,
  );
  const knees = new THREE.InstancedMesh(
    rootGeometry,
    new THREE.MeshStandardMaterial({ color: "#69634d", roughness: 0.97 }),
    roots.length,
  );
  roots.forEach((root, i) => {
    position.set(root.x, bankHeight(root.x, root.z), root.z);
    rotation.setFromAxisAngle(
      THREE.Object3D.DEFAULT_UP,
      random() * Math.PI * 2,
    );
    const size = 0.55 + random() * 1.1;
    scale.set(size, size, size);
    matrix.compose(position, rotation, scale);
    knees.setMatrixAt(i, matrix);
  });
  knees.name = "Weathered swamp root knees";
  knees.castShadow = knees.receiveShadow = true;
  group.add(knees);
}

function createMist(group) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color() },
      uOpacity: { value: 0.17 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vWorld;
      void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `varying vec2 vUv; varying vec3 vWorld; uniform float uTime,uOpacity; uniform vec3 uColor;
      float noise(vec2 p){return sin(p.x)*sin(p.y)*0.5+0.5;}
      void main(){
        float edge=smoothstep(0.0,0.18,vUv.x)*(1.0-smoothstep(0.82,1.0,vUv.x));
        edge*=smoothstep(0.0,0.18,vUv.y)*(1.0-smoothstep(0.42,1.0,vUv.y));
        float n=noise(vWorld.xz*0.12+vec2(uTime*0.015,uTime*0.01));
        n=0.35+0.65*n*noise(vWorld.xz*0.27-uTime*0.014);
        gl_FragColor=vec4(uColor,edge*n*uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for (const z of [-35, -105, -175, -250, -315]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(150, 16), material);
    mesh.position.set(riverCenter(z), 4.3, z);
    mesh.name = "Low drifting mist";
    group.add(mesh);
  }
  return material;
}

function createEnvironmentMap(preset) {
  const faces = Array.from({ length: 6 }, (_, face) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d"),
      gradient = ctx.createLinearGradient(0, 0, 0, 32);
    gradient.addColorStop(0, face === 3 ? preset.ground : preset.zenith);
    gradient.addColorStop(0.48, preset.horizon);
    gradient.addColorStop(1, preset.ground);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return canvas;
  });
  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Self-contained scenery. Geometry stays outside the navigable river corridor. */
export async function createEnvironment(
  scene,
  { renderer, quality = "balanced", assets = {}, signal, mood: initialMood = "moonlight" } = {},
) {
  signal?.throwIfAborted();
  if (!Object.hasOwn(MOODS, initialMood)) throw new Error(`Unknown swamp mood: ${initialMood}`);
  const group = new THREE.Group();
  group.name = "Moonwater wetland landscape";
  const colliders = [], warnings = [], prototypes = [], ownedTextures = new Set();
  const environmentMaps = {};
  let previous, sun, disposed = false;
  let lastExposure, lastEnvironmentIntensity;
  const ownParts = (parts) => {
    for (const part of parts) prototypes.push(new THREE.Mesh(part.geometry, part.material));
    for (const texture of parts.sourceTextures ?? []) ownedTextures.add(texture);
    return parts;
  };
  const fog = new THREE.FogExp2();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    group.removeFromParent();
    // Only restore values still owned by this asset; never dispose caller resources.
    if (previous) {
      if (scene.fog === fog) scene.fog = previous.fog;
      if (Object.values(environmentMaps).includes(scene.environment)) {
        scene.environment = previous.environment;
        if (scene.environmentIntensity === lastEnvironmentIntensity)
          scene.environmentIntensity = previous.environmentIntensity;
      }
      if (renderer) {
        if (renderer.toneMappingExposure === lastExposure)
          renderer.toneMappingExposure = previous.exposure;
        if (renderer.shadowMap.type === THREE.PCFSoftShadowMap)
          renderer.shadowMap.type = previous.shadowType;
        if (renderer.shadowMap.enabled) renderer.shadowMap.enabled = previous.shadows;
      }
    }
    disposeObjects([group, ...prototypes], {
      extraTextures: [...ownedTextures, ...Object.values(environmentMaps)],
    });
    sun?.shadow.dispose();
    group.clear();
    prototypes.length = 0;
    ownedTextures.clear();
  };
  try {
    const sky = createSky();
    group.add(sky.mesh);
    createBanks(group);
    const leafTexture = createLeafTexture();
    ownedTextures.add(leafTexture);
    const treeUrls = assets.treeUrls ?? (assets.treeUrl ? [assets.treeUrl] : []);
    const variants = [];
    for (const url of treeUrls.slice(0, 3)) {
      try {
        const parts = ownParts(await loadTreeParts(url, signal));
        if (parts.length) variants.push(parts);
      } catch (error) {
        if (signal?.aborted) throw error;
        warnings.push(`Tree asset unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const importedCount = variants.length, importedTrees = importedCount > 0;
    for (let i = 0; i < 3; i++) variants.push(ownParts(fallbackTree(523 + i * 151, leafTexture)));
    const trees = placeTrees(group, variants, quality, colliders, importedCount);
    createUnderstory(group, quality);
    createShoreDetails(group, trees, quality);
    // Settle every independent load before cleanup, so no late result can attach
    // geometry to an already disposed landscape.
    const groundResults = await Promise.allSettled([
      placeGroundAsset(group, assets.deadTreeUrl, "log", quality, warnings, signal, ownParts),
      placeGroundAsset(group, assets.fernUrl, "fern", quality, warnings, signal, ownParts),
    ]);
    signal?.throwIfAborted();
    for (const result of groundResults) if (result.status === "rejected") throw result.reason;
    const mistMaterial = createMist(group);
    sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(quality === "low" ? 1024 : 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -42;
    sun.shadow.camera.right = sun.shadow.camera.top = 42;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 380;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2;
    const hemi = new THREE.HemisphereLight(), ambient = new THREE.AmbientLight();
    group.add(sun, sun.target, hemi, ambient);
    for (const [name, preset] of Object.entries(MOODS)) environmentMaps[name] = createEnvironmentMap(preset);
    // Capture caller state only when mounting, after asynchronous work is done.
    previous = {
      fog: scene.fog,
      environment: scene.environment,
      environmentIntensity: scene.environmentIntensity,
      exposure: renderer?.toneMappingExposure,
      shadows: renderer?.shadowMap.enabled,
      shadowType: renderer?.shadowMap.type,
    };
    scene.add(group);
    scene.fog = fog;
    if (renderer) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    const direction = new THREE.Vector3(), target = new THREE.Vector3();
    const skyUniforms = sky.material.uniforms;
    let mood = initialMood, elapsed = MOOD_TRANSITION_SECONDS, from, to;
    const colorFields = ["fogColor", "zenith", "horizon", "lightColor", "hemisphere", "ground"];
    const scalarFields = ["fogDensity", "exposure", "lightIntensity", "fillIntensity", "moon", "cloud", "ambientIntensity", "environmentIntensity", "mistOpacity"];
    const current = {};
    for (const field of colorFields) current[field] = new THREE.Color(MOODS[initialMood][field]);
    for (const field of scalarFields) current[field] = MOODS[initialMood][field];
    current.direction = new THREE.Vector3().fromArray(MOODS[initialMood].moonDirection).normalize();
    const apply = (progress) => {
      for (const field of colorFields) current[field].lerpColors(from[field], to[field], progress);
      for (const field of scalarFields) current[field] = THREE.MathUtils.lerp(from[field], to[field], progress);
      current.direction.lerpVectors(from.direction, to.direction, progress).normalize();
      fog.color.copy(current.fogColor);
      fog.density = current.fogDensity;
      lastEnvironmentIntensity = current.environmentIntensity;
      scene.environmentIntensity = lastEnvironmentIntensity;
      if (progress >= 0.5) scene.environment = environmentMaps[mood];
      direction.copy(current.direction);
      skyUniforms.uZenith.value.copy(current.zenith);
      skyUniforms.uHorizon.value.copy(current.horizon);
      skyUniforms.uMoonDir.value.copy(direction);
      skyUniforms.uMoon.value = current.moon;
      skyUniforms.uCloud.value = current.cloud;
      sun.color.copy(current.lightColor);
      sun.intensity = current.lightIntensity;
      hemi.color.copy(current.hemisphere);
      hemi.groundColor.copy(current.ground);
      hemi.intensity = current.fillIntensity;
      ambient.color.copy(current.hemisphere);
      ambient.intensity = current.ambientIntensity;
      mistMaterial.uniforms.uColor.value.copy(current.fogColor);
      mistMaterial.uniforms.uOpacity.value = current.mistOpacity;
      if (renderer) {
        lastExposure = current.exposure;
        renderer.toneMappingExposure = lastExposure;
      }
    };
    const setMood = (name, { immediate = false } = {}) => {
      if (!Object.hasOwn(MOODS, name)) throw new Error(`Unknown swamp mood: ${name}`);
      const preset = MOODS[name];
      if (disposed) return preset;
      mood = name;
      from = { ...current, direction: current.direction.clone() };
      to = { ...preset, direction: new THREE.Vector3().fromArray(preset.moonDirection).normalize() };
      for (const field of colorFields) {
        from[field] = current[field].clone();
        to[field] = new THREE.Color(preset[field]);
      }
      elapsed = immediate ? MOOD_TRANSITION_SECONDS : 0;
      if (immediate) apply(1);
      return preset;
    };
    const update = (dt, time, boat) => {
      if (disposed) return;
      if (elapsed < MOOD_TRANSITION_SECONDS) {
        elapsed = Math.min(MOOD_TRANSITION_SECONDS, elapsed + Math.max(0, dt));
        const progress = elapsed / MOOD_TRANSITION_SECONDS;
        apply(progress * progress * (3 - 2 * progress));
      }
      skyUniforms.uTime.value = time;
      mistMaterial.uniforms.uTime.value = time;
      const x = boat?.x ?? boat?.position?.x ?? 0, z = boat?.z ?? boat?.position?.z ?? 25;
      target.set(Math.round(x * 16) / 16, 1.2, Math.round((z - 12) * 16) / 16);
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(direction, 210);
      sun.target.updateMatrixWorld();
    };
    setMood(initialMood, { immediate: true });
    update(0, 0, { x: riverCenter(25), z: 25 });
    signal?.addEventListener("abort", dispose, { once: true });
    return {
      group, sky, lights: { sun, hemi, ambient }, colliders, trees,
      importedTrees, warnings, update, setMood, dispose,
      get mood() { return mood; },
      get preset() { return MOODS[mood]; },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
