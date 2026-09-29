import { sql } from "drizzle-orm";
import { check, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
//
// Two kinds of state live here. courses, activities and sessions are a
// snapshot of what ANU offers, synced from src/data/timetable.json at boot
// (see src/lib/seed.ts). picks is the student's own state, and the only
// thing the app writes.

export const courses = sqliteTable("courses", {
  id: int().primaryKey({ autoIncrement: true }),
  code: text().notNull().unique(),
  title: text().notNull(),
});

// A stream of a course: its lectures, its tutorials, its labs. `mode` says
// whether the student attends every session ("all", like lectures) or
// chooses exactly one ("pick", like tutorials).
export const activities = sqliteTable(
  "activities",
  {
    id: int().primaryKey({ autoIncrement: true }),
    courseId: int("course_id")
      .notNull()
      .references(() => courses.id),
    name: text().notNull(),
    mode: text({ enum: ["all", "pick"] }).notNull(),
  },
  (t) => [
    uniqueIndex("activities_course_name").on(t.courseId, t.name),
    check("activities_mode", sql`${t.mode} in ('all', 'pick')`),
  ],
);

// One time slot of an activity. Times are minutes after midnight so overlap
// is plain integer comparison. `taken` is the seats other students held when
// the snapshot was taken.
export const sessions = sqliteTable(
  "sessions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    activityId: int("activity_id")
      .notNull()
      .references(() => activities.id),
    label: text().notNull(),
    day: int().notNull(),
    start: int().notNull(),
    end: int().notNull(),
    room: text().notNull(),
    capacity: int(),
    taken: int(),
  },
  (t) => [
    uniqueIndex("sessions_activity_label").on(t.activityId, t.label),
    check("sessions_day", sql`${t.day} between 1 and 7`),
    check("sessions_time", sql`${t.start} < ${t.end}`),
  ],
);

// The student's choice: one row per activity, so choosing a different session
// of the same activity replaces the old pick in a single write. A swap can
// never leave the student holding both sessions, or neither.
export const picks = sqliteTable("picks", {
  activityId: int("activity_id")
    .primaryKey()
    .references(() => activities.id),
  sessionId: int("session_id")
    .notNull()
    .references(() => sessions.id),
  pickedAt: text("picked_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Course = typeof courses.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Pick = typeof picks.$inferSelect;
