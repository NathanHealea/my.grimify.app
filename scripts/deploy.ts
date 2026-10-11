import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export const ENV_NAMES = ["dev", "stage", "prod"] as const;
export type EnvName = (typeof ENV_NAMES)[number];

export type Environment = {
  branch: string;
  worker: string;
  domain: string;
  wranglerEnv: string | null;
  // null until the owner creates the deployment (docs/DEPLOYMENT.md); deploys refuse until then.
  convexDeployment: string | null;
};

export const ENVIRONMENTS: Record<EnvName, Environment> = {
  dev: {
    branch: "dev",
    worker: "v2-grimify-app-dev",
    domain: "dev.grimify.app",
    wranglerEnv: "dev",
    convexDeployment: "sensible-buffalo-782",
  },
  stage: {
    branch: "stage",
    worker: "v2-grimify-app-stage",
    domain: "stage.grimify.app",
    wranglerEnv: "stage",
    convexDeployment: "notable-ferret-719",
  },
  prod: {
    branch: "main",
    worker: "v2-grimify-app",
    domain: "grimify.app",
    wranglerEnv: null,
    convexDeployment: "nautical-toucan-398",
  },
};

export function settingsFile(env: EnvName): string {
  return `.env.deploy.${env}.local`;
}

export type GitState = { branch: string; dirty: boolean; ahead: number; behind: number };

export type Step = { kind: "run"; argv: string[] } | { kind: "check-build"; deployment: string };

export type Plan = {
  env: EnvName;
  convexDeployment: string;
  childEnv: Record<string, string>;
  steps: Step[];
};

function isEnvName(name: string): name is EnvName {
  return (ENV_NAMES as readonly string[]).includes(name);
}

export function environmentFor(
  name: string,
  environments: Record<EnvName, Environment> = ENVIRONMENTS,
): { name: EnvName; environment: Environment; deployment: string } {
  if (!isEnvName(name)) {
    throw new Error(`Unknown environment "${name}"; use one of ${ENV_NAMES.join(", ")}`);
  }
  const environment = environments[name];
  const deployment = environment.convexDeployment;
  if (deployment === null) {
    throw new Error(
      `${name} isn't set up yet: create its Convex deployment and record its name in ENVIRONMENTS (scripts/deploy.ts)`,
    );
  }
  return { name, environment, deployment };
}

export function planDeploy(
  name: string,
  git: GitState,
  settings: Record<string, string> | undefined,
  baseEnv: Record<string, string | undefined>,
  environments: Record<EnvName, Environment> = ENVIRONMENTS,
): Plan {
  const { name: env, environment, deployment } = environmentFor(name, environments);

  if (git.branch !== environment.branch) {
    throw new Error(`deploy:${env} runs from ${environment.branch}; you are on ${git.branch}`);
  }
  if (git.dirty) throw new Error("You have uncommitted changes; commit or stash them first");
  if (git.ahead > 0) {
    throw new Error(`${environment.branch} has commits origin doesn't; push first`);
  }
  if (git.behind > 0) {
    throw new Error(`origin/${environment.branch} has commits you don't; pull first`);
  }

  const file = settingsFile(env);
  if (settings === undefined) throw new Error(`${file} is missing; see docs/ENVIRONMENT.md`);
  const deployKey = settings.CONVEX_DEPLOY_KEY;
  const publishableKey = settings.VITE_CLERK_PUBLISHABLE_KEY;
  if (!deployKey) throw new Error(`${file} has no CONVEX_DEPLOY_KEY`);
  if (!publishableKey) throw new Error(`${file} has no VITE_CLERK_PUBLISHABLE_KEY`);
  if (!publishableKey.startsWith("pk_live_")) {
    throw new Error(`${file}: VITE_CLERK_PUBLISHABLE_KEY must be the production pk_live_ key`);
  }
  // Production keys are `prod:<deployment>|<secret>` (docs.convex.dev/cli/deploy-key-types). Never echo the key.
  if (!deployKey.startsWith(`prod:${deployment}|`)) {
    throw new Error(`${file}: CONVEX_DEPLOY_KEY must be a production key for ${deployment}`);
  }

  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && key !== "CONVEX_DEPLOYMENT") childEnv[key] = value;
  }
  // Convex reads the deploy key from --env-file, so it stays out of the build's and Wrangler's environment.
  childEnv.VITE_CLERK_PUBLISHABLE_KEY = publishableKey;
  childEnv.GRIMIFY_DEPLOY = env;

  // --no: a missing local install fails instead of downloading an unpinned package.
  const wrangler = ["npx", "--no", "wrangler", "deploy"];
  // An empty --env names the top-level (production) Worker; Wrangler warns when it's left out.
  wrangler.push("--env", environment.wranglerEnv ?? "");

  return {
    env,
    convexDeployment: deployment,
    childEnv,
    steps: [
      {
        kind: "run",
        argv: [
          "npx",
          "--no",
          "convex",
          "deploy",
          "--env-file",
          file,
          "--cmd",
          "npm run build",
          "--cmd-url-env-var-name",
          "VITE_CONVEX_URL",
        ],
      },
      { kind: "check-build", deployment },
      { kind: "run", argv: wrangler },
    ],
  };
}

