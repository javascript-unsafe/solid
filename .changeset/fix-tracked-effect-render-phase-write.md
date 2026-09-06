---
"@solidjs/signals": patch
---

Fix `createTrackedEffect` missing a signal written during a flush's render phase (#3291). Tracked effects read with committed visibility but are woken by writes, so a write staged while the effect's re-run (or first run) was already queued in the same pass ran it against the stale value, and the commit never re-notified. The tracked run now marks dependencies still holding a staged value, and committing such a node re-enqueues its tracked subscribers so they observe the landed value.
