/** Database access for the teaching-document generator. Every function takes the teacher id: a teacher only sees their own rows. */
import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/access";
import { refundAllowance } from "@/lib/ai";
import { BAWAAN_ID, normalisasi, templateBawaan, type Template } from "./template";
import { isObj } from "./util";
import type { PerangkatKonteks } from "./generator";

const S = schema;

/** A generation that has been "pending" longer than this is treated as lost (the server probably restarted). */
export const STALE_MINUTES = 20;

/* ------------------------------------------------------------------ settings */
export type PerangkatSetting = {
  mata_pelajaran: string;
  kelas: string;
  fase: string;
  semester: string;
  tahun_ajaran: string;
  alokasi_waktu: string;
  nama_sekolah: string;
  nama_guru: string;
  nama_kepala: string;
  nip_guru: string;
  nip_kepala: string;
  kota: string;
  template_id: string;
};

export const SETTING_DEFAULT: PerangkatSetting = {
  mata_pelajaran: "Seni Musik",
  kelas: "",
  fase: "",
  semester: "I (Ganjil)",
  tahun_ajaran: "",
  alokasi_waktu: "2 JP",
  nama_sekolah: "",
  nama_guru: "",
  nama_kepala: "",
  nip_guru: "",
  nip_kepala: "",
  kota: "",
  template_id: BAWAAN_ID,
};

export async function getSetting(teacherId: string): Promise<PerangkatSetting> {
  const [row] = await db.select({ data: S.perangkatSetting.data }).from(S.perangkatSetting).where(eq(S.perangkatSetting.teacherId, teacherId)).limit(1);
  const data = isObj(row?.data) ? row.data : {};
  const out = { ...SETTING_DEFAULT };
  for (const k of Object.keys(out) as (keyof PerangkatSetting)[]) if (typeof data[k] === "string") out[k] = data[k] as string;
  return out;
}

export async function saveSetting(teacherId: string, data: PerangkatSetting) {
  await db
    .insert(S.perangkatSetting)
    .values({ teacherId, data })
    .onConflictDoUpdate({ target: S.perangkatSetting.teacherId, set: { data, updatedAt: new Date() } });
}

/* ------------------------------------------------------------------ documents */
export async function getOwnedDoc(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [d] = await db.select().from(S.teachingDoc).where(and(eq(S.teachingDoc.id, id), eq(S.teachingDoc.teacherId, teacherId))).limit(1);
  return d ?? null;
}

export const docContext = (d: { context: unknown }): PerangkatKonteks => (isObj(d.context) ? (d.context as PerangkatKonteks) : {});

/** Turn generations that were interrupted into errors and give their AI allowance back. */
export async function expireStale(teacherId: string) {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000);
  const rows = await db
    .update(S.teachingDoc)
    .set({ status: "error", error: "The generation was interrupted (the server may have restarted). Please try again." })
    .where(and(eq(S.teachingDoc.teacherId, teacherId), eq(S.teachingDoc.status, "pending"), lt(S.teachingDoc.createdAt, cutoff)))
    .returning({ id: S.teachingDoc.id });
  for (let i = 0; i < rows.length; i++) await refundAllowance(teacherId);
}

/** Library rows without the (large) result data. */
export async function listDocs(teacherId: string) {
  return db
    .select({
      id: S.teachingDoc.id,
      kind: S.teachingDoc.kind,
      title: S.teachingDoc.title,
      status: S.teachingDoc.status,
      error: S.teachingDoc.error,
      provider: S.teachingDoc.provider,
      context: S.teachingDoc.context,
      sourceId: S.teachingDoc.sourceId,
      createdAt: S.teachingDoc.createdAt,
    })
    .from(S.teachingDoc)
    .where(eq(S.teachingDoc.teacherId, teacherId))
    .orderBy(desc(S.teachingDoc.createdAt));
}

/** All finished CP-TP-ATP documents with their data (used to map a TP to its BAB/semester) and context (e.g. a hand-corrected class tag). */
export async function listCpDocs(teacherId: string) {
  return db
    .select({ id: S.teachingDoc.id, title: S.teachingDoc.title, data: S.teachingDoc.data, context: S.teachingDoc.context })
    .from(S.teachingDoc)
    .where(and(eq(S.teachingDoc.teacherId, teacherId), eq(S.teachingDoc.kind, "cp_tp_atp"), eq(S.teachingDoc.status, "done")))
    .orderBy(desc(S.teachingDoc.createdAt));
}

/* ------------------------------------------------------------------ templates */
/** Built-in template first, then the teacher's own (newest first). */
export async function listTemplates(teacherId: string): Promise<Template[]> {
  const rows = await db.select().from(S.modulTemplate).where(eq(S.modulTemplate.teacherId, teacherId)).orderBy(desc(S.modulTemplate.updatedAt));
  return [templateBawaan(), ...rows.map((r) => normalisasi({ ...r.data, id: r.id }))];
}

/** Template by id; falls back to the built-in one when empty or deleted. */
export async function getTemplate(teacherId: string, id: string | null | undefined): Promise<Template> {
  if (!id || id === BAWAAN_ID || !isUuid(id)) return templateBawaan();
  const [r] = await db.select().from(S.modulTemplate).where(and(eq(S.modulTemplate.id, id), eq(S.modulTemplate.teacherId, teacherId))).limit(1);
  return r ? normalisasi({ ...r.data, id: r.id }) : templateBawaan();
}

