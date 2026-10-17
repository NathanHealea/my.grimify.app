import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { cleanName, MAX_GROUPS, MAX_PAINTS, MAX_PALETTES } from "./palettes";
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
