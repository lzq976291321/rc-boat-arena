import * as THREE from 'three';
import { loadSceneryModel, instanceSceneryModel } from './scenery-assets.js';
import { disposeObjects } from '../../shared/rendering/resources.js';
import { inClubClearing } from './shore-vegetation.js';

const MATERIALS = {
  grass: 'assets/library/grass-ground/model.glb',
  slope: 'assets/library/aerial-grass-rock/model.glb',
};

// World-sized UVs keep the scanned ground at a consistent scale across meshes.
function groundUVs(mesh, meters) {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.attributes.position, uv = [], point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    uv.push(point.x / meters, -point.z / meters);
  }
  mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

function terrainMaterial(source, normalStrength = 0.7) {
  const material = source.clone();
  material.vertexColors = true;
  material.color.set('#ffffff');
  material.metalness = 0;
  material.roughness = 1;
  material.normalScale.setScalar(normalStrength);
  for (const value of Object.values(material)) if (value?.isTexture) {
    value.wrapS = value.wrapT = THREE.RepeatWrapping;
    value.anisotropy = 4;
    value.needsUpdate = true;
  }
  return material;
}

function applyGroundMaterial(shore, islet, source) {
  const material = terrainMaterial(source);
  // Preserve the mineral shore edge; grass cover gradually begins uphill.
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float grassCover; varying float vGrassCover;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrassCover = grassCover;');
    shader.fragmentShader = 'varying float vGrassCover;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        diffuseColor *= mix(vec4(1.0), sampledDiffuseColor, vGrassCover);
      #endif`);
  };
  material.customProgramCacheKey = () => 'scanned-shore-grass-v1';
  const meshes = [shore, islet.children[0]];
  for (const mesh of meshes) {
    groundUVs(mesh, 9);
    const count = mesh.geometry.attributes.position.count, cover = [];
    const position = mesh.geometry.attributes.position, colors = mesh.geometry.attributes.color;
    for (let i = 0; i < count; i++) {
      const h = position.getY(i) + (mesh === shore ? 0 : mesh.position.y);
      const grass = THREE.MathUtils.smoothstep(h, 1.1, 4.3);
      cover.push(grass);
      const tint = new THREE.Color('#b5a985').lerp(new THREE.Color('#b6cf9a'), grass);
      const variation = 0.92 + Math.sin(position.getX(i) * 0.033 + position.getZ(i) * 0.025) * 0.07;
      tint.multiplyScalar(variation);
      colors.setXYZ(i, tint.r, tint.g, tint.b);
    }
    colors.needsUpdate = true;
    mesh.geometry.setAttribute('grassCover', new THREE.Float32BufferAttribute(cover, 1));
    mesh.material.dispose();
    mesh.material = material;
  }
}

