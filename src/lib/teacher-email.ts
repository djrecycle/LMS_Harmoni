/**
 * Teachers sign up with an official email or Gmail: belajar.id (the Ministry's teacher accounts, every level such as
 * guru.smp.belajar.id), the studio's own domains, or gmail.com. Students are not affected (their teacher creates them).
 */
export const TEACHER_EMAIL_DOMAINS = ["belajar.id", "harmoniclass.tech", "musicclass.tech", "gmail.com"] as const;

export function isAllowedTeacherEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return TEACHER_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export const TEACHER_EMAIL_RULE = "Teachers sign up with an official email (belajar.id) or Gmail.";
