const appNames = { claude: 'Claude', chatgpt: 'ChatGPT', other: 'Other apps' };
const requestedApp = new URLSearchParams(location.search).get('app');
const app = Object.hasOwn(appNames, requestedApp) ? requestedApp : 'claude';

for (const guide of document.querySelectorAll('[data-guide]')) {
  guide.hidden = guide.dataset.guide !== app;
}
document.querySelector('[data-app="' + app + '"]').setAttribute('aria-current', 'page');

const chatUrls = { claude: 'https://claude.ai/new', chatgpt: 'https://chatgpt.com/' };
document.querySelector('#question-help').textContent = app === 'other'
  ? 'Copy a question and paste it into your app.'
  : 'Open a question in ' + appNames[app] + ', then edit it or send it.';

for (const [index, row] of document.querySelectorAll('.questions li').entries()) {
  const question = row.querySelector('p');
  question.id = 'question-' + (index + 1);
  const actions = document.createElement('div');
  actions.className = 'question-actions';
  if (chatUrls[app]) {
    const url = new URL(chatUrls[app]);
    url.searchParams.set('q', 'Use nextcard to answer: ' + question.textContent);
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Ask ' + appNames[app];
    link.setAttribute('aria-describedby', question.id);
    actions.append(link);
  }
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.copy = question.id;
  copy.textContent = 'Copy question';
  copy.setAttribute('aria-describedby', question.id);
  actions.append(copy);
  row.append(actions);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-copy]');
  if (!button) return;
  const text = document.getElementById(button.dataset.copy);
  const status = document.querySelector('#status');
  try {
    await navigator.clipboard.writeText(text.textContent);
    status.textContent = 'Copied to clipboard.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = 'Text selected. Use your device’s Copy command.';
  }
  clearTimeout(status.hideTimer);
  status.hideTimer = setTimeout(() => { status.textContent = ''; }, 3500);
});
