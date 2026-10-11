// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  checkBuiltHeaders,
  type Environment,
  ENVIRONMENTS,
  type EnvName,
  type GitState,
  type Plan,
  planDeploy,
  readGitState,
  runPlan,
  settingsFile,
} from "./deploy.ts";

const DEV_DEPLOY_KEY = "prod:happy-otter-123|ZmFrZS1zZWNyZXQ=";
const STAGE_DEPLOY_KEY = "prod:brave-lynx-456|ZmFrZS1zZWNyZXQ=";
const PROD_DEPLOY_KEY = "prod:nautical-toucan-398|ZmFrZS1zZWNyZXQ=";
const LIVE_CLERK_KEY = "pk_live_ZmFrZS5leGFtcGxlJA";

const testEnvironments: Record<EnvName, Environment> = {
  dev: { ...ENVIRONMENTS.dev, convexDeployment: "happy-otter-123" },
  stage: { ...ENVIRONMENTS.stage, convexDeployment: "brave-lynx-456" },
  prod: { ...ENVIRONMENTS.prod },
};

function cleanGit(branch: string): GitState {
  return { branch, dirty: false, ahead: 0, behind: 0 };
}

function settings(deployKey: string): Record<string, string> {
  return { CONVEX_DEPLOY_KEY: deployKey, VITE_CLERK_PUBLISHABLE_KEY: LIVE_CLERK_KEY };
}

function headersFor(...hosts: string[]): string {
  const convex = hosts
    .flatMap((h) => [`https://${h}.convex.cloud`, `wss://${h}.convex.cloud`])
    .join(" ");
  return `/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self' ${convex} https://clerk.grimify.app\n`;
}

function devPlan(): Plan {
  return planDeploy(
    "dev",
    cleanGit("dev"),
    settings(DEV_DEPLOY_KEY),
    { PATH: "/bin" },
    testEnvironments,
  );
}

type Call = { argv: string[]; env: Record<string, string> };

function recordingIo(exitCodes: number[], headers: string) {
  const calls: Call[] = [];
  let headerReads = 0;
  const io = {
    run(argv: string[], env: Record<string, string>): Promise<number> {
      calls.push({ argv, env });
      return Promise.resolve(exitCodes[calls.length - 1] ?? 0);
    },
    readBuiltHeaders(): Promise<string> {
      headerReads += 1;
      return Promise.resolve(headers);
    },
  };
  return { io, calls, headerReads: () => headerReads };
}

