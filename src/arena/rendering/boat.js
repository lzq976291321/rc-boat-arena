// MAVERICK GT by dannzjs (CC BY 4.0); wake and spray stay procedural.
import * as THREE from 'three';
import { loadGLTF } from '../../shared/assets/gltf.js';
import { waveHeight } from '../gameplay/physics.js';

export const HULL = { length: 4.6, width: 1.602, stern: 2.27, bowSpray: 1.8 };
// Display draft; not an engineering measurement of the real watercraft.
const KEEL_Y = -0.16;

function jetTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const along = y / (canvas.height - 1);
    for (let x = 0; x < canvas.width; x++) {
      const across = (x / (canvas.width - 1) - 0.5) * 2;
      const edge = Math.pow(Math.max(0, 1 - across * across), 2);
      const broken = 0.4 + 0.6 * Math.pow(Math.sin(y * 0.16 + Math.sin(x * 0.47) * 1.4), 2);
      const alpha = edge * Math.pow(along, 1.7) * broken * 0.72;
      const i = (y * canvas.width + x) * 4;
      image.data[i] = 222; image.data[i + 1] = 241; image.data[i + 2] = 235;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildBoat() {
  const group = new THREE.Group();
  const visual = new THREE.Group();
  group.name = 'MAVERICK GT race boat'; visual.name = 'MAVERICK GT visual pose';
  group.add(visual);
  // Keep the main-loop steering API without grafting a second rudder onto the approved model.
  const rudder = new THREE.Object3D();
  rudder.name = 'Steering effect anchor'; visual.add(rudder);
  const mats = {};
  const loadState = { status: 'loading', progress: 0, error: null, source: 'assets/library/maverick-gt/model.glb' };

  // A narrow broken water sheet, rather than a solid cone glowing behind the hull.
  const jetGeo = new THREE.PlaneGeometry(0.28, 0.75, 1, 6);
  jetGeo.translate(0, 0.375, 0);
  const jetMat = new THREE.MeshBasicMaterial({ map: jetTexture(), transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const jet = new THREE.Mesh(jetGeo, jetMat);
  jet.rotation.x = -Math.PI / 2;
  jet.position.set(0, 0.3, -HULL.length / 2 - 0.28);
  jet.visible = false; visual.add(jet);

  const modelUrl = new URL(loadState.source, document.baseURI).href;
  const ready = loadGLTF(modelUrl, { delivery: 'scene', onProgress: (event) => {
    if (event.total > 0) loadState.progress = Math.min(0.95, event.loaded / event.total);
  } }).then((gltf) => {
    // Preserve the source root transform (+Y up, -X bow). Rotate a separate
    // mount so the race physics' +Z forward remains the boat's actual bow.
    const model = new THREE.Group();
    const orientation = new THREE.Group();
    orientation.rotation.y = Math.PI / 2;
    orientation.add(gltf.scene);
    model.add(orientation);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.z) || size.z <= 0) throw new Error('船艇模型尺寸无效');
    const scale = HULL.length / size.z;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, KEEL_Y - bounds.min.y * scale, -center.z * scale);
    model.name = 'MAVERICK GT';
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = obj.receiveShadow = true;
    });
    visual.add(model);
    jet.position.set(0, 0.1, -HULL.stern);
    visual.userData.modelSource = loadState.source;
    visual.userData.modelDimensions = { width: size.x * scale, height: size.y * scale, length: HULL.length };
    loadState.progress = 1; loadState.status = 'ready';
    return model;
  }).catch((error) => {
    loadState.status = 'error';
    loadState.error = error instanceof Error ? error.message : String(error);
    throw error;
  });
  return { group, visual, jet, rudder, mats, ready, loadState };
}
/** 尾流：中心搅动带 + 左右开尔文 V 形臂
 *  V5：加"横向软边 + 程序化泡沫噪声 + 溶解阈值"，避免出现又长又直的白色几何条与硬三角边。 */
