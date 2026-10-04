import * as THREE from "three";
import { loadGLTF } from "../../shared/assets/gltf.js";
import { disposeObjects } from "../../shared/rendering/resources.js";

// Measured from this Riva GLB, including every authored node transform:
// world bounds [-683.781,47.759,-164.069] -> [-331.800,130.361,-55.808].
// The narrow pointed end is +X; the broad transom is -X. Preserve the GLB root
// transforms and turn the measured +X bow toward the navigation convention -Z.
export const RIVA_MOUNT = Object.freeze({ forward: "+X", yaw: Math.PI / 2, length: 2.4, draft: 0.11 });

export async function createCoveBoat(scene, url, { signal, length = RIVA_MOUNT.length,
  draft = RIVA_MOUNT.draft * length / RIVA_MOUNT.length } = {}) {
  const gltf = await loadGLTF(url, { signal });
  const group = new THREE.Group(), visual = new THREE.Group(), mount = new THREE.Group();
  const sourceMaterials = new Map();
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    group.removeFromParent();
    disposeObjects([group, ...gltf.scenes]);
    for (const original of sourceMaterials.keys()) original.dispose();
    sourceMaterials.clear();
    group.clear();
  }
  try {
    signal?.throwIfAborted();
    if (!Number.isFinite(length) || length <= 0) throw new TypeError("Boat length must be positive");
    if (!Number.isFinite(draft) || draft < 0 || draft > length * 0.3) throw new TypeError("Boat draft must fit the hull");
    const model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model, true);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.x) || size.x <= 0) throw new Error("Riva model has invalid bounds");
    const scale = length / size.x;
    const centered = new THREE.Group();
    centered.position.set(-center.x, -bounds.min.y, -center.z);
    centered.add(model);
    mount.add(centered);
    mount.scale.setScalar(scale);
    mount.rotation.y = RIVA_MOUNT.yaw;
    // The pale lower hull lies close to the keel; 11 cm draft leaves its boot
    // stripe readable while the keel remains submerged throughout the bob.
    mount.position.y = -draft;
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = object.receiveShadow = true;
      const finish = original => {
        if (!sourceMaterials.has(original)) sourceMaterials.set(original, rivaFinish(original));
        return sourceMaterials.get(original);
      };
      object.material = Array.isArray(object.material) ? object.material.map(finish) : finish(object.material);
    });
    group.name = "Riva Aquarama by Anton Kovalev";
    visual.add(mount); group.add(visual); scene.add(group);
    signal?.addEventListener("abort", dispose, { once: true });
    const dimensions = { length, beam: size.z * scale, height: size.y * scale, draft: -mount.position.y };
    return {
      group, visual, mount, model, dimensions, dispose,
      update(dt, time, boat, pose) {
        if (disposed || !boat) return;
        const t = Number.isFinite(time) ? time : 0;
        const speed = Number.isFinite(boat.speed) ? boat.speed : 0;
        if (pose) {
          group.position.set(boat.x, Number.isFinite(pose.heave) ? pose.heave : 0, boat.z);
          group.rotation.y = boat.heading;
          visual.rotation.x = Number.isFinite(pose.pitch) ? pose.pitch : 0;
          visual.rotation.z = Number.isFinite(pose.roll) ? pose.roll : 0;
          return;
        }
        group.position.set(boat.x, Math.sin(t * 0.82) * 0.012 + Math.sin(t * 1.27 + 1) * 0.005, boat.z);
        group.rotation.y = boat.heading;
        visual.rotation.x = Math.sin(t * 0.76 + 0.6) * 0.007 - speed * 0.01;
        visual.rotation.z = Math.sin(t * 0.91) * 0.012 + Math.max(-0.014, Math.min(0.014, (boat.turnRate ?? 0) * speed * 0.025));
      },
    };
  } catch (error) { dispose(); throw error; }
}

/** Keep the author's UVs, normal map and ORM region boundaries intact. */
function rivaFinish(source) {
  const material = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(material, source);
  material.defines = { STANDARD: '', PHYSICAL: '' };
  for (const texture of Object.values(material)) if (texture?.isTexture) texture.anisotropy = 8;
  material.envMapIntensity = 1.22;
  material.aoMapIntensity = 0.72;
  if (source.name === 'Glass_Blend') {
    material.name = 'Riva / pale curved windshield';
    // This is the separate authored glass mesh, not a colour guess on the hull.
    // A metallic glass map reads black against the sky; use dielectric glass.
    material.metalness = 0; material.roughness = 0.2;
    material.transparent = true; material.depthWrite = false; material.opacity = 0.56;
    material.color.set('#d8eef0'); material.normalScale.multiplyScalar(0.16);
    material.clearcoat = 0.48; material.clearcoatRoughness = 0.1; material.ior = 1.46;
    material.envMapIntensity = 1.05;
  } else {
    material.name = 'Riva / varnished mahogany, chrome and original upholstery';
    material.clearcoat = 0.9; material.clearcoatRoughness = 0.15;
    material.sheen = 0.12; material.sheenColor.set('#d7cbb7'); material.sheenRoughness = 0.7;
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `
        #include <metalnessmap_fragment>
        // Author's blue ORM channel isolates chrome. Warm, red-brown wood in
        // the colour atlas receives varnish; cream/blue leather stays matte.
        float coveMetal = smoothstep(.6, .9, metalnessFactor);
        float coveWood = smoothstep(1.7, 2.5, diffuseColor.r / max(diffuseColor.g, .012))
          * smoothstep(.006, .025, diffuseColor.g) * (1. - coveMetal);
        float coveLeather = (1. - coveWood) * (1. - coveMetal) * smoothstep(.32, .55, roughnessFactor);
        roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor * .74, .19, .36), coveWood);
        roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor * .65, .075, .22), coveMetal);
        roughnessFactor = mix(roughnessFactor, max(roughnessFactor, .49), coveLeather);
      `).replace('#include <lights_physical_fragment>', `
        #include <lights_physical_fragment>
        material.clearcoat *= coveWood;
        material.sheenColor *= coveLeather;
      `);
    };
    material.customProgramCacheKey = () => 'riva-authored-atlas-varnish-v1';
  }
  return material;
}
