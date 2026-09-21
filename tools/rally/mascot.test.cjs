const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('mascot animates only on tap, respects reduced motion, and celebrates once',()=>{
 const d=new JSDOM('<div class="countdown"></div><div id="status"></div>',{runScripts:'outside-only'}),w=d.window;
 w.eval(fs.readFileSync(__dirname+'/mascot.js','utf8'));
 w.RallyDino.home(w.document);const b=w.document.querySelector('button'),img=b.querySelector('img');
 assert.ok(img.src.endsWith('.png'));w.matchMedia=()=>({matches:true});b.click();assert.ok(img.src.endsWith('.png'));
 w.matchMedia=()=>({matches:false});b.click();assert.ok(img.src.endsWith('.gif'));
 const banner=w.document.querySelector('#status');w.RallyDino.ready(banner);w.RallyDino.ready(banner);assert.equal(banner.querySelectorAll('img').length,1);d.window.close();
});
