// Trusted presets only; project data stores an ID, never arbitrary CSS.
(() => {
  const presets = [
    {id:'warm',name:'Warm Ivory',description:'Ivory, charcoal, muted green',scheme:'light',colors:{paper:'#f7f7f2',card:'#ffffff',ink:'#202b25',muted:'#5d6c61',line:'#dfe5dd',sidebar:'#edf1eb',accent:'#285f4a',soft:'#e8f0e9',onAccent:'#ffffff',hover:'#1d4d3b',danger:'#a23932',favorite:'#816124',favoriteBg:'#f9efd2'}},
    {id:'niteharts',name:'Niteharts',description:'Charcoal, warm white, crimson',scheme:'dark',colors:{paper:'#121214',card:'#1d1d21',ink:'#f6f1ec',muted:'#b9b2b1',line:'#3b383d',sidebar:'#18181b',accent:'#ff858b',soft:'#322126',onAccent:'#241316',hover:'#ffabb0',danger:'#ff9992',favorite:'#f1ce82',favoriteBg:'#39301e'}},
    {id:'midnight',name:'Midnight',description:'Deep ink, lavender, soft violet',scheme:'dark',colors:{paper:'#14131e',card:'#201e2d',ink:'#f1eefb',muted:'#bdb7d0',line:'#40394f',sidebar:'#1a1826',accent:'#c4adff',soft:'#312840',onAccent:'#211731',hover:'#ddcfff',danger:'#ffa29e',favorite:'#edcf8a',favoriteBg:'#383020'}},
    {id:'ocean',name:'Ocean',description:'Cool white, slate, deep blue',scheme:'light',colors:{paper:'#f2f6f8',card:'#ffffff',ink:'#1e2d39',muted:'#546a79',line:'#d8e2e8',sidebar:'#eaf0f4',accent:'#245d85',soft:'#e4eef6',onAccent:'#ffffff',hover:'#184768',danger:'#a13a36',favorite:'#805f20',favoriteBg:'#f9efd2'}},
    // Inspired by current official artwork at decadencenye.com and lasvegas.edc.com.
    {id:'decadence',name:'Decadence · Digital City',description:'Midnight burgundy, molten gold, warm ivory',scheme:'dark',colors:{paper:'#181217',card:'#251c21',ink:'#fff5e8',muted:'#c6b8b3',line:'#4d3b42',sidebar:'#1f171c',accent:'#ffc670',soft:'#3b282b',onAccent:'#2c1b0b',hover:'#ffda9a',danger:'#ffada4',favorite:'#ffe498',favoriteBg:'#3b301f'}},
    {id:'edc',name:'EDC · Electric Sky',description:'Cosmic navy, electric cyan, daisy lime',scheme:'dark',colors:{paper:'#091321',card:'#111f33',ink:'#eef7ff',muted:'#b2c6d9',line:'#31445f',sidebar:'#0d1829',accent:'#75e6ef',soft:'#1b3447',onAccent:'#082331',hover:'#acf4f7',danger:'#ffb1b8',favorite:'#c6ed75',favoriteBg:'#27351d'}},
  ];
  const themeFor=id=>presets.find(theme=>theme.id===id)||presets[0];
  const tokens={paper:'paper',card:'card',ink:'ink',muted:'muted',line:'line',sidebar:'rally-sidebar',accent:'rally-accent',soft:'rally-soft',onAccent:'rally-on-accent',hover:'rally-hover',danger:'rally-danger',favorite:'rally-favorite',favoriteBg:'rally-favorite-bg'};
  function apply(id,target=document.documentElement){
    const theme=themeFor(id);
    target.dataset.projectTheme=theme.id;
    for(const [key,token] of Object.entries(tokens))target.style.setProperty('--'+token,theme.colors[key]);
    for(const [token,value] of Object.entries({text:'var(--ink)',border:'var(--line)',lime:'var(--rally-soft)',violet:'var(--rally-accent)','panel-solid':'var(--card)',gold:'var(--rally-favorite)'}))target.style.setProperty('--'+token,value);
    target.style.colorScheme=theme.scheme;
    if(target===document.documentElement){target.style.backgroundColor=theme.colors.paper;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.colors.paper);}
    return theme;
  }
  // First-paint cache contains palette IDs only, never names, room snapshots,
  // membership, credentials, or tokens. Project content still waits for auth.
  const paletteKey='rally-project-palettes-v1';
  const valid=id=>presets.some(theme=>theme.id===id);
  function storedPalettes(){
    try{
      const value=JSON.parse(localStorage.getItem(paletteKey));
      return new Map((Array.isArray(value)?value:[]).filter(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&entry[0].length<=180&&valid(entry[1])));
    }catch{return new Map();}
  }
  function remember(eventId,theme){
    if(typeof eventId!=='string'||!eventId||eventId.length>180||!valid(theme))return;
    try{const entries=storedPalettes();entries.delete(eventId);entries.set(eventId,theme);localStorage.setItem(paletteKey,JSON.stringify([...entries].slice(-100)));}catch{ /* Storage can be unavailable in private browsing. */ }
  }
  function prepare(eventId){
    const palette=storedPalettes().get(eventId)||window.__RALLY_NATIVE_CACHE__?.rooms?.[eventId]?.room?.projectTheme;
    const theme=valid(palette)?apply(palette):null;
    const target=document.documentElement;
    target.style.setProperty('--rally-loading-paper',theme?.colors.paper||'#18181b');
    target.style.setProperty('--rally-loading-ink',theme?.colors.ink||'#f1eefb');
    target.style.setProperty('--rally-loading-muted',theme?.colors.muted||'#bdb7d0');
    // Style the document before any page CSS or body content is painted.
    target.style.backgroundColor='var(--rally-loading-paper)';
    if(!theme){target.style.colorScheme='dark';document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#18181b');}
    return theme;
  }
  function clear(){try{localStorage.removeItem(paletteKey);}catch{}}
  window.RallyProjectThemes={presets,themeFor,apply,remember,prepare,clear};
  prepare(new URLSearchParams(location.search).get('event'));
})();
