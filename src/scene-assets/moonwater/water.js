import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { MOOD_TRANSITION_SECONDS } from "./presets.js";

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
  let disposed = false, lastTime, from, to, elapsed = MOOD_TRANSITION_SECONDS;
  const reflect = water.onBeforeRender;
  water.onBeforeRender = function (...args) {
    if (disposed) return;
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
      if (disposed) return;
      for (const object of objects) if (object && !hidden.includes(object)) hidden.push(object);
    },
    update(time, boat) {
      if (disposed) return;
      const dt = lastTime === undefined ? 0 : Math.max(0, time - lastTime);
      lastTime = time;
      if (elapsed < MOOD_TRANSITION_SECONDS) {
        elapsed = Math.min(MOOD_TRANSITION_SECONDS, elapsed + dt);
        const progress = elapsed / MOOD_TRANSITION_SECONDS;
        const eased = progress * progress * (3 - 2 * progress);
        u.uDeep.value.lerpColors(from.deep, to.deep, eased);
        u.uFog.value.lerpColors(from.fog, to.fog, eased);
        u.uDensity.value = THREE.MathUtils.lerp(from.density, to.density, eased);
        u.uMoon.value.lerpVectors(from.direction, to.direction, eased).normalize();
        u.uLight.value.lerpColors(from.light, to.light, eased);
      }
      u.uTime.value = time;
      if (boat) u.uBoat.value.set(boat.x, boat.z, boat.heading, boat.speed);
    },
    resize(w, h) {
      if (disposed || w <= 0 || h <= 0) return;
      const scale = Math.min(0.6, 1024 / Math.max(w, h));
      const rw = Math.max(192, Math.round(w * scale)),
        rh = Math.max(192, Math.round(h * scale));
      water.getRenderTarget().setSize(rw, rh);
      u.uTexel.value.set(1 / rw, 1 / rh);
    },
    setMood(preset, { immediate = false } = {}) {
      if (disposed) return;
      const firstMood = !to;
      from = {
        deep: u.uDeep.value.clone(), fog: u.uFog.value.clone(),
        density: u.uDensity.value, direction: u.uMoon.value.clone(), light: u.uLight.value.clone(),
      };
      to = {
        deep: preset.waterColor ? new THREE.Color(preset.waterColor) : from.deep.clone(),
        fog: preset.fogColor ? new THREE.Color(preset.fogColor) : from.fog.clone(),
        density: preset.fogDensity ?? 0.009,
        direction: preset.moonDirection ? new THREE.Vector3().fromArray(preset.moonDirection).normalize() : from.direction.clone(),
        light: new THREE.Color(preset.lightColor ?? "#bbd5da"),
      };
      elapsed = immediate || firstMood ? MOOD_TRANSITION_SECONDS : 0;
      if (immediate || firstMood) {
        u.uDeep.value.copy(to.deep);
        u.uFog.value.copy(to.fog);
        u.uDensity.value = to.density;
        u.uMoon.value.copy(to.direction);
        u.uLight.value.copy(to.light);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      water.removeFromParent();
      hidden.length = 0;
      water.geometry.dispose();
      // Reflector owns a render target in addition to its shader material.
      water.dispose();
    },
  };
}

export { createWake } from '../../shared/viewing/wake.js';
