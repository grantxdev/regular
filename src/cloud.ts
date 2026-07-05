/**
 * Cloud sync — Supabase. Optional: if the env keys are absent, the app runs
 * exactly as before on localStorage alone. When configured, the document
 * lives in one `documents` row per user (RLS-protected); localStorage stays
 * as the offline cache, and last-write-wins keeps two laptops honest.
 */

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import type { AppData } from "./types";
import { validateImport } from "./storage";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = Boolean(url && key);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    if (!cloudEnabled) throw new Error("Cloud sync is not configured.");
    client = createClient(url!, key!);
  }
  return client;
}

export type CloudStatus = "disabled" | "signedOut" | "syncing" | "synced" | "error";

export interface RemoteDoc {
  data: AppData;
  updatedAt: string;
}

/** Fetch the signed-in user's document, or null if they don't have one yet. */
export async function fetchRemote(session: Session): Promise<RemoteDoc | null> {
  const { data: row, error } = await supabase()
    .from("documents")
    .select("data, updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  // Run imports through the same validation as a JSON file — trust nothing.
  return {
    data: validateImport(JSON.stringify(row.data)),
    updatedAt: row.updated_at as string,
  };
}

/** Upsert the whole document. Returns the new server-side updated_at. */
export async function pushRemote(session: Session, doc: AppData): Promise<string> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase()
    .from("documents")
    .upsert({ user_id: session.user.id, data: doc, updated_at: updatedAt });
  if (error) throw error;
  return updatedAt;
}

/** Debounced pusher — rapid edits collapse into one write. */
export function makeDebouncedPush(delayMs = 800) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> = Promise.resolve();
  return (session: Session, doc: AppData, onDone: (updatedAt: string) => void, onError: (e: unknown) => void) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      inflight = inflight
        .then(() => pushRemote(session, doc))
        .then(onDone)
        .catch(onError);
    }, delayMs);
  };
}
