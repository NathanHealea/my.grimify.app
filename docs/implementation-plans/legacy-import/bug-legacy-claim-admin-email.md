---
type: bug
epic: legacy-import    # removed by `wi new` when there is no parent epic
slug: legacy-claim-admin-email
status: released
branch: bug/legacy-claim-admin-email
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/bug-legacy-claim-admin-email
created: 2026-10-18
approved: 2026-10-18
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.20.4
review_approved: 2026-10-18
pr:                  # set by `wi pr`
tag: v0.20.4
---

# Claim ignores emails verified by an admin

## Summary

The old-data claim only counts a Clerk email address verified by `email_code` or `email_link`. A user whose production Clerk account was created by an admin (Clerk dashboard or Backend API) has an address whose `verification.strategy` is `admin`, so the claim finds nothing and the prompt never appears. Accept `admin` as proof of ownership too: only the instance owner can create such an address.

## Context

- Found verifying `legacy-claim` (v0.20.0) on stage, 2026-10-18: the owner's account has a staged import (93 owned paints, 3 palettes), the stage Clerk lookup succeeds with the production secret, the hash keys match, yet `findMine` returns null. The owner confirmed the account was created by an admin.
- Allowlist: `OWNERSHIP_STRATEGIES` in `convex/lib/clerk.ts` (DECISIONS 059; SECURITY.md "Enabling another sign-in method means revisiting this check").
- Reproduce: Clerk user whose only address has `verification: { status: "verified", strategy: "admin" }` → `verifiedEmails` returns `[]`. Expected: the address.

## Scope

**In scope**

- Add `admin` to the allowlist, with a test.
- Update DECISIONS 059, SECURITY.md, API.md and `docs/features/legacy-import.md`.

**Out of scope**

- `ticket` (invitation) and other strategies: not used by this app today.
- OAuth and SAML strategies stay excluded.

## Requirements

- **R1** — `verifiedEmails` returns an address whose verification is `verified` with strategy `admin`, alongside `email_code` and `email_link`.
- **R2** — Addresses verified by an OAuth or SAML provider, and unverified addresses, are still excluded.

## Acceptance criteria

- **AC1** (R1) — Given a Clerk user whose address was verified by an admin, when `findMine` runs for them with a matching staged import, then it returns the counts.
- **AC2** (R2) — Given addresses verified by `from_oauth_google` or `saml`, when `verifiedEmails` runs, then they are not returned.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `verifiedEmails keeps an address an admin verified` | `convex/lib/clerk.test.ts` | Regression: an address with `{ status: "verified", strategy: "admin" }` is returned; an `admin` address with status `unverified` is not. Fails on current code. |
| T2 | R2 | existing `verifiedEmails ignores addresses verified by an OAuth or SAML provider` | `convex/lib/clerk.test.ts` | Unchanged and still passing. |

**Not unit testable:** AC1 end to end on stage: the owner reloads stage.grimify.app signed in and sees the prompt.

## Implementation plan

1. [x] Accept admin-verified addresses — touches `convex/lib/clerk.ts`, `convex/lib/clerk.test.ts` — tests T1, T2
2. [x] Document the admin strategy — touches `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/API.md`, `docs/features/legacy-import.md` — tests none (docs only)

**Must not change:** the other filters (status, OAuth/SAML exclusion); function contracts.

**High-risk steps:** Step 1 widens who can claim staged data (authorization). Approved by the owner in conversation, 2026-10-18.

## Risks and open questions

- The strategy name `admin` is taken from Clerk's Backend API behavior for addresses created as verified by an admin; not checked against a live response here. AC1 on stage confirms it.

## Progress log

- 2026-10-18 — Planned.
- 2026-10-18 — Plan approved.
- 2026-10-18 — Approved by the owner in conversation (2026-10-18)
- 2026-10-18 — Started on branch bug/legacy-claim-admin-email from origin/dev.
- 2026-10-18 — Security review: no findings. paints-screen tests timed out once under load (load avg ~6); passed alone and on re-run
- 2026-10-18 — Staged: version 0.20.3 → 0.20.4 by hand; the full suite times out intermittently under machine load, and the owner chose to go ahead (docs/TESTING.md).
- 2026-10-18 — Review approved.
- 2026-10-18 — Owner approved the change and its release in conversation (2026-10-18)
- 2026-10-18 — Released 0.20.4 as v0.20.4 by hand without a passing verification run, by the owner's decision.
