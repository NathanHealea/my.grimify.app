// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHUNK_MAX_BYTES,
  chunkRecord,
  loaderEnv,
  loadExport,
  readExport,
  type RunResult,
  type StageChunkArgs,
} from "./load.ts";
import type { ExportPalette, ExportRecord } from "./transform.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "0123456789abcdef".repeat(4);
const HASH_C = "fedcba9876543210".repeat(4);
const DEPLOY_KEY = "prod:happy-otter-123|ZmFrZS1zZWNyZXQ=";

function paintId(i: number): string {
  return `citadel-base-abaddon-black-${String(i).padStart(4, "0")}`;
}

function largePalette(index: number): ExportPalette {
  const paintIds = Array.from({ length: 200 }, (_, i) => paintId(i));
  return {
    name: `Palette ${index} ${"x".repeat(40)}`,
    paintIds,
    groups: Array.from({ length: 5 }, (_, g) => ({
      name: `Group ${g}`,
      paintIds: paintIds.slice(g * 40, g * 40 + 40),
    })),
  };
}

function smallRecord(emailHash: string): ExportRecord {
  return {
    emailHash,
    ownedPaintIds: [paintId(1), paintId(2)],
    palettes: [{ name: "Reds", paintIds: [paintId(1)], groups: [] }],
  };
}

type Call = { argv: string[]; env: Record<string, string> };

function stubRunner(results: RunResult[]) {
  const calls: Call[] = [];
  const run = (argv: string[], env: Record<string, string>): Promise<RunResult> => {
    calls.push({ argv, env });
    return Promise.resolve(results[calls.length - 1] ?? { code: 0, stdout: '"staged"\n' });
  };
  return { run, calls };
}

