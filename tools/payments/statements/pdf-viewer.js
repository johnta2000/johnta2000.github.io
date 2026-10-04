/* Self-hosted PDF.js keeps the document readable without a browser PDF plugin. */
window.StatementPdf = (() => {
  const base = new URL('./vendor/pdfjs/', document.currentScript.src).href;
  const $ = id => document.getElementById(id);
  let documentPdf = null, pageNumber = 1, zoom = 1, sequence = 0, task = null;
  async function show(page = pageNumber) {
    if (!documentPdf) return;
    pageNumber = Math.max(1, Math.min(documentPdf.numPages, page));
    const current = ++sequence;
    if (task) { task.cancel(); task = null; }
    $('pdf-controls').hidden = false; $('pdf-viewport').hidden = false;
    $('pdf-prev').disabled = pageNumber === 1; $('pdf-next').disabled = pageNumber === documentPdf.numPages;
    $('pdf-zoom-out').disabled = zoom <= 1; $('pdf-zoom-in').disabled = zoom >= 3;
    $('pdf-counter').textContent = `${pageNumber} / ${documentPdf.numPages} · ${Math.round(zoom * 100)}%`;
    const pdfPage = await documentPdf.getPage(pageNumber);
    if (current !== sequence) return;
    const canvas = $('pdf-canvas'), natural = pdfPage.getViewport({ scale: 1 });
    const width = Math.max(240, $('pdf-viewport').clientWidth - 2) * zoom;
    const viewport = pdfPage.getViewport({ scale: width / natural.width });
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(viewport.width * density); canvas.height = Math.ceil(viewport.height * density);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('aria-label', `Original statement, page ${pageNumber} of ${documentPdf.numPages}`);
    task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [density, 0, 0, density, 0, 0] });
    try { await task.promise; } catch (e) { if (e.name !== 'RenderingCancelledException') throw e; }
    if (current === sequence) task = null;
  }
  async function move(page) { try { await show(page); } catch { $('pdf-status').textContent = 'Could not render this page. Try reopening the statement or use the full PDF.'; } }
  $('pdf-prev').onclick = () => move(pageNumber - 1);
  $('pdf-next').onclick = () => move(pageNumber + 1);
  $('pdf-zoom-out').onclick = () => { zoom = Math.max(1, zoom - .5); move(); };
  $('pdf-zoom-in').onclick = () => { zoom = Math.min(3, zoom + .5); move(); };
  return {
    async load(bytes) {
      const pdfjs = await import(base + 'pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
      documentPdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/', isEvalSupported: false }).promise;
    },
    show,
    reset() { ++sequence; if (task) task.cancel(); task = null; documentPdf?.destroy(); documentPdf = null; $('pdf-controls').hidden = true; $('pdf-viewport').hidden = true; $('pdf-canvas').width = 0; },
  };
})();
