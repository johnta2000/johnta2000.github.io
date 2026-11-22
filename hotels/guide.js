// Design and copy come from the published nextcard guide. This adapter handles
// personal-site URLs, clipboard feedback and the handoff to nextcard for signup.
const setup = document.querySelector('#setup');
const signupUrl = new URL('https://www.nextcard.com/sign-up');
signupUrl.searchParams.set('redirect_url', 'https://www.nextcard.com/mcp/hotels');

function trackHotel(name, properties) {
  window.SiteAnalytics?.capture(name, properties);
}

function questionNumber(element) {
  const item = element.closest('#setup section[aria-labelledby="ask"] li');
  return item ? Array.from(item.parentElement.children).indexOf(item) + 1 : undefined;
}

// Record the destination without collecting link queries, clipboard contents or question text.
function trackHotelLink(event) {
  if (event.type === 'auxclick' && event.button !== 1) return;
  const link = event.target.closest('a');
  if (!link) return;
  if (link.closest('.setup-fallback')) return trackHotel('hotel_guide_fallback_clicked');
  const assistant = setup.querySelector('[data-app][aria-pressed="true"]')?.dataset.app;
  if (link.dataset.app) trackHotel('hotel_guide_app_selected', {assistant: link.dataset.app});
  else if (link.hasAttribute('data-signup')) trackHotel('hotel_guide_signup_clicked', {assistant});
  else if (link.closest('section[aria-labelledby="mcp-guide-heading"]')) trackHotel('hotel_guide_setup_opened', {assistant});
  else if (link.closest('section[aria-labelledby="ask"]')) trackHotel('hotel_guide_question_opened', {assistant, question_number: questionNumber(link)});
}
setup.addEventListener('click', trackHotelLink);
setup.addEventListener('auxclick', trackHotelLink);

async function loadGuide() {
  const response = await fetch('./setup.json');
  if (!response.ok) throw new Error('Setup unavailable');
  const {styles, fontClass, views} = await response.json();
  await Promise.all(styles.map(href => new Promise((resolve, reject) => {
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = href;
    sheet.onload = resolve;
    sheet.onerror = reject;
    document.head.append(sheet);
  })));
  document.documentElement.classList.add(...fontClass.trim().split(/\s+/));

  function render() {
    const requested = new URLSearchParams(location.search).get('app');
    const selected = Object.hasOwn(views, requested) ? requested : 'claude';
    setup.innerHTML = views[selected];
    const signup = setup.querySelector('[data-signup]');
    const link = document.createElement('a');
    link.dataset.signup = '';
    link.href = signupUrl.href;
    link.className = signup.className;
    link.textContent = signup.textContent;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    signup.replaceWith(link);
    for (const button of setup.querySelectorAll('[data-app]')) {
      const toggle = document.createElement('a');
      for (const {name,value} of button.attributes) {
        if (!['type','aria-pressed'].includes(name)) toggle.setAttribute(name,value);
      }
      toggle.href = '?app=' + button.dataset.app + '#setup';
      // The source uses aria-pressed to style its buttons. Keep native button
      // semantics and Space activation alongside the copyable destination.
      toggle.setAttribute('role','button');
      toggle.setAttribute('aria-pressed', String(button.dataset.app === selected));
      toggle.append(...button.childNodes);
      button.replaceWith(toggle);
    }
  }
  render();
  if (location.hash === '#questions') setup.querySelector('#ask')?.scrollIntoView();
  else if (location.hash === '#setup' || location.hash === '#ask') document.querySelector(location.hash)?.scrollIntoView();
  window.addEventListener('popstate', render);
  setup.addEventListener('keydown', event => {
    if (event.key === ' ' && event.target.matches('[data-app]')) {
      event.preventDefault();
      event.target.click();
    }
  });
  setup.addEventListener('click', async event => {
    const toggle = event.target.closest('[data-app]');
    if (toggle && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (location.href !== toggle.href) history.pushState(null, '', toggle.href);
      render();
      setup.querySelector('#mcp-guide-heading').focus();
      return;
    }
    const copy = event.target.closest('button[data-copy]');
    if (!copy) return;
    const assistant = setup.querySelector('[data-app][aria-pressed="true"]')?.dataset.app;
    const number = questionNumber(copy);
    const target = number ? 'example_question' : copy.getAttribute('aria-label') === 'Copy server URL' ? 'server_url' : 'setup_prompt';
    const status = copy.parentElement.querySelector('[role=status]');
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      trackHotel('hotel_guide_copied', {assistant, copy_target: target, question_number: number});
      const label = [...copy.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (label) label.textContent = 'Copied';
      status.textContent = 'Copied.';
      clearTimeout(copy.resetTimer);
      copy.resetTimer = setTimeout(() => {
        if (label) label.textContent = 'Copy';
        status.textContent = '';
      }, 2000);
    } catch {
      status.classList.remove('sr-only');
      status.textContent = 'Select and copy this text: ' + copy.dataset.copy;
    }
  });
}
loadGuide().catch(() => {
  trackHotel('hotel_guide_load_failed');
  // The original public guide stays available when the snapshot cannot load.
  setup.querySelector('.setup-fallback')?.prepend('The setup section could not load. ');
});
