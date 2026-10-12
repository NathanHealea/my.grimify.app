import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, query } from "./_generated/server";
import { findUser, requireIdentity } from "./lib/auth";

/** Creates the caller's `users` row on first sign-in; idempotent. */
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existing = await findUser(ctx, identity.tokenIdentifier);
    if (existing) return existing._id;
    return await ctx.db.insert("users", { tokenIdentifier: identity.tokenIdentifier });
  },
});

/** The caller's user ID, or null when signed out or not stored yet. */
export const me = query({
  args: {},
  returns: v.union(v.object({ _id: v.id("users") }), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUser(ctx, identity.tokenIdentifier);
    return user ? { _id: user._id } : null;
  },
});

// Rows deleted per transaction, well under Convex's per-transaction write limit.
export const DELETE_BATCH = 500;

/** Deletes one batch of a user's paints and schedules the next until none are left. */
async function deletePaintBatch(ctx: MutationCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("userPaints")
    .withIndex("by_userId_and_paintId", (q) => q.eq("userId", userId))
    .take(DELETE_BATCH);
  for (const row of rows) await ctx.db.delete("userPaints", row._id);
  if (rows.length === DELETE_BATCH) {
    await ctx.scheduler.runAfter(0, internal.users.deletePaints, { userId });
  }
}

/**
 * Deletes the caller's collection (tombstones included), palettes and `users` row; the Clerk account is
 * deleted by the client afterwards (DECISIONS 037). Returns null when there is nothing left, so a
 * retry after a failed Clerk step is safe.
 */
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const user = await findUser(ctx, identity.tokenIdentifier);
    if (!user) return null;
    await deletePaintBatch(ctx, user._id);
    // The 50-palette cap keeps these inside this transaction, so no batching is needed.
    for await (const palette of ctx.db
      .query("palettes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))) {
      await ctx.db.delete("palettes", palette._id);
    }
    await ctx.db.delete("users", user._id);
    return null;
  },
});

export const deletePaints = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deletePaintBatch(ctx, args.userId);
    return null;
  },
});
