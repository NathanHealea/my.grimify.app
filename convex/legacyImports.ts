import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { findUser } from "./lib/auth";
import { cleanName, MAX_GROUPS, MAX_PAINTS, MAX_PALETTES, newGroupId } from "./palettes";
import { legacyPaletteValidator } from "./schema";
import { PAINT_ID } from "./userPaints";

const EMAIL_HASH = /^[0-9a-f]{64}$/;

type LegacyPalette = typeof legacyPaletteValidator.type;

function requirePaintIds(paintIds: string[]): void {
  if (!paintIds.every((id) => PAINT_ID.test(id))) throw new ConvexError("INVALID_PAINT_ID");
}

function cleanPalette(palette: LegacyPalette): LegacyPalette {
  if (palette.paintIds.length > MAX_PAINTS) throw new ConvexError("PALETTE_FULL");
  if (palette.groups.length > MAX_GROUPS) throw new ConvexError("GROUP_LIMIT");
  requirePaintIds(palette.paintIds);
  return {
    name: cleanName(palette.name),
    paintIds: palette.paintIds,
    groups: palette.groups.map((group) => {
      requirePaintIds(group.paintIds);
      // A group only references its palette's paints, as in palettes.ts; this also bounds the row size.
      const inPalette = new Set(palette.paintIds);
      if (
        new Set(group.paintIds).size !== group.paintIds.length ||
        !group.paintIds.every((id) => inPalette.has(id))
      ) {
        throw new ConvexError("GROUP_PAINT_NOT_IN_PALETTE");
      }
      return { name: cleanName(group.name, "GROUP_NAME_INVALID"), paintIds: group.paintIds };
    }),
  };
}

/**
 * Writes one chunk of an old user's export under their email hash (scripts/legacy/load.ts).
 * `reset` starts the row over, otherwise the chunk is appended; `done` marks it complete.
 * Returns "claimed", writing nothing, when the hash was already claimed or discarded.
 */
export const stageChunk = internalMutation({
  args: {
    emailHash: v.string(),
    reset: v.boolean(),
    done: v.boolean(),
    ownedPaintIds: v.array(v.string()),
    palettes: v.array(legacyPaletteValidator),
  },
  returns: v.union(v.literal("staged"), v.literal("claimed")),
  handler: async (ctx, args) => {
    if (!EMAIL_HASH.test(args.emailHash)) throw new ConvexError("INVALID_EMAIL_HASH");
    requirePaintIds(args.ownedPaintIds);
    const palettes = args.palettes.map(cleanPalette);

    const claim = await ctx.db
      .query("legacyImportClaims")
      .withIndex("by_emailHash", (q) => q.eq("emailHash", args.emailHash))
      .first();
    if (claim) return "claimed";

    const existing = await ctx.db
      .query("legacyImports")
      .withIndex("by_emailHash", (q) => q.eq("emailHash", args.emailHash))
      .unique();
    if (!args.reset && !existing) throw new ConvexError("NOT_STAGED");
    if (args.reset && existing) await ctx.db.delete("legacyImports", existing._id);

    const base =
      !args.reset && existing
        ? existing
        : { ownedPaintIds: [], palettes: [], palettesOmitted: 0, loadedAt: Date.now() };
    // Past the per-user cap a palette could never be claimed, so it's only counted.
    const kept = palettes.slice(0, Math.max(0, MAX_PALETTES - base.palettes.length));
    const fields = {
      emailHash: args.emailHash,
      ownedPaintIds: [...new Set([...base.ownedPaintIds, ...args.ownedPaintIds])],
      palettes: [...base.palettes, ...kept],
      palettesOmitted: base.palettesOmitted + palettes.length - kept.length,
      complete: args.done,
      loadedAt: base.loadedAt,
    };
    if (!args.reset && existing) await ctx.db.replace("legacyImports", existing._id, fields);
    else await ctx.db.insert("legacyImports", fields);
    return "staged";
  },
});