describe("deploy environments", () => {
  it("maps each environment to its branch, Worker, domain and wrangler env", () => {
    expect(ENVIRONMENTS.dev).toMatchObject({
      branch: "dev",
      worker: "v2-grimify-app-dev",
      domain: "dev.grimify.app",
      wranglerEnv: "dev",
    });
    expect(ENVIRONMENTS.stage).toMatchObject({
      branch: "stage",
      worker: "v2-grimify-app-stage",
      domain: "stage.grimify.app",
      wranglerEnv: "stage",
    });
    expect(ENVIRONMENTS.prod).toEqual({
      branch: "main",
      worker: "v2-grimify-app",
      domain: "grimify.app",
      wranglerEnv: null,
      convexDeployment: "nautical-toucan-398",
    });
    expect(settingsFile("dev")).toBe(".env.deploy.dev.local");
    expect(settingsFile("stage")).toBe(".env.deploy.stage.local");
    expect(settingsFile("prod")).toBe(".env.deploy.prod.local");
  });

  it("refuses an environment whose Convex deployment isn't set up yet", () => {
    const attempt = () =>
      planDeploy(
        "dev",
        cleanGit("dev"),
        settings(DEV_DEPLOY_KEY),
        { PATH: "/bin" },
        { ...testEnvironments, dev: { ...ENVIRONMENTS.dev, convexDeployment: null } },
      );

    expect(attempt).toThrow(/dev isn't set up yet/);
    expect(attempt).toThrow(/ENVIRONMENTS/);
  });
});

describe("planDeploy", () => {
  it("plans convex deploy, then wrangler deploy, in that order", () => {
    const plan = devPlan();

    expect(plan.env).toBe("dev");
    expect(plan.convexDeployment).toBe("happy-otter-123");
    expect(plan.steps).toEqual([
      {
        kind: "run",
        argv: [
          "npx",
          "--no",
          "convex",
          "deploy",
          "--env-file",
          ".env.deploy.dev.local",
          "--cmd",
          "npm run build",
          "--cmd-url-env-var-name",
          "VITE_CONVEX_URL",
        ],
      },
      { kind: "check-build", deployment: "happy-otter-123" },
      { kind: "run", argv: ["npx", "--no", "wrangler", "deploy", "--env", "dev"] },
    ]);
  });

  it("plans prod against its own settings file and the top-level Worker", () => {
    const plan = planDeploy(
      "prod",
      cleanGit("main"),
      settings(PROD_DEPLOY_KEY),
      { PATH: "/bin" },
      testEnvironments,
    );

    expect(plan.steps[0]).toEqual({
      kind: "run",
      argv: [
        "npx",
        "--no",
        "convex",
        "deploy",
        "--env-file",
        ".env.deploy.prod.local",
        "--cmd",
        "npm run build",
        "--cmd-url-env-var-name",
        "VITE_CONVEX_URL",
      ],
    });
    expect(plan.steps[1]).toEqual({ kind: "check-build", deployment: "nautical-toucan-398" });
    expect(plan.steps[2]).toEqual({
      kind: "run",
      argv: ["npx", "--no", "wrangler", "deploy", "--env", ""],
    });
  });

  it("passes the publishable key, keeps the deploy key in the settings file and drops the local CONVEX_DEPLOYMENT", () => {
    const plan = planDeploy(
      "dev",
      cleanGit("dev"),
      settings(DEV_DEPLOY_KEY),
      {
        PATH: "/bin",
        CONVEX_DEPLOYMENT: "dev:proper-bloodhound-699",
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_x",
        UNSET: undefined,
      },
      testEnvironments,
    );

    expect(plan.childEnv).toEqual({
      PATH: "/bin",
      VITE_CLERK_PUBLISHABLE_KEY: LIVE_CLERK_KEY,
      GRIMIFY_DEPLOY: "dev",
    });
    expect(Object.values(plan.childEnv).join("\n")).not.toContain(DEV_DEPLOY_KEY);
  });

  it("refuses an unknown environment", () => {
    const attempt = () =>
      planDeploy("qa", cleanGit("dev"), settings(DEV_DEPLOY_KEY), {}, testEnvironments);

    expect(attempt).toThrow(/dev/);
    expect(attempt).toThrow(/stage/);
    expect(attempt).toThrow(/prod/);
  });

  it("refuses the wrong branch", () => {
    expect(() =>
      planDeploy("prod", cleanGit("dev"), settings(PROD_DEPLOY_KEY), {}, testEnvironments),
    ).toThrow("deploy:prod runs from main; you are on dev");
    expect(() =>
      planDeploy("dev", cleanGit("main"), settings(DEV_DEPLOY_KEY), {}, testEnvironments),
    ).toThrow(/runs from dev/);
  });

  it("refuses a dirty tree or a HEAD that differs from origin", () => {
    const dirty: GitState = { branch: "stage", dirty: true, ahead: 0, behind: 0 };
    const ahead: GitState = { branch: "stage", dirty: false, ahead: 1, behind: 0 };
    const behind: GitState = { branch: "stage", dirty: false, ahead: 0, behind: 1 };

    expect(() =>
      planDeploy("stage", dirty, settings(STAGE_DEPLOY_KEY), {}, testEnvironments),
    ).toThrow(/uncommitted/);
    expect(() =>
      planDeploy("stage", ahead, settings(STAGE_DEPLOY_KEY), {}, testEnvironments),
    ).toThrow(/push first/);
    expect(() =>
      planDeploy("stage", behind, settings(STAGE_DEPLOY_KEY), {}, testEnvironments),
    ).toThrow(/pull first/);
  });

  it("refuses missing settings", () => {
    expect(() => planDeploy("dev", cleanGit("dev"), undefined, {}, testEnvironments)).toThrow(
      ".env.deploy.dev.local",
    );
    expect(() =>
      planDeploy(
        "dev",
        cleanGit("dev"),
        { VITE_CLERK_PUBLISHABLE_KEY: LIVE_CLERK_KEY },
        {},
        testEnvironments,
      ),
    ).toThrow("CONVEX_DEPLOY_KEY");
    expect(() =>
      planDeploy(
        "dev",
        cleanGit("dev"),
        { CONVEX_DEPLOY_KEY: DEV_DEPLOY_KEY },
        {},
        testEnvironments,
      ),
    ).toThrow("VITE_CLERK_PUBLISHABLE_KEY");
  });

  it("refuses a test Clerk key", () => {
    const testKeySettings = {
      CONVEX_DEPLOY_KEY: DEV_DEPLOY_KEY,
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_ZmFrZS5leGFtcGxlJA",
    };

    expect(() => planDeploy("dev", cleanGit("dev"), testKeySettings, {}, testEnvironments)).toThrow(
      "pk_live_",
    );
  });

  it("refuses another environment's Convex key without printing it", () => {
    const cases = [
      { key: "prod:nautical-toucan-398|secretAAA", secret: "secretAAA" },
      { key: "dev:happy-otter-123|secretBBB", secret: "secretBBB" },
      { key: "preview:team:proj|secretCCC", secret: "secretCCC" },
      { key: "garbageWithoutAPipeDDD", secret: "garbageWithoutAPipeDDD" },
      { key: "prod:happy-otter-1234|secretEEE", secret: "secretEEE" },
    ];

    for (const { key, secret } of cases) {
      let message = "";
      try {
        planDeploy("dev", cleanGit("dev"), settings(key), {}, testEnvironments);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, key).toContain("happy-otter-123");
      expect(message, key).not.toContain(key);
      expect(message, key).not.toContain(secret);
    }
  });
});

describe("checkBuiltHeaders", () => {
  it("accepts a build whose CSP names only the expected deployment", () => {
    expect(() => checkBuiltHeaders(headersFor("happy-otter-123"), "happy-otter-123")).not.toThrow();
  });

  it("refuses to upload a build made for another Convex deployment", () => {
    expect(() =>
      checkBuiltHeaders(headersFor("proper-bloodhound-699"), "happy-otter-123"),
    ).toThrow();
    expect(() =>
      checkBuiltHeaders(headersFor("happy-otter-123", "proper-bloodhound-699"), "happy-otter-123"),
    ).toThrow();
    expect(() =>
      checkBuiltHeaders(
        "/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self' https://happy-otter-123.convex.cloud\n",
        "happy-otter-123",
      ),
    ).toThrow();
  });
});

describe("runPlan", () => {
  it("runs both commands with the plan's env and returns 0 on success", async () => {
    const plan = devPlan();
    const { io, calls, headerReads } = recordingIo([0, 0], headersFor("happy-otter-123"));

    const code = await runPlan(plan, io);

    expect(code).toBe(0);
    expect(headerReads()).toBe(1);
    expect(calls.map((c) => c.argv[2])).toEqual(["convex", "wrangler"]);
    for (const call of calls) expect(call.env).toEqual(plan.childEnv);
  });

  it("stops at the first failed command", async () => {
    const { io, calls, headerReads } = recordingIo([1, 0], headersFor("happy-otter-123"));

    const code = await runPlan(devPlan(), io);

    expect(code).toBe(1);
    expect(calls).toHaveLength(1);
    expect(headerReads()).toBe(0);
  });

  it("refuses to upload a build made for another Convex deployment", async () => {
    for (const headers of [
      headersFor("proper-bloodhound-699"),
      headersFor("happy-otter-123", "proper-bloodhound-699"),
    ]) {
      const { io, calls } = recordingIo([0, 0], headers);

      const code = await runPlan(devPlan(), io);

      expect(code).toBe(1);
      expect(calls.map((c) => c.argv[2])).toEqual(["convex"]);
    }
  });
});

describe("checkBuiltHeaders without a CSP", () => {
  it("refuses a build whose _headers has no Content-Security-Policy", () => {
    expect(() =>
      checkBuiltHeaders("/*\n  X-Content-Type-Options: nosniff\n", "happy-otter-123"),
    ).toThrow(/Content-Security-Policy/);
  });
});

describe("runPlan failures", () => {
  function devPlan(): Plan {
    return planDeploy("dev", cleanGit("dev"), settings(DEV_DEPLOY_KEY), {}, testEnvironments);
  }

  it("returns the Worker upload's exit code when it fails", async () => {
    const codes = [0, 2];
    const code = await runPlan(devPlan(), {
      run: () => Promise.resolve(codes.shift() ?? 0),
      readBuiltHeaders: () => Promise.resolve(headersFor("happy-otter-123")),
    });

    expect(code).toBe(2);
  });

  it("fails without uploading when dist/_headers can't be read", async () => {
    const calls: string[][] = [];
    const code = await runPlan(devPlan(), {
      run: (argv) => {
        calls.push(argv);
        return Promise.resolve(0);
      },
      readBuiltHeaders: () => Promise.reject(new Error("ENOENT: dist/_headers")),
    });

    expect(code).toBe(1);
    expect(calls.map((argv) => argv[2])).toEqual(["convex"]);
  });
});

describe("readGitState", () => {
  function fakeGit(outputs: Record<string, string>) {
    const calls: string[] = [];
    const git = (...args: string[]) => {
      calls.push(args[0] ?? "");
      return outputs[args[0] ?? ""] ?? "";
    };
    return { calls, git };
  }

  it("fetches, then reads behind and ahead in rev-list's left-right order", () => {
    const { calls, git } = fakeGit({ "rev-parse": "dev", status: "", "rev-list": "3\t1" });

    expect(readGitState("dev", git)).toEqual({ branch: "dev", dirty: false, ahead: 1, behind: 3 });
    expect(calls.indexOf("fetch")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("fetch")).toBeLessThan(calls.indexOf("rev-list"));
  });

  it("doesn't contact GitHub on the wrong branch or a dirty tree", () => {
    const wrongBranch = fakeGit({ "rev-parse": "main", status: "" });
    const dirty = fakeGit({ "rev-parse": "dev", status: " M package.json" });

    expect(readGitState("dev", wrongBranch.git).branch).toBe("main");
    expect(readGitState("dev", dirty.git).dirty).toBe(true);
    expect([...wrongBranch.calls, ...dirty.calls]).not.toContain("fetch");
  });
});
