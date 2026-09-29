# Process overview

## What I built

A full-stack replacement for choosing tutorials in ANU timetabling, on my real
2026 S2 courses, deployed to fly. `README.md` says what it is and what good
means here; this is how I got there, working with Claude Code.

## How I got here

**Harness first.** I carried my working agreements forward from Assignment 2
and dropped the rules that belonged to that site's subject
([`fcc8a58`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-arvinyuchen/commit/fcc8a58)).
The one that shaped this week was grounding: *never invent a fact about the
real system; ask rather than guess.* Before any code, the spec's two checkable
lines became a test that drives the running app over HTTP: choose a session,
reload, and it's still there. It was committed red
([`f4dfa34`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-arvinyuchen/commit/f4dfa34)).

**Choosing the slice.**

> let's start building the timetabling app

Following the grounding rule, the agent asked before writing code: which part
ruins my week, where the data comes from, and whose timetable it is. I answered
all four pain points (invisible clashes, sessions filling up, no weekly view,
painful swaps), my real timetable, and one student with no login. The agent
built the machinery with the timetable file left **empty**, and checked it
against an obviously fake fixture that was never committed
([`0580535`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-arvinyuchen/commit/0580535)).
Looking at the page in a browser, rather than trusting the tests, caught three
things: clash text clipped in narrow cards, empty days without hour lines, and
confusing "0 seats left" wording on a session I already held.

**Grounding the data.** Instead of typing sessions in, I pointed the agent at a
source:

> https://timetable.cssa.club/?y=2026&s=S2 Can you check if you can get data
> from this website.

It found the JSON file behind the CSSA app and reported what that data can't
do. It has no capacity. It's scraped from the old official timetable, not
MyTimetable. It's licensed CC BY-SA. And one session can meet on different days
in different weeks. Then I gave it my MyTimetable export:

> Check this

The two sources agreed on every one of my five allocations. That became the
design: the export decides my courses and starting picks, the CSSA data lists
the alternatives, and the import script fails on any mismatch. The schema moved
from one slot per session to meetings with teaching weeks, so a clash needs a
shared week
([`dd6641a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-arvinyuchen/commit/dd6641a)).
My export stays out of the public repo.

**Correcting course on seats.** I first said to ship without seats, then
changed my mind mid-answer:

> COMP4020, customise seats, ship with capacity

When I told the agent to define the numbers itself, that ran straight into the
grounding rule. The resolution kept the rule: the numbers are labelled as
illustrative in the data and on the page, never presented as ANU's, and one
tutorial is full so the refusal can be shown.

**How I knew it was right.** The full suite passed on the real data. On the
local build I swapped a tutorial and checked the database held one pick row,
not two. After deploying, the same checks ran against the live app on fly:
choose, reload, still there; a full session refused; a cross-site POST refused.
Then my real picks were restored.

**Things the agent got wrong that the checks caught:**

- a sync step that would have deleted every pick
- a `<=` that Astro's template parser read as a tag
- a non-breaking space in the CSSA course titles
- cards clipped at desktop widths, found by measuring the rendered page rather
  than eyeballing a scaled screenshot

It also caught one of mine: the first Fly token I pasted was scoped to my
final-project app, not this one.
