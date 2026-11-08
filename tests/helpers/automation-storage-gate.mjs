import path from 'node:path';

/** Pause before confirmation, after the native semantic transaction has returned. */
export function automationStorageGate(main, Response) {
  let armed;
  const module = {type:'ESModule',path:path.join(path.dirname(main),'automation-storage-observer.mjs'),contents:`
    import worker from './${path.basename(main)}';
    export * from './${path.basename(main)}';
    export default {
      ...worker,
      scheduled(event, env, context) {
        const wrap = (statement, sql, args = []) => new Proxy(statement, {get(target, name) {
          if (name === 'bind') return (...values) => wrap(target.bind(...values), sql, values);
          if (name === 'run' && sql.startsWith("UPDATE automation_action_receipts SET state='confirmed'"))
            return async () => {
              await env.TEST_AUTOMATION_GATE.fetch('https://storage.test/confirmation', {
                method:'POST',body:JSON.stringify({runId:args[1],actionIndex:args[2],targetId:args[3]})
              });
              return target.run();
            };
          const value = target[name];
          return typeof value === 'function' ? value.bind(target) : value;
        }});
        const db = new Proxy(env.DB, {get(target, name) {
          if (name === 'prepare') return sql => wrap(target.prepare(sql), sql);
          const value = target[name];
          return typeof value === 'function' ? value.bind(target) : value;
        }});
        return worker.scheduled(event, {...env,DB:db}, context);
      }
    };
  `};
  return {module,
    async service(request) {
      const point = await request.json();
      if (armed?.actionIndex === point.actionIndex) {
        armed.reached = point;
        await new Promise(resolve => {armed.release = resolve;});
      }
      return new Response(null,{status:204});
    },
    control(action, actionIndex) {
      if (action === 'arm') {
        if (armed) throw Error('Automation storage gate already armed');
        armed = {actionIndex};
      }
      const reached = armed?.reached ?? null;
      if (action === 'release') {armed?.release?.();armed=undefined;}
      return {reached};
    },
  };
}

/** Test-process IPC only; there is no application control route. */
export function automationControl(child, action, actionIndex) {
  return nativeAutomationRequest(child,{type:'fixture.automation',action,actionIndex});
}

export function nativeAutomationRequest(child, message) {
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const finish=(error,value)=>{clearTimeout(timer);child.off('message',receive);child.off('exit',exited);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('Automation runtime control timed out')),10000);
    const receive=result=>{if(result?.type===message.type+'.result'&&result.id===id)finish(result.error?Error(result.error):undefined,result.value);};
    const exited=()=>finish(Error('Automation runtime exited during control'));
    child.on('message',receive);child.once('exit',exited);
    child.send({...message,id},error=>{if(error)finish(error);});
  });
}
