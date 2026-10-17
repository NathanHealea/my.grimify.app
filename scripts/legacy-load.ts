import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

import { environmentFor, type EnvName, settingsFile } from "./deploy.ts";
import { loaderEnv, loadExport, readExport, type RunResult } from "./legacy/load.ts";

// Loads an export from legacy:export into one environment's Convex deployment (docs/features/legacy-import.md).
const USAGE = "usage: npm run legacy:load -- <dev|stage|prod> <export.json>";

async function readDeployKey(env: EnvName): Promise<string | undefined> {
  const file = settingsFile(env);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${file} is missing; see docs/ENVIRONMENT.md`, { cause: error });
    }
    throw error;
  }
  return parseEnv(text).CONVEX_DEPLOY_KEY;
}

// stderr isn't shown: Convex argument errors echo the values, which would print hashes and names.
function run(argv: string[], env: Record<string, string>): Promise<RunResult> {
  const [command, ...args] = argv as [string, ...string[]];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (data: string) => (stdout += data));
    // The spawn error's spawnargs would print the chunk; report only the code.
    child
      .on("error", (error: NodeJS.ErrnoException) =>
        reject(new Error(`Couldn't start convex run: ${error.code ?? "unknown error"}`)),
      )
      .on("close", (code) => resolve({ code: code ?? 1, stdout }));
  });
}

async function main(args: string[]): Promise<number> {
  const [envArg, file] = args;
  let env: Record<string, string>;
  let records;
  let target: string;
  try {
    if (!envArg || !file) throw new Error(USAGE);
    const { name, deployment } = environmentFor(envArg);
    env = loaderEnv(deployment, await readDeployKey(name), process.env);
    records = readExport(await readFile(file, "utf8"));
    target = `${name} (${deployment})`;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  console.log(`Loading ${records.length} records into ${target}`);
  const counts = await loadExport(records, env, run);
  console.log(
    `Staged ${counts.staged}, already claimed ${counts.claimed}, failed ${counts.failed}`,
  );
  return counts.failed > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
