---
"@solidjs/signals": patch
---

Keep `latest()` render readers independent from async Loading optimistic lanes so repeated refreshes are not held until unrelated async work settles.
