// Environment art: sky, warm key light, cool fill, sculpted shore and mountain ranges.
// The reflective water renderer lives in water.js.
import * as THREE from 'three';
import { WORLD } from '../gameplay/config.js';
import { waveHeight } from '../gameplay/physics.js';

export const SUN_DIR = new THREE.Vector3(-0.48, 0.68, 0.46).normalize();

export function buildSky(scene) {
  scene.fog = new THREE.Fog('#c6d9e2', 330, 1050);
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uTop: { value: new THREE.Color('#4b8dc9') },
      uMid: { value: new THREE.Color('#78b6df') },
      uHorizon: { value: new THREE.Color('#f1dfbf') },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uSun, uTop, uMid, uHorizon;
      uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.15, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.015, 0.11, h));
        col = mix(col, uTop, smoothstep(0.12, 0.85, h));
        // 太阳与光晕
        float sd = max(dot(d, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.92, 0.72) * pow(sd, 1800.0) * 2.0;
        col += vec3(1.0, 0.85, 0.6) * pow(sd, 22.0) * 0.18;
        col += vec3(1.0, 0.86, 0.62) * pow(sd, 3.0) * 0.025;
        // 程序化云
        if (d.y > 0.015) {
          vec2 uv = d.xz / max(d.y, 0.02) * 0.55 + vec2(uTime * 0.004, uTime * 0.002);
          float c = fbm(uv * 1.25);
          float c2 = fbm(uv * 3.1 + 4.0);
          float cover = smoothstep(0.56, 0.80, c * 0.75 + c2 * 0.35);
          cover *= smoothstep(0.055, 0.27, d.y);
          float shade = smoothstep(0.35, 0.9, c2);
          vec3 cloudCol = mix(vec3(0.55, 0.66, 0.77), vec3(1.0, 0.96, 0.85), shade);
          col = mix(col, cloudCol, cover * 0.64);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return { mesh: sky, material: mat };
}

export function buildLights(scene) {
  const sun = new THREE.DirectionalLight(0xffe4c1, 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const halfExtent = 32;
  sun.shadow.camera.left = -halfExtent; sun.shadow.camera.right = halfExtent;
  sun.shadow.camera.top = halfExtent; sun.shadow.camera.bottom = -halfExtent;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xb0d6fa, 0x435c4a, 0.90);
  const ambient = new THREE.AmbientLight(0xa8c7da, 0.07);
  scene.add(hemi, ambient);

  // Continuous direction-based sky avoids six visible seams in polished hull reflections.
  const cubeDirections = [
    (u, v) => [1, -v, -u], (u, v) => [-1, -v, u],
    (u, v) => [u, 1, v], (u, v) => [u, -1, -v],
    (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1],
  ];
  const faces = cubeDirections.map(directionAt => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const direction = directionAt((x + 0.5) / 64 - 1, (y + 0.5) / 64 - 1);
      const length = Math.hypot(...direction);
      const [dx, dy, dz] = direction.map(value => value / length);
      const above = dy >= 0, blend = Math.pow(Math.min(1, Math.abs(dy)), above ? 0.40 : 0.27);
      const horizon = [229, 226, 205], end = above ? [91, 151, 201] : [43, 78, 77];
      const highlight = Math.pow(Math.max(0, dx * SUN_DIR.x + dy * SUN_DIR.y + dz * SUN_DIR.z), 640) * 110;
      const offset = (y * 128 + x) * 4;
      for (let channel = 0; channel < 3; channel++) pixels.data[offset + channel] =
        Math.min(255, horizon[channel] * (1 - blend) + end[channel] * blend + highlight * [1, 0.92, 0.76][channel]);
      pixels.data[offset + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  });
  const environment = new THREE.CubeTexture(faces);
  environment.colorSpace = THREE.SRGBColorSpace;
  environment.needsUpdate = true;
  scene.environment = environment;
  scene.environmentIntensity = 0.62;

  // Quantize the shadow target to the light's texel grid to avoid swimming shadows.
  const texel = halfExtent * 2 / sun.shadow.mapSize.x;
  const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
  const lightUp = new THREE.Vector3().crossVectors(SUN_DIR, lightRight).normalize();
  const target = new THREE.Vector3(), offset = SUN_DIR.clone().multiplyScalar(135);
  const update = (x, z) => {
    target.set(x, 0.8, z);
    const alongRight = target.dot(lightRight), alongUp = target.dot(lightUp);
    target.addScaledVector(lightRight, Math.round(alongRight / texel) * texel - alongRight);
    target.addScaledVector(lightUp, Math.round(alongUp / texel) * texel - alongUp);
    sun.target.position.copy(target);
    sun.position.copy(target).add(offset);
    sun.target.updateMatrixWorld();
  };
  update(0, 0);
  return { sun, hemi, ambient, update };
}

/** 岸边环带定义（scale = 相对湖岸椭圆的半径倍数，y = 该环高度） */
export const SHORE_RINGS = [
  { scale: 1.0, y: 0.35 },
  { scale: 1.035, y: 1.6 },
  { scale: 1.09, y: 4.2 },
  { scale: 1.22, y: 7.6 },
  { scale: 1.55, y: 12.0 },
  { scale: 2.2, y: 20.0 },
];

/** 岸线扰动：与 buildShore 用同一函数，保证落点与网格一致 */
function shoreWobble(t) {
  return 1 + 0.035 * Math.sin(t * 3 + 0.7) + 0.02 * Math.sin(t * 7);
}

function ringHeight(ring, t) {
  return ring.y + Math.max(0, ring.scale - 1.06) *
    (3.0 + Math.sin(t * 5 + 0.5) * 2.6 + Math.cos(t * 9) * 1.3);
}

/**
 * 岸边任意点的地面高度（把树木、礁石放在真实地面上，不再悬空）。
 * @param x 世界 x
 * @param z 世界 z
 * @param sink 额外下沉量（把底座埋进地面）
 */
export function shoreHeightAt(x, z, sink = 0) {
  const a = WORLD.lakeA, b = WORLD.lakeB;
  const t = Math.atan2(z / b, x / a);
  const s = Math.sqrt((x / a) ** 2 + (z / b) ** 2) / shoreWobble(t);
  if (s <= SHORE_RINGS[0].scale) return ringHeight(SHORE_RINGS[0], t) - sink;
  for (let i = 0; i < SHORE_RINGS.length - 1; i++) {
    const r0 = SHORE_RINGS[i], r1 = SHORE_RINGS[i + 1];
    if (s <= r1.scale) {
      const k = (s - r0.scale) / (r1.scale - r0.scale);
      return THREE.MathUtils.lerp(ringHeight(r0, t), ringHeight(r1, t), k) - sink;
    }
  }
  const last = SHORE_RINGS[SHORE_RINGS.length - 1];
  return ringHeight(last, t) + (s - last.scale) * 12 - sink;
}

/** 岸边：从湖岸椭圆向外延伸的沙滩 + 草地环 */
export function buildShore(scene) {
  const N = 220;
  const a = WORLD.lakeA, b = WORLD.lakeB;
  // 配色按"渲染后会偏亮"来压低（场景光照约 2 倍辐照度 + ACES），避免岸面糊成一片白
  const rings = [
    { scale: 1.0, y: 0.35, color: new THREE.Color('#727d64') },
    { scale: 1.035, y: 1.6, color: new THREE.Color('#aa9f79') },
    { scale: 1.09, y: 4.2, color: new THREE.Color('#727e52') },
    { scale: 1.22, y: 7.6, color: new THREE.Color('#566a47') },
    { scale: 1.55, y: 12.0, color: new THREE.Color('#405d4b') },
    { scale: 2.2, y: 20.0, color: new THREE.Color('#354f46') },
  ];
  const pos = [], col = [], idx = [];
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      // 岸线做轻微不规则，避免完美椭圆
      const wob = shoreWobble(t);
      const sa = a * ring.scale * wob, sb = b * ring.scale * wob;
      pos.push(Math.cos(t) * sa, ringHeight(ring, t), Math.sin(t) * sb);
      const c = ring.color.clone().multiplyScalar(0.92 + Math.sin(t * 17 + r) * 0.045 + Math.sin(t * 6) * 0.04);
      col.push(c.r, c.g, c.b);
    }
  }
  const stride = N + 1;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const a0 = r * stride + i, b0 = a0 + 1, c0 = a0 + stride, d0 = c0 + 1;
      // 顶点顺序取"从上方看逆时针"，法线朝上（此前朝下会被背面剔除 → 岸面消失/发白）
      idx.push(a0, b0, c0, b0, d0, c0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const shore = new THREE.Mesh(geo, mat);
  shore.receiveShadow = true;
  scene.add(shore);
  return shore;
}

