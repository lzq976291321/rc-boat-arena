// Environment art: sky, warm key light, cool fill, sculpted shore and mountain ranges.
// The reflective water renderer lives in water.js.
import * as THREE from 'three';
import { WORLD } from '../gameplay/config.js';
import { waveHeight } from '../gameplay/physics.js';
import { buildShoreVegetation } from './shore-vegetation.js';
import { buildRaceClub } from './race-club.js';
import { buildTerrainAssets } from './terrain-assets.js';

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

/** A shared shoreline coordinate for planting and terrain placement. */
function shorePointAt(angle, scale) {
  const radius = shoreWobble(angle) * scale;
  return { x: Math.cos(angle) * WORLD.lakeA * radius, z: Math.sin(angle) * WORLD.lakeB * radius };
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
  scene.add(g);
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
export function buildScenery(scene, { shore, islet, after = Promise.resolve() }) {
  const group = new THREE.Group();
  group.userData.assetState = { status: 'waiting', errors: [] };
  group.userData.assets = [];
  group.ready = Promise.resolve(after).then(async () => {
    group.userData.assetState.status = 'loading';
    const rand = mulberry32(20240917);
    const islandHeightAt = (x, z) => -2.2 + 0.36 * Math.sqrt(Math.max(0, WORLD.islet.r ** 2 - (x - WORLD.islet.x) ** 2 - (z - WORLD.islet.z) ** 2));
    const planting = buildShoreVegetation({
      heightAt: shoreHeightAt, pointAt: shorePointAt, islandHeightAt, random: rand,
    });
    group.add(buildContactPatches(planting.islandContacts, islandHeightAt));
    group.add(planting.group);
    group.add(buildContactPatches(planting.contacts));
    const terrain = buildTerrainAssets({ shore, islet, heightAt: shoreHeightAt, pointAt: shorePointAt, random: mulberry32(20260922) });
    group.add(terrain);
    const club = buildRaceClub(shoreHeightAt);
    group.add(club);
    await Promise.all([planting.ready, club.ready, terrain.ready]);
    group.userData.assetState.status = 'ready';
    group.userData.assets = [...planting.group.userData.assets, ...(club.userData.assets || []), ...terrain.userData.assets];
    return group;
  }).catch(error => {
    group.userData.assetState.status = 'error';
    group.userData.assetState.errors.push(String(error));
    throw error;
  });
  // Decorative failures stay inspectable through ready/state without becoming
  // an unhandled rejection when the race only waits for its essential models.
  group.ready.catch(() => {});
  scene.add(group);
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
