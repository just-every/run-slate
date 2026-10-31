import path from 'node:path';

/** Pause only the storage boundary; all application handlers and R2 operations remain native. */
export function transferStorageGate(main, Response) {
  let armed, release;
  const module = {type:'ESModule', path:path.join(path.dirname(main),'transfer-storage-observer.mjs'), contents:`
    import worker from './${path.basename(main)}';
    export * from './${path.basename(main)}';
    export default {
      ...worker,
      fetch(request, env, context) {
        const files = new Proxy(env.FILES, {get(bucket, name) {
          const value = bucket[name];
          if (typeof value !== 'function') return value;
          return async (...args) => {
            if (name === 'createMultipartUpload' || name === 'get' && String(args[0]).startsWith('federation/staging/'))
              await env.TEST_TRANSFER_GATE.fetch('https://storage.test/' + name);
            return value.apply(bucket, args);
          };
        }});
        return worker.fetch(request, {...env, FILES:files}, context);
      }
    };
  `};
  return {module,
    async service(request) {
      if (armed?.method === new URL(request.url).pathname.slice(1)) {
        armed.reached = true;
        await new Promise(resolve => {release = resolve;});
      }
      return new Response(null, {status:204});
    },
    control(action, method) {
      if (action === 'arm') {if (armed) throw Error('Storage gate already armed');armed={method,reached:false};}
      if (action === 'release') {armed=undefined;release?.();release=undefined;}
      return {reached:armed?.reached ?? false};
    },
  };
}

/** Parent IPC controls a test-only storage pause, never an application response. */
export function transferControl(child, action, method) {
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const finish=(error,value)=>{clearTimeout(timer);child.off('message',receive);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('Transfer storage control timed out')),10000);
    const receive=message=>{if(message?.type==='fixture.transfer.result'&&message.id===id)finish(message.error?Error(message.error):undefined,message.value);};
    child.on('message',receive);
    child.send({type:'fixture.transfer',id,action,method},error=>{if(error)finish(error);});
  });
}
