import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { PAINT_ID } from "./userPaints";

export const MAX_PALETTES = 50;
const MAX_NAME_LENGTH = 60;
const PREVIEW_COUNT = 5;
export const MAX_PAINTS = 200;
export const MAX_GROUPS = 30;

export function cleanName(name: string, error = "PALETTE_NAME_INVALID"): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new ConvexError(error);
  }
  return trimmed;
}

function requirePaintId(paintId: string): void {
  if (!PAINT_ID.test(paintId)) throw new ConvexError("INVALID_PAINT_ID");
}

function requireGroup(
  palette: Doc<"palettes">,
  groupId: string,
): Doc<"palettes">["groups"][number] {
  const group = palette.groups.find((g) => g.id === groupId);
  if (!group) throw new ConvexError("GROUP_NOT_FOUND");
  return group;
}

// Convex seeds Math.random per mutation, so this stays deterministic on replay.
function newGroupId(palette: Doc<"palettes">): string {
  let id: string;
  do {
    id = Math.random().toString(36).slice(2, 10);
  } while (palette.groups.some((g) => g.id === id));
  return id;
}

function requireIndex(toIndex: number): void {
  if (!Number.isInteger(toIndex) || toIndex < 0) throw new ConvexError("INVALID_INDEX");
}

/** `items` with the one at `from` moved to `toIndex` (clamped to the end), or null if it wouldn't move. */
function moveItem<T>(items: T[], from: number, toIndex: number): T[] | null {
  const to = Math.min(toIndex, items.length - 1);
  if (from === -1 || from === to) return null;
  const next = items.filter((_, i) => i !== from);
  next.splice(to, 0, items[from]);
  return next;
}

function insertAt(ids: string[], id: string, toIndex?: number): string[] {
  const next = [...ids];
  next.splice(toIndex ?? ids.length, 0, id);
  return next;
}

