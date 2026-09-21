import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

// A second, mirrored scene render supplies the reflection. Small normal changes
// preserve the readable tree/sky silhouettes while breaking up their edges.
export function createWater(scene) {
  const uniforms = {
    tDiffuse: { value: null },
    color: { value: new THREE.Color() },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uBoat: { value: new THREE.Vector4() },
    uDeep: { value: new THREE.Color("#092523") },
    uFog: { value: new THREE.Color("#50666b") },
    uDensity: { value: 0.009 },
    uMoon: { value: new THREE.Vector3(-0.18, 0.34, -0.92).normalize() },
    uLight: { value: new THREE.Color("#bbd5da") },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 768) },
  };
  const water = new Reflector(new THREE.PlaneGeometry(1300, 1300), {
    textureWidth: 1024,
    textureHeight: 768,
    multisample: 0,
    clipBias: 0.003,
    shader: {
      name: "StillMarshWater",
      uniforms,
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vRef; varying vec3 vWorld;
        void main(){vRef=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime,uDensity; uniform vec4 uBoat;
        uniform vec3 uDeep,uFog,uMoon,uLight;uniform vec2 uTexel;
        varying vec4 vRef;varying vec3 vWorld;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        float rip(vec2 p){vec2 f=vec2(uTime*.12,-uTime*.09);return noise(p*1.2+f)+.32*noise(p*3.7-f*1.8);}
        void main(){
          vec2 p=vWorld.xz;vec3 view=normalize(cameraPosition-vWorld);
          float dist=length(cameraPosition-vWorld);
          vec2 grad=vec2(rip(p+vec2(.05,0))-rip(p-vec2(.05,0)),rip(p+vec2(0,.05))-rip(p-vec2(0,.05)))*.38;
          grad+=vec2(sin(p.y*.7+uTime*.9),cos(p.x*.58-uTime*.7))*.011;
          vec2 delta=p-uBoat.xy;
          vec2 fw=vec2(-sin(uBoat.z),-cos(uBoat.z));
          vec2 local=vec2(dot(delta,vec2(-fw.y,fw.x)),dot(delta,fw));
          float hull=length(local/vec2(.72,2.65));
          float hullWave=sin(hull*24.-uTime*2.3)*exp(-abs(hull-1.)*3.);
          grad+=normalize(delta+.0001)*hullWave*.022;
          vec3 n=normalize(vec3(-grad.x,1.,-grad.y));
          float fresnel=.025+.975*pow(1.-max(dot(view,n),0.),4.6);
          vec2 uv=vRef.xy/vRef.w+n.xz*clamp(.52/max(dist,1.),.002,.055);
          uv=clamp(uv,uTexel*2.,1.-uTexel*2.);
          vec3 reflection=texture2D(tDiffuse,uv).rgb*.70;
          reflection+=texture2D(tDiffuse,uv+uTexel*vec2(1.,0.)).rgb*.15;
          reflection+=texture2D(tDiffuse,uv-uTexel*vec2(1.,0.)).rgb*.15;
          vec3 body=uDeep*(.83+noise(p*.10)*.25);
          vec3 col=mix(body,reflection*vec3(.86,.94,.97),.26+fresnel*.69);
          col*=1.-.42*exp(-hull*hull*1.8);
          vec3 halfDir=normalize(uMoon+view);
          float glint=pow(max(dot(n,halfDir),0.),600.);
          col+=uLight*glint*.75;
          float ring=exp(-pow((hull-1.04)*17.,2.))*smoothstep(.51,.76,noise(p*9.+uTime*.1));
          col+=vec3(.21,.27,.24)*ring*clamp(abs(uBoat.w)*.05,0.,.24);
          float fog=1.-exp(-pow(dist*uDensity,2.));
          col=mix(col,uFog,fog*.84);
          gl_FragColor=vec4(col,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  water.name = "Planar scene reflection and fine water ripples";
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  const u = water.material.uniforms;
  const hidden = [];
  const reflect = water.onBeforeRender;
  water.onBeforeRender = function (...args) {
    const old = hidden.map((o) => o.visible);
    hidden.forEach((o) => {
      o.visible = false;
    });
    try {
      reflect.apply(this, args);
    } finally {
      hidden.forEach((o, i) => {
        o.visible = old[i];
      });
    }
  };
  return {
    mesh: water,
    exclude(...objects) {
      hidden.push(...objects.filter(Boolean));
    },
    update(time, boat) {
      u.uTime.value = time;
      u.uBoat.value.set(boat.x, boat.z, boat.heading, boat.speed);
    },
    resize(w, h) {
      const scale = Math.min(0.6, 1024 / Math.max(w, h));
      const rw = Math.max(192, Math.round(w * scale)),
        rh = Math.max(192, Math.round(h * scale));
      water.getRenderTarget().setSize(rw, rh);
      u.uTexel.value.set(1 / rw, 1 / rh);
    },
    setMood(preset) {
      if (preset.waterColor) u.uDeep.value.set(preset.waterColor);
      if (preset.fogColor) u.uFog.value.set(preset.fogColor);
      u.uDensity.value = preset.fogDensity ?? 0.009;
      if (preset.moonDirection)
        u.uMoon.value.fromArray(preset.moonDirection).normalize();
      u.uLight.value.set(preset.name === "dawn" ? "#efca93" : "#bbd5da");
    },
  };
}

export function createWake(scene) {
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
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float strength,across;varying float vA,vSide;varying vec3 vP;
      void main(){vA=strength;vSide=across;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;varying float vA,vSide;varying vec3 vP;
      float hash(vec2 p){return fract(sin(dot(p,vec2(41.3,117.8)))*31415.9);}
      void main(){float edge=sin(vSide*3.14159);float n=hash(floor(vP.xz*12.+uTime*.6));
        float alpha=vA*edge*(.25+.75*smoothstep(.3,.9,n));
        gl_FragColor=vec4(vec3(.24,.35,.32),alpha);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(
      ";#include",
      ";\n#include",
    ),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Persistent drifting wake";
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  let elapsed = 0;
  return {
    mesh,
    reset() {
      trail.length = 0;
      geo.setDrawRange(0, 0);
    },
    update(dt, time, boat) {
      elapsed += dt;
      mat.uniforms.uTime.value = time;
      if (elapsed > 0.055 && Math.abs(boat.speed) > 0.2) {
        elapsed = 0;
        trail.unshift({
          x: boat.x + Math.sin(boat.heading) * 2.55,
          z: boat.z + Math.cos(boat.heading) * 2.55,
          h: boat.heading,
          t: time,
          s: Math.min(Math.abs(boat.speed) / 4, 1),
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
          spread = 0.6 + age * 0.48,
          w = 0.18 + age * 0.1,
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
  };
}
