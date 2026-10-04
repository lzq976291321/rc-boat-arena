import { createMoonwaterViewer, CAMERA_MODES, MOODS } from '../scene-assets/moonwater/index.js';
import { createViewingPage } from '../shared/viewing/page.js';

const page = createViewingPage({
  createViewer: createMoonwaterViewer, moods: MOODS, cameraModes: CAMERA_MODES,
  debugKey: '__SWAMP__', capturePrefix: 'moonwater',
  manifestPath: 'swamp/asset-manifest.json', loadingText: '正在准备水面与林影…',
});
if (import.meta.hot) import.meta.hot.dispose(() => page.dispose());
