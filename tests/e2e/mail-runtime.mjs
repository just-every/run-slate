import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launch} from '../qualification/local/process.mjs';

/** Run the selected emitted artifact, intercepting only the paid mail transport. */
export async function launchMailRuntime({root,configPath,persist,port,variables={},env}) {
  const varsPath=path.join(persist,'mail-vars.json');
  await mkdir(persist,{recursive:true});
  await writeFile(varsPath,JSON.stringify(variables),{mode:0o600});
  return launch(process.execPath,[path.join(root,'tests/e2e/emitted-runtime.mjs'),configPath,persist,String(port),varsPath],{cwd:root,...(env?{env}:{})});
}
