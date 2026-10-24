import {useEffect,useState} from 'react';
export default function useMobileLayout() {
  const [mobile,setMobile]=useState(()=>typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 760px)').matches);
  useEffect(()=>{
    if(typeof window.matchMedia!=='function')return;
    const media=window.matchMedia('(max-width: 760px)');
    const update=()=>setMobile(media.matches);
    update();media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  return mobile;
}
