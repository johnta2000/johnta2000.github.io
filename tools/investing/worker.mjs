import {ensemble} from './model.mjs?v=2';
self.onmessage = ({data}) => { try { self.postMessage({key:data.key, stats:ensemble(data.state)}); } catch(error) { self.postMessage({key:data.key,error:error.message}); } };
