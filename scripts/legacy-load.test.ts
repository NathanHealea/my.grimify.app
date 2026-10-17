// @vitest-environment node
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ENVIRONMENTS } from "./deploy.ts";

const SCRIPT = join(import.meta.dirname, "legacy-load.ts");
const HASH = "0123456789abcdef".repeat(4);
const PALETTE_NAME = "Secret Palette Name";

let dir: string;

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Runs the CLI against a fake `npx` (or none) so nothing reaches a real deployment.
function runCli(fakeNpx: string | null) {
  dir = mkdtempSync(join(tmpdir(), "legacy-load-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  if (fakeNpx !== null) {
    writeFileSync(join(bin, "npx"), `#!/bin/sh\n${fakeNpx}\n`);
    chmodSync(join(bin, "npx"), 0o755);
  }
  writeFileSync(
    join(dir, ".env.deploy.dev.local"),
    `CONVEX_DEPLOY_KEY=prod:${ENVIRONMENTS.dev.convexDeployment}|ZmFrZS1zZWNyZXQ=\n`,
  );
  writeFileSync(
    join(dir, "export.json"),
    JSON.stringify([
      {
        emailHash: HASH,
        ownedPaintIds: ["citadel-base-abaddon-black"],
        palettes: [{ name: PALETTE_NAME, paintIds: [], groups: [] }],
      },
    ]),
  );
  const result = spawnSync(process.execPath, [SCRIPT, "dev", "export.json"], {
    cwd: dir,
    env: { PATH: bin },
    encoding: "utf8",
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("legacy:load CLI", () => {
  it("keeps convex run's stderr, which echoes the arguments, off the terminal", () => {
    const { status, output } = runCli('echo "$@" >&2\nexit 1');

    expect(output).toContain("failed 1");
    expect(status).toBe(1);
    expect(output).not.toContain(HASH);
    expect(output).not.toContain(PALETTE_NAME);
  });

  it("reports a convex run that can't start without its arguments", () => {
    const { status, output } = runCli(null);

    expect(output).toContain("Couldn't start convex run: ENOENT");
    expect(status).not.toBe(0);
    expect(output).not.toContain(HASH);
    expect(output).not.toContain(PALETTE_NAME);
  });
});
