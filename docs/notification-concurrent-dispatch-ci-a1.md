# APP8-NOTIFICATION-CONCURRENT-DISPATCH-CI-A1

Base staging: `529b4c15efbd13cf648b18b014606ecdd148abe4`, tree `c40679e16478873d9b69eafc23c5b7989526e668`.

## Finding

A real same-notification duplicate provider invocation is reproducible in the existing dispatch code. This is not an inbox/mark-all-read change or a second fixture notification being counted. The original failing assertion is at line 219: provider calls = 2, although completed delivery count = 1.

`claimNotification` locks the notifications row (`FOR UPDATE OF n SKIP LOCKED`), but reads its joined delivery-state row from the statement's earlier PostgreSQL snapshot. A second query can take its snapshot before the first claimant commits, and reach the row lock after that commit. The notification row itself has not changed while the provider is pending. The second query therefore uses old/missing lease state and its unconditional conflict update overwrites the active claim. Both providers send; only the final owner's delivery can be finalized, hiding the duplicate in the completed-delivery counter. Stale retry or terminal-state reads expose the same unguarded write.

## Evidence before the fix

Baseline HEAD `d585cbde4c5097aaaa4bb95344c36d5be3945584` changes only test instrumentation/workflow, not application code.

https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39162739048

A real PostgreSQL 16 test database and an in-process synthetic provider are used. An advisory predicate delays one actual claim query after its MVCC snapshot, without changing its existing predicates, values or transaction. The other real dispatcher obtains a lease while this query waits. Only one due notification exists in each case, and every provider call records its notification ID.

| Case | Distinct notification IDs | Provider calls before fix | Required calls |
| --- | ---: | ---: | ---: |
| No delivery-state row yet | 1 | 2 | 1 |
| Previously expired lease | 1 | 2 | 1 |
| First attempt establishes retry backoff | 1 | 2 | 1 |
| First attempt establishes terminal failure | 1 | 2 | 1 |

In the first two cases the active claim was replaced while the first provider was still pending; completed delivery count was only 1. The strict regression assertions failed in all four cases. An earlier instrumentation-only run did not reach its gate and is not used as product evidence.

The existing notification preference test file is byte-identical to pre-PR62 staging `12c15074c71c6bc3c84fc7a32b02eaa71f4f32c7`. The original production functions also match that version:

- claimNotification SHA-256: `c06a4b5198d3b17bcb2812ed12393c0b2bc5887d7a195d2e81ac76e1c2198048`.
- dispatchDue SHA-256: `3358531adbf85d2d694636a9c12ea34e6be49923f1d05cf5384f48b0d7546249`.

## Minimal fix

Make the existing claim insert/conflict update conditional on the latest state: no terminal failure, retry is due, and lease is absent or expired. PostgreSQL checks these conditions on the state row being written. A zero-row write means another claimant or transition won, so return without invoking the provider. Keep the existing row lock, claim IDs, three-minute lease, preference policy, retry budget/backoff and finalization behavior.

No schema, inbox, Android, Coach sync, delivery category or send-time change. This closes the demonstrated active-claim race; it does not claim provider-level exactly-once guarantees after a process crash, lost acknowledgement or an expired lease.

## Targeted validation

The four deterministic regression cases retain a strict single-provider-call assertion. They also check finalized state, attempt counts, retry/terminal state, and all call IDs. The original tests for concurrent dispatch, bounded retry and disabled preferences are run without modification. The dedicated workflow performs only these backend checks, types/lint and disposable PostgreSQL migrations; no real push, staging merge, deploy, APK or production/main action.

Final results and exact final HEAD/TREE are recorded in the PR and its successful workflow run.
