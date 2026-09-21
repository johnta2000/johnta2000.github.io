// Lost Lands-only decoration. Animation is opt-in and respects reduced motion.
window.RallyDino = {
  home(root) {
    const countdown=root.querySelector('.countdown');
    if(!countdown)return;
    const button=document.createElement('button');
    button.type='button';button.title='Tap to dance';button.setAttribute('aria-label','Make the dinosaur dance');
    button.style.cssText='display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;padding:4px;cursor:pointer;border-radius:16px';
    button.innerHTML='<img src="/tools/rally/assets/dancing-dino.png" alt="Dinosaur wearing sunglasses" width="64" height="64" style="border-radius:14px;object-fit:cover">';
    let timer;
    button.onclick=()=>{
      if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
      clearTimeout(timer);button.querySelector('img').src='/tools/rally/assets/dancing-dino.gif';
      timer=setTimeout(()=>{button.querySelector('img').src='/tools/rally/assets/dancing-dino.png';},3000);
    };
    countdown.prepend(button);
  },
  ready(banner){
    if(this.celebrated)return;
    this.celebrated=true;
    const mark=document.createElement('span');
    mark.style.cssText='display:inline-flex;align-items:center;gap:6px;margin-left:8px';
    mark.innerHTML='<img src="/tools/rally/assets/dancing-dino.png" alt="" width="24" height="24" style="border-radius:6px"> Ready to roam offline';
    banner.append(mark);setTimeout(()=>mark.remove(),5000);
  }
};
