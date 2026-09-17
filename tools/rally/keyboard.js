// Shared by Safari and every frame in the iOS web view. Never reads field values.
(() => {
  if (window.RallyKeyboard) return;
  const editable = element => element?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable=true]');
  let timer;
  function reveal() {
    const viewport = window.visualViewport;
    document.documentElement?.style.setProperty('--rally-viewport-height', `${viewport?.height || innerHeight}px`);
    let input = document.activeElement;
    while(input?.shadowRoot?.activeElement)input=input.shadowRoot.activeElement;
    if (!editable(input)) return;
    const box = input.getBoundingClientRect();
    const top = (viewport?.offsetTop || 0) + 16;
    const bottom = top + (viewport?.height || innerHeight) - 40;
    if (box.top < top || box.bottom > bottom) input.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  }
  window.RallyKeyboard = {reveal};
  document.addEventListener('focusin', event => {
    if (!editable(event.composedPath?.()[0] || event.target)) return;
    reveal(); requestAnimationFrame(reveal);
    clearTimeout(timer); timer = setTimeout(reveal, 350);
  });
  window.visualViewport?.addEventListener('resize', reveal);
  window.visualViewport?.addEventListener('scroll', reveal);
  window.addEventListener('resize', reveal);
  document.addEventListener('DOMContentLoaded', reveal);
})();
