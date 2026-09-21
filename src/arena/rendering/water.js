import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { WORLD } from '../gameplay/config.js';
import { SUN_DIR } from './environment.js';

// A clipped, half-resolution scene reflection. The large waves use the same
// equation as physics.js; finer ripples only change the surface normal.
const vertexShader = /* glsl */`
  uniform float uTime, uPlaneHeight;
  uniform mat4 textureMatrix;
  varying vec3 vWorld;
  varying vec4 vReflection;
  #include <common>
  #include <shadowmap_pars_vertex>
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec2 p = worldPosition.xz;
    worldPosition.y = 0.34 * sin(p.x * 0.052 + uTime * 1.30)
                    + 0.24 * sin(p.y * 0.068 - uTime * 1.02)
                    + 0.13 * sin((p.x + p.y) * 0.121 + uTime * 2.05);
    vWorld = worldPosition.xyz;
    vReflection = textureMatrix * vec4(position.xy, worldPosition.y - uPlaneHeight, 1.0);
    vec3 transformedNormal = normalMatrix * normal;
    #include <shadowmap_vertex>
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uTime, uA, uB;
  uniform vec3 uDeep, uShallow, uSun, uFogColor;
  uniform vec4 uBoat;
  uniform vec2 uTexel, uFogRange;
  varying vec3 vWorld;
  varying vec4 vReflection;
  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
  }
  float ripple(vec2 p) {
    vec2 drift = vec2(uTime * 0.20, -uTime * 0.13);
    vec2 warp = vec2(noise(p * 0.22 + drift), noise(p * 0.18 - drift));
    return noise(p * vec2(1.4, 0.8) + drift + warp * 1.6)
         + 0.36 * noise(p * vec2(3.6, 4.2) - drift * 1.5 + warp);
  }
  void main() {
    vec2 p = vWorld.xz;
    float distanceToEye = length(cameraPosition - vWorld);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec2 grad = vec2(
      0.34 * 0.052 * cos(p.x * 0.052 + uTime * 1.30),
      0.24 * 0.068 * cos(p.y * 0.068 - uTime * 1.02));
    grad += 0.13 * 0.121 * cos((p.x + p.y) * 0.121 + uTime * 2.05);
    vec2 fine = vec2(ripple(p + vec2(.065,0)) - ripple(p - vec2(.065,0)),
                     ripple(p + vec2(0,.065)) - ripple(p - vec2(0,.065)));
    grad += fine * mix(.30, .045, smoothstep(25.0,180.0,distanceToEye));

    // A shallow hull displacement wave anchors the boat without a glowing ring.
    vec2 delta = p - uBoat.xy;
    vec2 forward = vec2(sin(uBoat.z),cos(uBoat.z));
    vec2 local = vec2(dot(delta,vec2(forward.y,-forward.x)),dot(delta,forward));
    float hullRadius = length(local / vec2(0.83,2.30));
    float hullFalloff = exp(-max(0.0,hullRadius-1.0)*2.3);
    float hullRipple = sin(hullRadius * 17.0 - uTime * 2.7) * hullFalloff;
    grad += normalize(delta + vec2(.0001)) * hullRipple * .018;
    vec3 n = normalize(vec3(-grad.x,1.0,-grad.y));
    float fresnel = .035 + .965 * pow(1.0-clamp(dot(n,viewDir),0.0,1.0),4.5);

    float theta = atan(p.y/uB,p.x/uA);
    float wobble = 1.0 + .035*sin(theta*3.0+.7) + .02*sin(theta*7.0);
    float shore = length(p / vec2(uA,uB)) / wobble;
    float islet = 1.0-smoothstep(27.0,43.0,length(p-vec2(0,-4)));
    float shallow = max(smoothstep(.78,1.0,shore),islet);
    vec3 body = mix(uDeep,uShallow,shallow * .88);
    body *= .87 + .17 * noise(p * .055) + .10 * max(dot(n,uSun),0.0);

    vec2 reflectionUV = vReflection.xy / vReflection.w;
    // Scale distortion with distance so the boat reflection stays attached.
    float distortion = clamp(1.4 / max(distanceToEye,1.0),.006,.11);
    reflectionUV += n.xz * distortion;
    reflectionUV = clamp(reflectionUV,uTexel * 2.0,1.0-uTexel * 2.0);
    vec2 blur = uTexel * mix(.6,1.8,smoothstep(8.0,80.0,distanceToEye));
    vec3 reflected = texture2D(tDiffuse,reflectionUV).rgb * .5;
    reflected += texture2D(tDiffuse,reflectionUV+vec2(blur.x,0)).rgb * .125;
    reflected += texture2D(tDiffuse,reflectionUV-vec2(blur.x,0)).rgb * .125;
    reflected += texture2D(tDiffuse,reflectionUV+vec2(0,blur.y)).rgb * .125;
    reflected += texture2D(tDiffuse,reflectionUV-vec2(0,blur.y)).rgb * .125;
    vec3 col = mix(body,reflected * vec3(.88,.96,1.0),.16+fresnel*.78);

    float shadow = getShadowMask();
    // Contact darkening falls away within one hull width, never an opaque decal.
    float contact = exp(-pow(hullRadius * 1.06,3.0));
    col *= (1.0-contact*.36) * mix(.73,1.0,shadow);
    vec3 halfVector = normalize(uSun + viewDir);
    float sun = pow(max(dot(n,halfVector),0.0),260.0);
    col += vec3(1.0,.80,.52) * sun * 1.6 * shadow;

    float grain = noise(p * 4.5 + vec2(uTime * .16,-uTime * .12));
    float edgeFoam = (1.0-smoothstep(.002,.013,abs(shore-.997))) * smoothstep(.48,.76,grain);
    float bowFoam = exp(-pow((hullRadius-1.07)*14.0,2.0)) * smoothstep(.48,.85,grain);
    bowFoam *= .05 + min(uBoat.w/35.0,.5) * smoothstep(-1.0,1.5,local.y);
    col = mix(col,vec3(.60,.77,.72),clamp(edgeFoam*.22+bowFoam,0.0,.5));
    col = mix(col,uFogColor,smoothstep(uFogRange.x,uFogRange.y,distanceToEye)*.85);
    gl_FragColor = vec4(col,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildWater(scene) {
  const mesh = new Reflector(new THREE.PlaneGeometry(760,760,160,160), {
    textureWidth: 768, textureHeight: 512, multisample: 0, clipBias: .001,
    shader: {
      name: 'PineLakeWater', vertexShader, fragmentShader,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
        tDiffuse: { value: null }, color: { value: new THREE.Color() },
        textureMatrix: { value: new THREE.Matrix4() },
        uTime: { value: 0 }, uPlaneHeight: { value: 0 },
        uA: { value: WORLD.lakeA }, uB: { value: WORLD.lakeB },
        uDeep: { value: new THREE.Color('#07515a') },
        uShallow: { value: new THREE.Color('#479987') },
        uSun: { value: SUN_DIR.clone() },
        uFogColor: { value: new THREE.Color('#b8ceca') },
        uBoat: { value: new THREE.Vector4() },
        uTexel: { value: new THREE.Vector2(1/768,1/512) },
        uFogRange: { value: new THREE.Vector2(330,1050) },
      }]),
    },
  });
  mesh.name = 'Pine Lake · planar reflection';
  mesh.rotation.x = -Math.PI/2;
  mesh.receiveShadow = true;
  mesh.material.lights = true;
  mesh.material.needsUpdate = true;
  const reflect = mesh.onBeforeRender;
  const excluded = [];
  mesh.onBeforeRender = function(renderer, renderScene, camera) {
    // Wake, droplets and transparent guide graphics must not double in the mirror.
    const visibility = excluded.map(object => object.visible);
    excluded.forEach(object => { object.visible = false; });
    try { reflect.call(mesh,renderer,renderScene,camera); }
    finally { excluded.forEach((object,i) => { object.visible = visibility[i]; }); }
  };
  scene.add(mesh);
  const resize = (width,height) => {
    const scale = Math.min(.5,1024/Math.max(width,height));
    const w = Math.max(192,Math.round(width*scale));
    const h = Math.max(192,Math.round(height*scale));
    mesh.getRenderTarget().setSize(w,h);
    mesh.material.uniforms.uTexel.value.set(1/w,1/h);
  };
  return {
    mesh, material: mesh.material, resize,
    excludeFromReflection(...objects) { excluded.push(...objects); },
    update(boat) {
      mesh.material.uniforms.uBoat.value.set(boat.x,boat.z,boat.heading,boat.speed);
      // Move only the reflection plane with the local waterline; the visible
      // water vertices remain at the physics wave height everywhere in the lake.
      mesh.position.y = boat.bob;
      mesh.material.uniforms.uPlaneHeight.value = boat.bob;
      if (scene.fog) {
        mesh.material.uniforms.uFogColor.value.copy(scene.fog.color);
        mesh.material.uniforms.uFogRange.value.set(scene.fog.near,scene.fog.far);
      }
    },
  };
}
