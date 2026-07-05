/**
 * Login gate — shown only when cloud sync is configured and no one is signed
 * in. Same design language as the console: calm, dark, no ceremony.
 */

import { useState } from "react";
import { supabase } from "../cloud";

export function Login({ onOffline }: { onOffline: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 6;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "in") {
        const { error } = await supabase().auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange in the store takes it from here.
      } else {
        const { data, error } = await supabase().auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice("Account created. Check your email for the confirmation link, then sign in.");
          setMode("in");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="wordmark" style={{ fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.22em" }}>
          REGULAR
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 4, marginBottom: 28 }}>
          never not saving
        </div>

        <div className="card">
          <div className="label mb16">{mode === "in" ? "Sign in" : "Create account"}</div>
          <div className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="field">
            <span className="label">Password (6+ characters)</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {error && <div className="notice block mb16">{error}</div>}
          {notice && <div className="notice mb16">{notice}</div>}

          <button className="btn btn-primary btn-big" style={{ width: "100%" }} disabled={!valid || busy} onClick={submit}>
            {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
          </button>

          <div className="row mt16">
            <button className="linklike" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}>
              {mode === "in" ? "First time? Create account" : "Have an account? Sign in"}
            </button>
            <button className="linklike" onClick={onOffline}>
              Continue offline
            </button>
          </div>
        </div>

        <div className="status-line faint mt16">
          Your ledger syncs to your private database. Offline mode keeps
          everything in this browser only.
        </div>
      </div>
    </div>
  );
}
