# Coach P2: bounded revision transport

APP7-COACH-P2-SAFE-COMPLETION-A1 replaces the PostgreSQL LISTEN credential with the existing application Prisma pool. PUBLIC permissions are unchanged. No listener account, new secret, service, data policy or migration is needed. The previous listener-account instructions are obsolete; COACH_SYNC_DATABASE_URL is ignored and must not be provisioned.

## Data and isolation

The existing CoachSyncRevision row is incremented in the same transaction as every successful conversation mutation. Its userId/version metadata is the only data read by the transport. One process-wide query selects just these two fields for authenticated users with active streams, at most 20 rows. No chat or health contents enter the broker. Original authenticated and owner-scoped history APIs remain the sole source of messages and conversation summaries.

Post-commit local changes retain the existing tiny targeted changed event. Across processes, a changed durable version produces a revision event containing only version. The existing client coordinator uses its canonical snapshot reconciliation for this event; it preserves the selected conversation, draft and message ordering. Coalesced revisions and deletes require no event log. Reconnect/server restart reads the current durable revision and repairs gaps.

This is a hybrid SSE transport with **server-side metadata polling**, not query-free PostgreSQL push. Active processes check at most once per two seconds after the prior check completes. Healthy idle clients perform no periodic conversation list/detail reads, but the server does read revision metadata. Cross-process delivery latency is normally one check interval plus query/network time. No subscribers means no polling.

## Bounds and failures

- At most 20 streams per process, six per account per process; reservation occurs before awaiting. These are not global multi-instance account caps. Existing HTTP rate limits and Cloud Run instance limits still apply.
- One in-flight revision query per process; five-second deadline closes streams, with ten-second unavailable cooldown. A stalled underlying query is not replaced until it settles, preventing an accumulating timeout/retry queue.
- At most 100 pre-ready events; backpressure closes slow clients. JWT expiry caps stream lifetime, additionally capped at 145 seconds. Existing 25-second account-active/token checks remain.
- No token in the URL. Authentication runs before the stream handler. Account changes clear client state; hidden/offline/unmounted clients abort.
- Explicit 409 COACH_SYNC_DISABLED retains the original five-second P1 behavior. Explicit 503 COACH_SYNC_UNAVAILABLE also selects that same P1 path while the view is active. Auth errors, capacity errors, unrelated 503s and network errors do not silently enable polling. Network disconnects use bounded exponential reconnect. A fallback client retries live mode upon visibility/offline lifecycle reconciliation or remount; no parallel live/fallback loops.
- Only staging/test can open P2. COACH_SYNC_ENABLED remains false by default. Production is not enabled by this change.

## Verification

Unit tests cover owner routing, bounded queries, atomic capacity reservation, stalled/rejected query cleanup, stale query results and disabled/local publishing. Existing P1/client tests cover auth lifecycle, reconnect, cross-server revision deduplication, safe fallback, drafts and account isolation. The disposable CI PostgreSQL integration uses three independent Node processes, existing application connections and no listener role. Browser tests use desktop/mobile Chromium and WebKit, six directions, real saved history, reconnect and fallback; browser engines are not physical Android/iOS runtime evidence.

## Integration and later activation

Merge code only after Hardening and Staging Config pass on the reviewed branch and the latest staging base is reconciled. Do not add deployment trigger markers. This task integrates code only and does not start a runtime release.

No database account/password/connection-secret preparation remains. A later separately approved staging release must deploy both backend and frontend, respect any current release restrictions, verify the serving SHA and flag, then explicitly enable COACH_SYNC_ENABLED and validate actual Cloud Run streaming plus real devices. This code integration keeps the flag off. Rollback is the existing disabled flag/P1 path; no database ACL restoration is necessary.
