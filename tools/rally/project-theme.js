// Trusted presets only; project data stores an ID, never arbitrary CSS.
(() => {
  const presets = [
    {id:'warm',name:'Warm Ivory',description:'Ivory, charcoal, muted green',scheme:'light',colors:{paper:'#f7f7f2',card:'#ffffff',ink:'#202b25',muted:'#5d6c61',line:'#dfe5dd',sidebar:'#edf1eb',accent:'#285f4a',soft:'#e8f0e9',onAccent:'#ffffff',hover:'#1d4d3b',danger:'#a23932',favorite:'#816124',favoriteBg:'#f9efd2'}},
    {id:'niteharts',name:'Niteharts',description:'Charcoal, warm white, crimson',scheme:'dark',colors:{paper:'#121214',card:'#1d1d21',ink:'#f6f1ec',muted:'#b9b2b1',line:'#3b383d',sidebar:'#18181b',accent:'#ff858b',soft:'#322126',onAccent:'#241316',hover:'#ffabb0',danger:'#ff9992',favorite:'#f1ce82',favoriteBg:'#39301e'}},
    {id:'midnight',name:'Midnight',description:'Deep ink, lavender, soft violet',scheme:'dark',colors:{paper:'#14131e',card:'#201e2d',ink:'#f1eefb',muted:'#bdb7d0',line:'#40394f',sidebar:'#1a1826',accent:'#c4adff',soft:'#312840',onAccent:'#211731',hover:'#ddcfff',danger:'#ffa29e',favorite:'#edcf8a',favoriteBg:'#383020'}},
    {id:'ocean',name:'Ocean',description:'Cool white, slate, deep blue',scheme:'light',colors:{paper:'#f2f6f8',card:'#ffffff',ink:'#1e2d39',muted:'#546a79',line:'#d8e2e8',sidebar:'#eaf0f4',accent:'#245d85',soft:'#e4eef6',onAccent:'#ffffff',hover:'#184768',danger:'#a13a36',favorite:'#805f20',favoriteBg:'#f9efd2'}},
  ];
  const themeFor=id=>presets.find(theme=>theme.id===id)||presets[0];
  const tokens={paper:'paper',card:'card',ink:'ink',muted:'muted',line:'line',sidebar:'rally-sidebar',accent:'rally-accent',soft:'rally-soft',onAccent:'rally-on-accent',hover:'rally-hover',danger:'rally-danger',favorite:'rally-favorite',favoriteBg:'rally-favorite-bg'};
  function apply(id,target=document.documentElement){
    const theme=themeFor(id);
    target.dataset.projectTheme=theme.id;
    for(const [key,token] of Object.entries(tokens))target.style.setProperty('--'+token,theme.colors[key]);
    for(const [token,value] of Object.entries({text:'var(--ink)',border:'var(--line)',lime:'var(--rally-soft)',violet:'var(--rally-accent)','panel-solid':'var(--card)',gold:'var(--rally-favorite)'}))target.style.setProperty('--'+token,value);
    target.style.colorScheme=theme.scheme;
    if(target===document.documentElement)document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.colors.paper);
    return theme;
  }
  window.RallyProjectThemes={presets,themeFor,apply};
})();
