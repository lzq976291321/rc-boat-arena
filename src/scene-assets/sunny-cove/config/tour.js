// Metres / seconds. The curated coastline and camera corridor are one layout.
// Change them together; this is not an arbitrary route or dock editor.
export const COVE_TOUR = Object.freeze({
  dock: Object.freeze({ position: Object.freeze([-7, 0, .25]), rotation: 0 }),
  navigation: Object.freeze({ travelDuration: 90, dwellDuration: 18, startProgress: .2 }),
  camera: Object.freeze({ holdDuration: 20, transitionDuration: 12 }),
  changeoverDwell: 4,
});

/** Align an authored route to the dock's actual world berth and bow direction. */
export function routeAtBerth(route, { position, heading }) {
  if (![position?.x, position?.z, heading].every(Number.isFinite))
    throw new TypeError('A finite berth position and heading are required');
  const [origin, handle] = route[0];
  const authoredHeading = Math.atan2(-(handle[0] - origin[0]), -(handle[1] - origin[1]));
  const angle = heading - authoredHeading, cos = Math.cos(angle), sin = Math.sin(angle);
  return route.map(segment => segment.map(([x, z]) => {
    const dx = x - origin[0], dz = z - origin[1];
    return [position.x + dx * cos + dz * sin, position.z - dx * sin + dz * cos];
  }));
}
