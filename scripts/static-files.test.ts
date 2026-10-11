// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const publicDir = new URL("../public/", import.meta.url);

function readPublic(name: string): string {
  return readFileSync(new URL(name, publicDir), "utf8");
}

type HeaderRule = { pattern: string; headers: Map<string, string> };

// Cloudflare `_headers` format (Pages and Workers static assets): an unindented URL pattern, then indented `Name: value` lines.
function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: new Map() });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) throw new Error(`Header line before any URL pattern: ${line}`);
    const colon = line.indexOf(":");
    if (colon === -1) throw new Error(`Header line without a colon: ${line}`);
    rule.headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return rules;
}

function allPathsHeaders(): Map<string, string> {
  const rule = parseHeaders(readPublic("_headers")).find((r) => r.pattern === "/*");
  if (!rule) throw new Error("No /* rule in public/_headers");
  return rule.headers;
}

function parseCsp(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of value.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) continue;
    directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

function csp(): Map<string, string[]> {
  const value = allPathsHeaders().get("content-security-policy");
  if (value === undefined) throw new Error("No Content-Security-Policy on /*");
  return parseCsp(value);
}

describe("public/_headers", () => {
  it("the CSP template allows only the app, the build's Convex host and Clerk hosts", () => {
    const expected: Record<string, string[]> = {
      "default-src": ["'self'"],
      "script-src": [
        "'self'",
        "https://clerk.grimify.app",
        "https://challenges.cloudflare.com",
        "https://*.protect.clerk.com",
      ],
      "connect-src": [
        "'self'",
        "https://{{CONVEX_HOST}}",
        "wss://{{CONVEX_HOST}}",
        "https://clerk.grimify.app",
        "https://*.protect.clerk.com:*",
      ],
      "img-src": ["'self'", "data:", "https://img.clerk.com"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "worker-src": ["'self'", "blob:"],
      "frame-src": ["https://challenges.cloudflare.com", "https://*.protect.clerk.com"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "manifest-src": ["'self'"],
    };

    const directives = csp();

    expect(new Set(directives.keys())).toEqual(new Set(Object.keys(expected)));
    for (const [name, sources] of Object.entries(expected)) {
      expect(new Set(directives.get(name)), name).toEqual(new Set(sources));
    }
    expect(readPublic("_headers")).not.toContain("convex.cloud");
  });

  it("the CSP never allows eval, inline scripts, wildcards or framing", () => {
    const raw = allPathsHeaders().get("content-security-policy") ?? "";
    const directives = csp();
    const scriptSrc = directives.get("script-src") ?? [];

    expect(raw).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("*");
    expect(scriptSrc).not.toContain("http:");
    expect(scriptSrc).not.toContain("data:");
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(raw).not.toContain("clerk.accounts.dev");
    expect(raw).not.toContain("proper-bloodhound-699");
  });

  it("the site sends nosniff, a referrer policy and a deny-all permissions policy", () => {
    const headers = allPathsHeaders();

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    // Structured-header dictionary: a repeated key's last value wins, so check the final value per key.
    const permissions = new Map(
      (headers.get("permissions-policy") ?? "").split(",").map((entry) => {
        const [key, value] = entry.trim().split("=");
        return [key, value] as const;
      }),
    );
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(permissions.get(feature), feature).toBe("()");
    }
  });

  it("_headers stays within Cloudflare's limits", () => {
    const text = readPublic("_headers");

    for (const line of text.split(/\r?\n/)) {
      expect(line.length).toBeLessThanOrEqual(2000);
    }
    expect(parseHeaders(text).length).toBeLessThanOrEqual(100);
  });

  it("has a single rule, so no path can detach the headers", () => {
    expect(parseHeaders(readPublic("_headers")).map((rule) => rule.pattern)).toEqual(["/*"]);
  });
});

describe("public/robots.txt", () => {
  it("robots.txt disallows every crawler", () => {
    const lines = readPublic("robots.txt")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"));

    expect(lines).toEqual(["User-agent: *", "Disallow: /"]);
  });
});

describe("wrangler.json", () => {
  function readWrangler(): Record<string, unknown> {
    return JSON.parse(readFileSync(new URL("../wrangler.json", import.meta.url), "utf8")) as Record<
      string,
      unknown
    >;
  }

  it("serves index.html for every unmatched path", () => {
    const config = readWrangler();

    expect(config.assets).toEqual({
      directory: "./dist",
      not_found_handling: "single-page-application",
    });
  });

  it("deploys assets only, as the v2-grimify-app Worker", () => {
    const config = readWrangler();

    expect(config).not.toHaveProperty("main");
    expect(config.name).toBe("v2-grimify-app");
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(config).sort()).toEqual([
      "assets",
      "compatibility_date",
      "env",
      "name",
      "routes",
    ]);
    expect(Object.keys(config.assets as object).sort()).toEqual([
      "directory",
      "not_found_handling",
    ]);
  });

  it("wrangler.json deploys three assets-only Workers on their domains", () => {
    const config = readWrangler();
    const spaAssets = { directory: "./dist", not_found_handling: "single-page-application" };

    expect(config.name).toBe("v2-grimify-app");
    expect(config).not.toHaveProperty("main");
    expect(config.routes).toEqual([
      { pattern: "grimify.app", custom_domain: true },
      { pattern: "www.grimify.app", custom_domain: true },
    ]);

    const env = config.env as Record<string, Record<string, unknown>>;
    expect(Object.keys(env).sort()).toEqual(["dev", "stage"]);

    expect(Object.keys(env.dev).sort()).toEqual(["assets", "routes"]);
    expect(env.dev.assets).toEqual(spaAssets);
    expect(env.dev.routes).toEqual([
      { pattern: "dev.grimify.app", custom_domain: true },
      { pattern: "www.dev.grimify.app", custom_domain: true },
    ]);
    expect(env.dev).not.toHaveProperty("main");
    expect(env.dev).not.toHaveProperty("name");

    expect(Object.keys(env.stage).sort()).toEqual(["assets", "routes"]);
    expect(env.stage.assets).toEqual(spaAssets);
    expect(env.stage.routes).toEqual([
      { pattern: "stage.grimify.app", custom_domain: true },
      { pattern: "www.stage.grimify.app", custom_domain: true },
    ]);
    expect(env.stage).not.toHaveProperty("main");
    expect(env.stage).not.toHaveProperty("name");
  });
});

describe("CLAUDE.md", () => {
  it("work items use dev as their base", () => {
    const text = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
    const match = /^## Work Item Workflow\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
    if (!match) throw new Error("No '## Work Item Workflow' section in CLAUDE.md");
    const section = match[1];

    expect(section).toMatch(/^- base_branch: dev$/m);
    expect(section.match(/base_branch/g)).toHaveLength(1);
  });
});

describe("vite.config.ts", () => {
  it("deploy builds don't load .env files", () => {
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

    expect(config).toMatch(/^\s*envDir: process\.env\.GRIMIFY_DEPLOY \? false : undefined,$/m);
  });
});

describe("build and deploy wiring", () => {
  it("the build runs the CSP plugin", () => {
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

    expect(config).toMatch(/^\s*cspHeaders\(\),$/m);
  });

  it("each deploy script runs its own environment", () => {
    const { scripts } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };

    for (const env of ["dev", "stage", "prod"]) {
      expect(scripts[`deploy:${env}`], env).toBe(`node scripts/deploy.ts ${env}`);
    }
  });
});