async function patchGroups(
  ctx: MutationCtx,
  palette: Doc<"palettes">,
  groups: Doc<"palettes">["groups"],
): Promise<void> {
  await ctx.db.patch("palettes", palette._id, { groups, updatedAt: Date.now() });
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

/** One of the caller's palettes; null when missing, owned by someone else, or not a palette ID. */
export const get = query({
  // A string, not v.id: the ID comes from the URL, and a mangled one should read as not found.
  args: { paletteId: v.string() },
  returns: v.union(paletteValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const paletteId = ctx.db.normalizeId("palettes", args.paletteId);
    if (!paletteId) return null;
    const palette = await ctx.db.get("palettes", paletteId);
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

/** Appends the paints not already in the palette, in the order given; returns how many were added. */
export const addPaints = mutation({
  args: { paletteId: v.id("palettes"), paintIds: v.array(v.string()) },
  returns: v.object({ added: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.paintIds.length > MAX_PAINTS) throw new ConvexError("PALETTE_FULL");
    if (!args.paintIds.every((id) => PAINT_ID.test(id))) {
      throw new ConvexError("INVALID_PAINT_ID");
    }
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    const paintIds = [...new Set([...palette.paintIds, ...args.paintIds])];
    if (paintIds.length > MAX_PAINTS) throw new ConvexError("PALETTE_FULL");
    const added = paintIds.length - palette.paintIds.length;
    if (added > 0) {
      await ctx.db.patch("palettes", args.paletteId, { paintIds, updatedAt: Date.now() });
    }
    return { added };
  },
});

/** Removes a paint from the palette and all of its groups; a paint not in it is a no-op. */
export const removePaint = mutation({
  args: { paletteId: v.id("palettes"), paintId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!PAINT_ID.test(args.paintId)) throw new ConvexError("INVALID_PAINT_ID");
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    const inPalette =
      palette.paintIds.includes(args.paintId) ||
      palette.groups.some((g) => g.paintIds.includes(args.paintId));
    if (!inPalette) return null;
    const without = (ids: string[]) => ids.filter((id) => id !== args.paintId);
    await ctx.db.patch("palettes", args.paletteId, {
      paintIds: without(palette.paintIds),
      groups: palette.groups.map((g) => ({ ...g, paintIds: without(g.paintIds) })),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Appends an empty group to the palette and returns its ID. */
export const createGroup = mutation({
  args: { paletteId: v.id("palettes"), name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = cleanName(args.name, "GROUP_NAME_INVALID");
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    if (palette.groups.length >= MAX_GROUPS) throw new ConvexError("GROUP_LIMIT");
    const id = newGroupId(palette);
    await patchGroups(ctx, palette, [...palette.groups, { id, name, paintIds: [] }]);
    return id;
  },
});

export const renameGroup = mutation({
  args: { paletteId: v.id("palettes"), groupId: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = cleanName(args.name, "GROUP_NAME_INVALID");
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    if (requireGroup(palette, args.groupId).name === name) return null;
    await patchGroups(
      ctx,
      palette,
      palette.groups.map((g) => (g.id === args.groupId ? { ...g, name } : g)),
    );
    return null;
  },
});

/** Deletes a group; its paints stay in the palette's main list. */
export const removeGroup = mutation({
  args: { paletteId: v.id("palettes"), groupId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    requireGroup(palette, args.groupId);
    await patchGroups(
      ctx,
      palette,
      palette.groups.filter((g) => g.id !== args.groupId),
    );
    return null;
  },
});

/** Adds a main-list paint to a group at `toIndex`, or the end; a paint already in the group is a no-op. */
export const addPaintToGroup = mutation({
  args: {
    paletteId: v.id("palettes"),
    groupId: v.string(),
    paintId: v.string(),
    toIndex: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requirePaintId(args.paintId);
    if (args.toIndex !== undefined) requireIndex(args.toIndex);
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    const group = requireGroup(palette, args.groupId);
    if (!palette.paintIds.includes(args.paintId)) throw new ConvexError("PAINT_NOT_IN_PALETTE");
    if (group.paintIds.includes(args.paintId)) return null;
    await patchGroups(
      ctx,
      palette,
      palette.groups.map((g) =>
        g.id === args.groupId
          ? { ...g, paintIds: insertAt(g.paintIds, args.paintId, args.toIndex) }
          : g,
      ),
    );
    return null;
  },
});

/** Takes a paint out of one group; it stays in the palette. A paint not in the group is a no-op. */
export const removePaintFromGroup = mutation({
  args: { paletteId: v.id("palettes"), groupId: v.string(), paintId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requirePaintId(args.paintId);
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    const group = requireGroup(palette, args.groupId);
    if (!group.paintIds.includes(args.paintId)) return null;
    await patchGroups(
      ctx,
      palette,
      palette.groups.map((g) =>
        g.id === args.groupId
          ? { ...g, paintIds: g.paintIds.filter((id) => id !== args.paintId) }
          : g,
      ),
    );
    return null;
  },
});

/** Moves a paint between groups in one write, to `toIndex` or the end; a paint not in the source group is a no-op. */
export const movePaintToGroup = mutation({
  args: {
    paletteId: v.id("palettes"),
    paintId: v.string(),
    fromGroupId: v.string(),
    toGroupId: v.string(),
    toIndex: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requirePaintId(args.paintId);
    if (args.toIndex !== undefined) requireIndex(args.toIndex);
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    const from = requireGroup(palette, args.fromGroupId);
    requireGroup(palette, args.toGroupId);
    if (args.fromGroupId === args.toGroupId || !from.paintIds.includes(args.paintId)) return null;
    await patchGroups(
      ctx,
      palette,
      palette.groups.map((g) => {
        if (g.id === args.fromGroupId) {
          return { ...g, paintIds: g.paintIds.filter((id) => id !== args.paintId) };
        }
        if (g.id === args.toGroupId && !g.paintIds.includes(args.paintId)) {
          return { ...g, paintIds: insertAt(g.paintIds, args.paintId, args.toIndex) };
        }
        return g;
      }),
    );
    return null;
  },
});

/** Moves a paint within the main list to `toIndex` (clamped); a paint not in it is a no-op. */
export const movePaint = mutation({
  args: { paletteId: v.id("palettes"), paintId: v.string(), toIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requirePaintId(args.paintId);
    requireIndex(args.toIndex);
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    const paintIds = moveItem(
      palette.paintIds,
      palette.paintIds.indexOf(args.paintId),
      args.toIndex,
    );
    if (!paintIds) return null;
    await ctx.db.patch("palettes", args.paletteId, { paintIds, updatedAt: Date.now() });
    return null;
  },
});

/** Moves a paint within one group to `toIndex` (clamped); a paint not in the group is a no-op. */
export const moveGroupPaint = mutation({
  args: {
    paletteId: v.id("palettes"),
    groupId: v.string(),
    paintId: v.string(),
    toIndex: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requirePaintId(args.paintId);
    requireIndex(args.toIndex);
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    const group = requireGroup(palette, args.groupId);
    const paintIds = moveItem(group.paintIds, group.paintIds.indexOf(args.paintId), args.toIndex);
    if (!paintIds) return null;
    await patchGroups(
      ctx,
      palette,
      palette.groups.map((g) => (g.id === args.groupId ? { ...g, paintIds } : g)),
    );
    return null;
  },
});

/** Moves a group, with its paints, to `toIndex` (clamped) among the palette's groups. */
export const moveGroup = mutation({
  args: { paletteId: v.id("palettes"), groupId: v.string(), toIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireIndex(args.toIndex);
    const palette = await requireOwnPalette(ctx, user._id, args.paletteId);
    requireGroup(palette, args.groupId);
    const groups = moveItem(
      palette.groups,
      palette.groups.findIndex((g) => g.id === args.groupId),
      args.toIndex,
    );
    if (!groups) return null;
    await patchGroups(ctx, palette, groups);
    return null;
  },
});
