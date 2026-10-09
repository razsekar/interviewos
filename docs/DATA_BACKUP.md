# Data and backup

## What is stored, and where

| Data | Store | Notes |
|---|---|---|
| Progress per question | IndexedDB `progress` | exposures, reviews, lapses, stage, interval, due date, last five ratings |
| Review history | IndexedDB `reviews` | one row per rating (question, time, rating, mode, style) |
| Bookmarks | IndexedDB `bookmarks` | |
| Study sessions | IndexedDB `sessions` | queue, position, ratings, simulation notes (up to 20 finished ones are kept) |
| Goals | IndexedDB `goals` | daily target, optional interview date |
| Preferences | LocalStorage | theme, answer style, speech rate/voice, scheduling ladder, mastery threshold, timers |

Nothing is sent to a server. Simulation notes are stored on the device and included in backups.

## Backup file

One JSON file (`interviewos-backup-YYYY-MM-DD.json`):

```json
{ "format": "interviewos-backup", "version": 1, "appVersion": "1.0.0", "exportedAt": "2026-10-09T...Z",
  "data": { "progress": [...], "reviews": [...], "bookmarks": [...], "sessions": [...], "goals": [...], "prefs": {...} } }
```
It contains no question text, only ids like `react/what-is-react`.

## Import rules

The file is parsed and validated **before** anything changes: format name, version (newer versions are refused), every record's types and ranges, id pattern, size limit (25 MB), whitelisted preference keys with value checks. One bad record rejects the file with a list of reasons; nothing is written.

- **Merge** keeps the record with the newer `lastSeen` per question (ties go to more reviews), unions review history by (question, time, rating), unions bookmarks, keeps the newer session per id, keeps local goals (adding any that are missing) and keeps local preferences.
- **Replace** overwrites progress, reviews, bookmarks, sessions, goals and preferences, after a confirmation dialog.
- Both are applied in a single IndexedDB transaction: all or nothing.

## Resetting

Settings → Reset deletes progress, reviews, bookmarks, sessions and goals (after confirmation). Preferences stay.

## Durability

Browsers may evict site data under storage pressure. Settings has *Ask browser to keep my data* (`navigator.storage.persist()`); the browser decides. Export backups before switching browsers or clearing data. In private browsing, IndexedDB may be unavailable; the app then uses memory and shows a warning.
