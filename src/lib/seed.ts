import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import data from "../data/timetable.json";
import { activities, courses, meetings, picks, sessions } from "./schema";

// src/data/timetable.json is what ANU offers this term, written by
// scripts/import-timetable.ts from real sources (see its header): nothing in
// it is typed in by hand, except the seats it labels as illustrative. This
// module checks it and syncs it into the database at boot, keyed on natural
// keys (course code, activity name, session label) so row ids, and therefore
// the student's picks, survive a redeploy with a refreshed snapshot.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type SeedMeeting = { day: string; start: string; end: string; room: string; weeks: number[] };
type SeedSession = { label: string; capacity?: number; taken?: number; meetings: SeedMeeting[] };
type SeedActivity = { name: string; mode: string; sessions: SeedSession[] };
type SeedCourse = { code: string; title: string; activities: SeedActivity[] };
type SeedPick = { course: string; activity: string; label: string };
export type Seed = {
  term: string;
  source?: { sessions: string; project: string; licence: string; fetched: string; allocation: string };
  seats?: string;
  courses: SeedCourse[];
  picks?: SeedPick[];
};

export const seed = data as Seed;

function minutes(time: string, where: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`${where}: time "${time}" is not HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

// Refuse a malformed snapshot at boot rather than render a wrong timetable.
function validate(s: Seed): void {
  for (const course of s.courses) {
    for (const activity of course.activities) {
      const where = `${course.code} ${activity.name}`;
      if (activity.mode !== "all" && activity.mode !== "pick") {
        throw new Error(`${where}: mode must be "all" or "pick", not "${activity.mode}"`);
      }
      for (const session of activity.sessions) {
        const at = `${where} ${session.label}`;
        if (session.meetings.length === 0) throw new Error(`${at}: never meets`);
        if (session.capacity !== undefined && (session.taken ?? 0) > session.capacity) {
          throw new Error(`${at}: ${session.taken} taken of ${session.capacity} seats`);
        }
        for (const m of session.meetings) {
          if (!DAYS.includes(m.day as (typeof DAYS)[number])) {
            throw new Error(`${at}: day "${m.day}" is not one of ${DAYS.join(", ")}`);
          }
          if (minutes(m.start, at) >= minutes(m.end, at)) throw new Error(`${at}: ends before it starts`);
          if (m.weeks.length === 0) throw new Error(`${at}: meets in no weeks`);
        }
      }
    }
  }
}

export function syncSeed(db: BetterSQLite3Database): void {
  validate(seed);
  db.transaction((tx) => {
    for (const c of seed.courses) {
      const course = tx
        .insert(courses)
        .values({ code: c.code, title: c.title })
        .onConflictDoUpdate({ target: courses.code, set: { title: c.title } })
        .returning()
        .get();

      for (const a of c.activities) {
        const mode = a.mode as "all" | "pick";
        const activity = tx
          .insert(activities)
          .values({ courseId: course.id, name: a.name, mode })
          .onConflictDoUpdate({ target: [activities.courseId, activities.name], set: { mode } })
          .returning()
          .get();

        for (const s of a.sessions) {
          const at = `${c.code} ${a.name} ${s.label}`;
          const seats = { capacity: s.capacity ?? null, taken: s.taken ?? null };
          const session = tx
            .insert(sessions)
            .values({ activityId: activity.id, label: s.label, ...seats })
            .onConflictDoUpdate({ target: [sessions.activityId, sessions.label], set: seats })
            .returning()
            .get();

          // meetings carry no student state, so they're simply rewritten
          tx.delete(meetings).where(eq(meetings.sessionId, session.id)).run();
          for (const m of s.meetings) {
            tx.insert(meetings)
              .values({
                sessionId: session.id,
                day: DAYS.indexOf(m.day as (typeof DAYS)[number]) + 1,
                start: minutes(m.start, at),
                end: minutes(m.end, at),
                room: m.room,
                weeks: m.weeks.join(","),
              })
              .run();
          }
        }

        // a session ANU no longer offers: drop any pick of it, then the session
        const labels = a.sessions.map((s) => s.label);
        const gone = tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(and(eq(sessions.activityId, activity.id), notInArray(sessions.label, labels)))
          .all()
          .map((r) => r.id);
        if (gone.length > 0) {
          tx.delete(picks).where(inArray(picks.sessionId, gone)).run();
          tx.delete(sessions).where(inArray(sessions.id, gone)).run();
        }
      }
    }

    // A fresh database starts from the allocation in my MyTimetable export.
    // Once any pick exists the student's own choices win, so a redeploy never
    // undoes a swap.
    const existing = tx.select({ n: count() }).from(picks).get()?.n ?? 0;
    if (existing > 0) return;
    for (const p of seed.picks ?? []) {
      const row = tx
        .select({ sessionId: sessions.id, activityId: activities.id })
        .from(sessions)
        .innerJoin(activities, eq(sessions.activityId, activities.id))
        .innerJoin(courses, eq(activities.courseId, courses.id))
        .where(and(eq(courses.code, p.course), eq(activities.name, p.activity), eq(sessions.label, p.label)))
        .get();
      if (!row) throw new Error(`starting pick ${p.course} ${p.activity} ${p.label} isn't an offered session`);
      tx.insert(picks).values(row).run();
    }
  });
}
