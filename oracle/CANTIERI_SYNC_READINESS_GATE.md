# Oracle Cantieri -> Gestionale: readiness gate

Status: staging contains 6,125 unique business documents, but source `public.firestore_documents` in Cantieri last showed only one `test_oracle` entry.

**Do not schedule automatic imports from empty source.**

For production synchronization:
1. Confirm Cantieri's live writer actually persists real business collections on Oracle rather than only Firebase.
2. Compare source document versions and retain the destination's historical-only entries.
3. Run staged, idempotent upserts; never remove missing records automatically.
4. Record checkpoint, error and freshness; enforce lock against concurrent runs.
5. Enable scheduling after a full sample reconciliation and restoration rehearsal.

Until the live writer is confirmed, the 6,125 staged documents remain historical copies, not real-time sync.
