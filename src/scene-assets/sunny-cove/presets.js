// Complete sky, illumination and water palettes for the open coastal cove.
export const MOODS = {
  afternoon: {
    name: 'afternoon', label: '晴湾午后', time: '15:36', weather: '晴朗 · 轻风',
    zenith: '#246faa', horizon: '#8ebdd1', fogColor: '#a9c7d8', fogDensity: 0.0011,
    waterColor: '#247e85', shallowColor: '#6cbeb0', deepColor: '#105267',
    exposure: 1.03, lightColor: '#ffd6a3', lightIntensity: 4.3,
    moonDirection: [-0.34, 0.16, -0.93], hemisphere: '#b8d5e9', ground: '#566049',
    fillIntensity: 0.74, ambientIntensity: 0.025, environmentIntensity: 0.61,
    frontFillColor: '#dceaf1', frontFillIntensity: 1.28,
    moon: 0, cloud: 0.18, sunSize: 0.008, sunGlow: 0.6,
    waterClarity: 0.8, waveStrength: 0.48,
  },
  sunset: {
    name: 'sunset', label: '落日金湾', time: '18:18', weather: '薄云 · 微风',
    zenith: '#7296bb', horizon: '#edbd95', fogColor: '#d6b5a0', fogDensity: 0.0034,
    waterColor: '#467f86', shallowColor: '#91b8a0', deepColor: '#284e67',
    exposure: 1.02, lightColor: '#ffc98c', lightIntensity: 3.15,
    moonDirection: [-0.48, 0.09, -0.85], hemisphere: '#bfd1e0', ground: '#806b53',
    fillIntensity: 0.65, ambientIntensity: 0.035, environmentIntensity: 0.58,
    frontFillColor: '#e9dace', frontFillIntensity: 0.74,
    moon: 0, cloud: 0.24, sunSize: 0.009, sunGlow: 0.8,
    waterClarity: 0.73, waveStrength: 0.4,
  },
  bluehour: {
    name: 'bluehour', label: '蓝调暮色', time: '19:04', weather: '晚风 · 静湾',
    zenith: '#263a66', horizon: '#a3a1b8', fogColor: '#889bad', fogDensity: 0.004,
    waterColor: '#355d76', shallowColor: '#688e9c', deepColor: '#182d49',
    exposure: 1.12, lightColor: '#bacbff', lightIntensity: 0.9,
    moonDirection: [-0.38, 0.28, -0.88], hemisphere: '#91add5', ground: '#3e4757',
    fillIntensity: 0.78, ambientIntensity: 0.065, environmentIntensity: 0.54,
    frontFillColor: '#bed2f2', frontFillIntensity: 0.48,
    moon: 0.8, cloud: 0.16, sunSize: 0.006, sunGlow: 0.035,
    waterClarity: 0.66, waveStrength: 0.33,
  },
};

export const MOOD_TRANSITION_SECONDS = 3.2;
