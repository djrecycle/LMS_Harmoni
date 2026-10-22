"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/access";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { AiError } from "@/lib/ai-error";
import { requireTeacher } from "@/lib/session";
import { analisisDocx } from "@/lib/perangkat/template-import";
import { extractText, MAX_SOURCE_BYTES } from "@/lib/perangkat/extract-text";
import { BATAS_CONTOH_SIMPAN, BAWAAN_ID, normalisasi, templateBawaan, type Template } from "@/lib/perangkat/template";
import { CONTOH_MODUL_AJAR } from "@/lib/perangkat/assets";
import { getTemplate } from "@/lib/perangkat/store";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/teacher/perangkat-ajar", "layout");

/** What is stored in `modul_template.data`: the template without its id (the row id is the id). */
function toStored(tpl: Template): Record<string, unknown> {
  const { id: _id, bawaan: _bawaan, ...rest } = tpl;
  void _id;
  void _bawaan;
  return rest;
}

async function insertTemplate(teacherId: string, tpl: Template): Promise<string> {
  const [row] = await db.insert(S.modulTemplate).values({ teacherId, name: tpl.nama, data: toStored(tpl) }).returning({ id: S.modulTemplate.id });
  return row.id;
}

/** Create (empty id) or update a template. The built-in template cannot be saved: duplicate it first. */
export async function saveTemplate(data: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const tpl = normalisasi(data);
  if (tpl.id === BAWAAN_ID) return fail(t("The built-in template cannot be changed. Duplicate it first."));

  if (tpl.id) {
    if (!isUuid(tpl.id)) return fail(t("Template not found."));
    const updated = await db
      .update(S.modulTemplate)
      .set({ name: tpl.nama, data: toStored(tpl), updatedAt: new Date() })
      .where(and(eq(S.modulTemplate.id, tpl.id), eq(S.modulTemplate.teacherId, teacher.id)))
      .returning({ id: S.modulTemplate.id });
    if (!updated.length) return fail(t("Template not found."));
    refresh();
    return succeed(t("Template saved."), { id: tpl.id });
  }
  const id = await insertTemplate(teacher.id, tpl);
  refresh();
  return succeed(t("Template saved."), { id });
}

/** Copy any template (including the built-in one) into a new one the teacher can change. */
export async function duplicateTemplate(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const source = await getTemplate(teacher.id, id);
  const copy = normalisasi({ ...source, id: "", nama: `${source.nama} (${t("copy")})`, deskripsi: source.bawaan ? "" : source.deskripsi });
  if (!copy.gaya_contoh) copy.gaya_contoh = CONTOH_MODUL_AJAR.trim(); // the built-in sample becomes editable text
  const newId = await insertTemplate(teacher.id, copy);
  refresh();
  return succeed(t("Template duplicated."), { id: newId });
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  if (id === BAWAAN_ID) return fail(t("The built-in template cannot be deleted."));
  if (!isUuid(id)) return fail(t("Template not found."));
  const gone = await db.delete(S.modulTemplate).where(and(eq(S.modulTemplate.id, id), eq(S.modulTemplate.teacherId, teacher.id))).returning({ id: S.modulTemplate.id });
  if (!gone.length) return fail(t("Template not found."));
  refresh();
  return succeed(t("Template deleted."));
}

/**
 * New template from the teacher's own Modul Ajar / RPM file.
 * .docx: the layout (section order, titles, numbering, bullets, font) is detected and the text becomes the AI's style sample.
 * .pdf / .txt: only the text is used as the style sample; the layout follows the built-in template.
 */
export async function importTemplate(formData: FormData): Promise<ActionResult<{ id: string; report: string[] }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(t("Choose a .docx, .pdf, or .txt file."));
  if (file.size > MAX_SOURCE_BYTES) return fail(t("The file is too large (maximum 3 MB)."));
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 300);
  const base = file.name.replace(/\.[^.]+$/, "");

  try {
    if (file.name.toLowerCase().endsWith(".docx")) {
      const r = await analisisDocx(new Uint8Array(await file.arrayBuffer()));
      const tpl = normalisasi({ ...r.template, id: "", nama: name || base, deskripsi: description, gaya_contoh: r.teks.slice(0, BATAS_CONTOH_SIMPAN) });
      const id = await insertTemplate(teacher.id, tpl);
      refresh();
      return succeed(t("Template created from your file."), { id, report: r.laporan });
    }
    const text = await extractText(file);
    const tpl = normalisasi({ ...templateBawaan(), id: "", nama: name || base, deskripsi: description, gaya_contoh: text.slice(0, BATAS_CONTOH_SIMPAN) });
    const id = await insertTemplate(teacher.id, tpl);
    refresh();
    return succeed(t("Template created from your file."), { id, report: [] });
  } catch (e) {
    if (e instanceof AiError) return fail(t(e.message));
    console.error("[perangkat] import template", e);
    return fail(t("The file could not be read. Make sure it is a valid .docx, .pdf, or .txt file."));
  }
}
