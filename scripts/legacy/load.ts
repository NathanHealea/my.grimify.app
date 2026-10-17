import { z } from "zod";

import type { ExportPalette, ExportRecord } from "./transform.ts";

// `npx convex run` takes the arguments as one argv string, and Linux caps one at 128 KiB.
export const CHUNK_MAX_BYTES = 100_000;

export type StageChunkArgs = {
  emailHash: string;
  reset: boolean;
  done: boolean;
  ownedPaintIds: string[];
  palettes: ExportPalette[];
};

export type RunResult = { code: number; stdout: string };
export type Runner = (argv: string[], env: Record<string, string>) => Promise<RunResult>;
export type LoadCounts = { staged: number; claimed: number; failed: number };

const STAGE_CHUNK = ["npx", "--no", "convex", "run", "legacyImports:stageChunk"];

const recordSchema = z.strictObject({
  emailHash: z.string().regex(/^[0-9a-f]{64}$/, "emailHash must be 64 lowercase hex characters"),
  ownedPaintIds: z.array(z.string()),
  palettes: z.array(
    z.strictObject({
      name: z.string(),
      paintIds: z.array(z.string()),
      groups: z.array(z.strictObject({ name: z.string(), paintIds: z.array(z.string()) })),
    }),
  ),
});

/** The records of an export.json written by `legacy:export`; throws naming the first bad record. */
export function readExport(text: string): ExportRecord[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("The export file must be a JSON array of records");
  return parsed.map((item, index) => {
    const result = recordSchema.safeParse(item);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`record ${index}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`);
    }
    return result.data;
  });
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

/** Splits a record into stageChunk calls in order, each under `maxBytes` of JSON; a palette is never split. */
export function chunkRecord(
  record: ExportRecord,
  maxBytes: number = CHUNK_MAX_BYTES,
): StageChunkArgs[] {
  const newChunk = (): StageChunkArgs => ({
    emailHash: record.emailHash,
    reset: false,
    done: false,
    ownedPaintIds: [],
    palettes: [],
  });
  const emptyBytes = jsonBytes(newChunk());
  const chunks = [newChunk()];
  let bytes = emptyBytes;

  // Returns the chunk an item of `itemBytes` fits in, starting a new one when the last is full.
  const chunkFor = (itemBytes: number, what: string): StageChunkArgs => {
    // +1 for the comma before the item; counting it for an array's first item only overestimates.
    if (bytes + itemBytes + 1 < maxBytes) {
      bytes += itemBytes + 1;
      return chunks[chunks.length - 1];
    }
    if (emptyBytes + itemBytes >= maxBytes) {
      throw new Error(`${what} alone is over ${maxBytes} bytes of JSON`);
    }
    const next = newChunk();
    chunks.push(next);
    bytes = emptyBytes + itemBytes;
    return next;
  };

  for (const id of record.ownedPaintIds) {
    chunkFor(jsonBytes(id), "An owned paint ID").ownedPaintIds.push(id);
  }
  record.palettes.forEach((palette, index) => {
    chunkFor(jsonBytes(palette), `Palette ${index}`).palettes.push(palette);
  });

  chunks[0].reset = true;
  chunks[chunks.length - 1].done = true;
  return chunks;
}

/** The environment for `convex run`: the deploy key picks the deployment, so CONVEX_DEPLOYMENT is dropped. */
export function loaderEnv(
  deployment: string,
  deployKey: string | undefined,
  baseEnv: Record<string, string | undefined>,
): Record<string, string> {
  if (!deployKey) throw new Error("No CONVEX_DEPLOY_KEY; see docs/ENVIRONMENT.md");
  // Production keys are `prod:<deployment>|<secret>`. Never echo the key.
  if (!deployKey.startsWith(`prod:${deployment}|`)) {
    throw new Error(`CONVEX_DEPLOY_KEY must be a production key for ${deployment}`);
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && key !== "CONVEX_DEPLOYMENT") env[key] = value;
  }
  env.CONVEX_DEPLOY_KEY = deployKey;
  return env;
}

// Piped, `convex run` prints the return value as JSON (convex/dist/cjs/cli/lib/run.js formatValue).
function outcome(stdout: string): string {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== "");
  return (lines.at(-1) ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
}

/** Stages every record, one `convex run` per chunk; prints only record numbers and counts. */
export async function loadExport(
  records: ExportRecord[],
  env: Record<string, string>,
  run: Runner,
): Promise<LoadCounts> {
  const counts: LoadCounts = { staged: 0, claimed: 0, failed: 0 };
  for (const [index, record] of records.entries()) {
    let chunks: StageChunkArgs[];
    try {
      chunks = chunkRecord(record);
    } catch (error) {
      console.error(`Record ${index} failed: ${(error as Error).message}`);
      counts.failed += 1;
      continue;
    }
    let result: keyof LoadCounts = "staged";
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const { code, stdout } = await run([...STAGE_CHUNK, JSON.stringify(chunk)], env);
      const printed = code === 0 ? outcome(stdout) : "";
      if (printed === "staged") continue;
      if (printed === "claimed") {
        result = "claimed";
        break;
      }
      console.error(
        `Record ${index} failed at chunk ${chunkIndex + 1} of ${chunks.length}` +
          (code === 0 ? " (unexpected output)" : ` (exit code ${code})`),
      );
      result = "failed";
      break;
    }
    counts[result] += 1;
  }
  return counts;
}
