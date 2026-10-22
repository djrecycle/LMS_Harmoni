/** Plain data shapes passed from the server page to the client components of the teaching-document generator. */
import type { DocKind } from "./generator";

export type LibraryRow = {
  id: string;
  kind: DocKind;
  title: string;
  status: "pending" | "done" | "error";
  error: string | null;
  provider: string | null;
  templateId: string;
  templateName: string;
  /** Grade level (7/8/9) this document was generated for, from its context — empty when not set. */
  kelas: string;
  createdAt: string; // ISO
};

/** One learning objective (TP) taken from a saved CP-TP-ATP, with what its ATP says about it. */
export type TpItem = { tp: string; semester: string; babNomor: string; babJudul: string; alokasi: string };

export type CpGroup = {
  cpId: string;
  cpTitle: string;
  /** Context fields readable from this CP (subject, class, phase, year, number of TP). */
  context: Record<string, string>;
  tps: TpItem[];
};

export type TemplateOption = { id: string; name: string };

export const PROVIDER_LABEL: Record<string, string> = { "claude-cli": "Claude Code", anthropic: "Anthropic API", gemini: "Gemini API", ollama: "Ollama (local)" };
