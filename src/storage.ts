/** Tiny storage adapter (later swappable for a portal SDK data module). */
const KEY = 'shardsling.best';
export function loadBest(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}
export function saveBest(v: number): void {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* storage may be blocked in iframes */
  }
}
