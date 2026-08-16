const CONVEX_URL="https://blessed-bee-408.convex.cloud";
const code=new URLSearchParams(location.search).get("code")||"";
const signIn=document.getElementById("clerk-sign-in");
const status=document.getElementById("status");
const result=document.getElementById("result");

window.addEventListener("load",initialize);

async function initialize(){
  if(code.length<32)return showError("This connection link is invalid. Start again from Tranquil settings.");
  try{
    await window.Clerk.load();
    if(window.Clerk.user)return connect();
    status.textContent="Sign in with your existing Clerk account.";
    window.Clerk.mountSignIn(signIn,{afterSignInUrl:location.href,afterSignUpUrl:location.href});
    window.Clerk.addListener(({user})=>{if(user)connect();});
  }catch(error){showError(error.message||"Secure sign-in could not load.");}
}

async function connect(){
  if(connect.running)return;connect.running=true;
  signIn.replaceChildren();status.textContent="Connecting your Tranquil history…";
  try{
    const token=await getConvexToken();
    await convexMutation("focus:claimClerkLink",{code},token);
    result.hidden=false;document.getElementById("result-title").textContent="Tranquil is connected";
    document.getElementById("result-copy").textContent="Return to the extension. Your statistics will appear there automatically; you can close this tab.";
    status.textContent="Connection complete.";
  }catch(error){connect.running=false;showError(error.message||"Tranquil could not connect this account.");}
}

async function getConvexToken(){
  const session=window.Clerk.session;if(!session)throw new Error("Sign in before connecting Tranquil.");
  const token=await session.getToken();const audience=readJwtPayload(token)?.aud;
  if(audience==="convex"||(Array.isArray(audience)&&audience.includes("convex")))return token;
  try{return await session.getToken({template:"convex"});}catch{return token;}
}

async function convexMutation(path,args,token){
  const response=await fetch(`${CONVEX_URL}/api/mutation`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({path,args,format:"json"})});
  const payload=await response.json();if(!response.ok||payload.status==="error")throw new Error(payload.errorMessage||"Convex request failed.");return payload.value;
}

function readJwtPayload(token){try{const encoded=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(decodeURIComponent(escape(atob(encoded))));}catch{return null;}}
function showError(message){status.textContent=message;status.style.color="#9f3126";}
