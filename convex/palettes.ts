import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const MAX_PALETTES = 50;
const MAX_NAME_LENGTH = 60;
const PREVIEW_COUNT = 5;

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new ConvexError("PALETTE_NAME_INVALID");
  }
  return trimmed;
}

// Someone else's palette throws the same error as a missing one, so a guessed ID reveals nothing.
async function requireOwnPalette(
  ctx: MutationCtx,
  userId: Id<"users">,
  paletteId: Id<"palettes">,
): Promise<Doc<"palettes">> {
  const palette = await ctx.db.get("palettes", paletteId);
  if (!palette || palette.userId !== userId) throw new ConvexError("NOT_FOUND");
  return palette;
}

const groupValidator = v.object({
  id: v.string(),
  name: v.string(),
  paintIds: v.array(v.string()),
});

const paletteValidator = v.object({
  _id: v.id("palettes"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  paintIds: v.array(v.string()),
  groups: v.array(groupValidator),
  updatedAt: v.number(),
});

/** The caller's palettes, most recently updated first, with a count and the first few paints. */
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("palettes"),
      name: v.string(),
      paintCount: v.number(),
      previewPaintIds: v.array(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("palettes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_PALETTES);
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => ({
        _id: p._id,
        name: p.name,
        paintCount: p.paintIds.length,
        previewPaintIds: p.paintIds.slice(0, PREVIEW_COUNT),
        updatedAt: p.updatedAt,
      }));
  },
});

/** One of the caller's palettes; null when missing or owned by someone else. */
export const get = query({
  args: { paletteId: v.id("palettes") },
  returns: v.union(paletteValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const palette = await ctx.db.get("palettes", args.paletteId);
    if (!palette || palette.userId !== user._id) return null;
    return palette;
  },
});

/** Creates an empty palette for the caller and returns its ID. */
export const create = mutation({
  args: { name: v.string() },
  returns: v.id("palettes"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = cleanName(args.name);
    const existing = await ctx.db
      .query("palettes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_PALETTES);
    if (existing.length >= MAX_PALETTES) throw new ConvexError("PALETTE_LIMIT");
    return await ctx.db.insert("palettes", {
      userId: user._id,
      name,
      paintIds: [],
      groups: [],
      updatedAt: Date.now(),
    });
  },
});

export const rename = mutation({
  args: { paletteId: v.id("palettes"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = cleanName(args.name);
    await requireOwnPalette(ctx, user._id, args.paletteId);
    await ctx.db.patch("palettes", args.paletteId, { name, updatedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { paletteId: v.id("palettes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnPalette(ctx, user._id, args.paletteId);
    await ctx.db.delete("palettes", args.paletteId);
    return null;
  },
});
