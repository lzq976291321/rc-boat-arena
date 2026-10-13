import * as THREE from 'three';

const smooth = THREE.MathUtils.smoothstep;
const mix = THREE.MathUtils.lerp;
const fract = value => value - Math.floor(value);
function noise(value, seed = 0) {
  const i = Math.floor(value), t = value - i, fade = t * t * (3 - 2 * t);
  const hash = n => fract(Math.sin(n * 127.1 + seed * 311.7) * 43758.5453);
  return mix(hash(i), hash(i + 1), fade);
}

/** The two headlands have independent shoulders, inlets and receding silhouettes. */
export function coveShoreX(side, z) {
  const opening = Math.max(0, -z - 7) * (side < 0 ? 0.19 : 0.24);
  const shoulder = Math.exp(-(((z + (side < 0 ? 9 : 22)) / 11) ** 2));
  return side < 0
    ? -12.2 - opening + shoulder * 0.95 - noise(z * 0.095, 3) * 0.65
    : 14.9 + opening - shoulder * 1.1 + noise(z * 0.08, 8) * 0.8;
}

/** Low supporting bedrock stays beneath the exposed scanned cliff fragments. */
export function shoreHeight(radial, z, side) {
  if (radial < 0) return -0.2 + radial * 0.6;
  const shoulder = side < 0
    ? 1.6 + Math.exp(-(((z + 6) / 15) ** 2)) * 1.2
    : 0.65 + Math.exp(-(((z + 25) / 18) ** 2)) * 1.9;
  const ridge = shoulder + (noise(z * 0.12, side + 11) - 0.5) * 0.9;
  const face = 1 - Math.exp(-radial / 3.1);
  const shelves = Math.sin(radial * 2.8 + noise(z * 0.22, 7) * 1.8) * .12;
  const erosion = (noise(z * .55 + radial * .45, 5) - .5) * .42;
  const inland = mix(1, .6, smooth(radial, 9, 35));
  // Broken, low stone shoulders continue behind the scans. Orbit cameras see
  // this surface too, so avoid a smooth green ramp beyond the shoreline lip.
  const rubble = (noise(z * .21 + radial * .47, side + 23) * 1.15
    + noise(z * .51 - radial * .28, 17) * .45 - .3)
    * smooth(radial, 1.2, 3.6) * (1 - smooth(radial, 18, 42));
  return -.28 + face * (ridge * inland + shelves + erosion + rubble);
}

export function createRockyCoast(group, sourceMaterial, quality) {
  const material = sourceMaterial.clone();
  material.name = 'Weathered limestone with world-space mineral texture';
  material.color.set('#e5e6d0'); material.vertexColors = true;
  material.roughness = 0.94; material.metalness = 0;
  // A photographed asset UV atlas is unsuitable for the new cliff surface.
  // Project the licensed base-colour map in world space; geometry supplies the
  // large-scale normals and a modest procedural bump supplies close rock grain.
  material.normalMap = null; material.aoMap = null; material.roughnessMap = null; material.metalnessMap = null;
  for (const texture of Object.values(material)) if (texture?.isTexture) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4; texture.needsUpdate = true;
  }
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vCovePoint; varying vec3 vCoveNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vCovePoint = (modelMatrix * vec4(position, 1.)).xyz;
      vCoveNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = 'varying vec3 vCovePoint; varying vec3 vCoveNormal;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec3 weights = pow(abs(normalize(vCoveNormal)), vec3(5.));
        weights /= max(.001, weights.x + weights.y + weights.z);
        vec3 p = vCovePoint * .24;
        vec3 mineral = texture2D(map, p.yz).rgb * weights.x
          + texture2D(map, p.xz).rgb * weights.y + texture2D(map, p.xy).rgb * weights.z;
        float grey = dot(mineral, vec3(.299, .587, .114));
        mineral = mix(mineral, grey * vec3(1.08, 1.02, .88), .56);
        diffuseColor.rgb *= mix(mineral, vec3(.67, .61, .49), .2);
      #endif`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      vec3 grain = vec3(sin(vCovePoint.y * 23. + vCovePoint.z * 17.),
        sin(vCovePoint.z * 31. - vCovePoint.x * 21.), sin(vCovePoint.x * 29. + vCovePoint.y * 19.));
      normal = normalize(normal + mat3(viewMatrix) * grain * .045);`);
  };
  material.customProgramCacheKey = () => 'sunny-cove-continuous-limestone-v2';
  const meshRecords = [];
  for (const side of [-1, 1]) {
    const positions = [], colors = [], uv = [], indices = [];
    const longitudinal = quality === 'low' ? 160 : 224;
    // Concentrate geometry at the exposed cliff, not across the unseen back slope.
    const radii = [-2.8, -1.6, -.8, -.2, 0, .25, .55, .9, 1.3, 1.8, 2.4, 3.1, 3.9, 4.8, 5.8, 7, 8.5, 10.5, 14, 20, 30, 42];
    for (let row = 0; row <= longitudinal; row++) {
      const z = 22 - row / longitudinal * 112;
      for (let column = 0; column < radii.length; column++) {
        const radial = radii[column];
        const fracture = radial > 0 ? (noise(z * 0.72 + radial * .22, 13) - .5) * .46 : 0;
        const x = coveShoreX(side, z) + side * (radial + fracture);
        const y = shoreHeight(radial, z, side);
        positions.push(x, y, z); uv.push(z * .3, y * .3);
        const cover = smooth(radial, 2.6, 7.5) * smooth(noise(z * .25 + radial * .18, 4), .42, .86);
        // Sparse olive ground cover belongs in pockets; exposed gaps retain the
        // warm limestone palette instead of reading as an untextured lawn.
        const tint = new THREE.Color('#d3d0b8').lerp(new THREE.Color('#7e8260'), cover * .52);
        tint.multiplyScalar(.9 + noise(z * .65 + radial * .32, 15) * .12);
        colors.push(tint.r, tint.g, tint.b);
        if (row < longitudinal && column < radii.length - 1) {
          const a = row * radii.length + column, b = a + 1, c = a + radii.length;
          if (side > 0) indices.push(a, b, c, b, c + 1, c); else indices.push(a, c, b, b, c, c + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = side < 0 ? 'West fractured limestone headland' : 'East broken rock terraces';
    // The hidden inland foundation is a simplified fill, not the visible
    // silhouette. Its long straight shadow cut across the shallow foreground;
    // the scanned outcrops and vegetation supply the real coastal shadows.
    mesh.castShadow = false; mesh.receiveShadow = true; group.add(mesh); meshRecords.push(mesh);
  }
  return meshRecords;
}
