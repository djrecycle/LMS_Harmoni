"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where the songs inside a lesson or practice material save their scores. Only the students' pages set it;
 *  outside it (teacher previews, editors) songs are played without saving.
 */
export type PracticeScope = { materialId?: string; practiceMaterialId?: string };

const Scope = createContext<PracticeScope | null>(null);

export function PracticeScopeProvider({ materialId, practiceMaterialId, children }: PracticeScope & { children: ReactNode }) {
  return <Scope.Provider value={{ materialId, practiceMaterialId }}>{children}</Scope.Provider>;
}

/** The scope songs save into, or null when they should not save. */
export function usePracticeScope() {
  return useContext(Scope);
}
