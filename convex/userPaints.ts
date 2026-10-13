import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { findUser, requireUser } from "./lib/auth";

// Same shape as catalog paint IDs (DATABASE §8); paints themselves aren't checked against the catalog.
export const PAINT_ID = /^[a-z0-9-]{3,100}$/;
// Queued offline changes carry their original time; this caps how far ahead a wrong clock can win.
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
// Above the catalog's 2,837 paints: a user has at most one row per paint.
const LIST_LIMIT = 5000;

/** Sets any of a paint's owned, wishlisted and favorite flags for the caller; last write by client time wins. */
export const set = mutation({
  args: {
    paintId: v.string(),
    owned: v.optional(v.boolean()),
    wishlisted: v.optional(v.boolean()),
    favorite: v.optional(v.boolean()),
    clientUpdatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!PAINT_ID.test(args.paintId)) throw new ConvexError("INVALID_PAINT_ID");
    if (args.owned === undefined && args.wishlisted === undefined && args.favorite === undefined) {
      throw new ConvexError("NO_FLAGS");
    }
    if (args.clientUpdatedAt > Date.now() + MAX_FUTURE_SKEW_MS) {
      throw new ConvexError("CLOCK_IN_FUTURE");
    }

    const existing = await ctx.db
      .query("userPaints")
      .withIndex("by_userId_and_paintId", (q) =>
        q.eq("userId", user._id).eq("paintId", args.paintId),
      )
      .unique();
    if (existing && existing.updatedAt > args.clientUpdatedAt) return null;

    const owned = args.owned ?? existing?.owned ?? false;
    const wishlisted = args.wishlisted ?? existing?.wishlisted ?? false;
    const favorite = args.favorite ?? existing?.favorite ?? false;
    const updatedAt = args.clientUpdatedAt;

    // An all-false row stays as a tombstone so its updatedAt still beats older queued changes (#4).
    if (existing) {
      await ctx.db.patch("userPaints", existing._id, { owned, wishlisted, favorite, updatedAt });
    } else {
      await ctx.db.insert("userPaints", {
        userId: user._id,
        paintId: args.paintId,
        owned,
        wishlisted,
        favorite,
        updatedAt,
      });
    }
    return null;
  },
});

const userPaintValidator = v.object({
  paintId: v.string(),
  owned: v.boolean(),
  wishlisted: v.boolean(),
  favorite: v.boolean(),
  updatedAt: v.number(),
});

/** The caller's collection; empty when signed out so screens don't error. */
export const listMine = query({
  args: {},
  returns: v.array(userPaintValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await findUser(ctx, identity.tokenIdentifier);
    if (!user) return [];
    const rows = await ctx.db
      .query("userPaints")
      .withIndex("by_userId_and_paintId", (q) => q.eq("userId", user._id))
      .take(LIST_LIMIT);
    return rows
      .filter((row) => row.owned || row.wishlisted || row.favorite)
      .map(({ paintId, owned, wishlisted, favorite, updatedAt }) => ({
        paintId,
        owned,
        wishlisted,
        favorite: favorite ?? false,
        updatedAt,
      }));
  },
});
