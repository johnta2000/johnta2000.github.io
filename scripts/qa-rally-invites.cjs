// Real navigation/auth entry points, synthetic accounts and records only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=process.env.RALLY_PLAYWRIGHT?require(process.env.RALLY_PLAYWRIGHT):require('playwright');
const contrastAudit=require('./rally-contrast-audit.cjs');
const engine=process.env.RALLY_BROWSER||'chromium',base=process.env.RALLY_QA_URL||'http://127.0.0.1:8798',output='/tmp/rally-invites-qa-'+engine;
const eventId='test-festival',id='00000000-0000-4000-8000-000000000001';
const state={id:eventId,name:'Midnight Carnival · Test Crew',location:'San Francisco',startsAt:'2026-10-31',endsAt:'2026-10-31',eventTimeZone:'America/Los_Angeles',projectTheme:'midnight',members:[{id:'admin',name:'Alex',initials:'A',role:'admin',status:'confirmed',origin:'SFO',color:'purple'},{id:'sam',name:'Sam',initials:'S',role:'member',status:'not_invited',origin:'LAX',color:'sky'}],rooms:[],travel:[],cars:[],passes:[],tasks:[],notes:[],lineup:[],lineupInterests:{},currentLineupFavorites:[]};
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=engine==='webkit'?await webkit.launch({headless:true,executablePath:'/Users/johnta/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],findings=[];
 try{
  for(const width of [320,390,1440]){
   let invitations=[],failClaim=true,claims=0,emails=0;
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block',reducedMotion:'reduce'});
   if(engine==='chromium')await context.grantPermissions(['clipboard-read','clipboard-write']);
   await context.addInitScript(()=>{
    const signedIn=!new URLSearchParams(location.search).has('signedout');
    window.Clerk={isSignedIn:signedIn,user:{id:'test-account',fullName:'Taylor',primaryEmailAddress:{emailAddress:'taylor@example.test'}},session:{getToken:async()=> 'synthetic-token'},load:async()=>{},signOut:async()=>{},mountSignIn(element,options){window.qaRedirect=options.forceRedirectUrl;element.innerHTML='<button id="qaSignIn">Sign in (test)</button>';element.querySelector('button').onclick=()=>{this.isSignedIn=true;unlock();};}};
    navigator.serviceWorker?.register?.bind(navigator.serviceWorker);
   });
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==='dashing-heron-837.convex.cloud'){
     const {path:api,args}=request.postDataJSON(),isFriend=request.frame().url().includes('join='),room={...state,isAdmin:!isFriend,currentMemberId:isFriend?'sam':'admin'};
     let value;
     if(api==='rally:listEvents')value=[{id:eventId,name:state.name,startsAt:state.startsAt,endsAt:state.endsAt}];
     else if(api==='rally:bootstrap'||api==='rally:get')value=room;
     else if(api==='rally:sharedCrewCandidates')value=[];
     else if(api==='rallyInvites:list')value=invitations;
     else if(api==='rallyInvites:create'){value={id:args.requestId||id,name:args.name||'',memberId:args.memberId||'',createdAt:Date.now(),expiresAt:Date.now()+7*86400000,status:'active'};if(!invitations.some(i=>i.id===value.id))invitations.push(value);}
     else if(api==='rallyInvites:revoke'){invitations.find(i=>i.id===args.invitationId).status='revoked';value={revoked:true};}
     else if(api==='rallyInvites:inspect')value={eventId,eventName:state.name,name:'Sam',alreadyMember:false};
     else if(api==='rallyInvites:accept'){claims++;if(failClaim){failClaim=false;return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',errorData:'Connection interrupted. Please try again.'})});}value={eventId,memberId:'sam'};}
     else if(api==='rally:sendInvitation'){emails++;value={room,memberName:'Sam'};}
     else if(api==='rallyCollection:getExperience')value={sharedMemories:[]};
     else throw Error('Unexpected backend request: '+api);
     return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'success',value})});
    }
    if(url.hostname!=='127.0.0.1')return route.abort();return route.continue();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/tools/rally/?view=crew&event='+eventId);await page.locator('#inviteCrew').waitFor();
   await page.locator('#inviteCrew').click();await page.getByRole('button',{name:'Create invite link',exact:true}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('panel'),'invite');
   await page.locator('#dialogRoot [name=name]').fill('My friend');
   await page.reload();await page.getByRole('button',{name:'Create invite link',exact:true}).waitFor();assert.equal(await page.locator('#dialogRoot [name=name]').inputValue(),'My friend');
   const dialog=page.getByRole('dialog');
   await dialog.locator('.search-select-trigger').click();await dialog.locator('.search-select-input:visible').fill('sam');await dialog.getByRole('option').click();
   assert.equal(new URL(page.url()).searchParams.get('member'),'sam');assert.equal(await dialog.locator('[name=name]').inputValue(),'Sam');
   await page.goBack();await page.getByRole('button',{name:'Create invite link',exact:true}).waitFor();assert.equal(await page.locator('#dialogRoot [name=memberId]').inputValue(),'');assert.equal(await page.locator('#dialogRoot [name=name]').inputValue(),'My friend');
   await page.goForward();await page.getByRole('button',{name:'Create invite link',exact:true}).waitFor();assert.equal(await page.locator('#dialogRoot [name=memberId]').inputValue(),'sam');
   findings.push(...await contrastAudit(page,width+' create invitation'));
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));await page.screenshot({path:`${output}/${width}-create.png`});
   await page.getByRole('button',{name:'Create invite link',exact:true}).click();await page.locator('#copyInviteLink').waitFor();
   const detailUrl=page.url(),invitationUrl=await page.getByRole('textbox',{name:'Invitation link',exact:true}).inputValue();
   assert(new URL(detailUrl).searchParams.get('invitation'));assert(new URL(invitationUrl).searchParams.get('join'));assert(!invitationUrl.includes('My friend'));
   await page.locator('#copyInviteLink').click();
   if(engine==='chromium')assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),invitationUrl);
   else await page.waitForFunction(()=>document.getElementById('copyInviteLink').textContent==='Copied'||document.querySelector('.invite-url').selectionEnd===document.querySelector('.invite-url').value.length);
   assert((await page.getByRole('link',{name:'Open email',exact:true}).getAttribute('href')).startsWith('mailto:'));
   findings.push(...await contrastAudit(page,width+' share invitation'));await page.screenshot({path:`${output}/${width}-share.png`});
   await page.reload();await page.locator('#copyInviteLink').waitFor();
   await page.getByRole('dialog').click({position:{x:20,y:20}});assert(await page.locator('#copyInviteLink').isVisible());
   const bounds=await page.getByRole('dialog').boundingBox();await page.mouse.move(bounds.x+20,bounds.y+20);await page.mouse.down();await page.mouse.move(2,2);await page.mouse.up();assert(await page.locator('#copyInviteLink').isVisible());
   await page.locator('.dialog-backdrop').click({position:{x:1,y:1}});assert(!new URL(page.url()).searchParams.has('panel'));await page.goBack();await page.locator('#copyInviteLink').waitFor();
   const fresh=await context.newPage();await fresh.goto(detailUrl);await fresh.locator('#copyInviteLink').waitFor();assert.equal(await fresh.getByRole('textbox',{name:'Invitation link',exact:true}).inputValue(),invitationUrl);await fresh.close();
   // Escape, backdrop, and history all preserve a restorable panel destination.
   await page.keyboard.press('Escape');assert(!new URL(page.url()).searchParams.has('panel'));await page.goBack();await page.locator('#copyInviteLink').waitFor();
   await page.getByRole('link',{name:'All invitations',exact:false}).click();await page.getByRole('button',{name:'Create invite link',exact:true}).waitFor();
   await page.getByRole('link',{name:'Send email',exact:true}).click();await page.locator('#dialogRoot [name=email]').waitFor();
   await page.locator('#dialogRoot [name=name]').fill('Sam');await page.locator('#dialogRoot [name=email]').fill('sam@example.test');await page.reload();await page.locator('#dialogRoot [name=email]').waitFor();assert.equal(await page.locator('#dialogRoot [name=email]').inputValue(),'sam@example.test');
   await page.locator('#dialogRoot [type=submit]').click();await page.waitForFunction(()=>!document.getElementById('dialogRoot').children.length);assert.equal(emails,1);assert(!new URL(page.url()).searchParams.has('panel'));
   // A copied invite survives the sign-in destination and an interrupted claim.
   const joinUrl=new URL(invitationUrl);joinUrl.searchParams.set('signedout','1');
   const friend=await context.newPage();friend.on('pageerror',e=>errors.push(e.message));await friend.goto(base+joinUrl.pathname+joinUrl.search);
   await friend.locator('#qaSignIn').waitFor();assert.equal(new URL(await friend.evaluate(()=>qaRedirect)).searchParams.get('join'),joinUrl.searchParams.get('join'));
   await friend.locator('#qaSignIn').click();await friend.getByRole('button',{name:'Join crew',exact:true}).waitFor();assert(await friend.locator('#rallyApp').isHidden());
   await friend.locator('#authOptions [name=name]').fill('Taylor Example');await friend.getByRole('button',{name:'Join crew',exact:true}).click();await friend.getByText('Connection interrupted. Please try again.',{exact:true}).waitFor();assert.equal(await friend.locator('#authOptions [name=name]').inputValue(),'Taylor Example');
   await friend.reload();await friend.locator('#qaSignIn').click();await friend.getByRole('button',{name:'Join crew',exact:true}).waitFor();assert.equal(await friend.locator('#authOptions [name=name]').inputValue(),'Taylor Example');
   await friend.getByRole('button',{name:'Join crew',exact:true}).click();await friend.locator('#memberGrid').waitFor();assert(!new URL(friend.url()).searchParams.has('join'));assert.equal(new URL(friend.url()).searchParams.get('event'),eventId);assert.equal(claims,2);await friend.close();
   await page.goto(detailUrl);await page.locator('#revokeInviteLink').click();await page.getByText('This invitation is revoked.',{exact:true}).waitFor();assert.equal(await page.locator('#copyInviteLink').count(),0);assert.equal(invitations[0].status,'revoked');
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(findings,[]);console.log(engine+': invite creation, email, copies, refresh, Back/Forward, sign-in recovery, retryable join, revocation and mobile layout passed at 320/390/1440px.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
