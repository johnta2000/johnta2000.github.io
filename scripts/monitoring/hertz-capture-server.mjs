// Local handoff from the supported browser tool to the deterministic importer.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseBrowserSnapshot } from './hertz-snapshot.mjs';
const output = resolve(process.argv[2] || '/tmp/hertz-browser-snapshot.json');
const token = randomUUID();
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  if (req.headers.host !== '127.0.0.1:4187') { res.writeHead(403); res.end('Forbidden host'); return; }
  if (req.method === 'GET' && req.url === '/') {
    res.end(`<h1>Save Hertz browser evidence</h1><p>This local form saves the rendered snapshot for validation and publication.</p><form method="post" action="/capture"><input type="hidden" name="token" value="${token}"><label for="snapshot">Browser snapshot JSON</label><br><textarea id="snapshot" name="snapshot" rows="12" cols="80" required></textarea><br><button>Save snapshot</button></form>`);
    return;
  }
  if (req.method !== 'POST' || req.url !== '/capture' || req.headers.origin !== 'http://127.0.0.1:4187') { res.writeHead(403); res.end('Forbidden request'); return; }
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 1_000_000) throw new Error('Snapshot too large'); }
    const form = new URLSearchParams(body);
    if (form.get('token') !== token) throw new Error('Invalid local form token');
    const snapshot = JSON.parse(form.get('snapshot'));
    let parsed, validationError;
    try { parsed = parseBrowserSnapshot(snapshot); } catch (error) { validationError = error.message; }
    await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    res.end(`<h1>Snapshot saved</h1><p>${parsed ? `${parsed.cards.length} rendered cards validated. Ready to publish.` : 'Validation failed. Publish this attempt to record the failure; no new price will be accepted.'}</p>`);
    console.log(JSON.stringify({ saved: output, cards: parsed?.cards.length ?? 0, validationError, capturedAt: snapshot.capturedAt }));
  } catch (error) {
    res.writeHead(400);
    res.end('Snapshot rejected. See the terminal for details.');
    console.error(error.message);
  }
});
server.listen(4187, '127.0.0.1', () => console.log('Local capture form: http://127.0.0.1:4187/'));
