// Metres and seconds. One spectrum drives both the water and hull buoyancy.
const SWELLS = Object.freeze([
  [.36, .9329523, 2.25, .016, 1.16, 0],
  [-.8823529, .4705882, 4.8, .0065, -1.72, 1.3],
  [.9486833, .3162278, 1.14, .009, .72, 2.1],
]);

export function sampleWaterSurface(x, z, time, strength = .48) {
  let height = 0, slopeX = 0, slopeZ = 0;
  for (const [dx, dz, frequency, amplitude, speed, offset] of SWELLS) {
    const phase = (x * dx + z * dz) * frequency + time * speed + offset;
    const slope = Math.cos(phase) * amplitude * frequency;
    height += Math.sin(phase) * amplitude;
    slopeX += dx * slope; slopeZ += dz * slope;
  }
  const scale = Math.max(0, Math.min(1.5, strength)) / .48;
  return { height: height * scale, slopeX: slopeX * scale, slopeZ: slopeZ * scale };
}

const glslFloat = value => Number.isInteger(value) ? `${value}.0` : String(value);
export const waterSurfaceGLSL = `
  vec3 ambientWater(vec2 p, float time) {
    vec3 result = vec3(0.0);
    ${SWELLS.map(([dx, dz, frequency, amplitude, speed, offset]) => `{
      vec2 direction = vec2(${glslFloat(dx)}, ${glslFloat(dz)});
      float phase = dot(p, direction) * ${glslFloat(frequency)} + time * ${glslFloat(speed)} + ${glslFloat(offset)};
      result += vec3(sin(phase) * ${glslFloat(amplitude)}, direction * cos(phase) * ${glslFloat(amplitude * frequency)});
    }`).join('\n')}
    return result;
  }
`;
