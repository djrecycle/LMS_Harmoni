import { AiError } from "../../ai-error";
import type { DocKind } from "../generator";
import { obj } from "../util";
import type { Ident } from "./base";
import { tulisCpTpAtp } from "./cp";
import { tulisMateriGuru, tulisMateriSiswa } from "./materi";
import { tulisModulAjar } from "./modul";

export type { Ident };

/** Render a saved document to .docx. `template` only applies to a Modul Ajar. */
export function tulisDokumen(jenis: DocKind, data: unknown, ident: Ident, template?: unknown): Promise<Buffer> {
  const d = obj(data);
  switch (jenis) {
    case "cp_tp_atp":
      return tulisCpTpAtp(d, ident);
    case "modul_ajar":
      return tulisModulAjar(d, ident, template);
    case "materi_guru":
      return tulisMateriGuru(d, ident);
    case "materi_siswa":
      return tulisMateriSiswa(d, ident);
    default:
      throw new AiError(`Jenis dokumen tidak dikenal: ${String(jenis)}`);
  }
}
