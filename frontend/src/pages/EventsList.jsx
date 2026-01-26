import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Link } from "react-router-dom";

import { getPredictProgram } from "../lib/anchorClient";
import { getPredictReadonlyProgram } from "../lib/anchorReadOnly";

export default function EventsList() {
  const wallet = useWallet();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const program = useMemo(() => {
    if (wallet?.publicKey && wallet.connected) return getPredictProgram(wallet);
    return getPredictReadonlyProgram();
  }, [wallet.publicKey, wallet.connected]);

  async function loadEvents() {
    if (!program) return;
    setErr("");
    setLoading(true);
    try {
      // fetch all Event accounts
      const rows = await program.account.event.all();
      // sort newest first
      rows.sort((a, b) => (b.account.createdAt?.toNumber?.() ?? 0) - (a.account.createdAt?.toNumber?.() ?? 0));
      setEvents(rows);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!program) return;
    loadEvents();
  }, [program]);

  return (
    <div>
      <h2>Events</h2>

      
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={loadEvents} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
        {err && <span style={{ color: "crimson" }}>{err}</span>}
        {!wallet.publicKey && (
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            Viewing in read-only mode (connect wallet to interact).
          </span>
        )}
      </div>
      

      <div style={{ marginTop: 16 }}>
        {events.length === 0 && wallet.publicKey && !loading && <p>No events found.</p>}

        {events.map((row) => {
          const ev = row.account;
          return (
            <div key={row.publicKey.toBase58()} style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{ev.title}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                PDA: {row.publicKey.toBase58()}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Creator: {ev.creator.toBase58()}
              </div>
              {/* <div style={{ fontSize: 12, opacity: 0.8 }}>
                event_id: {ev.eventId?.toString?.() ?? "?"}
              </div> */}

              <div style={{ marginTop: 8 }}>
                <Link to={`/event/${row.publicKey.toBase58()}`}>View Details</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
