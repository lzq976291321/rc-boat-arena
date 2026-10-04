import { WAKE_CAPACITY, WAKE_LIFETIME } from './trail.js';

export const hullUniformsGLSL = `
  uniform vec4 uContactHull;
  uniform vec3 uContactSize;
  uniform float uContactEnabled;
`;

export const hullSurfaceGLSL = `
  vec2 hullCoordinates(vec2 p) {
    vec2 delta = p - uContactHull.xy;
    vec2 forward = vec2(-sin(uContactHull.z), -cos(uContactHull.z));
    return vec2(dot(delta, vec2(-forward.y, forward.x)), dot(delta, forward));
  }
  float hullDisplacement(vec2 p) {
    vec2 local = hullCoordinates(p);
    float speed = min(abs(uContactHull.w) / .85, 1.);
    float bow = exp(-pow((local.y - uContactSize.x * .43) / .22, 2.));
    float side = exp(-pow(local.x / (uContactSize.y * .44), 2.));
    float behindBow=uContactSize.x*.48-local.y;
    float wingDistance=abs(local.x)-(.055+max(behindBow,0.)*.33);
    float wingWidth=.085+max(behindBow,0.)*.018;
    float wingEnvelope=smoothstep(-.08,.16,behindBow)*(1.-smoothstep(uContactSize.x*.9,uContactSize.x*1.7,behindBow));
    float wing=exp(-pow(wingDistance/wingWidth,2.))*wingEnvelope;
    return (bow*side*.018+wing*.020)*speed*uContactEnabled;
  }
`;

// Returns world XZ slopes, foam and aerated water. The caller shades these with
// its own reflection/refraction/light, so the wake never becomes a flat decal.
export const boatContactGLSL = `
  uniform vec4 uWakePoints[${WAKE_CAPACITY}];
  uniform vec4 uWakeBounds;
  uniform float uWakeCount;
  float contactNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    vec4 h = fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),
      dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+1.,vec2(127.1,311.7))))*43758.5453);
    return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
  }
  vec4 boatContact(vec2 p, float time, float footprint) {
    if (uContactEnabled < .5) return vec4(0.);
    vec2 local = hullCoordinates(p);
    vec2 forward = vec2(-sin(uContactHull.z), -cos(uContactHull.z));
    vec2 right = vec2(-forward.y, forward.x);
    float speed = min(abs(uContactHull.w)/.85, 1.);
    float halfLength = uContactSize.x*.5;
    float halfBeam = uContactSize.y*.5;
    // Narrow bow and broad transom follow the measured Riva waterline.
    float alongHull = clamp((local.y+halfLength)/(2.*halfLength),0.,1.);
    float waterline = halfBeam*mix(.79,1.,smoothstep(0.,.35,alongHull))
      * sqrt(max(.006,1.-pow(smoothstep(.58,1.02,alongHull),2.)));
    float sideDistance = abs(local.x)-waterline;
    float longitudinal = smoothstep(-halfLength-.10,-halfLength+.08,local.y)
      * (1.-smoothstep(halfLength*.88,halfLength+.12,local.y));
    float crest = exp(-pow((sideDistance-.032)/.07,2.))*longitudinal;
    float wave = sin(sideDistance*31.-time*2.4)*exp(-max(sideDistance,0.)*5.)
      * smoothstep(-.015,.02,sideDistance)*longitudinal;
    float bowBias = .32+.68*smoothstep(-.5,.9,local.y/halfLength);
    vec2 gradient = right*sign(local.x)*(crest*.065+wave*.022)*(.22+.78*speed)*bowBias;
    float foamDetail = 1.-smoothstep(.008,.03,footprint);
    float cells = contactNoise(p*92.+vec2(time*.08,-time*.06))*.7+contactNoise(p*177.)*.3;
    float flecks=mix(.10,smoothstep(.48,.76,cells),foamDetail);
    float foam = crest*flecks*speed*.075;
    if (uWakeCount < 2. || p.x < uWakeBounds.x || p.y < uWakeBounds.y || p.x > uWakeBounds.z || p.y > uWakeBounds.w)
      return vec4(gradient,foam,0.);
    // Locate the closest segment in a bounded history of actual stern positions.
    float best = 1e6, age = 0., energy = 0.;
    vec2 direction = vec2(1.,0.);
    for (int i=0;i<${WAKE_CAPACITY - 1};i++) {
      if (float(i+1)>=uWakeCount) break;
      vec4 a=uWakePoints[i], b=uWakePoints[i+1];
      vec2 segment=b.xy-a.xy;
      float length2=dot(segment,segment);
      float t=clamp(dot(p-a.xy,segment)/max(length2,.0001),0.,1.);
      vec2 delta=p-mix(a.xy,b.xy,t);
      float distance2=dot(delta,delta);
      if(distance2<best) {
        best=distance2; age=mix(a.z,b.z,t); energy=mix(a.w,b.w,t);
        direction=delta/max(sqrt(distance2),.001);
      }
    }
    float distance=sqrt(best);
    float fade=pow(max(0.,1.-age/${WAKE_LIFETIME}.),2.)*energy;
    float onset=smoothstep(0.,.65,age);
    float spread=halfBeam*.67+age*.17;
    float width=.075+age*.017;
    float crestDistance=distance-spread;
    float outer=exp(-pow(crestDistance/width,2.));
    float ripple=sin(crestDistance*22.-age*2.2)*exp(-abs(crestDistance)*2.8);
    float filtering=1.-smoothstep(.035,.18,footprint);
    float crestSlope=-2.*crestDistance/(width*width)*outer*.015;
    gradient+=direction*(crestSlope+ripple*.035)*fade*onset*filtering;
    float churn=exp(-pow(distance/(.14+age*.035),2.))*fade;
    foam+=outer*fade*onset*flecks*.095;
    foam+=churn*flecks*.08;
    return vec4(gradient,clamp(foam,0.,.16),churn*.18);
  }
`;
