# My ANU timetable

A replacement for the slice of ANU timetabling that ruins my week: choosing
tutorials. It shows my real 2026 Semester 2 week (COMP4020 and MUSI1110) on
one grid, lets me pick or swap a tutorial, warns me about a clash before I
choose, and refuses a session that's full. Choices are stored in SQLite on the
server, so they're still there after a reload or a redeploy.

## What good looks like here

**Good means it's my real timetable, not a plausible one.** The whole point is
the annoyance of the real system, so nothing about ANU is made up. The sessions
come from two sources that have to agree. My own MyTimetable export (an `.ics`
file) says which courses I take and which session I'm allocated to. The
[ANU CSSA unofficial timetable](https://github.com/pl4nty/anutimetable)
(CC BY-SA 4.0, scraped daily from the old official timetable) lists every
session I could choose instead. `scripts/import-timetable.ts` refuses to import
if any allocation in my export doesn't match a CSSA session at the same day and
time. All five matched. My export itself stays out of the repo because it's
personal and names staff; only what's derived from it is committed.

**The four things that actually go wrong are the features:**

- **Clashes are invisible until too late.** The picker marks a session that
  overlaps something I already attend, before I choose it. A clash needs the
  same day, overlapping times *and* a teaching week in common, because some
  tutorials move day for a single week (COMP4020 TutA/01 and /02 in week 41).
- **Sessions fill up.** A full session can't be chosen, and the check and the
  write happen in one transaction.
- **There's no single weekly view.** One grid holds lectures (blue), my picks
  (green) and clashes (red, side by side). On a phone it becomes a list per day.
- **Swapping is painful.** The database holds exactly one pick per activity, so
  a swap replaces the old pick in a single write. I can never end up in both
  sessions, or in neither.

**Which activities are "pick one" isn't my rule.** It's the CSSA app's: an
activity with several sessions is one you choose between, and one with a single
session is one you attend.

**Seats are the exception, and they say so.** Neither source publishes
capacity. The seat numbers on COMP4020's tutorials are illustrative, set for
this prototype so the full-session behaviour can be shown, and the page labels
them that way. MUSI1110 shows "capacity not published".

**What's enforced and what's judgement.** `spec/timetable.test.ts` drives the
running app over HTTP: it chooses a session through the form and checks it's
still in the timetable on a fresh load. The course invariants check structure
and accessibility on every page, and the seed is validated at boot, so a
malformed timetable stops the server instead of rendering wrong. Whether this
is the right slice, and whether it's better than MyTimetable, is judgement.

**What I chose not to build:** logins and other students (it's one person's
timetable), searching all 895 S2 courses (only my own are imported), and live
seat counts (there's no source for them).
