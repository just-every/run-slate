import assert from 'node:assert/strict';

const selector = 'button, summary, input, select, label, .insert-menu, .right, .page-document, .block-content';

// Retain DOM identities, including zero-offset panes. Axe may inject nodes, so
// re-querying a numbered list after its run cannot identify the original panes.
export async function guardCaptureCamera(page, name, analyze) {
  const saved = await page.evaluateHandle(selector => {
    const panes = () => [...document.querySelectorAll('*')].filter(node => {
      const style = getComputedStyle(node);
      return node === document.scrollingElement || node.scrollTop || node.scrollLeft ||
        node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth ||
        /(auto|scroll|hidden)/.test(`${style.overflowX} ${style.overflowY}`);
    }).map(node => ({ node, left: node.scrollLeft, top: node.scrollTop }));
    const saved = { panes };
    saved.read = (baseline = false) => {
      const controls = [...document.querySelectorAll(selector)];
      const geometry = {
        viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
        controls: controls.filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height).map(el => ({ tag: el.tagName, name: el.getAttribute('aria-label') ?? el.textContent?.trim(), box: el.getBoundingClientRect().toJSON(), padding: [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight], background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderColor })),
      };
      if (baseline) {
        // Snapshot restore offsets only after the geometry/style reads above.
        saved.nodes = panes();
        saved.controls = controls;
        saved.x = scrollX;
        saved.y = scrollY;
      }
      return {
        camera: { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio, visualViewport: visualViewport ? { x: visualViewport.pageLeft, y: visualViewport.pageTop, width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null },
        geometry,
        trackedPaneCount: saved.nodes.length,
        controlsRetained: controls.length === saved.controls.length && controls.every((node, index) => node === saved.controls[index]),
        controlChanges: { removed: saved.controls.filter(node => !controls.includes(node)).map(node => ({ tag: node.tagName, name: node.getAttribute('aria-label') ?? node.textContent?.trim() })), added: controls.filter(node => !saved.controls.includes(node)).map(node => ({ tag: node.tagName, name: node.getAttribute('aria-label') ?? node.textContent?.trim() })) },
        missingNodes: saved.nodes.flatMap(({ node }, index) => node.isConnected ? [] : [{ index, tag: node.tagName, id: node.id }]),
        changedScrolls: saved.nodes.flatMap(({ node, left, top }, index) => node.scrollLeft === left && node.scrollTop === top ? [] : [{ index, expected: { left, top }, actual: { left: node.scrollLeft, top: node.scrollTop } }]),
        scrollPanes: saved.nodes.flatMap(({ node }, index) => node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth || node.scrollTop || node.scrollLeft ? [{ index, tag: node.tagName, id: node.id, left: node.scrollLeft, top: node.scrollTop }] : []),
      };
    };
    // Native scrolling can occur between browser protocol calls. Retain the
    // first camera frame beside its restore offsets, never measure it later.
    saved.original = saved.read(true);
    return saved;
  }, selector);
  const read = () => saved.evaluate(saved => saved.read());
  const original = await saved.evaluate(saved => saved.original);
  const integrity = { original };
  const layout = ({ viewport, documentWidth, documentHeight, controls }) => ({ viewport, documentWidth, documentHeight,
    controls: controls.map(({ tag, name, box, padding }) => ({ tag, name, box, padding })) });
  let captureGeometry;
  const unchanged = async stage => {
    const current = await read();
    integrity[stage] = current;
    assert.deepEqual(current.missingNodes, [], `${name}: ${stage} retains every original scroll node`);
    assert.deepEqual(current.controlChanges, { removed: [], added: [] }, `${name}: ${stage} retains original control identities`);
    assert.equal(current.controlsRetained, true, `${name}: ${stage} retains original control order`);
    assert.deepEqual(current.changedScrolls, [], `${name}: ${stage} preserves every original internal scroll position`);
    assert.deepEqual(current.camera, original.camera, `${name}: ${stage} preserves the original screenshot camera`);
    if (captureGeometry) assert.deepEqual(layout(current.geometry), layout(captureGeometry), `${name}: ${stage} geometry matches the measured capture`);
    return current;
  };
  try {
    let axe;
    try {
      axe = await analyze();
      integrity.afterAxe = await read();
    } finally {
      await saved.evaluate(async saved => {
        for (const { node, left, top } of saved.nodes) node.scrollTo({ left, top, behavior: 'instant' });
        window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
    }
    // Real asynchronous application content may finish loading during analysis.
    // Measure that settled content only after restoring the original camera.
    await saved.evaluate((saved, selector) => {
      saved.controls = [...document.querySelectorAll(selector)];
      const known = new Set(saved.nodes.map(({ node }) => node));
      saved.nodes.push(...saved.panes().filter(({ node }) => !known.has(node)));
    }, selector);
    await unchanged('restored');
    captureGeometry = integrity.restored.geometry;
    return { axe, integrity, unchanged, dispose: () => saved.dispose() };
  } catch (cause) {
    await saved.dispose();
    throw cause;
  }
}

export function assertScreenshotCamera(buffer, frame, fullPage, name) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG', `${name}: capture is PNG`);
  const dimensions = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  assert.deepEqual(dimensions, {
    width: Math.ceil(frame.geometry.viewport.width * frame.camera.deviceScaleFactor),
    height: Math.ceil((fullPage ? frame.geometry.documentHeight : frame.geometry.viewport.height) * frame.camera.deviceScaleFactor),
  }, `${name}: screenshot pixels match the measured capture extent`);
  return { ...dimensions, fullPage, origin: fullPage ? { x: 0, y: 0 } : { x: frame.camera.x, y: frame.camera.y } };
}
