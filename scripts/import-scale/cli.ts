import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeZipArchive } from "./zip-stream";
import { buildNotionBlueprint, notionGroupNames } from "./generate-notion";
import { buildCloudBlueprint } from "./generate-cloud";
import { buildServerDcBlueprint } from "./generate-server-dc";
import { guardedDirectory, writeManifestAndReport } from "./manifest";
import { repositoryRoot } from "./source-fixtures";

const ALL_GROUPS = [...notionGroupNames(), "cloud-csv-scale", "server-dc-entities"];
const DEFAULT_OUTPUT = "evidence/generated/imports";
const DEFAULT_MANIFESTS = "evidence/imports";
const DEFAULT_ALLOWED_EMAIL = "scale-reader@example.test";

type Arguments = {
  groups: string[];
  outputDir: string;
  manifestDir: string;
  allowedMemberEmail: string;
  manifestOverrides: Map<string, string>;
  plan: boolean;
  help: boolean;
};

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = {
    groups: [],
    outputDir: DEFAULT_OUTPUT,
    manifestDir: DEFAULT_MANIFESTS,
    allowedMemberEmail: DEFAULT_ALLOWED_EMAIL,
    manifestOverrides: new Map(),
    plan: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const take = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(arg + " requires a value.");
      index += 1;
      return value;
    };
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--plan") result.plan = true;
    else if (arg === "--group") result.groups.push(take());
    else if (arg === "--output-dir") result.outputDir = take();
    else if (arg === "--manifest-dir") result.manifestDir = take();
    else if (arg === "--allowed-member-email") result.allowedMemberEmail = take();
    else if (arg === "--manifest-path") {
      const specification = take();
      const separator = specification.indexOf("=");
      if (separator < 1 || separator === specification.length - 1) throw new Error("--manifest-path must be GROUP=PATH.");
      const group = specification.slice(0, separator);
      if (result.manifestOverrides.has(group)) throw new Error("Manifest path was provided twice for " + group + ".");
      result.manifestOverrides.set(group, specification.slice(separator + 1));
    } else throw new Error("Unknown import-scale option: " + arg);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(result.allowedMemberEmail)) throw new Error("--allowed-member-email must be a valid email address.");
  return result;
}

function selectedGroups(requested: string[]): string[] {
  const groups = requested.length ? requested : ["all"];
  const expanded = groups.flatMap((group) => group === "all" ? ALL_GROUPS : [group]);
  const unique = [...new Set(expanded)];
  const unknown = unique.filter((group) => !ALL_GROUPS.includes(group));
  if (unknown.length) throw new Error("Unknown import-scale group: " + unknown.join(", "));
  return unique;
}

function printHelp(): void {
  process.stdout.write([
    "Deterministic import scale archive generator",
    "",
    "Usage:",
    "  pnpm exec tsx scripts/import-scale/cli.ts [options]",
    "",
    "Options:",
    "  --group NAME                 Repeatable group; use all for every archive (default: all)",
    "  --output-dir PATH            Must remain under evidence/generated/imports",
    "  --manifest-dir PATH          Must remain under evidence/imports",
    "  --manifest-path GROUP=PATH   Override one JSON manifest path; a matching .txt is written",
    "  --allowed-member-email EMAIL Explicit destination email for the known source member",
    "  --plan                       Print group/count plan without building archives",
    "  --help                       Show this help",
    "",
    "Groups:",
    ...ALL_GROUPS.map((group) => "  " + group),
    "",
  ].join("\n"));
}

function planLine(group: string): string {
  if (group === "notion-scale") return group + ": 3,055 source pages; 7 databases; 42 inferred fields; 22 records; 110 source CSV cells (60 populated, 50 blank); 15 source media objects; 3,066 physical pages/revisions; 17 physical files.";
  if (group === "cloud-csv-scale") return group + ": 3,000 source pages; 4,000 source versions; 3,000 restriction rows (2,999 mapped, 1 unknown); 2,997 labels; 7,000 physical revisions.";
  if (group === "server-dc-entities") return group + ": 3,000 entities.xml pages; 3,000 source versions; 3,000 permission sets; 3,000 labels; 6,000 physical revisions.";
  if (group === "boundary-20000") return group + ": exactly 20,000 ZIP file entries; success expected.";
  if (group === "boundary-20001") return group + ": exactly 20,001 ZIP file entries; entry-count refusal expected.";
  if (group === "boundary-512m") return group + ": exactly 536,870,912 expanded bytes; success expected.";
  if (group === "boundary-512m-plus-one") return group + ": exactly 536,870,913 expanded bytes; expanded-byte refusal expected.";
  if (group === "boundary-64m") return group + ": one exactly 67,108,864-byte entry; success expected.";
  return group + ": one 67,108,865-byte entry; per-entry refusal expected.";
}

function manifestTarget(root: string, manifestDir: string, group: string, overrides: Map<string, string>): string {
  const override = overrides.get(group);
  if (!override) return resolve(root, manifestDir, "generator-" + group + ".json");
  const path = override.startsWith("evidence/imports/") ? resolve(root, override) : resolve(root, manifestDir, override);
  if (!path.endsWith(".json")) throw new Error("Manifest override for " + group + " must end in .json.");
  return path;
}

async function generateOne(root: string, group: string, options: Arguments, outputDirectory: string): Promise<void> {
  const blueprint = group === "cloud-csv-scale"
    ? buildCloudBlueprint(root, group, options.allowedMemberEmail)
    : group === "server-dc-entities"
      ? buildServerDcBlueprint(root, group, options.allowedMemberEmail)
      : buildNotionBlueprint(root, group);
  const archivePath = resolve(outputDirectory, blueprint.archiveName);
  const archive = await writeZipArchive(archivePath, blueprint.entries);
  const archiveRelativePath = relative(root, archivePath);
  const manifestPath = manifestTarget(root, options.manifestDir, group, options.manifestOverrides);
  const manifestAndReport = await writeManifestAndReport(blueprint, archiveRelativePath, archive, root, manifestPath);
  const result = manifestAndReport.content.archive;
  process.stdout.write(
    "Generated " + group + ": " + result.files + " files, " + result.expandedBytes + " expanded bytes, " +
    result.maximumFileBytes + " maximum file bytes, archive " + result.bytes + " bytes; " +
    manifestAndReport.manifestPath + " and " + manifestAndReport.reportPath + "\n",
  );
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  const groups = selectedGroups(options.groups);
  const root = repositoryRoot(dirname(fileURLToPath(import.meta.url)));
  if (options.plan) {
    process.stdout.write(groups.map(planLine).join("\n") + "\n");
    return;
  }
  const outputRelative = relative(root, resolve(root, options.outputDir));
  const manifestRelative = relative(root, resolve(root, options.manifestDir));
  const outputDirectory = await guardedDirectory(root, "evidence/generated/imports", outputRelative);
  await guardedDirectory(root, "evidence/imports", manifestRelative);
  for (const group of groups) await generateOne(root, group, options, outputDirectory);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown import-scale generator failure.";
  process.stderr.write("import-scale generator failed: " + message + "\n");
  process.exitCode = 1;
});
