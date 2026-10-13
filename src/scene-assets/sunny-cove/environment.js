import * as THREE from 'three';
import { disposeObjects } from '../../shared/rendering/resources.js';
import { loadCoveModel, instanceCoveModel } from './dock.js';
import { MOODS, MOOD_TRANSITION_SECONDS } from './presets.js';
import { coveShoreX, createRockyCoast } from './coast.js';
import { createCoastalFoliage } from './foliage.js';
import { SHORE_DRESSING } from './config/dressing.js';
export { coveShoreX } from './coast.js';
export { MOODS } from './presets.js';

const smoothstep = THREE.MathUtils.smoothstep;
/** Continuous seabed, including the near foreground seen through the water. */
export function coveFloorHeight(x, z) {
  const frontDepth = THREE.MathUtils.lerp(2.15, 0.35, smoothstep(z, 3.8, 7.6));
  const openDepth = THREE.MathUtils.lerp(frontDepth, 8, smoothstep(-z, 14, 190));
  const clearance = Math.min(x - coveShoreX(-1, z), coveShoreX(1, z) - x);
  const shoreDepth = Math.max(0.18, (clearance + 0.4) * 0.34);
  const ripples = Math.sin(x * 0.78 + z * 0.13) * 0.034 + Math.sin(z * 0.51 - x * 0.31) * 0.042;
  return -Math.min(openDepth, shoreDepth) + ripples;
}