function stagedArgs(call: Call): StageChunkArgs {
  return JSON.parse(call.argv[call.argv.length - 1]) as StageChunkArgs;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("legacy load", () => {
  it("chunkRecord keeps every chunk under the size limit", () => {
    const record: ExportRecord = {
      emailHash: HASH_A,
      ownedPaintIds: Array.from({ length: 2837 }, (_, i) => paintId(i)),
      palettes: Array.from({ length: 60 }, (_, i) => largePalette(i)),
    };
    expect(Buffer.byteLength(JSON.stringify(record))).toBeGreaterThan(CHUNK_MAX_BYTES);

    const chunks = chunkRecord(record);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Buffer.byteLength(JSON.stringify(chunk))).toBeLessThan(CHUNK_MAX_BYTES);
      expect(chunk.emailHash).toBe(HASH_A);
    }
    expect(chunks.map((chunk) => chunk.reset)).toEqual(chunks.map((_, i) => i === 0));
    expect(chunks.map((chunk) => chunk.done)).toEqual(
      chunks.map((_, i) => i === chunks.length - 1),
    );
    expect(chunks.flatMap((chunk) => chunk.ownedPaintIds)).toEqual(record.ownedPaintIds);
    expect(chunks.flatMap((chunk) => chunk.palettes)).toEqual(record.palettes);

    const longOwned = Array.from({ length: 2837 }, (_, i) => `${paintId(i)}-${"x".repeat(15)}`);
    expect(Buffer.byteLength(JSON.stringify(longOwned))).toBeGreaterThan(130_000);
    const ownedChunks = chunkRecord({ emailHash: HASH_A, ownedPaintIds: longOwned, palettes: [] });
    expect(ownedChunks.length).toBeGreaterThan(1);
    for (const chunk of ownedChunks) {
      expect(Buffer.byteLength(JSON.stringify(chunk))).toBeLessThan(CHUNK_MAX_BYTES);
    }
    expect(ownedChunks.flatMap((chunk) => chunk.ownedPaintIds)).toEqual(longOwned);

    expect(chunkRecord({ emailHash: HASH_A, ownedPaintIds: [], palettes: [] })).toEqual([
      { emailHash: HASH_A, reset: true, done: true, ownedPaintIds: [], palettes: [] },
    ]);

    expect(() =>
      chunkRecord({ emailHash: HASH_A, ownedPaintIds: [], palettes: [largePalette(0)] }, 2_000),
    ).toThrow();
  });

  it("chunkRecord counts shell escaping of apostrophes toward the limit", () => {
    const quoted = "'".repeat(60);
    const palettes = Array.from({ length: 50 }, () => ({
      name: quoted,
      paintIds: [],
      groups: Array.from({ length: 30 }, () => ({ name: quoted, paintIds: [] })),
    }));

    const chunks = chunkRecord({ emailHash: HASH_A, ownedPaintIds: [], palettes });

    for (const chunk of chunks) {
      const json = JSON.stringify(chunk);
      expect(Buffer.byteLength(json) + 3 * (json.split("'").length - 1)).toBeLessThan(100_000);
    }
  });

  it("loadExport runs one convex call per chunk with the deploy key in the environment", async () => {
    const env = loaderEnv("happy-otter-123", DEPLOY_KEY, {
      PATH: "/usr/bin",
      CONVEX_DEPLOYMENT: "dev:other-deployment-999",
      UNSET: undefined,
    });
    expect(env).toEqual({ PATH: "/usr/bin", CONVEX_DEPLOY_KEY: DEPLOY_KEY });
    expect(() => loaderEnv("happy-otter-123", undefined, {})).toThrow();
    expect(() => loaderEnv("happy-otter-123", "", {})).toThrow();
    expect(() =>
      loaderEnv("happy-otter-123", "prod:brave-lynx-456|ZmFrZS1zZWNyZXQ=", {}),
    ).toThrow();

    const big: ExportRecord = {
      emailHash: HASH_B,
      ownedPaintIds: Array.from({ length: 2837 }, (_, i) => `${paintId(i)}-${"x".repeat(15)}`),
      palettes: [],
    };
    expect(Buffer.byteLength(JSON.stringify(big.ownedPaintIds))).toBeGreaterThan(130_000);
    const bigChunks = chunkRecord(big);
    expect(bigChunks.length).toBeGreaterThan(1);
    const records = [smallRecord(HASH_A), big, smallRecord(HASH_C)];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const staged = stubRunner([]);
    expect(await loadExport(records, env, staged.run)).toEqual({
      staged: 3,
      claimed: 0,
      failed: 0,
    });
    expect(staged.calls).toHaveLength(2 + bigChunks.length);
    for (const call of staged.calls) {
      expect(call.argv.slice(0, -1)).toEqual([
        "npx",
        "--no",
        "convex",
        "run",
        "legacyImports:stageChunk",
      ]);
      expect(call.env.CONVEX_DEPLOY_KEY).toBe(DEPLOY_KEY);
      expect(call.env).not.toHaveProperty("CONVEX_DEPLOYMENT");
    }
    expect(staged.calls[0].argv[5]).toBe(JSON.stringify(chunkRecord(records[0])[0]));
    expect(staged.calls.slice(1, 1 + bigChunks.length).map(stagedArgs)).toEqual(bigChunks);

    const claimed = stubRunner([
      { code: 0, stdout: "'staged'\n" },
      { code: 0, stdout: "claimed\n\n" },
    ]);
    expect(await loadExport(records, env, claimed.run)).toEqual({
      staged: 2,
      claimed: 1,
      failed: 0,
    });
    expect(claimed.calls.map((call) => stagedArgs(call).emailHash)).toEqual([
      HASH_A,
      HASH_B,
      HASH_C,
    ]);

    const failedExit = stubRunner([
      { code: 0, stdout: '"staged"' },
      { code: 0, stdout: '"staged"' },
      { code: 1, stdout: "" },
    ]);
    expect(await loadExport(records, env, failedExit.run)).toEqual({
      staged: 2,
      claimed: 0,
      failed: 1,
    });
    expect(failedExit.calls.map((call) => stagedArgs(call).emailHash)).toEqual([
      HASH_A,
      HASH_B,
      HASH_B,
      HASH_C,
    ]);

    const failedOutput = stubRunner([
      { code: 0, stdout: '"staged"' },
      { code: 0, stdout: "Something unexpected\n" },
    ]);
    expect(await loadExport(records, env, failedOutput.run)).toEqual({
      staged: 2,
      claimed: 0,
      failed: 1,
    });
    expect(failedOutput.calls.map((call) => stagedArgs(call).emailHash)).toEqual([
      HASH_A,
      HASH_B,
      HASH_C,
    ]);

    const exitedWithOutput = stubRunner([
      { code: 0, stdout: 'A notice from the CLI\n"staged"\n' },
      { code: 1, stdout: '"staged"\n' },
    ]);
    expect(await loadExport(records, env, exitedWithOutput.run)).toEqual({
      staged: 2,
      claimed: 0,
      failed: 1,
    });

    const oversized: ExportRecord = {
      emailHash: HASH_B,
      ownedPaintIds: [],
      palettes: [
        {
          name: "Everything",
          paintIds: Array.from({ length: 2837 }, (_, i) => `${paintId(i)}-${"x".repeat(15)}`),
          groups: [],
        },
      ],
    };
    const unsplittable = stubRunner([]);
    expect(
      await loadExport(
        [smallRecord(HASH_A), oversized, smallRecord(HASH_C)],
        env,
        unsplittable.run,
      ),
    ).toEqual({ staged: 2, claimed: 0, failed: 1 });
    expect(unsplittable.calls.map((call) => stagedArgs(call).emailHash)).toEqual([HASH_A, HASH_C]);

    const printed = [...log.mock.calls, ...error.mock.calls].flat().map(String).join("\n");
    for (const hash of [HASH_A, HASH_B, HASH_C]) expect(printed).not.toContain(hash);
  });

  it("readExport rejects a malformed export file", () => {
    const good = [smallRecord(HASH_A), smallRecord(HASH_B)];
    expect(readExport(JSON.stringify(good))).toEqual(good);

    expect(() => readExport("not json")).toThrow("The export file isn't valid JSON");
    expect(() => readExport('{"emailHash": SECRET')).toThrow(/^(?!.*SECRET)/s);
    expect(() => readExport("{}")).toThrow();
    expect(() => readExport(JSON.stringify({ records: good }))).toThrow();

    const badHash = [smallRecord(HASH_A), { ...smallRecord(HASH_B), emailHash: "ABC123" }];
    expect(() => readExport(JSON.stringify(badHash))).toThrow(/record 1\b/);

    const upperHash = [{ ...smallRecord(HASH_A), emailHash: "A".repeat(64) }];
    expect(() => readExport(JSON.stringify(upperHash))).toThrow(/record 0\b/);

    const missingField = [smallRecord(HASH_A), smallRecord(HASH_B), { emailHash: HASH_C }];
    expect(() => readExport(JSON.stringify(missingField))).toThrow(/record 2\b/);

    const unknownTop = [{ ...smallRecord(HASH_A), email: "painter@example.com" }];
    expect(() => readExport(JSON.stringify(unknownTop))).toThrow(/record 0\b/);

    const unknownPalette = [
      smallRecord(HASH_A),
      {
        ...smallRecord(HASH_B),
        palettes: [{ name: "Reds", paintIds: [], groups: [], createdAt: "2025-01-01" }],
      },
    ];
    expect(() => readExport(JSON.stringify(unknownPalette))).toThrow(/record 1\b/);

    const unknownGroup = [
      {
        ...smallRecord(HASH_A),
        palettes: [
          { name: "Reds", paintIds: [], groups: [{ name: "Shades", paintIds: [], id: "g1" }] },
        ],
      },
    ];
    expect(() => readExport(JSON.stringify(unknownGroup))).toThrow(/record 0\b/);
  });
});
