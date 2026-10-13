import { createServer } from "node:net";
import { qualificationPorts } from "../local/ports.mjs";
import { availablePort, launchRuntime, root, stop, waitForReady } from '../../e2e/runtime-harness.mjs';
import { emittedRuntimeConfig } from '../../e2e/emitted-runtime-config.mjs';

/** Use OS-assigned ports by default; explicit parent allocations remain strict. */
export async function startShellWorker(persistPath, vars, allocatedPorts) {
  let ports = allocatedPorts;
  if (!ports && ['SHELL_APP_PORT', 'SHELL_INSPECTOR_PORT', 'SHELL_PORT_RANGE'].some(name => process.env[name] !== undefined)) {
    ports = qualificationPorts(
      Number(process.env.SHELL_APP_PORT ?? 57000),
      Number(process.env.SHELL_INSPECTOR_PORT ?? 57001),
      process.env.SHELL_PORT_RANGE ?? '57000-57019',
    );
  } else if (!ports) {
    const [appPort, inspectorPort] = await Promise.all([availablePort(), availablePort()]);
    ports = { appPort, inspectorPort };
  }
  const { appPort, inspectorPort } = qualificationPorts(ports.appPort, ports.inspectorPort, '1024-65535');
  await Promise.all([appPort, inspectorPort].map(async port => {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }));
  const config = await emittedRuntimeConfig(root, persistPath);
  const child = launchRuntime('pnpm', ['exec', 'wrangler', 'dev', '--config', config, '--local', '--ip', '127.0.0.1', '--port', String(appPort), '--inspector-port', String(inspectorPort), '--persist-to', persistPath, ...Object.entries({...vars,...(vars.LOCAL_DEVELOPMENT==='true'?{APP_URL:`http://127.0.0.1:${appPort}`}:{})}).flatMap(([name, value]) => ['--var', `${name}:${value}`])], { cwd: root });
  const baseUrl = `http://127.0.0.1:${appPort}`;
  try { await waitForReady(baseUrl, child); } catch (error) { await stop(child); throw error; }
  return { baseUrl, child, ports };
}
