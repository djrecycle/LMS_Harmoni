import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";

/**
 * Filters for the members of a class as the TEACHER sees them: the teacher's test student (Student view) is left out,
 * so it never shows up in rosters, grades, recaps, attendance or exports. Student-side pages use the plain membership.
 */
export const memberOf = (classroomId: string) => and(eq(schema.classroomMembership.classroomId, classroomId), eq(schema.classroomMembership.isDemo, false))!;
export const membersOf = (classroomIds: string[]) => and(inArray(schema.classroomMembership.classroomId, classroomIds), eq(schema.classroomMembership.isDemo, false))!;
