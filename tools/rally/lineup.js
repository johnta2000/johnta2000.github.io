// A persistent same-document view. Shadow DOM isolates the schedule styles,
// not its page lifecycle: no iframe, navigation, fetch, or second login.
(() => {
  let instance=null;
  function destroy(){
    if(!instance)return;
    instance.controller.suspend();instance.controller.destroy();instance.element.remove();instance=null;
  }
  function show({container,key,state,params,onEvent,onParams,shareUrl,event}){
    const catalogSignature=JSON.stringify(event||null);
    if(instance&&(instance.key!==key||instance.catalogSignature!==catalogSignature))destroy();
    if(!instance){
      const element=document.createElement('rally-lineup');
      element.setAttribute('aria-label','Festival lineup');
      const root=element.attachShadow({mode:'open'});
      const style=document.createElement('style');style.textContent=RallyLineupTemplate.css;
      root.append(style);
      const template=document.createElement('template');template.innerHTML=RallyLineupTemplate.markup;
      root.append(template.content.cloneNode(true));container.append(element);
      const integration={params:params||'',shareUrl,event,isActive:()=>!container.hidden,onEvent,onParams};
      const controller=createLostLandsLineup(root,integration);
      instance={key,catalogSignature,element,controller,integration,stateSignature:'',scroll:0};
    } else if(params!==null&&params!==undefined&&params!==instance.integration.params){
      instance.controller.route(params);instance.scroll=0;
    }
    receive(state);
    instance.element.scrollTop=instance.scroll;
  }
  function receive(message){
    if(!instance)return;
    if(message.type==='rally-lineup-state'){
      const signature=JSON.stringify(message);
      if(signature===instance.stateSignature)return;
      instance.stateSignature=signature;
    }
    instance.controller.receive(message);
  }
  function hide(){
    if(!instance)return;
    instance.scroll=instance.element.scrollTop;instance.controller.suspend();
  }
  window.RallyLineup={show,hide,receive,destroy};
})();