function mountainRange(layer, source, grassSource) {
  const positions = [], colors = [], uv = [], indices = [];
  const around = 256, radialSteps = 24, phase = layer * 1.73;
  for (let radial = 0; radial <= radialSteps; radial++) {
    const v = radial / radialSteps;
    for (let i = 0; i <= around; i++) {
      const t = i / around * Math.PI * 2;
      const distance = 294 + layer * 160 + v * (235 + layer * 30)
        + Math.sin(t * 3 + phase) * 32 + Math.sin(t * 7 + v * 2) * 14;
      // Different ridge positions and broad valleys break up the old concentric humps.
      const ridgePosition = 0.43 + Math.sin(t * 4 + phase) * 0.12;
      const crossSection = v < ridgePosition ? v / ridgePosition : (1 - v) / (1 - ridgePosition);
      const ridge = Math.pow(Math.sin(Math.max(0, crossSection) * Math.PI / 2), 1.4);
      const peak = 48 + layer * 18 + Math.pow(Math.max(0, Math.sin(t * 3 + phase)), 3) * 40
        + Math.pow(Math.max(0, Math.cos(t * 7 - phase)), 3) * 23;
      const gullies = Math.sin(t * 19 + v * 6 + phase) * 8 + Math.sin(t * 43 - v * 9) * 3;
      const h = 12 + layer * 5 + ridge * (peak + gullies);
      const x = Math.cos(t) * distance, z = Math.sin(t) * distance;
      positions.push(x, h, z);
      uv.push(x / (20 + layer * 8), -z / (20 + layer * 8));
      const rock = THREE.MathUtils.smoothstep(h, 35 + layer * 18, 110 + layer * 22);
      const color = new THREE.Color(['#b6cf9a', '#b7c3ab', '#cbd2cb'][layer])
        .lerp(new THREE.Color('#dad8ca'), rock);
      color.multiplyScalar(0.91 + Math.sin(t * 11 + v * 7) * 0.065);
      colors.push(color.r, color.g, color.b);
      if (radial < radialSteps && i < around) {
        const a = radial * (around + 1) + i, b = a + 1, c = a + around + 1;
        indices.push(a, b, c, b, c + 1, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = terrainMaterial(source, 0.85);
  // The same grass asset and world UVs cross the shore/mountain seam.
  // Keep custom texture uniforms on the material for shared resource disposal.
  material.uniforms = { terrainGrass: { value: grassSource.map } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, material.uniforms);
    shader.vertexShader = 'varying vec3 vTerrainPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainPoint = position;');
    shader.fragmentShader = 'uniform sampler2D terrainGrass; varying vec3 vTerrainPoint;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 grassUv = vTerrainPoint.xz * vec2(1.0, -1.0) / 9.0;
      vec4 grassColor = texture2D(terrainGrass, grassUv);
      vec4 rockColor = texture2D(map, vMapUv);
      diffuseColor *= mix(grassColor, rockColor, smoothstep(38.0, 82.0, vTerrainPoint.y));`);
  };
  material.customProgramCacheKey = () => 'scanned-mountain-grass-transition-v1';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Textured mountain range ${layer + 1}`;
  mesh.receiveShadow = true;
  return mesh;
}

/** Scanned rocks and terrain materials, with one resource owner per racing scene. */
export function buildTerrainAssets({ shore, islet, heightAt, pointAt, random }) {
  const group = new THREE.Group();
  group.name = 'Library terrain and rock formations';
  group.userData.assets = [];
  const ready = (async () => {
    // Load in pairs to keep decoding and peak memory bounded.
    const materialResults = await Promise.allSettled(Object.values(MATERIALS).map(path => loadSceneryModel(path)));
    const materialModels = materialResults.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failure = materialResults.find(r => r.status === 'rejected');
    if (failure) { disposeObjects(materialModels); throw failure.reason; }
    const [grass, slope] = materialModels;
    applyGroundMaterial(shore, islet, grass.children[0].material);
    for (let layer = 0; layer < 3; layer++) group.add(mountainRange(layer, slope.children[0].material, grass.children[0].material));
    group.userData.assets.push(
      { path: MATERIALS.grass, count: 2, role: 'shore and island ground material' },
      { path: MATERIALS.slope, count: 3, role: 'mountain surface material' },
    );
    // The new terrain materials retain the texture objects; preview geometry is unnecessary here.
    disposeObjects(materialModels, { textures: false });

    const rock = await loadSceneryModel('assets/library/rock-09/model.glb');
    const rockPlacements = [];
    for (let i = 0; i < 58; i++) {
      const angle = i / 58 * Math.PI * 2 + (random() - 0.5) * 0.055;
      const { x, z } = pointAt(angle, 1.025 + random() * 0.18);
      if (inClubClearing(x, z)) continue;
      const span = 2.4 + random() * 3.6;
      const height = span * rock.userData.size.y / Math.max(rock.userData.size.x, rock.userData.size.z);
      rockPlacements.push({ x, z, y: heightAt(x, z) - height * 0.22,
        scale: height / rock.userData.size.y, width: 0.85 + random() * 0.35, yaw: random() * Math.PI * 2 });
    }
    for (let sector = 0; sector < 8; sector++) {
      const batch = rockPlacements.filter(p => Math.floor((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2) * 8) % 8 === sector);
      if (batch.length) group.add(instanceSceneryModel(rock, batch, `Scanned shoreline rocks ${sector}`));
    }
    group.userData.assets.push({ path: rock.userData.source, count: rockPlacements.length, sourceSize: rock.userData.size });

    const cliff = await loadSceneryModel('assets/library/rock-face-01/model.glb');
    const cliffs = [];
    for (let i = 0; i < 14; i++) {
      const angle = i / 14 * Math.PI * 2 + 0.16 * Math.sin(i * 2.1);
      const foot = 294 + Math.sin(angle * 3) * 32 + Math.sin(angle * 7) * 14;
      const distance = foot + 18;
      const height = 32 + random() * 17;
      cliffs.push({ x: Math.cos(angle) * distance, z: Math.sin(angle) * distance,
        y: 7 - height * 0.08, scale: height / cliff.userData.size.y,
        width: 1.15 + random() * 0.2, yaw: -angle - Math.PI / 2 });
    }
    for (let i = 0; i < cliffs.length; i += 2) {
      const batch = instanceSceneryModel(cliff, cliffs.slice(i, i + 2), `Scanned mountain escarpment ${i / 2}`);
      // Distant cliffs are outside the moving boat's small shadow map.
      batch.children.forEach(mesh => { mesh.castShadow = false; });
      group.add(batch);
    }
    group.userData.assets.push({ path: cliff.userData.source, count: cliffs.length, sourceSize: cliff.userData.size });
    return group;
  })();
  group.ready = ready;
  return group;
}
