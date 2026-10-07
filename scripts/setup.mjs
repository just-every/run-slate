import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { deploymentCachePath, readDeploymentInput, renderWranglerConfig } from "./deployment.mjs";

const { values } = parseArgs({ options: { help: { type: "boolean", short: "h" } } });
if (values.help) {
  console.log("Usage: pnpm run setup [--help]\nConfigure SLATE_* environment variables as described in OPERATIONS.md and docs/release/sendgrid-deployment.md.\nWithout --help, provisions Cloudflare resources, uploads secrets and applies remote migrations.");
  process.exit(0);
}

const root = process.cwd();
const input = readDeploymentInput(process.env);
const configPath = path.join(root, "wrangler.toml");
const cachePath = deploymentCachePath(root, input.environment);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ["pipe", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(options.input);
  });
}

async function wrangler(args, options) {
  const result = await run("pnpm", ["exec", "wrangler", ...args], options);
  if (result.code !== 0) throw new Error(`Wrangler ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

async function d1ByName(name) {
  const listed = JSON.parse(await wrangler(["d1", "list", "--json"]));
  const databases = Array.isArray(listed) ? listed : listed.result ?? listed.databases ?? [];
  return databases.find((database) => database.name === name) ?? null;
}

async function ensureD1(name) {
  const existing = await d1ByName(name);
  if (existing?.uuid) return existing.uuid;
  await wrangler(["d1", "create", name]);
  const created = await d1ByName(name);
  if (!created?.uuid) throw new Error(`D1 database ${name} was created but cannot be resolved by Wrangler.`);
  return created.uuid;
}

async function ensureNamedResource(createArgs) {
  try {
    await wrangler(createArgs);
  } catch (cause) {
    if (!String(cause).toLowerCase().includes("already exists")) throw cause;
  }
}

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

function requiredSecret(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required setup secret: ${name}.`);
  return value;
}

async function putSecret(name, value) {
  await wrangler(["secret", "put", name, "--config", configPath], { input: value });
}

const secrets = {
  session: requiredSecret("SLATE_SESSION_SECRET"),
  mailApiKey: requiredSecret("SLATE_MAIL_API_KEY"),
  aiApiKey: input.aiEnabled === "true" ? requiredSecret("SLATE_AI_API_KEY") : null,
  identityClientSecret: input.ssoEnabled === "true" ? requiredSecret("SLATE_IDENTITY_CLIENT_SECRET") : null,
  connectorCredentialsKey: process.env.SLATE_CONNECTOR_CREDENTIALS_KEY?.trim() || null,
};

const oauthSecrets = [];
for (const provider of ['GOOGLE','SLACK','GITHUB']) {
  const clientId=process.env[`SLATE_${provider}_CLIENT_ID`]?.trim();
  const secret=process.env[`SLATE_${provider}_CLIENT_SECRET`]?.trim();
  if(clientId||secret){if(!clientId||!secret)throw new Error(`Both SLATE_${provider}_CLIENT_ID and SLATE_${provider}_CLIENT_SECRET are required.`);oauthSecrets.push([`${provider}_CLIENT_SECRET`,secret]);}
}
if(oauthSecrets.length&&(!secrets.connectorCredentialsKey||secrets.connectorCredentialsKey.length<32))throw new Error('SLATE_CONNECTOR_CREDENTIALS_KEY must contain at least 32 characters for OAuth connections.');
const databaseId = await ensureD1(input.database);
await ensureNamedResource(["r2", "bucket", "create", input.files]);
await ensureNamedResource(["queues", "create", input.jobs]);

const template = await readFile(path.join(root, "deploy", "wrangler.template.toml"), "utf8");
await atomicWrite(configPath, renderWranglerConfig(template, input, databaseId));
await atomicWrite(cachePath, `${JSON.stringify({ version: 1, configuredAt: new Date().toISOString(), environment: input.environment, worker: input.worker, database: { name: input.database, id: databaseId }, files: { bucket: input.files }, jobs: { queue: input.jobs }, appUrl: input.appUrl }, null, 2)}\n`);

await putSecret("SESSION_SECRET", secrets.session);
await putSecret("MAIL_API_KEY", secrets.mailApiKey);
if (secrets.aiApiKey) await putSecret("AI_API_KEY", secrets.aiApiKey);
if (secrets.identityClientSecret) await putSecret("IDENTITY_CLIENT_SECRET", secrets.identityClientSecret);
if (secrets.connectorCredentialsKey) await putSecret("CONNECTOR_CREDENTIALS_KEY", secrets.connectorCredentialsKey);
for(const [name,value] of oauthSecrets)await putSecret(name,value);
await wrangler(["d1","migrations","apply","DB","--remote","--config",configPath]);

console.log(JSON.stringify({ environment: input.environment, worker: input.worker, database: input.database, files: input.files, jobs: input.jobs, config: "wrangler.toml", cache: path.relative(root, cachePath) }, null, 2));
