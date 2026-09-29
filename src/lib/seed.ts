import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import data from "../data/timetable.json";
import { activities, courses, picks, sessions } from "./schema";

// src/data/timetable.json is what ANU offers this term, transcribed from the
// real timetable: nothing in it is invented. This module checks it and syncs
// it into the database at boot, keyed on natural keys (course code, activity
// name, session label) so row ids, and therefore the student's picks, survive
// a redeploy with a corrected snapshot.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type SeedSession = {
  label: string;
  day: string;
  start: string;
  end: string;
  room: string;
  capacity?: number;
  taken?: number;
};
type SeedActivity = { name: string; mode: string; sessions: SeedSession[] };
type SeedCourse = { code: string; title: string; activities: SeedActivity[] };
type Seed = { term: string; source: string; courses: SeedCourse[] };

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
        if (!DAYS.includes(session.day as (typeof DAYS)[number])) {
          throw new Error(`${at}: day "${session.day}" is not one of ${DAYS.join(", ")}`);
        }
        if (minutes(session.start, at) >= minutes(session.end, at)) {
          throw new Error(`${at}: ends before it starts`);
        }
        if (session.capacity !== undefined && (session.taken ?? 0) > session.capacity) {
          throw new Error(`${at}: ${session.taken} taken of ${session.capacity} seats`);
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

        const labels = a.sessions.map((s) => s.label);
        for (const s of a.sessions) {
          const at = `${c.code} ${a.name} ${s.label}`;
          const values = {
            day: DAYS.indexOf(s.day as (typeof DAYS)[number]) + 1,
            start: minutes(s.start, at),
            end: minutes(s.end, at),
            room: s.room,
            capacity: s.capacity ?? null,
            taken: s.taken ?? null,
          };
          tx.insert(sessions)
            .values({ activityId: activity.id, label: s.label, ...values })
            .onConflictDoUpdate({ target: [sessions.activityId, sessions.label], set: values })
            .run();
        }

        // a session ANU no longer offers: drop any pick of it, then the session
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
  });
}
