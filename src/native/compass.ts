/** Iránytű (eszköz-orientáció) – a terepi fotó irányához. */
let heading: number | null = null;
let started = false;

function onOrientation(e: DeviceOrientationEvent & { webkitCompassHeading?: number }): void {
  if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
  else if (e.absolute && typeof e.alpha === 'number') heading = (360 - e.alpha) % 360;
}

export function startCompass(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
  window.addEventListener('deviceorientation', onOrientation as EventListener);
}

/** Utolsó ismert irány (0 = észak, óramutató szerint), vagy null */
export function currentHeading(): number | null {
  return heading === null ? null : Math.round(heading);
}
