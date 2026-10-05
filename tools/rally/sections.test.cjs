const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const sandbox={module:{exports:{}},require};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallySections.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,sandbox);
const save=sandbox.module.exports.save._handler;
test('section changes require project admin and preserve every other field',async()=>{
 const state={members:[{id:'a',clerkSubject:'admin',role:'admin'}],rooms:[{id:'room'}],notes:[{body:'Hotel',section:'stay'}],lineupFavorites:{a:['set']}};
 let patch,identity={subject:'admin'};
 const ctx={auth:{getUserIdentity:async()=>identity},db:{query:()=>({withIndex:()=>({unique:async()=>({_id:'doc',buckets:state})})}),patch:async(id,value)=>{patch=value;}}};
 await save(ctx,{eventId:'a',hiddenSections:['stay','travel','stay']});
 assert.deepEqual(JSON.parse(JSON.stringify(patch.buckets)),{...state,hiddenSections:['stay','travel']});
 await save(ctx,{eventId:'a',hiddenSections:[]});assert.equal(patch.buckets.hiddenSections.length,0);
 for(const subject of ['member','outsider']){identity={subject};await assert.rejects(save(ctx,{eventId:'a',hiddenSections:[]}),/admin/);}
 identity=null;await assert.rejects(save(ctx,{eventId:'a',hiddenSections:[]}),/Sign in/);
 identity={subject:'admin'};await assert.rejects(save(ctx,{eventId:'a',hiddenSections:['home']}),/optional/);
});
test('legacy projects enable all sections; core sections cannot be hidden',()=>{
 const ctx={data:{}};vm.createContext(ctx);
 vm.runInContext(app.slice(app.indexOf('const optionalSections'),app.indexOf('function openSectionSettings')),ctx);
 assert(ctx.sectionEnabled('stay'));ctx.data.hiddenSections=['stay','travel','home'];
 assert(!ctx.sectionEnabled('stay'));assert(!ctx.sectionEnabled('travel'));assert(ctx.sectionEnabled('home'));assert(ctx.sectionEnabled('notes'));
 ctx.data.hiddenSections=[];assert(ctx.sectionEnabled('stay'));
});
