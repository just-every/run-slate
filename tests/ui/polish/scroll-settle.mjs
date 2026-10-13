const settleTimeoutMs = 10_000;
const stableFrames = 8;

// A capture taken while a smooth scroll or a finite animation is still running is
// half-scrolled or blurred, and differs from the next capture of the same page.
// Wait until every scroll offset and every running finite animation stops moving for
// consecutive frames before anything is measured or photographed.
export async function waitForScrollSettled(page) {
  const settled = await page.waitForFunction(({ stableFrames }) => {
    const state = window.__slateSettle ??= { frames: 0, last: '' };
    const nodes = [...document.querySelectorAll('*')].filter(node => node.scrollTop || node.scrollLeft);
    const offsets = [`${scrollX},${scrollY}`, ...nodes.map(node => `${node.scrollLeft},${node.scrollTop}`)].join('|');
    const running = document.getAnimations().some(animation => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime));
    state.frames = !running && offsets === state.last ? state.frames + 1 : 0;
    state.last = offsets;
    if (state.frames < stableFrames) return false;
    delete window.__slateSettle;
    return true;
  }, { stableFrames }, { polling: 'raf', timeout: settleTimeoutMs });
  await settled.dispose();
}