export class Wake {
  constructor(scene, { points = 130, armLife = 2.0, life = 2.3 } = {}) {
    this.max = points;
    this.pts = [];
    this.armLife = armLife;
    this.life = life;
    const idx = [];
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color('#e4f0e9') },
        uTime: { value: 0 },
        uFade: { value: 1 },
      },
      vertexShader: `uniform float uTime; attribute float alpha; attribute float side; varying float vA; varying float vSide; varying vec3 vWorld;
        void main(){
          vA = alpha; vSide = side;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y += 0.34 * sin(wp.x * 0.052 + uTime * 1.30)
                + 0.24 * sin(wp.z * 0.068 - uTime * 1.02)
                + 0.13 * sin((wp.x + wp.z) * 0.121 + uTime * 2.05);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uFade; varying float vA; varying float vSide; varying vec3 vWorld;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
        }
        void main(){
          if (vA <= 0.002) discard;
          float edge = 1.0 - smoothstep(0.18, 1.0, abs(vSide));
          // Islands of bubbles at two scales. No constant white strip under the noise.
          vec2 flow = vWorld.xz + vec2(uTime * 0.09, -uTime * 0.06);
          float n = noise(flow * 1.05);
          float fine = noise(flow * 4.2 + vec2(2.4, 7.1));
          float patches = smoothstep(0.32, 0.74, n * 0.74 + fine * 0.26);
          float foam = patches * (0.16 + 0.84 * smoothstep(0.24, 0.70, fine));
          float a = vA * edge * foam * uFade;
          a *= smoothstep(0.0, 0.10, vA);
          if (a <= 0.004) discard;
          gl_FragColor = vec4(uColor * (0.82 + 0.18 * foam), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const makeRibbon = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 2 * 3), 3));
      geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(points * 2), 1));
      const sides = new Float32Array(points * 2);
      for (let i = 0; i < points; i++) { sides[i * 2] = -1; sides[i * 2 + 1] = 1; }
      geo.setAttribute('side', new THREE.BufferAttribute(sides, 1));
      geo.setIndex(idx.slice());
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      return { mesh, geo };
    };
    this.center = makeRibbon();
    this.arms = [-1, 1].map((side) => ({ side, ...makeRibbon() }));
  }
  reset() { this.pts.length = 0; this._flush(); }
  push(x, z, y, heading, speed, t) {
    if (speed < 0.65) return;
    const last = this.pts[this.pts.length - 1];
    const distance = last ? Math.hypot(x - last.x, z - last.z) : 0;
    if (last && (t < last.t || distance > Math.max(8, speed * 0.4))) this.reset();
    else if (last && distance < Math.min(0.55, 0.17 + speed * 0.012)) return;
    this.pts.push({ x, z, y, heading, speed, t });
    while (this.pts.length > this.max) this.pts.shift();
  }
  _flush() {
    const now = this.mat.uniforms.uTime.value;
    const write = (geo, fn) => {
      const pos = geo.attributes.position.array;
      const alp = geo.attributes.alpha.array;
      for (let i = 0; i < this.max; i++) {
        const p = this.pts[i];
        const a0 = i * 2, a1 = i * 2 + 1;
        if (!p) {
          pos[a0 * 3] = 0; pos[a0 * 3 + 1] = -60; pos[a0 * 3 + 2] = 0;
          pos[a1 * 3] = 0; pos[a1 * 3 + 1] = -60; pos[a1 * 3 + 2] = 0;
          alp[a0] = alp[a1] = 0;
          continue;
        }
        const age = Math.max(0, now - p.t);
        fn(p, age, a0, a1, pos, alp);
        const tailFade = Math.min(1, i / 4);
        alp[a0] *= tailFade; alp[a1] *= tailFade;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
      // Never connect the final real sample to unused vertices below the lake.
      geo.setDrawRange(0, Math.max(0, this.pts.length - 1) * 6);
    };
    // 中心搅动带：窄一些、寿命短一些
    write(this.center.geo, (p, age, a0, a1, pos, alp) => {
      const life = this.life;
      const k = Math.max(0, 1 - age / life);
      const perpX = Math.cos(p.heading), perpZ = -Math.sin(p.heading);
      const irregular = 1 + Math.sin(p.t * 9.3 + age * 1.2) * 0.1;
      const w = HULL.width * (0.18 + age * 0.22) * (0.7 + Math.min(1, p.speed / 26) * 0.5) * irregular;
      pos[a0 * 3] = p.x - perpX * w; pos[a0 * 3 + 1] = 0.014; pos[a0 * 3 + 2] = p.z - perpZ * w;
      pos[a1 * 3] = p.x + perpX * w; pos[a1 * 3 + 1] = 0.014; pos[a1 * 3 + 2] = p.z + perpZ * w;
      const v = k * k * Math.min(1, p.speed / 8);
      alp[a0] = alp[a1] = 0.40 * v;
    });
    // V 形臂：随年龄扩散并淡出
    for (const arm of this.arms) {
      write(arm.geo, (p, age, a0, a1, pos, alp) => {
        const k = Math.max(0, 1 - age / this.armLife);
        const perpX = Math.cos(p.heading), perpZ = -Math.sin(p.heading);
        const spread = 0.48 + age * (0.85 + Math.min(p.speed, 30) * 0.07);
        const cx = p.x + perpX * spread * arm.side;
        const cz = p.z + perpZ * spread * arm.side;
        const w = (0.12 + age * 0.24) * (1 + Math.sin(p.t * 7.6 + arm.side) * 0.14);
        pos[a0 * 3] = cx - perpX * w; pos[a0 * 3 + 1] = 0.012; pos[a0 * 3 + 2] = cz - perpZ * w;
        pos[a1 * 3] = cx + perpX * w; pos[a1 * 3 + 1] = 0.012; pos[a1 * 3 + 2] = cz + perpZ * w;
        const v = k * k * Math.min(1, p.speed / 10);
        alp[a0] = alp[a1] = 0.24 * v;
      });
    }
  }
}

export class Spray {
  constructor(scene, count = 900) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.size = new Float32Array(count);
    this.baseSize = new Float32Array(count);
    this.opacity = new Float32Array(count);
    this.time = 0;
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('opacity', new THREE.BufferAttribute(this.opacity, 1));
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {},
      vertexShader: `attribute float size; attribute float opacity; varying float vA;
        void main(){
          vA = opacity;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * 105.0 / max(-mv.z, 1.0), 1.0, 8.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA;
        void main(){
          if (vA <= 0.01) discard;
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d);
          if (r > 0.5) discard;
          float a = (1.0 - smoothstep(0.08, 0.5, r)) * vA;
          gl_FragColor = vec4(0.76, 0.88, 0.83, a * 0.5);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
  }
  emit(x, y, z, vx, vy, vz, life = 0.8, size = 1) {
    const i = this.head;
    this.head = (this.head + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = waveHeight(x, z, this.time) + y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = this.baseSize[i] = size;
    this.opacity[i] = 0;
  }
  burst(x, z, n = 26, power = 1, heading = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3.4) * power;
      this.emit(x, 0.3, z, Math.cos(a) * sp, (2.2 + Math.random() * 4.4) * power, Math.sin(a) * sp,
        0.5 + Math.random() * 0.6, 0.55 + Math.random() * 0.6);
    }
  }
  update(dt, time = this.time + dt) {
    this.time = time;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.size[i] = this.opacity[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // Droplets disappear into the moving surface; they do not bounce as luminous beads.
      const waterY = waveHeight(this.pos[i * 3], this.pos[i * 3 + 2], time);
      if (this.vel[i * 3 + 1] <= 0 && this.pos[i * 3 + 1] < waterY + 0.015) {
        this.life[i] = 0; this.size[i] = this.opacity[i] = 0;
        continue;
      }
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const age = this.maxLife[i] - this.life[i];
      this.size[i] = this.baseSize[i] * (0.5 + k * 0.5);
      this.opacity[i] = Math.min(1, age / 0.045) * Math.pow(k, 1.4);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.opacity.needsUpdate = true;
  }
}
