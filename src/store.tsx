/**
 * React store: owns the persisted document, recomputes derived state from the
 * ledger on every change, and exposes the action layer. All mutations funnel
 * through `commit`, which persists to localStorage (always, as the offline
 * cache) and — when cloud sync is configured and signed in — pushes the
 * document to Supabase, debounced, last-write-wins.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppData, Settings } from "./types";
import { emptyData } from "./types";
import { exportJSON, localStorageBackend, validateImport } from "./storage";
import { setPrivacy } from "./lib/util";
import {
  cloudEnabled,
  fetchRemote,
  makeDebouncedPush,
  pushRemote,
  supabase,
  type CloudStatus,
} from "./cloud";
import { deriveState, type Derived } from "./engine/replay";
import { assessGoals, type Feasibility } from "./engine/feasibility";
import * as actions from "./engine/actions";
import { buildSeedData } from "./seed";

interface StoreValue {
  data: AppData;
  derived: Derived;
  feasibility: Feasibility[];
  /** True while the document is untouched example data. */
  isSeeded: boolean;
  cloudStatus: CloudStatus;
  accountEmail: string | null;
  signOut: () => Promise<void>;
  apply: (fn: (draft: AppData) => unknown) => unknown;
  updateSettings: (patch: Partial<Settings>) => void;
  wipeAll: () => void;
  loadExample: () => void;
  exportData: () => void;
  importData: (raw: string) => string | null;
  actions: typeof actions;
  /* privacy — a local view preference, never synced or in the document */
  privacyOn: boolean;
  togglePrivacy: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const SEEDED_KEY = "regular-is-seed-v1";

/* privacy preference, held per-device in localStorage */
const PRIV_ON_KEY = "regular-privacy-on-v1";

function initialData(): AppData {
  const existing = localStorageBackend.load();
  if (existing) return existing;
  // First launch: seed with example data the user can wipe with one click.
  const seeded = buildSeedData();
  localStorageBackend.save(seeded);
  localStorage.setItem(SEEDED_KEY, "1");
  return seeded;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const [isSeeded, setIsSeeded] = useState(
    () => localStorage.getItem(SEEDED_KEY) === "1"
  );
  const [session, setSession] = useState<Session | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    cloudEnabled ? "signedOut" : "disabled"
  );

  /* privacy — mirror to the util module so fmt/fmtExact mask on render */
  const [privacyOn, setPrivacyOn] = useState(
    () => localStorage.getItem(PRIV_ON_KEY) === "1"
  );
  // Set the module state before first paint so numbers render masked.
  setPrivacy(privacyOn);

  const togglePrivacy = useCallback(() => {
    setPrivacyOn((on) => {
      const next = !on;
      localStorage.setItem(PRIV_ON_KEY, next ? "1" : "0");
      setPrivacy(next);
      return next;
    });
  }, []);

  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  /** Server updated_at of the last state we pushed or adopted. */
  const lastSyncRef = useRef<string>("");
  const debouncedPush = useRef(makeDebouncedPush()).current;

  const schedulePush = useCallback(
    (doc: AppData) => {
      const s = sessionRef.current;
      if (!s) return;
      setCloudStatus("syncing");
      debouncedPush(
        s,
        doc,
        (updatedAt) => {
          lastSyncRef.current = updatedAt;
          setCloudStatus("synced");
        },
        () => setCloudStatus("error")
      );
    },
    [debouncedPush]
  );

  /** The single write path: React state + localStorage + (maybe) cloud. */
  const commit = useCallback(
    (next: AppData, opts?: { keepSeeded?: boolean }) => {
      localStorageBackend.save(next);
      if (!opts?.keepSeeded) {
        localStorage.removeItem(SEEDED_KEY);
        setIsSeeded(false);
      }
      setData(next);
      schedulePush(next);
    },
    [schedulePush]
  );

  /* ---------------- cloud session lifecycle ---------------- */

  useEffect(() => {
    if (!cloudEnabled) return;
    supabase()
      .auth.getSession()
      .then(({ data: { session } }) => setSession(session));
    const { data: sub } = supabase().auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /** Adopt the remote document, or migrate local history up on first login. */
  const syncFromRemote = useCallback(
    async (s: Session, localDoc: AppData) => {
      setCloudStatus("syncing");
      try {
        const remote = await fetchRemote(s);
        if (remote) {
          if (remote.updatedAt > lastSyncRef.current) {
            lastSyncRef.current = remote.updatedAt;
            localStorageBackend.save(remote.data);
            localStorage.removeItem(SEEDED_KEY);
            setIsSeeded(false);
            setData(remote.data);
          }
        } else {
          // First login anywhere: whatever this browser holds becomes the doc.
          lastSyncRef.current = await pushRemote(s, localDoc);
        }
        setCloudStatus("synced");
      } catch {
        setCloudStatus("error");
      }
    },
    []
  );

  useEffect(() => {
    if (!session) {
      if (cloudEnabled) setCloudStatus("signedOut");
      return;
    }
    void syncFromRemote(session, data);
    // Two-laptop case: whenever the tab regains focus, check for newer remote.
    const onFocus = () => {
      const s = sessionRef.current;
      if (s && document.visibilityState === "visible") {
        void syncFromRemote(s, data);
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const signOut = useCallback(async () => {
    if (!cloudEnabled) return;
    await supabase().auth.signOut();
    lastSyncRef.current = "";
  }, []);

  /* ---------------- mutations ---------------- */

  const apply = useCallback(
    (fn: (draft: AppData) => unknown) => {
      let result: unknown;
      setData((prev) => {
        const draft = structuredClone(prev);
        result = fn(draft);
        localStorageBackend.save(draft);
        schedulePush(draft);
        return draft;
      });
      localStorage.removeItem(SEEDED_KEY);
      setIsSeeded(false);
      return result;
    },
    [schedulePush]
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      apply((draft) => {
        draft.settings = { ...draft.settings, ...patch };
      });
    },
    [apply]
  );

  const wipeAll = useCallback(() => {
    commit(emptyData(structuredClone(data.settings)));
  }, [data.settings, commit]);

  const loadExample = useCallback(() => {
    const seeded = buildSeedData();
    commit(seeded, { keepSeeded: true });
    localStorage.setItem(SEEDED_KEY, "1");
    setIsSeeded(true);
  }, [commit]);

  const exportData = useCallback(() => exportJSON(data), [data]);

  const importData = useCallback(
    (raw: string): string | null => {
      try {
        commit(validateImport(raw));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Import failed.";
      }
    },
    [commit]
  );

  const derived = useMemo(() => deriveState(data), [data]);
  const feasibility = useMemo(() => assessGoals(data, derived), [data, derived]);

  const value: StoreValue = {
    data,
    derived,
    feasibility,
    isSeeded,
    cloudStatus,
    accountEmail: session?.user.email ?? null,
    signOut,
    apply,
    updateSettings,
    wipeAll,
    loadExample,
    exportData,
    importData,
    actions,
    privacyOn,
    togglePrivacy,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export { cloudEnabled };
