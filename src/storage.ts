/**
 * Persistence layer. Currently localStorage; the interface is deliberately
 * tiny (load/save) so a real backend + auth could replace it later without
 * touching the engine or UI.
 */

import type { AppData } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const KEY = "regular-data-v1";

export interface Storage {
  load(): AppData | null;
  save(data: AppData): void;
}

export const localStorageBackend: Storage = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppData;
      if (parsed.version !== 1) return null;
      // Backfill any settings added after the document was first written.
      parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      return parsed;
    } catch {
      return null;
    }
  },
  save(data: AppData) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },
};

/** Validate an imported JSON document just enough to trust it. */
export function validateImport(raw: string): AppData {
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.events) ||
    !Array.isArray(parsed.goals) ||
    !Array.isArray(parsed.assets) ||
    typeof parsed.settings !== "object"
  ) {
    throw new Error("This file doesn't look like a Regular export.");
  }
  parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
  parsed.pendingWithdrawals ??= [];
  parsed.incomeSources ??= [];
  return parsed as AppData;
}

export function exportJSON(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regular-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
