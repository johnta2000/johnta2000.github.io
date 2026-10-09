const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.join(__dirname, '..');
const routes = ['login', 'tools/payments', 'tools/payment/questions', 'tools/payments/statements', 'tools/rent', 'tools/1on1s', 'tools/monitoring', 'tools/sleep', 'tools/standups', 'tools/rally', 'tools/tranquil-connect', 'lost-lands-2026-lineup', 'war-room-10012026'];

async function open(browser, route, viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__internal_ClerkUICtor = {};
    window.Clerk = {
      session: null, user: null, isSignedIn: false, addListener() {}, unmountSignIn(node) { node.replaceChildren(); },
      async load(options) {
        if (!options?.ui?.ClerkUI) throw new Error('Missing Clerk UI constructor');
      },
      mountSignIn(node) {
        // Clerk replaces the mount classes and supplies fixed-width defaults.
        node.className = 'cl-rootBox cl-signIn-root';
        const style = document.createElement('style');
        style.textContent = '.cl-rootBox,.cl-cardBox{width:400px}.cl-cardBox{overflow:hidden}.cl-card{display:flex;flex-direction:column;gap:32px;padding:32px;margin:-1px;box-shadow:0 8px 20px #ccc}.cl-form{display:grid;gap:24px}.cl-otpCodeFieldInputs{display:flex;gap:12px}.cl-otpCodeFieldInput{width:48px}.cl-footer{padding:20px}';
        document.head.append(style);
        const frame = content => `<div class="cl-cardBox"><div class="cl-card">${content}</div><div class="cl-footer">Secured by Clerk</div></div>`;
        const start = () => {
          node.innerHTML = frame('<header class="cl-header"><h1 class="cl-headerTitle">Continue to John’s website</h1></header><form class="cl-form"><label class="cl-formFieldLabel">Email address<input class="cl-formFieldInput" type="email" required></label><button class="cl-formButtonPrimary">Continue</button></form>');
          node.querySelector('form').onsubmit = event => {
            event.preventDefault();
            node.innerHTML = frame('<header class="cl-header"><h1 class="cl-headerTitle">Check your email</h1><p class="cl-headerSubtitle">Enter the verification code sent to your email.</p></header><div class="cl-otpCodeFieldInputs">' + Array.from({ length: 6 }, (_, i) => `<input class="cl-otpCodeFieldInput" inputmode="numeric" maxlength="1" aria-label="Digit ${i + 1}">`).join('') + '</div><p role="alert">That code is incorrect. Try again.</p><button type="button">Use a different email</button>');
            node.querySelector('button').onclick = start;
          };
        };
        start();
      },
    };
  });
  await page.route('**/*', async request => {
    const url = new URL(request.request().url());
    if (url.hostname === 'clerk.john-ta.com' && url.pathname.endsWith('.js')) return request.fulfill({ body: '', contentType: 'text/javascript' });
    if (url.hostname !== 'www.john-ta.com') return request.abort();
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    try {
      const body = await fs.readFile(file);
      return request.fulfill({ body, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : undefined });
    } catch { return request.abort(); }
  });
  await page.goto(`https://www.john-ta.com/${route}/${route === 'tools/tranquil-connect' ? '?code=' + 'x'.repeat(32) : ''}`);
  if (route === 'lost-lands-2026-lineup') await page.locator('#account-button').click();
  await page.locator('[data-clerk-mount] .cl-formFieldInput').waitFor();
  return { page, errors };
}

async function assertLayout(page, viewport, route) {
  const result = await page.evaluate(() => {
    const mount = document.querySelector('[data-clerk-mount]');
    const card = mount.querySelector('.cl-cardBox').getBoundingClientRect();
    const title = mount.querySelector('.cl-headerTitle');
    const shell = mount.closest('[data-auth-panel],.access-card,.gate-card,.auth-card,dialog') || mount;
    const shellBox = shell.getBoundingClientRect();
    return { scroll: document.documentElement.scrollWidth, width: innerWidth, card: card.toJSON(), center: shellBox.x + shellBox.width / 2, titleSize: parseFloat(getComputedStyle(title).fontSize), fields: [...mount.querySelectorAll('input')].map(input => ({ rect: input.getBoundingClientRect().toJSON(), font: parseFloat(getComputedStyle(input).fontSize) })) };
  });
  assert.equal(result.width, viewport.width, route);
  assert.ok(result.scroll <= viewport.width, `${route}: horizontal overflow`);
  assert.ok(result.card.x >= 0 && result.card.right <= viewport.width + 1, `${route}: card outside screen`);
  assert.ok(Math.abs(result.card.x + result.card.width / 2 - result.center) < 2, `${route}: off-center card`);
  assert.ok(result.titleSize <= 24, `${route}: page headline style leaked into Clerk`);
  for (const field of result.fields) {
    assert.ok(field.rect.left >= 0 && field.rect.right <= viewport.width + 1, `${route}: clipped field`);
    assert.ok(field.rect.height >= 44 && field.font >= 16, `${route}: small input / mobile zoom`);
  }
  // Tall forms must remain reachable from their first heading to their last control.
  const screen = page.locator('[data-auth-screen]');
  if (await screen.count()) await screen.evaluate(node => { node.scrollTop = 0; });
  await page.evaluate(() => scrollTo(0, 0));
  assert.ok((await page.locator('[data-clerk-mount] .cl-headerTitle').boundingBox()).y >= 0, `${route}: top clipped on a short screen`);
  await page.locator('[data-clerk-mount] input').last().scrollIntoViewIfNeeded();
  const last = await page.locator('[data-clerk-mount] input').last().boundingBox();
  assert.ok(last.y >= 0 && last.y + last.height <= viewport.height + 1, `${route}: last field cannot be reached`);
}

test('every Clerk gate fits desktop, phone, and short screens through email and code steps', async () => {
  const browser = await (process.env.AUTH_BROWSER === 'webkit' ? webkit : chromium).launch({ headless: true });
  try {
    for (const route of routes) {
      try { await fs.access(path.join(root, route, 'index.html')); } catch { continue; }
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
        const { page, errors } = await open(browser, route, viewport);
        try {
          await assertLayout(page, viewport, route);
          await page.locator('[data-clerk-mount] input').fill('preview@example.com');
          await page.locator('[data-clerk-mount]').getByRole('button', { name: 'Continue', exact: true }).click();
          await page.getByRole('alert').waitFor();
          await assertLayout(page, viewport, route);
          await page.getByRole('button', { name: 'Use a different email', exact: true }).click();
          await assertLayout(page, viewport, route);
          assert.deepEqual(errors, [], route);
        } catch (error) { error.message = route + ' at ' + viewport.width + 'px: ' + error.message; throw error; } finally { await page.close(); }
      }
    }
  } finally { await browser.close(); }
});

test('signed-out centering releases the normal tool layout when its gate hides', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of ['login', 'tools/payments', 'tools/payment/questions', 'tools/rent', 'tools/1on1s', 'tools/payments/statements']) {
      const { page } = await open(browser, route, { width: 1440, height: 900 });
      await page.evaluate(() => {
        document.querySelector('[data-auth-panel]')?.setAttribute('hidden', '');
        document.querySelector('#directory')?.removeAttribute('hidden');
        document.querySelector('[data-clerk-mount]')?.replaceChildren();
      });
      assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node).display), 'block', route);
      await page.close();
    }
  } finally { await browser.close(); }
});
