"use client";

import { MenulisMelodiPianoRoll } from "./menulis-melodi-piano-roll";
import { PolaIramaSederhana } from "./pola-irama-sederhana";

/**
 * Renders the interactive lesson component registered for `slug` (see src/lib/interactive-lessons.ts), or null if unknown.
 * `preview` renders it read-only for teachers trying it out — completion marks stay local and are never saved.
 */
export function InteractiveLesson({ slug, materialId, completedInitial, preview }: { slug: string; materialId: string; completedInitial: boolean; preview?: boolean }) {
  switch (slug) {
    case "pola-irama-sederhana":
      return <PolaIramaSederhana materialId={materialId} completedInitial={completedInitial} preview={preview} />;
    case "menulis-melodi-piano-roll":
      return <MenulisMelodiPianoRoll materialId={materialId} completedInitial={completedInitial} preview={preview} />;
    default:
      return null;
  }
}