function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uSunDirection: { value: new THREE.Vector3() },
      uCloud: { value: 0.18 }, uGlow: { value: 0.3 }, uSize: { value: 0.008 }, uNight: { value: 0 },
    },
    vertexShader: `varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 uZenith,uHorizon,uSunColor,uSunDirection;
      uniform float uTime,uCloud,uGlow,uSize,uNight;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=noise(p)*a;p=mat2(1.65,1.12,-1.12,1.65)*p;a*=.5;}return v;}
      void main(){
        vec3 d=normalize(vDirection),sun=normalize(uSunDirection);
        float elevation=pow(max(d.y,0.),.34);
        vec3 color=mix(uHorizon,uZenith,elevation);
        float facing=max(0.,dot(d,sun));
        color+=uSunColor*pow(facing,26.)*uGlow;
        color+=uSunColor*pow(facing,180.)*uGlow*.45;
        float disk=1.-smoothstep(uSize*.8,uSize,length(d-sun));
        color+=uSunColor*disk*mix(12.,1.7,uNight);
        vec2 cloudUV=d.xz/max(.16,d.y+.12)*1.4+vec2(uTime*.0013,0.);
        float n=fbm(cloudUV*vec2(.8,2.0));
        float cloud=smoothstep(.46,.69,n)*uCloud*smoothstep(.025,.23,d.y);
        vec3 cloudColor=mix(vec3(1.,.965,.9),uHorizon,.22+uNight*.4);
        color=mix(color,cloudColor,cloud);
        color=mix(uHorizon*.76,color,smoothstep(-.1,.04,d.y));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(700, 40, 24), material);
  mesh.name = 'Clear coastal sky and warm low sun'; mesh.frustumCulled = false;
  return { mesh, material };
}

function skyPreset(sky, preset) {
  const u = sky.material.uniforms;
  u.uZenith.value.set(preset.zenith); u.uHorizon.value.set(preset.horizon);
  u.uSunColor.value.set(preset.lightColor); u.uSunDirection.value.fromArray(preset.moonDirection).normalize();
  u.uCloud.value = preset.cloud; u.uGlow.value = preset.sunGlow; u.uSize.value = preset.sunSize; u.uNight.value = preset.moon;
}

function sandTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  const image = context.createImageData(512, 512), random = randomFrom(11231);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const wave = Math.sin((x + Math.sin(y / 31) * 7) / 9) * 3 + Math.sin(y / 65 + x / 100) * 2;
    const grain = (random() - 0.5) * 27 + wave;
    image.data[i] = 196 + grain; image.data[i + 1] = 185 + grain; image.data[i + 2] = 153 + grain;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  return texture;
}

function createSeabed(group, quality) {
  const geometry = new THREE.PlaneGeometry(270, 410, quality === 'low' ? 64 : 96, quality === 'low' ? 96 : 128);
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, -140);
  const positions = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, coveFloorHeight(x, z)); uv.setXY(i, x / 3.2, z / 3.2);
  }
  geometry.computeVertexNormals();
  const texture = sandTexture();
  const material = new THREE.MeshStandardMaterial({ color: '#e9debf', map: texture,
    bumpMap: texture, bumpScale: 0.035, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Continuous sandy seabed, shallow foreground to deep sea';
  mesh.receiveShadow = true; group.add(mesh);
}

function distantHeadland(group, side, layer) {
  const positions = [], indices = [];
  const across = 92, depth = 16;
  const peaks = [0, 0.28, 0.36, 0.69, 0.52, 0.73, 0.59, 0.86, 0.81, 0.62, 0.72, 0.51, 0.67, 0.6, 0.36, 0.48, 0.26, 0];
  for (let row = 0; row <= depth; row++) for (let column = 0; column <= across; column++) {
    const t = column / across, v = row / depth;
    const sample = t * (peaks.length - 1), segment = Math.min(peaks.length - 2, Math.floor(sample));
    const ridge = THREE.MathUtils.lerp(peaks[segment], peaks[segment + 1], sample - segment);
    const x = side * (38 + layer * 35 + t * 190);
    const coast = -195 - layer * 85 - t * 46 + Math.sin(t * 21) * 7;
    const z = coast - v * 95;
    const cross = Math.pow(Math.sin(v * Math.PI), 0.67);
    const gullies = Math.sin(t * 121 + v * 8) * 0.8 + Math.sin(t * 51 - v * 13) * 0.6;
    const y = -0.5 + ridge * cross * (22 + layer * 5) + gullies * cross;
    positions.push(x, y, z);
    if (row < depth && column < across) {
      const a = row * (across + 1) + column, b = a + 1, c = a + across + 1;
      if (side > 0) indices.push(a, b, c, b, c + 1, c);
      else indices.push(a, c, b, b, c, c + 1);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: layer ? '#879fae' : '#8c9b9d', roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Irregular distant coastal ridges beyond the open sea'; group.add(mesh);
}

function fallbackEnvironmentMap(preset) {
  const faces = Array.from({ length: 6 }, (_, index) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d'), gradient = context.createLinearGradient(0, 0, 0, 32);
    gradient.addColorStop(0, index === 3 ? preset.ground : preset.zenith);
    gradient.addColorStop(0.58, preset.horizon); gradient.addColorStop(1, preset.ground);
    context.fillStyle = gradient; context.fillRect(0, 0, 32, 32); return canvas;
  });
  const texture = new THREE.CubeTexture(faces); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}

/** Open coastal landscape. No navigation or DOM state is owned by this asset. */
export async function createCoveEnvironment(scene, {
  renderer, assetBaseUrl, quality = 'balanced', mood: initialMood = 'afternoon', signal, dressing = SHORE_DRESSING,
} = {}) {
  if (!assetBaseUrl) throw new Error('Cove environment requires assetBaseUrl');
  if (!Object.hasOwn(MOODS, initialMood)) throw new Error(`Unknown cove mood: ${initialMood}`);
  signal?.throwIfAborted();
  const group = new THREE.Group(); group.name = 'Sunny Cove / open limestone bay';
  const resources = [], warnings = [], models = {}, maps = {}, mapTargets = [], looseTextures = [];
  const detailSources = [
    { key: 'tree', path: 'library/jacaranda-tree/model.glb' },
    { key: 'bush', path: 'library/shrub-04/model.glb', nodeName: 'shrub_04' },
    ...dressing.models,
  ];
  const detailController = new AbortController();
  const detailState = { status: 'waiting', error: null };
  let resolveDetails, rejectDetails, detailFrame = 0, detailsStarted = false;
  const detailReady = new Promise((resolve, reject) => { resolveDetails = resolve; rejectDetails = reject; });
  // Details are optional: callers can inspect/await failure without an unhandled rejection.
  detailReady.catch(() => {});
  let disposed = false, previous, lastExposure, lastIntensity, sun;
  const fog = new THREE.FogExp2();
  async function loadDetails() {
    detailFrame = 0;
    if (disposed) return;
    detailState.status = 'loading';
    try {
      const results = [];
      // Keep decoding bounded even when more small plants share the composition.
      for (let offset = 0; offset < detailSources.length; offset += 2) {
        results.push(...await Promise.allSettled(detailSources.slice(offset, offset + 2).map(record => loadCoveModel(
          new URL(record.path, assetBaseUrl).href, { signal: detailController.signal, nodeName: record.nodeName }))));
        if (disposed || detailController.signal.aborted || results.some(result => result.status === 'rejected')) break;
      }
      const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      const failure = results.find(result => result.status === 'rejected');
      if (disposed || detailController.signal.aborted || failure) {
        disposeObjects(loaded.flatMap(model => model.roots));
        throw failure?.reason || detailController.signal.reason || new DOMException('Coastal details cancelled', 'AbortError');
      }
      results.forEach((result, index) => {
        models[detailSources[index].key] = result.value;
        resources.push(...result.value.roots);
      });
      prepareBushMaterials(models.bush);
      group.userData.vegetation = createCoastalFoliage(group, models, quality, dressing);
      detailState.status = 'ready'; resolveDetails();
    } catch (error) {
      detailState.status = 'error'; detailState.error = String(error);
      if (!disposed && error.name !== 'AbortError') warnings.push(`Coastal foliage unavailable: ${String(error)}`);
      rejectDetails(error);
    }
  }
  function prepareBushMaterials(bush) {
    for (const part of bush.parts) for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #include <map_fragment>
          float leaf = smoothstep(.80, 1.03, diffuseColor.g / max(.001, diffuseColor.r));
          diffuseColor.rgb *= mix(vec3(1.), vec3(.84, 1.19, .78), leaf);`);
      };
      material.customProgramCacheKey = () => 'sunny-cove-living-coastal-foliage';
      material.alphaToCoverage = true;
    }
  }
  function startDetails() {
    if (disposed || detailsStarted) return detailReady;
    detailsStarted = true;
    // The composition starts this only after boat, dock and core environment resolve.
    // Two frames allow the host to mount and paint before the large tree request.
    detailFrame = requestAnimationFrame(() => {
      if (!disposed) detailFrame = requestAnimationFrame(() => { void loadDetails(); });
    });
    return detailReady;
  }
  const dispose = () => {
    if (disposed) return;
    disposed = true; signal?.removeEventListener('abort', dispose); group.removeFromParent();
    cancelAnimationFrame(detailFrame); detailFrame = 0;
    const cancelled = new DOMException('Coastal details cancelled', 'AbortError');
    detailController.abort(cancelled);
    if (detailState.status === 'waiting' || detailState.status === 'loading') {
      detailState.status = 'error'; detailState.error = String(cancelled); rejectDetails(cancelled);
    }
    if (previous) {
      if (scene.fog === fog) scene.fog = previous.fog;
      if (Object.values(maps).includes(scene.environment)) {
        scene.environment = previous.environment;
        if (scene.environmentIntensity === lastIntensity) scene.environmentIntensity = previous.intensity;
      }
      if (renderer) {
        if (renderer.toneMappingExposure === lastExposure) renderer.toneMappingExposure = previous.exposure;
        if (renderer.shadowMap.type === THREE.PCFSoftShadowMap) renderer.shadowMap.type = previous.shadowType;
        if (renderer.shadowMap.enabled) renderer.shadowMap.enabled = previous.shadows;
      }
    }
    disposeObjects([group, ...resources], { extraTextures: looseTextures });
    mapTargets.forEach(target => target.dispose()); sun?.shadow.dispose();
    group.clear(); resources.length = 0; mapTargets.length = 0; looseTextures.length = 0;
  };
  try {
    const sourceList = [
      { key: 'rock', path: 'library/rock-09/model.glb' },
      { key: 'cliff', path: 'library/rock-face-01/model.glb' },
    ];
    // Decode at most two source models at a time to bound mobile peak memory.
    for (let offset = 0; offset < sourceList.length; offset += 2) {
      const results = await Promise.allSettled(sourceList.slice(offset, offset + 2).map(async record => {
        const model = await loadCoveModel(new URL(record.path, assetBaseUrl).href, { signal, nodeName: record.nodeName });
        resources.push(...model.roots); models[record.key] = model;
      }));
      signal?.throwIfAborted();
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    group.userData.sources = [...sourceList, ...detailSources].map(({ path, nodeName }) => ({ path, nodeName }));
    createSeabed(group, quality);
    createRockyCoast(group, models.cliff.parts[0].material, quality);
    distantHeadland(group, 1, 0); distantHeadland(group, -1, 1);
    const random = randomFrom(63901), rocks = [], cliffs = [];
    for (const model of [models.rock, models.cliff]) for (const part of model.parts)
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
        material.color.set('#fffaf0'); material.roughness = 0.93; material.metalness = 0;
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            float mineral = dot(diffuseColor.rgb, vec3(.299, .587, .114));
            diffuseColor.rgb = mix(diffuseColor.rgb, mineral * vec3(1.08, 1.06, 1.), .65) * 1.35 + vec3(.035);`);
        };
        material.customProgramCacheKey = () => 'sunny-cove-warm-limestone';
      }
    const spanOf = model => Math.max(model.size.x, model.size.z);
    // Individual fallen blocks punctuate the solid bedrock. No repeated stone rows.
    const breaks = [
      [-1, 9.6, 3.2], [-1, 5.2, 2.2], [-1, -5.4, 3.7], [-1, -13.1, 2.9],
      [-1, -23.5, 3.5], [-1, -37, 2.8], [-1, -53, 2.4],
      [1, 8.4, 2.1], [1, -1.8, 3.4], [1, -8.5, 2.5], [1, -21, 3.8], [1, -33.7, 2.8], [1, -51, 2.5],
    ];
    for (const [side, z, span] of breaks) {
      rocks.push({ x: coveShoreX(side, z) + side * .12,
        y: -.46 - random() * .15, z, scale: span / spanOf(models.rock),
        height: 1.25 + random() * .55, yaw: random() * 6.28, leanX: (random() - .5) * .1 });
    }
    // Different-sized scan fragments overlap irregularly; the low backing mesh
    // only closes inland gaps, so photographed fractures remain the silhouette.
    const cliffSites = [
      [-1, 11.8, 3.4], [-1, 7.7, 4.5], [-1, 2.2, 5.8], [-1, -4.8, 6.0],
      [-1, -11.4, 5.1], [-1, -17.6, 4.8], [-1, -24.2, 4.1], [-1, -31.3, 4.7],
      [-1, -39.5, 3.4], [-1, -51.3, 2.8], [-1, -65, 2.4],
      [1, 12.3, 1.7], [1, 5.2, 2.2], [1, -1.8, 2.9], [1, -8.7, 3.7],
      [1, -14.6, 4.1], [1, -21.8, 4.7], [1, -29.2, 5.1], [1, -36.6, 4.1],
      [1, -45.4, 3.5], [1, -58.2, 2.5], [1, -69, 2.0],
    ];
    for (const [side, z, height] of cliffSites) {
      const scale = height / models.cliff.size.y;
      const staggeredZ = z + (random() - .5) * 1.6;
      cliffs.push({ x: coveShoreX(side, staggeredZ) + side * (models.cliff.size.z * scale * .27 + .2 + random() * .55),
        y: -.48 - random() * .38, z: staggeredZ, scale,
        width: .98 + random() * .5, depth: .88 + random() * .42,
        yaw: (side < 0 ? Math.PI / 2 : -Math.PI / 2) + (random() - .5) * 1.25,
        leanX: (random() - .5) * .24, leanZ: side * (.06 + random() * .19) });
    }
    // The shallow foreground anchor is outside the actual cruise path. A low
    // partial exposure, plus submerged neighbours, makes water depth legible.
    for (const [x, z, span, top] of [[1.3, 5.8, 1.25, .13], [1.65, 6.45, .8, -.08],
      [1.0, 6.75, .62, -.20], [-6.7, 8.2, 1.15, -.1], [-4, 9, 1.5, -.23]]) {
      const scale = span / spanOf(models.rock);
      const y = coveFloorHeight(x, z) - .08;
      rocks.push({ x, y, z, scale, height: (top - y) / (models.rock.size.y * scale), yaw: random() * 6.28 });
    }
    group.add(instanceCoveModel(models.rock, rocks, 'Individual fallen shoreline blocks and submerged stones'));
    group.add(instanceCoveModel(models.cliff, cliffs, 'Scanned fractures embedded in the continuous limestone coast'));
    const sky = createSky(); group.add(sky.mesh);
    sun = new THREE.DirectionalLight(); sun.castShadow = true;
    sun.shadow.mapSize.setScalar(quality === 'low' ? 1024 : 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -28;
    sun.shadow.camera.right = sun.shadow.camera.top = 28;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
    sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.025; sun.shadow.radius = 1.6;
    const hemisphere = new THREE.HemisphereLight(), ambient = new THREE.AmbientLight();
    const frontFill = new THREE.DirectionalLight('#ffe8c5', 0.9);
    frontFill.position.set(25, 20, 60); frontFill.target.position.set(-3, 0, -5);
    group.add(sun, sun.target, hemisphere, ambient, frontFill, frontFill.target);
    if (renderer?.isWebGLRenderer) {
      const generator = new THREE.PMREMGenerator(renderer), lightingScene = new THREE.Scene();
      const lightingSky = new THREE.Mesh(sky.mesh.geometry, sky.material); lightingScene.add(lightingSky);
      try {
        for (const [name, preset] of Object.entries(MOODS)) {
          skyPreset(sky, preset);
          const target = generator.fromScene(lightingScene, 0.03, 0.1, 1000);
          mapTargets.push(target); maps[name] = target.texture;
        }
      } finally { generator.dispose(); lightingScene.remove(lightingSky); }
    } else {
      for (const [name, preset] of Object.entries(MOODS)) {
        maps[name] = fallbackEnvironmentMap(preset); looseTextures.push(maps[name]);
      }
    }
    previous = { fog: scene.fog, environment: scene.environment, intensity: scene.environmentIntensity,
      exposure: renderer?.toneMappingExposure, shadows: renderer?.shadowMap.enabled, shadowType: renderer?.shadowMap.type };
    scene.add(group); scene.fog = fog;
    if (renderer) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    const colors = ['fogColor', 'zenith', 'horizon', 'lightColor', 'hemisphere', 'ground', 'frontFillColor'];
    const scalars = ['fogDensity', 'exposure', 'lightIntensity', 'fillIntensity', 'ambientIntensity', 'environmentIntensity', 'cloud', 'moon', 'sunSize', 'sunGlow', 'frontFillIntensity'];
    const current = { ...MOODS[initialMood], direction: new THREE.Vector3().fromArray(MOODS[initialMood].moonDirection).normalize() };
    for (const field of colors) current[field] = new THREE.Color(current[field]);
    let mood = initialMood, elapsed = MOOD_TRANSITION_SECONDS, from, to;
    const apply = progress => {
      for (const field of colors) current[field].lerpColors(from[field], to[field], progress);
      for (const field of scalars) current[field] = THREE.MathUtils.lerp(from[field], to[field], progress);
      current.direction.lerpVectors(from.direction, to.direction, progress).normalize();
      fog.color.copy(current.fogColor); fog.density = current.fogDensity;
      const u = sky.material.uniforms;
      u.uZenith.value.copy(current.zenith); u.uHorizon.value.copy(current.horizon);
      u.uSunColor.value.copy(current.lightColor); u.uSunDirection.value.copy(current.direction);
      u.uCloud.value = current.cloud; u.uNight.value = current.moon; u.uSize.value = current.sunSize; u.uGlow.value = current.sunGlow;
      sun.color.copy(current.lightColor); sun.intensity = current.lightIntensity;
      hemisphere.color.copy(current.hemisphere); hemisphere.groundColor.copy(current.ground); hemisphere.intensity = current.fillIntensity;
      ambient.color.copy(current.hemisphere); ambient.intensity = current.ambientIntensity;
      // Soft sky-side fill reveals the hull and varnish without tinting both
      // sides the sun's orange, and keeps either boat legible at blue hour.
      frontFill.color.copy(current.frontFillColor); frontFill.intensity = current.frontFillIntensity;
      if (progress >= 0.5) scene.environment = maps[mood];
      scene.environmentIntensity = lastIntensity = current.environmentIntensity;
      if (renderer) renderer.toneMappingExposure = lastExposure = current.exposure;
      sun.target.position.set(0, 0, -7); sun.position.copy(sun.target.position).addScaledVector(current.direction, 90);
      sun.target.updateMatrixWorld();
    };
    const setMood = (name, { immediate = false } = {}) => {
      if (!Object.hasOwn(MOODS, name)) throw new Error(`Unknown cove mood: ${name}`);
      const preset = MOODS[name]; if (disposed) return preset;
      mood = name; from = { ...current, direction: current.direction.clone() };
      to = { ...preset, direction: new THREE.Vector3().fromArray(preset.moonDirection).normalize() };
      for (const field of colors) { from[field] = current[field].clone(); to[field] = new THREE.Color(preset[field]); }
      elapsed = immediate ? MOOD_TRANSITION_SECONDS : 0;
      if (immediate) apply(1);
      return preset;
    };
    const update = (dt, time) => {
      if (disposed) return;
      sky.material.uniforms.uTime.value = time;
      if (elapsed < MOOD_TRANSITION_SECONDS) {
        elapsed = Math.min(MOOD_TRANSITION_SECONDS, elapsed + Math.max(0, dt));
        const progress = elapsed / MOOD_TRANSITION_SECONDS; apply(progress * progress * (3 - 2 * progress));
      }
    };
    setMood(initialMood, { immediate: true });
    signal?.addEventListener('abort', dispose, { once: true });
    return { group, sky, lights: { sun, hemisphere, ambient, frontFill }, warnings, update, setMood, dispose,
      detailState, detailReady, startDetails,
      floorHeight: coveFloorHeight, shoreX: coveShoreX,
      get mood() { return mood; }, get preset() { return MOODS[mood]; } };
  } catch (error) { dispose(); throw error; }
}