/** 内场小岛 */
export function buildIslet(scene) {
  const { x, z, r } = WORLD.islet;
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(1, 0.36, 1);
  const islandColors = [];
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const height = geo.attributes.position.getY(i) / (r * 0.36);
    const color = new THREE.Color('#556447').lerp(new THREE.Color('#7f905a'), height * 0.7);
    islandColors.push(color.r, color.g, color.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(islandColors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const mound = new THREE.Mesh(geo, mat);
  mound.position.set(x, -2.2, z);
  mound.receiveShadow = true; mound.castShadow = true;
  g.add(mound);
  // 沙滩环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.96, r * 1.5, 40),
    new THREE.MeshStandardMaterial({ color: '#a59979', roughness: 0.95 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.4, z);
  g.add(ring);
  const heightAt = (wx, wz) => -2.2 + 0.36 * Math.sqrt(Math.max(0, r * r - (wx - x) ** 2 - (wz - z) ** 2));
  const contacts = [];
  // 岛上树群，避免等间距绕圆一圈。
  for (let i = 0; i < 11; i++) {
    const t = i * 2.39996 + 0.4;
    const rr = r * (0.2 + 0.4 * ((i % 4) / 3));
    // 岛面高度：球冠（半径 r，压扁 0.36，中心在 y=-2.2）
    const moundY = -2.2 + 0.36 * Math.sqrt(Math.max(0, r * r - rr * rr)) - 0.5;
    const tx = x + Math.cos(t) * rr, tz = z + Math.sin(t) * rr;
    const scale = 1.05 + (i % 3) * 0.2;
    g.add(makeTree(tx, tz, scale, moundY));
    contacts.push({ x: tx, z: tz, radius: scale * 0.92 });
  }
  g.add(buildContactPatches(contacts, heightAt));
  scene.add(g);
  return g;
}

const treeGeoCache = {};
function pineCrown(radius, height, baseY) {
  const geometry = new THREE.CylinderGeometry(0.015, radius, height, 11, 9);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i), u = (y + height / 2) / height;
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    const tiers = 0.90 + 0.16 * Math.cos(u * Math.PI * 6);
    const irregular = 1 + Math.sin(angle * 3 + u * 9) * 0.10 + Math.cos(angle * 5) * 0.05;
    position.setXYZ(i, position.getX(i) * tiers * irregular,
      y + Math.sin(angle * 3) * (1 - u) * 0.07,
      position.getZ(i) * tiers * irregular);
  }
  geometry.translate(0, baseY + height / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeTree(x, z, scale = 1, baseY = 0) {
  if (!treeGeoCache.merged) {
    const trunk = new THREE.CylinderGeometry(0.16, 0.22, 1.3, 6);
    trunk.translate(0, 0.65, 0);
    const c1 = pineCrown(1.18, 3.2, 0.78);
    const c2 = pineCrown(0.65, 1.9, 2.9);
    const g = new THREE.Group();
    treeGeoCache.merged = { trunk, c1, c2 };
    g.userData.geo = treeGeoCache.merged;
  }
  const { trunk, c1, c2 } = treeGeoCache.merged;
  const g = new THREE.Group();
  const barkMat = new THREE.MeshStandardMaterial({ color: '#51422f', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#315845', roughness: 0.96 });
  const leafTopMat = new THREE.MeshStandardMaterial({ color: '#55794d', roughness: 0.94 });
  const t = new THREE.Mesh(trunk, barkMat);
  const f1 = new THREE.Mesh(c1, leafMat);
  const f2 = new THREE.Mesh(c2, leafTopMat);
  t.castShadow = f1.castShadow = f2.castShadow = true;
  g.add(t, f1, f2);
  g.position.set(x, baseY, z);
  g.scale.setScalar(scale);
  return g;
}

/** Soft local occlusion, conformed to the terrain, in one inexpensive draw. */
function buildContactPatches(patches, heightAt = shoreHeightAt) {
  const positions = [], alphas = [], indices = [], steps = 6;
  for (const { x, z, radius } of patches) {
    const base = positions.length / 3;
    for (let row = 0; row <= steps; row++) for (let col = 0; col <= steps; col++) {
      const u = col / steps * 2 - 1, v = row / steps * 2 - 1;
      const wx = x + u * radius, wz = z + v * radius;
      const edge = Math.max(0, 1 - u * u - v * v);
      positions.push(wx, heightAt(wx, wz) + 0.045, wz);
      alphas.push(edge * edge * 0.27);
      if (row < steps && col < steps) {
        const a = base + row * (steps + 1) + col, b = a + 1, c = a + steps + 1;
        indices.push(a, c, b, b, c, c + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `attribute float alpha; varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(0.014, 0.029, 0.021, vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Terrain contact shading';
  mesh.renderOrder = 1;
  return mesh;
}

/** 岸边植被、礁石与远景山峦 */
export function buildScenery(scene) {
  const group = new THREE.Group();
  const rand = mulberry32(20240917);
  const a = WORLD.lakeA, b = WORLD.lakeB;
  // 树：高度直接取自岸面高度函数，避免悬空
  const treePositions = [];
  for (let i = 0; i < 150; i++) {
    const t = rand() * Math.PI * 2;
    const s = 1.12 + rand() * 0.85;
    const x = Math.cos(t) * a * s, z = Math.sin(t) * b * s;
    const y = shoreHeightAt(x, z, 0.4);
    // Keep an intentional clearing at the race club rather than scatter uniformly.
    if (x > -92 && x < -12 && z > 130 && z < 185) continue;
    treePositions.push({ x, y, z, scale: 1.3 + rand() * 2.0, width: 0.72 + rand() * 0.5, yaw: rand() * Math.PI * 2 });
  }
  // Reuse geometry and materials for the forest: three draws instead of hundreds.
  const treeTemplate = makeTree(0, 0);
  const treeMatrix = new THREE.Matrix4();
  const treeRotation = new THREE.Quaternion(), treeScale = new THREE.Vector3(), treePosition = new THREE.Vector3();
  const contactPatches = [];
  for (const part of treeTemplate.children) {
    const forest = new THREE.InstancedMesh(part.geometry, part.material, treePositions.length);
    treePositions.forEach(({ x, y, z, scale, width, yaw }, i) => {
      treePosition.set(x, y, z); treeScale.set(scale * width, scale, scale * width);
      treeRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      treeMatrix.compose(treePosition, treeRotation, treeScale);
      forest.setMatrixAt(i, treeMatrix);
      const variation = (i * 0.61803) % 1;
      forest.setColorAt(i, new THREE.Color().setRGB(0.80 + variation * 0.23, 0.90 + variation * 0.10, 0.83 + (1 - variation) * 0.15));
    });
    forest.castShadow = forest.receiveShadow = true;
    group.add(forest);
  }
  for (const { x, z, scale, width } of treePositions) contactPatches.push({ x, z, radius: scale * width * 0.82 });
  // 礁石
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rockPosition = rockGeo.attributes.position;
  for (let i = 0; i < rockPosition.count; i++) {
    const x = rockPosition.getX(i), y = rockPosition.getY(i), z = rockPosition.getZ(i);
    const weathering = 0.92 + Math.sin(x * 7 + z * 4) * 0.11 + Math.cos(y * 8 - z * 3) * 0.07;
    rockPosition.setXYZ(i, x * weathering, y * weathering, z * weathering);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8c9484', roughness: 0.95, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 60);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    const t = rand() * Math.PI * 2;
    const s = 1.02 + rand() * 0.4;
    const rx = Math.cos(t) * a * s, rz = Math.sin(t) * b * s;
    const k = 1.2 + rand() * 2.6;
    // 礁石坐在岸面上（底座略埋入地面）
    p.set(rx, shoreHeightAt(rx, rz) - k * 0.25, rz);
    q.setFromEuler(new THREE.Euler(rand() * 2, rand() * 6, rand() * 2));
    sc.set(k, k * (0.5 + rand() * 0.4), k);
    m.compose(p, q, sc);
    rocks.setMatrixAt(i, m);
    rocks.setColorAt(i, new THREE.Color().setRGB(0.74 + rand() * 0.26, 0.77 + rand() * 0.23, 0.74 + rand() * 0.23));
    contactPatches.push({ x: rx, z: rz, radius: k * 0.95 });
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  group.add(rocks);
  group.add(buildContactPatches(contactPatches));
  // Sculpted annular terrain: foothill, lit slope, irregular ridge and back slope.
  // Each band has radial depth, so the sun reveals valleys rather than a silhouette wall.
  for (let layer = 0; layer < 3; layer++) {
    const positions = [], colors = [], indices = [];
    const around = 160, radialSteps = 12;
    const footColor = new THREE.Color(['#506a51', '#6b8580', '#8fa7b0'][layer]);
    const rockColor = new THREE.Color(['#8e9980', '#94a89e', '#bdcacc'][layer]);
    for (let radial = 0; radial <= radialSteps; radial++) {
      const v = radial / radialSteps;
      for (let i = 0; i <= around; i++) {
        const t = i / around * Math.PI * 2;
        const phase = layer * 1.37;
        const ridgeDepth = 280 + layer * 40;
        const distance = 285 + layer * 145 + v * ridgeDepth +
          (14 + v * 24) * Math.sin(t * 5 + phase) + 12 * Math.cos(t * 11 - v * 3);
        const ridge = Math.pow(Math.max(0, Math.sin(Math.PI * v)), 1.6);
        const peak = 42 + layer * 26 + 25 * Math.pow(Math.max(0, Math.sin(t * 5 + phase)), 2) +
          15 * Math.pow(Math.max(0, Math.cos(t * 11 - phase)), 2);
        const gullies = Math.sin(t * 23 + v * 8 + phase) * 9 + Math.sin(t * 37 - v * 5) * 4;
        const height = 4 + layer * 3 + ridge * (peak + gullies);
        positions.push(Math.cos(t) * distance, height, Math.sin(t) * distance);
        const tint = THREE.MathUtils.clamp((height - 42 - layer * 20) / 110 + Math.sin(t * 9) * 0.08, 0, 1);
        const color = footColor.clone().lerp(rockColor, tint);
        color.multiplyScalar(0.91 + 0.07 * Math.sin(t * 17 + v * 7));
        colors.push(color.r, color.g, color.b);
        if (radial < radialSteps && i < around) {
          const a0 = radial * (around + 1) + i, b0 = a0 + 1, c0 = a0 + around + 1;
          indices.push(a0, b0, c0, b0, c0 + 1, c0);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const range = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.98, metalness: 0,
    }));
    range.name = `Mountain range ${layer + 1}`;
    range.receiveShadow = true;
    group.add(range);
  }
  group.add(buildRaceClub());
  scene.add(group);
  return group;
}

/** A small, authored race-club backdrop beside the launch area. */
function buildRaceClub() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#9b8060', roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: '#233d3d', roughness: 0.52, metalness: 0.25 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#ece7d5', roughness: 0.85, side: THREE.DoubleSide });
  const red = new THREE.MeshStandardMaterial({ color: '#c34c35', roughness: 0.72, side: THREE.DoubleSide });
  const addBox = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  // The boardwalk sits outside the navigable shoreline; physics need no new obstacles.
  const x = -53, z = 150, y = shoreHeightAt(x, z) + 0.5;
  for (let i = 0; i < 26; i++) addBox(0.82, 0.28, 7.6, x - 11 + i * 0.88, y, z, wood);
  for (const dx of [-11, -5.5, 0, 5.5, 11]) {
    for (const dz of [-3.4, 3.4]) {
      const ground = shoreHeightAt(x + dx, z + dz);
      addBox(0.32, Math.max(0.5, y - ground + 1), 0.32, x + dx, (ground + y) / 2 - 0.3, z + dz, dark);
    }
  }
  // Simple sail canopy, benches and race flags give the place a human scale.
  for (const dx of [-5.5, 5.5]) for (const dz of [-2.7, 2.7]) {
    addBox(0.18, 5.4, 0.18, x + dx, y + 2.7, z + dz, dark);
  }
  for (const side of [-1, 1]) {
    const roof = addBox(12, 0.16, 3.5, x, y + 5.6, z + side * 1.5, cloth);
    roof.rotation.x = side * 0.14;
    addBox(5, 0.26, 1, x + side * 5.5, y + 0.85, z + 2, wood);
    addBox(0.28, 0.8, 0.75, x + side * 7.2, y + 0.4, z + 2, dark);
    addBox(0.28, 0.8, 0.75, x + side * 3.8, y + 0.4, z + 2, dark);
  }
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#173d3e'; ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = '#efe9d8'; ctx.font = '600 61px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('LAKE  /  RACING CLUB', 512, 106);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }));
  sign.position.set(x, y + 4.4, z - 2.87); sign.rotation.y = Math.PI; group.add(sign);
  for (const dx of [-15, 15]) {
    const fx = x + dx, fz = z + 1, fy = shoreHeightAt(fx, fz);
    addBox(0.12, 9, 0.12, fx, fy + 4.5, fz, dark);
    const flag = addBox(1.65, 4.7, 0.035, fx + 0.86, fy + 6.5, fz, red);
    flag.rotation.y = 0.25;
  }
  // Small venue details read in the shore reflections without adding race obstacles.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.11, 8, 24), red);
  ring.position.set(x - 5.55, y + 1.9, z - 2.8);
  ring.castShadow = true; group.add(ring);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.023, 5, 24), cloth);
  rope.position.copy(ring.position); group.add(rope);
  addBox(0.55, 0.4, 0.04, x - 5.55, y + 2.65, z - 2.83, cloth);
  for (let i = 0; i < 3; i++) {
    addBox(1.4, 0.68, 0.78, x + 8.2, y + 0.48 + i * 0.7, z + 1.8, i % 2 ? dark : wood);
    addBox(0.32, 0.07, 0.035, x + 8.2, y + 0.52 + i * 0.7, z + 1.39, dark);
  }
  // Open frontage rail frames the timber platform; the launch area remains clear.
  for (const side of [-1, 1]) {
    addBox(4.3, 0.10, 0.10, x + side * 8.4, y + 1.1, z - 3.6, dark);
    for (const dx of [6.5, 10.5]) addBox(0.11, 1.1, 0.11, x + side * dx, y + 0.55, z - 3.6, dark);
  }
  return group;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export { waveHeight };
