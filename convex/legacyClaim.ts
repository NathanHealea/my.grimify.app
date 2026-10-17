import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { verifiedEmails } from "./lib/clerk";
import { hashEmail } from "./lib/emailHash";

const summaryValidator = v.object({ ownedCount: v.number(), paletteCount: v.number() });

/** Hashes of the caller's verified addresses, or null when the import is off on this deployment. */
async function verifiedHashes(subject: string): Promise<string[] | null> {
  const hashKey = process.env.LEGACY_IMPORT_HASH_KEY;
  if (!hashKey) return null;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set on this deployment");
  const emails = await verifiedEmails(subject, secretKey);
  return await Promise.all(emails.map((email) => hashEmail(email, hashKey)));
}

/**
 * What the caller's old Grimify account holds, matched by a verified email address; null when
 * signed out, not stored yet, nothing matches, or the import is off on this deployment.
 */
export const findMine = action({
  args: {},
  returns: v.union(summaryValidator, v.null()),
  handler: async (ctx): Promise<typeof summaryValidator.type | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const emailHashes = await verifiedHashes(identity.subject);
    if (!emailHashes || emailHashes.length === 0) return null;
    return await ctx.runQuery(internal.legacyImports.summaryForHashes, {
      tokenIdentifier: identity.tokenIdentifier,
      emailHashes,
    });
  },
});

/** Imports or discards the caller's matched old data; either way it can't be claimed again. */
export const resolveMine = action({
  args: { choice: v.union(v.literal("import"), v.literal("discard")) },
  returns: v.object({
    paintsAdded: v.number(),
    palettesAdded: v.number(),
    palettesSkipped: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ paintsAdded: number; palettesAdded: number; palettesSkipped: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("UNAUTHENTICATED");
    const emailHashes = await verifiedHashes(identity.subject);
    if (!emailHashes) throw new ConvexError("LEGACY_IMPORT_NOT_FOUND");
    return await ctx.runMutation(internal.legacyImports.claim, {
      tokenIdentifier: identity.tokenIdentifier,
      emailHashes,
      choice: args.choice,
    });
  },
});
