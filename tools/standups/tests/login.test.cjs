const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;

async function openLogin(browser, width, mode = 'delayed') {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 760, hasTouch: true });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(mode => {
    window.__internal_ClerkUICtor = {};
    window.Clerk = {
      isSignedIn: mode === 'denied' && !localStorage.getItem('signed-out'),
      session: { getToken: async () => 'test-token' },
      load: () => mode === 'failed' ? Promise.reject(new Error('Unavailable')) : Promise.resolve(),
      signOut: async () => { localStorage.setItem('signed-out', 'yes'); },
      mountSignIn: (node, options) => {
        window.signInOptions = options;
        window.showSignIn = () => {
          // Reproduce Clerk replacing the mount classes and its default card sizing.
          node.className = 'cl-rootBox cl-signIn-root';
          const style = document.createElement('style');
          style.textContent = '.cl-rootBox,.cl-cardBox{width:350px}.cl-card{padding:32px;box-shadow:0 4px 10px #ccc}.cl-form{display:grid;gap:24px}.cl-header{margin-bottom:24px}.cl-otpCodeFieldInputs{display:flex}.cl-footer{padding:20px;text-align:center}';
          document.head.append(style);
          const frame = content => `<div class="cl-cardBox"><div class="cl-card">${content}</div><div class="cl-footer">Secured by Clerk</div></div>`;
          const start = () => {
            node.innerHTML = frame('<div class="cl-header"><h1 class="cl-headerTitle">Sign in</h1></div><form class="cl-form"><label>Email address<input class="cl-formFieldInput" type="email" required></label><button class="cl-formButtonPrimary" type="submit">Continue</button></form>');
            node.querySelector('form').onsubmit = event => {
              event.preventDefault();
              node.innerHTML = frame('<div class="cl-header"><h1 class="cl-headerTitle">Check your email</h1><p class="cl-headerSubtitle">Enter the verification code sent to your email.</p></div><div class="cl-otpCodeFieldInputs">' + Array.from({length:6}, (_,i) => `<input class="cl-otpCodeFieldInput" inputmode="numeric" maxlength="1" aria-label="Digit ${i+1}">`).join('') + '</div><p role="alert">That code is incorrect. Try again.</p><button type="button">Use a different email</button>');
              node.querySelector('button').onclick = start;
            };
          };
          start();
        };
      },
    };
  }, mode);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') {
      if (url.pathname.startsWith('/assets/')) return route.fulfill({ body: await fs.readFile(path.join(__dirname, '../../..', url.pathname)), contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
      const file = url.pathname.endsWith('/') ? 'index.html' : path.basename(url.pathname);
      let body = await fs.readFile(path.join(__dirname, '..', file), 'utf8');
      if (file === 'index.html') body = body.replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g, '');
      return route.fulfill({ body, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    }
    if (url.hostname.endsWith('.convex.cloud')) return route.fulfill({ json: { status: 'error', errorMessage: 'Not authorized' } });
    return route.abort();
  });
  await page.goto('http://localhost/');
  return { page, errors };
}

async function assertFits(page, width) {
  const result = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth, card: document.querySelector('.access-card').getBoundingClientRect().toJSON() }));
  assert.equal(result.viewport, width, 'Login must not expand the mobile layout viewport');
  assert.ok(result.scroll <= width, 'Login must not scroll horizontally');
  assert.ok(result.card.left >= 0 && result.card.right <= width);
}

test('login keeps a stable shell while Clerk mounts, changes steps, and shows inline errors', async () => {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const width of [320, 390, 430, 768, 1280]) {
      const { page, errors } = await openLogin(browser, width);
      await page.waitForFunction(() => typeof window.showSignIn === 'function');
      const loadingTitle = await page.locator('#accessTitle').boundingBox();
      const loadingCard = await page.locator('.access-card').boundingBox();
      assert.equal(await page.locator('#authLoading').isVisible(), true);
      await assertFits(page, width);
      await page.evaluate(() => window.showSignIn());
      await page.waitForFunction(() => document.querySelector('#accessGate').dataset.state === 'ready');
      assert.equal(await page.locator('#authLoading').isVisible(), false);
      const readyTitle = await page.locator('#accessTitle').boundingBox();
      const readyCard = await page.locator('.access-card').boundingBox();
      assert.equal(readyTitle.y, loadingTitle.y, 'Heading should not jump when sign-in appears');
      assert.equal(readyCard.height, loadingCard.height, 'Loading reserves the form space');
      assert.equal(await page.locator('#authBody').getAttribute('aria-busy'), 'false');
      await assertFits(page, width);
      assert.ok(await page.locator('#clerkSignIn input').evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16));
      const options = await page.evaluate(() => ({ routing: signInOptions.routing, signup: signInOptions.withSignUp, redirect: signInOptions.forceRedirectUrl }));
      assert.equal(options.routing, 'hash');
      assert.equal(options.signup, true);
      assert.equal(options.redirect, 'http://localhost/');
      await page.locator('#clerkSignIn input').fill('test@example.com');
      await page.getByRole('button', { name: 'Continue', exact: true }).tap();
      await page.getByText('Check your email', { exact: true }).waitFor();
      await assertFits(page, width);
      assert.equal((await page.locator('#accessTitle').boundingBox()).y, loadingTitle.y);
      const digits = await page.locator('.cl-otpCodeFieldInput').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().right));
      assert.ok(digits.every(right => right <= width));
      await page.getByRole('button', { name: 'Use a different email' }).tap();
      await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('login failures show recovery controls and unauthorized accounts can switch email', async () => {
  const browser = await browserType.launch({ headless: true });
  try {
    const failed = await openLogin(browser, 390, 'failed');
    await failed.page.getByRole('button', { name: 'Try again' }).waitFor();
    assert.equal(await failed.page.locator('#authLoading').isVisible(), false);
    assert.equal(await failed.page.locator('#standupsApp').isVisible(), false);
    await assertFits(failed.page, 390);
    const denied = await openLogin(browser, 390, 'denied');
    await denied.page.getByText("This email doesn't have access to standups. Try a different email.").waitFor();
    await denied.page.getByRole('button', { name: 'Use a different email' }).tap();
    await denied.page.waitForFunction(() => localStorage.getItem('signed-out') === 'yes' && typeof window.showSignIn === 'function');
    await denied.page.evaluate(() => window.showSignIn());
    await denied.page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
    assert.equal(await denied.page.locator('#standupsApp').isVisible(), false);
    assert.deepEqual([...failed.errors, ...denied.errors], []);
  } finally { await browser.close(); }
});
