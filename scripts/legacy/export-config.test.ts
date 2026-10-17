// @vitest-environment node
import { describe, expect, it } from "vitest";

import { HASH_KEY_MIN_LENGTH, readConfig } from "./export-config.ts";

const REPO_ROOT = "/srv/repo";
const OUT_DIR = "/tmp/legacy-export";
const HASH_KEY = "h".repeat(HASH_KEY_MIN_LENGTH);

function validEnv(): Record<string, string | undefined> {
  return {
    LEGACY_SUPABASE_URL: "https://example-project.supabase.test",
    LEGACY_SUPABASE_SECRET_KEY: "sb_secret_fake-key-for-tests",
    LEGACY_IMPORT_HASH_KEY: HASH_KEY,
  };
}

describe("readConfig validates the environment", () => {
  it("returns the config when everything is valid and the output dir is outside the repo", () => {
    expect(readConfig(validEnv(), OUT_DIR, REPO_ROOT)).toEqual({
      supabaseUrl: "https://example-project.supabase.test",
      secretKey: "sb_secret_fake-key-for-tests",
      hashKey: HASH_KEY,
      outDir: OUT_DIR,
    });
  });

  it.each(["LEGACY_SUPABASE_URL", "LEGACY_SUPABASE_SECRET_KEY", "LEGACY_IMPORT_HASH_KEY"])(
    "names %s when it is missing",
    (name) => {
      const env = { ...validEnv(), [name]: undefined };
      expect(() => readConfig(env, OUT_DIR, REPO_ROOT)).toThrow(name);
    },
  );

  it.each(["LEGACY_SUPABASE_URL", "LEGACY_SUPABASE_SECRET_KEY", "LEGACY_IMPORT_HASH_KEY"])(
    "names %s when it is empty",
    (name) => {
      const env = { ...validEnv(), [name]: "" };
      expect(() => readConfig(env, OUT_DIR, REPO_ROOT)).toThrow(name);
    },
  );

  it("rejects a hash key one character shorter than the minimum", () => {
    const env = { ...validEnv(), LEGACY_IMPORT_HASH_KEY: "h".repeat(HASH_KEY_MIN_LENGTH - 1) };
    expect(() => readConfig(env, OUT_DIR, REPO_ROOT)).toThrow("LEGACY_IMPORT_HASH_KEY");
  });

  it("requires 32 as the minimum hash key length", () => {
    expect(HASH_KEY_MIN_LENGTH).toBe(32);
  });

  it("throws a usage error when no output dir is given", () => {
    expect(() => readConfig(validEnv(), undefined, REPO_ROOT)).toThrow();
  });

  it("rejects an output dir inside the repo", () => {
    expect(() => readConfig(validEnv(), "/srv/repo/tmp/export", REPO_ROOT)).toThrow(
      /outside the repository/,
    );
  });

  it("rejects the repo root itself as the output dir", () => {
    expect(() => readConfig(validEnv(), "/srv/repo/", REPO_ROOT)).toThrow(/outside the repository/);
  });

  it("rejects an output dir with .. segments that resolves inside the repo", () => {
    expect(() => readConfig(validEnv(), "/srv/elsewhere/../repo/out", REPO_ROOT)).toThrow(
      /outside the repository/,
    );
  });

  it("accepts a sibling dir that only shares a name prefix with the repo", () => {
    expect(readConfig(validEnv(), "/srv/repo-export", REPO_ROOT).outDir).toBe("/srv/repo-export");
  });

  it("strips a trailing slash from the Supabase URL", () => {
    const env = { ...validEnv(), LEGACY_SUPABASE_URL: "https://example-project.supabase.test/" };
    expect(readConfig(env, OUT_DIR, REPO_ROOT).supabaseUrl).toBe(
      "https://example-project.supabase.test",
    );
  });
});