export function checkBuiltHeaders(headersText: string, deployment: string): void {
  const line = headersText.split(/\r?\n/).find((l) => /^\s+content-security-policy:/i.test(l));
  if (line === undefined) throw new Error("dist/_headers has no Content-Security-Policy");
  const connectSrc = line
    .slice(line.indexOf(":") + 1)
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([directive]) => directive?.toLowerCase() === "connect-src");
  const convexHosts = new Set(
    (connectSrc ?? []).filter((source) => source.includes("convex.cloud")),
  );
  const expected = new Set([
    `https://${deployment}.convex.cloud`,
    `wss://${deployment}.convex.cloud`,
  ]);
  const matches =
    convexHosts.size === expected.size && [...expected].every((host) => convexHosts.has(host));
  if (!matches) {
    throw new Error(
      `The build targets ${[...convexHosts].join(" ") || "no Convex host"}, not ${deployment}; nothing was uploaded to Cloudflare`,
    );
  }
}

export async function runPlan(
  plan: Plan,
  io: {
    run(argv: string[], env: Record<string, string>): Promise<number>;
    readBuiltHeaders(): Promise<string>;
  },
): Promise<number> {
  for (const step of plan.steps) {
    if (step.kind === "check-build") {
      try {
        checkBuiltHeaders(await io.readBuiltHeaders(), step.deployment);
      } catch (error) {
        console.error((error as Error).message);
        return 1;
      }
      continue;
    }
    const code = await io.run(step.argv, plan.childEnv);
    if (code !== 0) return code;
  }
  return 0;
}

function runGit(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function readGitState(
  branch: string,
  git: (...args: string[]) => string = runGit,
): GitState {
  const current = git("rev-parse", "--abbrev-ref", "HEAD");
  const dirty = git("status", "--porcelain") !== "";
  // planDeploy refuses these first, so don't contact GitHub for them.
  if (current !== branch || dirty) return { branch: current, dirty, ahead: 0, behind: 0 };
  try {
    git("fetch", "--quiet", "origin", branch);
  } catch {
    throw new Error(`Couldn't fetch origin/${branch}; does the branch exist on GitHub?`);
  }
  const [behind, ahead] = git("rev-list", "--left-right", "--count", `origin/${branch}...HEAD`)
    .split(/\s+/)
    .map(Number);
  return { branch: current, dirty, ahead: ahead ?? 0, behind: behind ?? 0 };
}

async function readSettings(file: string): Promise<Record<string, string> | undefined> {
  try {
    return parseEnv(await readFile(file, "utf8")) as Record<string, string>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function run(argv: string[], env: Record<string, string>): Promise<number> {
  const [command, ...args] = argv as [string, ...string[]];
  return new Promise((resolve, reject) => {
    spawn(command, args, { env, stdio: "inherit" })
      .on("error", reject)
      .on("exit", (code) => resolve(code ?? 1));
  });
}

async function main(name: string): Promise<number> {
  let plan: Plan;
  try {
    const { environment } = environmentFor(name);
    const gitState = readGitState(environment.branch);
    plan = planDeploy(
      name,
      gitState,
      await readSettings(settingsFile(name as EnvName)),
      process.env,
    );
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  const { worker, domain } = ENVIRONMENTS[plan.env];
  console.log(
    `Deploying ${plan.env}: Convex ${plan.convexDeployment}, Worker ${worker} (${domain})`,
  );
  return runPlan(plan, { run, readBuiltHeaders: () => readFile("dist/_headers", "utf8") });
}

if (import.meta.main) {
  process.exitCode = await main(process.argv[2] ?? "");
}
