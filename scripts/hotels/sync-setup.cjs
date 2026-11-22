// Refresh the public, signed-out setup section. Keep the last complete snapshot
// available when the source is unavailable or changes in an incompatible way.
const { chromium } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const source = 'https://www.nextcard.com/mcp/hotels';
const output = path.resolve(__dirname, '../../hotels/setup.json');
const clients = { claude: 'claude', chatgpt: 'chatgpt', other: 'custom' };

async function capture(page, app) {
  const toggle = page.locator('[aria-describedby="mcp-client-' + clients[app] + '"]');
  await toggle.click();
  await page.waitForFunction(id => document.querySelector(
    '[aria-describedby="mcp-client-' + id + '"]'
  )?.getAttribute('aria-pressed') === 'true', clients[app]);

  return page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find(h => h.textContent.trim() === 'Set up nextcard');
    const chooser = document.getElementById('mcp-setup-heading').closest('section');
    const questions = document.getElementById('ask').closest('section');
    const content = document.createElement('div');
    const titleRow = heading.parentElement;
    const titleContainer = titleRow.parentElement.cloneNode(false);
    titleContainer.append(titleRow.cloneNode(true));
    content.append(titleContainer);
    for (const block of [chooser.parentElement, questions.parentElement]) {
      content.append(block.cloneNode(true));
    }

    // Export display markup and explicit safe actions only. Never rehost the
    // source application's scripts, auth forms, event handlers or account state.
    const tags = new Set('div section nav h2 h3 h4 p span label ol ul li figure img pre input a button svg path rect circle line polyline polygon g defs linearGradient stop ellipse br strong em'.split(' '));
    const attrs = new Set('class id tabindex role type readonly name value alt width height loading sizes viewBox fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray fill-rule clip-rule d x y x1 x2 y1 y2 cx cy rx ry r points transform xmlns for offset gradientUnits stop-color'.split(' '));
    for (const el of content.querySelectorAll('*')) {
      if (!tags.has(el.localName)) throw new Error('Review new setup element: ' + el.localName);
      const href = el.getAttribute('href');
      const img = el.localName === 'img' ? new URL(el.getAttribute('src'), location.href) : null;
      for (const {name} of [...el.attributes]) {
        if (!attrs.has(name) && !name.startsWith('aria-') && !name.startsWith('data-')) el.removeAttribute(name);
      }
      if (href) {
        const url = new URL(href, location.href);
        if (url.protocol !== 'https:' || !['www.nextcard.com','claude.ai','chatgpt.com'].includes(url.hostname)) throw new Error('Review new link destination');
        el.setAttribute('href', url.href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
      if (img) {
        if (img.origin !== location.origin) throw new Error('Review new screenshot origin');
        // Keep the compressed responsive screenshot, not the largest rendition.
        if (img.pathname === '/_next/image') img.searchParams.set('w', '1200');
        el.setAttribute('src', img.href);
        el.setAttribute('loading', 'lazy');
      }
    }
    const account = content.querySelector('section[aria-label="Your nextcard account"] button');
    if (account?.textContent.trim() !== 'Get started free') throw new Error('Expected public signup CTA');
    account.dataset.signup = '';
    const applications = { 'mcp-client-claude': 'claude', 'mcp-client-chatgpt': 'chatgpt', 'mcp-client-custom': 'other' };
    for (const button of content.querySelectorAll('button')) {
      const client = applications[button.getAttribute('aria-describedby')];
      const label = button.getAttribute('aria-label') || '';
      if (client) button.dataset.app = client;
      else if (label.startsWith('Copy question: ')) button.dataset.copy = label.slice('Copy question: '.length);
      else if (label === 'Copy server URL') button.dataset.copy = content.querySelector('#mcp-server-url').value;
      else if (label === 'Copy simple setup prompt') button.dataset.copy = content.querySelector('pre').textContent;
      else if (button !== account) throw new Error('Review new setup action: ' + label);
    }
    if (content.querySelectorAll('[data-app]').length !== 3 || !content.querySelector('[data-copy]')) throw new Error('Incomplete setup');
    return content.innerHTML;
  });
}

async function main() {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage();
    await page.goto(source, {waitUntil: 'domcontentloaded', timeout: 45000});
    await page.getByRole('button', {name:'Get started free', exact:true}).waitFor();
    const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
    if (!styles.length || styles.some(url => !url.startsWith('https://www.nextcard.com/_next/static/'))) throw new Error('Unexpected stylesheets');
    const fontClass = await page.locator('html').getAttribute('class');
    const views = {};
    for (const client of Object.keys(clients)) views[client] = await capture(page, client);
    const result = {styles, fontClass, views};
    await fs.writeFile(output + '.tmp', JSON.stringify(result) + '\n');
    await fs.rename(output + '.tmp', output);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
