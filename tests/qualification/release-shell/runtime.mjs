import { createServer } from "node:net";
import { qualificationPorts } from "../local/ports.mjs";
import { launchRuntime, root, stop, waitForReady } from '../../e2e/runtime-harness.mjs';

/** Bounded native proof: one Worker at a time in the parent-reserved range. */
export async function startShellWorker(persistPath, vars) {
  const { appPort, inspectorPort } = qualificationPorts(
    Number(process.env.SHELL_APP_PORT ?? 57000),
    Number(process.env.SHELL_INSPECTOR_PORT ?? 57001),
    process.env.SHELL_PORT_RANGE ?? '57000-57019',
  );
  await Promise.all([appPort, inspectorPort].map(async port => {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }));
  const child = launchRuntime('pnpm', ['exec', 'wrangler', 'dev', '--config', 'dist/server/wrangler.json', '--local', '--ip', '127.0.0.1', '--port', String(appPort), '--inspector-port', String(inspectorPort), '--persist-to', persistPath, ...Object.entries(vars).flatMap(([name, value]) => ['--var', `${name}:${value}`])], { cwd: root });
  const baseUrl = `http://127.0.0.1:${appPort}`;
  try { await waitForReady(baseUrl, child); } catch (error) { await stop(child); throw error; }
  return { baseUrl, child };
}
