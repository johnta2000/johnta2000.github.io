// Current Clerk CodeControl wrapper shape + legacy individual inputs, with fake
// local data only. No authentication attempt, email, SMS or backend request.
const {chromium,webkit}=process.env.RALLY_PLAYWRIGHT?require(process.env.RALLY_PLAYWRIGHT):require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),engine=process.env.RALLY_BROWSER||'chromium',output='/tmp/rally-auth-qa-'+engine;
const fakeClerk=()=>{
 window.__internal_ClerkUICtor={};
 window.Clerk={isSignedIn:false,load:async()=>{},mountSignIn(node){
  const style=document.createElement('style');style.textContent='.cl-cardBox{border:1px solid #ddd;border-radius:18px;background:#fffef9;overflow:hidden;box-shadow:0 14px 40px #172c2420}.cl-card{display:flex;flex-direction:column;align-items:stretch}.cl-main{display:flex;flex-direction:column;gap:24px}.cl-form{display:flex;flex-direction:column;align-items:center;gap:16px}.cl-otpCodeField{display:flex;flex-direction:column;gap:8px}.cl-otpCodeFieldInputContainer{position:relative}.cl-otpCodeFieldInputs{display:flex;gap:8px}.cl-otpCodeFieldInput{width:40px;height:40px;border:1px solid #7f8b80;border-radius:7px;font:24px system-ui}.cl-otpCodeFieldInputContainer:focus-within .cl-otpCodeFieldInput{border-color:#285f4a}.cl-otpCodeField[data-error] .cl-otpCodeFieldInput{border-color:#b43c3c}.cl-otpCodeFieldErrorText{margin:0;text-align:center;color:#a23932;font:14px/1.5 system-ui}.cl-formResendCodeLink{margin:0;color:#666;font:13px/1.5 system-ui}.cl-formButtonPrimary{border:0;background:#202b25;color:white;padding:12px}.cl-footer{background:#f7f7f2;color:#666}';document.head.append(style);
  window.qaOtp=(value='',error=false,legacy=false)=>{
   node.className='cl-rootBox cl-signIn-root';
   node.innerHTML=`<div class="cl-cardBox"><div class="cl-card"><header class="cl-header"><h1 class="cl-headerTitle">Check your email</h1><p class="cl-headerSubtitle">Enter the verification code sent to alex@example.test.</p></header><div class="cl-main"><div class="cl-form"><div class="cl-otpCodeField" ${error?'data-error':''}><div class="cl-otpCodeFieldInputContainer"><div data-input-otp-container style="position:relative;display:flex;align-items:center"><div class="cl-otpCodeFieldInputs" role="group" aria-label="Verification code">${Array.from({length:6},(_,i)=>legacy?`<input class="cl-otpCodeFieldInput" inputmode="numeric" autocomplete="one-time-code" maxlength="1" aria-label="Digit ${i+1}" value="${value[i]||''}">`:`<div class="cl-otpCodeFieldInput" data-testid="otp-input-segment">${value[i]?`<div>${value[i]}</div>`:''}</div>`).join('')}</div>${legacy?'':`<input data-input-otp aria-label="Enter verification code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${value}" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;caret-color:transparent">`}</div></div><p class="cl-otpCodeFieldErrorText" role="alert">${error?'That code is incorrect. Please try again.':''}</p></div><p class="cl-formResendCodeLink">Didn’t receive a code? Resend (29)</p></div><button class="cl-formButtonPrimary" type="button">Continue</button></div></div><footer class="cl-footer">Secured by Clerk</footer></div>`;
   const input=node.querySelector('[data-input-otp]');if(input)input.oninput=()=>{node.querySelectorAll('.cl-otpCodeFieldInput').forEach((slot,i)=>{slot.innerHTML=input.value[i]?`<div>${input.value[i]}</div>`:'';});};
  };window.qaOtp();
 }};
};
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=engine==='webkit'?await webkit.launch({headless:true,executablePath:'/Users/johnta/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],metrics=[];
 try{for(const width of [320,390,430,768,1280]){
  const page=await browser.newPage({viewport:{width,height:844},...(engine==='webkit'&&width<=430?{isMobile:true,hasTouch:true}:{})});
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(fakeClerk);
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'||route.request().method()!=='GET')return route.abort();const file=path.resolve(base,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));if(!file.startsWith(base+path.sep))return route.abort();if(url.pathname.endsWith('analytics.js'))return route.fulfill({contentType:'application/javascript',body:''});return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8',body:fs.readFileSync(file)});});
  await page.goto('http://127.0.0.1/tools/rally/');await page.locator('.cl-otpCodeFieldInput').first().waitFor();
  for(const [name,value,error,legacy] of [['empty','',false,false],['filled','123456',false,false],['error','123456',true,false],['legacy','123456',false,true]]){
   await page.evaluate(([value,error,legacy])=>qaOtp(value,error,legacy),[value,error,legacy]);
   const slots=await page.locator('.cl-otpCodeFieldInput').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,right:node.getBoundingClientRect().right,left:node.getBoundingClientRect().left,font:parseFloat(getComputedStyle(node).fontSize),childFont:node.firstElementChild?parseFloat(getComputedStyle(node.firstElementChild).fontSize):null})));
   assert.equal(slots.length,6);for(const s of slots){assert(s.width>=32&&s.width<=60,`${width}px ${name}: digit width ${s.width}`);assert(s.height>=48&&s.font>=24);assert(s.left>=0&&s.right<=width+1);if(s.childFont)assert(s.childFont>=24);}
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
   assert(await page.locator('.cl-otpCodeFieldErrorText').evaluate(node=>node.getBoundingClientRect().width>=200));
   if(!legacy){const input=page.locator('[data-input-otp]');assert.equal(await input.getAttribute('autocomplete'),'one-time-code');assert.equal(await input.getAttribute('inputmode'),'numeric');await input.fill('654321');assert.equal(await page.locator('.cl-otpCodeFieldInputs').textContent(),'654321');}
   await page.screenshot({path:`${output}/${width}-${name}.png`});metrics.push({width,state:name,digitWidth:Math.round(slots[0].width)});
  }
  await page.evaluate(()=>qaOtp('123456'));await page.setViewportSize({width,height:480});await page.locator('[data-input-otp]').focus();await page.locator('.cl-otpCodeFieldInputContainer').scrollIntoViewIfNeeded();
  const box=await page.locator('.cl-otpCodeFieldInputContainer').boundingBox();assert(box.y>=0&&box.y+box.height<=481);
  await page.screenshot({path:`${output}/${width}-short-viewport.png`});
  await page.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({engine,errors,metrics,output},null,2));assert.equal(errors.length,0);
})().catch(error=>{console.error(error);process.exitCode=1;});