/** The first complete staged row among the hashes, in the order given. */
async function findStaged(
  ctx: QueryCtx,
  emailHashes: string[],
): Promise<Doc<"legacyImports"> | null> {
  for (const emailHash of emailHashes) {
    const row = await ctx.db
      .query("legacyImports")
      .withIndex("by_emailHash", (q) => q.eq("emailHash", emailHash))
      .unique();
    if (row?.complete) return row;
  }
  return null;
}

/**
 * Counts for the staged import matching one of the caller's verified email hashes (legacyClaim.findMine);
 * null when the user isn't stored yet or nothing complete matches.
 */
export const summaryForHashes = internalQuery({
  args: { tokenIdentifier: v.string(), emailHashes: v.array(v.string()) },
  returns: v.union(v.object({ ownedCount: v.number(), paletteCount: v.number() }), v.null()),
  handler: async (ctx, args) => {
    if (!(await findUser(ctx, args.tokenIdentifier))) return null;
    const staged = await findStaged(ctx, args.emailHashes);
    if (!staged) return null;
    return {
      ownedCount: staged.ownedPaintIds.length,
      paletteCount: staged.palettes.length + staged.palettesOmitted,
    };
  },
});

/**
 * Imports or discards the staged row matching one of the caller's verified email hashes
 * (legacyClaim.resolveMine), then deletes it and records the hash so it can't be claimed or loaded again.
 * Import never changes existing palettes or clears a paint's wishlisted or favorite flag.
 */
export const claim = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    emailHashes: v.array(v.string()),
    choice: v.union(v.literal("import"), v.literal("discard")),
  },
  returns: v.object({
    paintsAdded: v.number(),
    palettesAdded: v.number(),
    palettesSkipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await findUser(ctx, args.tokenIdentifier);
    if (!user) throw new ConvexError("UNAUTHENTICATED");
    const staged = await findStaged(ctx, args.emailHashes);
    if (!staged) throw new ConvexError("LEGACY_IMPORT_NOT_FOUND");
    const now = Date.now();
    await ctx.db.delete("legacyImports", staged._id);
    await ctx.db.insert("legacyImportClaims", { emailHash: staged.emailHash, claimedAt: now });
    if (args.choice === "discard") return { paintsAdded: 0, palettesAdded: 0, palettesSkipped: 0 };

    // One read of the user's rows rather than a query per paint; userPaints.set doesn't cap paint IDs
    // to the catalog, so this isn't truncated with take().
    const existing = new Map<string, Doc<"userPaints">>();
    for await (const row of ctx.db
      .query("userPaints")
      .withIndex("by_userId_and_paintId", (q) => q.eq("userId", user._id))) {
      existing.set(row.paintId, row);
    }
    let paintsAdded = 0;
    for (const paintId of staged.ownedPaintIds) {
      const row = existing.get(paintId);
      if (row?.owned) continue;
      paintsAdded += 1;
      if (row) {
        // The server clock can trail a device's (DECISIONS 010, 059); never move a row backwards.
        await ctx.db.patch("userPaints", row._id, {
          owned: true,
          updatedAt: Math.max(row.updatedAt, now),
        });
      } else {
        await ctx.db.insert("userPaints", {
          userId: user._id,
          paintId,
          owned: true,
          wishlisted: false,
          favorite: false,
          updatedAt: now,
        });
      }
    }

    const palettes = await ctx.db
      .query("palettes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_PALETTES);
    const added = staged.palettes.slice(0, Math.max(0, MAX_PALETTES - palettes.length));
    for (const palette of added) {
      const groups: Doc<"palettes">["groups"] = [];
      for (const group of palette.groups) groups.push({ id: newGroupId(groups), ...group });
      await ctx.db.insert("palettes", {
        userId: user._id,
        name: palette.name,
        paintIds: palette.paintIds,
        groups,
        updatedAt: now,
      });
    }
    return {
      paintsAdded,
      palettesAdded: added.length,
      palettesSkipped: staged.palettes.length - added.length + staged.palettesOmitted,
    };
  },
});
