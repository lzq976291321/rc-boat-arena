import * as THREE from "three";

// Each consumer owns its trail; geometry and material are released together.
export function createWake(scene, {
  sternOffset = 2.55, halfWidth = 0.6, spreadRate = 0.48,
  ribbonWidth = 0.18, speedScale = 4, color = [0.24, 0.35, 0.32],
} = {}) {
  const capacity = 180,
    trail = [];
  const positions = new Float32Array(capacity * 4 * 3),
    strength = new Float32Array(capacity * 4),
    across = new Float32Array(capacity * 4);
  const indices = [];
  for (let i = 0; i < capacity - 1; i++)
    for (let side = 0; side < 2; side++) {
      const a = i * 4 + side * 2,
        b = a + 1,
        c = a + 4,
        d = a + 5;
      indices.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("strength", new THREE.BufferAttribute(strength, 1));
  geo.setAttribute("across", new THREE.BufferAttribute(across, 1));
  geo.setIndex(indices);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color().setRGB(...color) } },
    vertexShader: `attribute float strength,across;varying float vA,vSide;varying vec3 vP;
      void main(){vA=strength;vSide=across;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;uniform vec3 uColor;varying float vA,vSide;varying vec3 vP;
      float hash(vec2 p){return fract(sin(dot(p,vec2(41.3,117.8)))*31415.9);}
      void main(){float edge=sin(vSide*3.14159);float n=hash(floor(vP.xz*12.+uTime*.6));
        float alpha=vA*edge*(.25+.75*smoothstep(.3,.9,n));
        gl_FragColor=vec4(uColor,alpha);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(
      ";#include",
      ";\n#include",
    ),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Persistent drifting wake";
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  geo.setDrawRange(0, 0);
  scene.add(mesh);
  let elapsed = 0, disposed = false;
  return {
    mesh,
    reset() {
      if (disposed) return;
      elapsed = 0;
      trail.length = 0;
      geo.setDrawRange(0, 0);
    },
    update(dt, time, boat) {
      if (disposed || !boat) return;
      elapsed += dt;
      mat.uniforms.uTime.value = time;
      if (elapsed > 0.055 && Math.abs(boat.speed) > 0.2) {
        elapsed = 0;
        trail.unshift({
          x: boat.x + Math.sin(boat.heading) * sternOffset,
          z: boat.z + Math.cos(boat.heading) * sternOffset,
          h: boat.heading,
          t: time,
          s: Math.min(Math.abs(boat.speed) / speedScale, 1),
        });
      }
      while (
        trail.length > capacity ||
        (trail.length && time - trail.at(-1).t > 9)
      )
        trail.pop();
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i],
          age = time - p.t,
          spread = halfWidth + age * spreadRate,
          w = ribbonWidth + age * 0.1,
          fade = (1 - age / 9) ** 2 * p.s * 0.32;
        for (let side = 0; side < 2; side++)
          for (let edge = 0; edge < 2; edge++) {
            const n = i * 4 + side * 2 + edge,
              offset = (side === 0 ? -1 : 1) * (spread + (edge - 0.5) * w);
            positions[n * 3] = p.x + Math.cos(p.h) * offset;
            positions[n * 3 + 1] = 0.015 + Math.sin(age * 2 + p.x) * 0.004;
            positions[n * 3 + 2] = p.z - Math.sin(p.h) * offset;
            strength[n] = fade;
            across[n] = edge;
          }
      }
      geo.attributes.position.needsUpdate =
        geo.attributes.strength.needsUpdate = true;
      geo.attributes.across.needsUpdate = true;
      geo.setDrawRange(0, Math.max(0, trail.length - 1) * 12);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      trail.length = 0;
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
