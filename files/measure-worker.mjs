import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
const original = childProcess.spawn;
childProcess.spawn = function (...args) {
  const child = original.apply(this, args);
  if (process.env.FV_MEASURE && child.stdout) {
    let buffered = '';
    child.stdout.on('data', chunk => {
      buffered += chunk;
      let index;
      while ((index = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, index); buffered = buffered.slice(index + 1);
        const marker = line.indexOf('FLEET_LIMIT ');
        if (marker >= 0) {
          const row = JSON.parse(line.slice(marker + 12));
          // Explicit allowlist: no cookies, tokens, request bodies or environment values.
          appendFileSync(process.env.FV_MEASURE, JSON.stringify({at:row.at,scope:row.scope,address:row.address,bucket:row.bucket,count:row.count,limit:row.limit,path:row.path})+'\n');
        }
      }
    });
  }
  return child;
};
syncBuiltinESMExports();
