import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Only the Clerk identity: email and name stay in Clerk and are read on the device (DECISIONS 028).
  users: defineTable({
    tokenIdentifier: v.string(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  // One row per user and paint; owned, wishlisted and favorite are independent (DECISIONS 011, 033).
  userPaints: defineTable({
    userId: v.id("users"),
    paintId: v.string(),
    owned: v.boolean(),
    wishlisted: v.boolean(),
    // Optional: rows written before favorites existed lack it, and missing means false.
    favorite: v.optional(v.boolean()),
    // The client's clock when the change was made; drives last-write-wins (DECISIONS 010).
    updatedAt: v.number(),
  }).index("by_userId_and_paintId", ["userId", "paintId"]),

  // One document per palette so a reorder or move is a single atomic write; groups reference
  // paints in the main list.
  palettes: defineTable({
    userId: v.id("users"),
    name: v.string(),
    paintIds: v.array(v.string()),
    groups: v.array(v.object({ id: v.string(), name: v.string(), paintIds: v.array(v.string()) })),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
});
