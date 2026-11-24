const assert=require('node:assert/strict');
async function accountFixture(context, store={revision:0,data:null}, signedIn=true) {
  await context.route('https://clerk.john-ta.com/npm/**',route=>route.fulfill({
    contentType:'application/javascript',
    body:route.request().url().includes('/ui@')?'window.__internal_ClerkUICtor={};':`
    window.Clerk={
      user:{id:'test-player'},session:${signedIn?"{id:'test',getToken:async()=>'a.'+btoa(JSON.stringify({aud:'convex'}))+'.b'}":"null"},
      load:async()=>{},addListener(fn){this.listener=fn;},mountSignIn(el){el.textContent='Sign in';},
      async signOut(){this.session=null;this.listener({session:null});}
    };`
  }));
  await context.route('https://secret-gull-839.convex.cloud/api/**',async route=>{
    const {path,args}=route.request().postDataJSON();
    let value;
    if(path==='game:load') value={revision:store.revision,data:store.data};
    else if(store.offline) return route.abort();
    else if(args.data===store.data) value={revision:store.revision};
    else if(args.revision!==store.revision) value={conflict:true};
    else {store.data=args.data;value={revision:++store.revision};}
    await route.fulfill({json:{status:'success',value}});
  });
  return store;
}
async function savedPet(page,store) {
  assert.equal(await page.evaluate(async()=> (await import('./account.mjs?v=9')).flush()),true);
  return JSON.parse(store.data).pet;
}
module.exports={accountFixture,savedPet};
