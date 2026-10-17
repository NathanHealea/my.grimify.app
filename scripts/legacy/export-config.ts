import { isAbsolute, relative, resolve } from "node:path";

export type ExportConfig = {
  supabaseUrl: string;
  secretKey: string;
  hashKey: string;
  outDir: string;
};

export const HASH_KEY_MIN_LENGTH = 32;

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set; see docs/ENVIRONMENT.md`);
  return value;
}

export function readConfig(
  env: Record<string, string | undefined>,
  outDirArg: string | undefined,
  repoRoot: string,
): ExportConfig {
  const supabaseUrl = required(env, "LEGACY_SUPABASE_URL").replace(/\/+$/, "");
  const secretKey = required(env, "LEGACY_SUPABASE_SECRET_KEY");
  const hashKey = required(env, "LEGACY_IMPORT_HASH_KEY");
  if (hashKey.length < HASH_KEY_MIN_LENGTH) {
    throw new Error(`LEGACY_IMPORT_HASH_KEY must be at least ${HASH_KEY_MIN_LENGTH} characters`);
  }
  if (!outDirArg) throw new Error("usage: npm run legacy:export -- <output-dir>");

  const outDir = resolve(outDirArg);
  const fromRepo = relative(resolve(repoRoot), outDir);
  if (fromRepo === "" || (!fromRepo.startsWith("..") && !isAbsolute(fromRepo))) {
    throw new Error(`The output directory must be outside the repository: ${outDir}`);
  }
  return { supabaseUrl, secretKey, hashKey, outDir };
}
