# Spec: queue export (planted)

- The export must return at most 30 items per page.
- The export must be fast.
- The user shall be able to upload a CSV of up to 5 MB.
- A failed download is retried 3 times, then an error is shown.
- The screen should be user-friendly.
- Existing approve and reject buttons must keep working unchanged.

F2P: node tools/export.mjs --page 1 prints 30 rows or fewer
P2P: node --test tests/apply-queue.test.mjs
