import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getProgram } from "../lib/anchorClient";
import {
  findCounterPda,
  findEventPda,
  findCollateralVaultPda,
  findMintAuthorityPda,
  findTrueMintPda,
  findFalseMintPda,
} from "../lib/pdas";
import { useNavigate } from "react-router-dom";

function toUnixSeconds(dateStr) {
  const ms = new Date(dateStr).getTime();
  return Math.floor(ms / 1000);
}

export default function CreateEvent() {
  const wallet = useWallet();
  const nav = useNavigate();

  const [title, setTitle] = useState("");
  const [betEnd, setBetEnd] = useState("");
  const [commitEnd, setCommitEnd] = useState("");
  const [revealEnd, setRevealEnd] = useState("");
  const [truthQuestion, setTruthQuestion] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const program = useMemo(() => {
    if (!wallet?.publicKey || !wallet.connected) return null;
    return getProgram(wallet);
  }, [wallet.publicKey, wallet.connected]);

  async function ensureCounter() {
    const [counterPda] = await findCounterPda(wallet.publicKey);
    const counterAcc = await program.account.eventCounter.fetchNullable(counterPda);

    if (counterAcc) return { counterPda, counterAcc };

    // init counter
    await program.methods
      .initializeEventCounter()
      .accounts({
        creator: wallet.publicKey,
        counter: counterPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const counterAcc2 = await program.account.eventCounter.fetch(counterPda);
    return { counterPda, counterAcc: counterAcc2 };
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!wallet.publicKey) return alert("Connect wallet");
    if (!program) return alert("Program not ready");

    // basic client-side checks (optional)
    if (title.trim().length < 10 || title.trim().length > 150) {
      return alert("Title must be 10-150 characters.");
    }
    if (!betEnd || !commitEnd || !revealEnd) {
      return alert("Please set bet/commit/reveal times.");
    }

    setBusy(true);
    setMsg("");

    try {
      // 1) ensure counter exists
      const { counterPda, counterAcc } = await ensureCounter();

      const eventId = new BN(counterAcc.count); // u64
      const eventIdLe = eventId.toArrayLike(Buffer, "le", 8);

      // 2) derive Event PDA
      const [eventPda] = await findEventPda(wallet.publicKey, eventIdLe);

      // 3) args
      const bet = new BN(toUnixSeconds(betEnd));
      const commit = new BN(toUnixSeconds(commitEnd));
      const reveal = new BN(toUnixSeconds(revealEnd));

      const tq = truthQuestion?.trim()
        ? new PublicKey(truthQuestion.trim())
        : null;

      // TX #1: create_event_core
      const sig1 = await program.methods
        .createEventCore(title.trim(), bet, commit, reveal, tq)
        .accounts({
          creator: wallet.publicKey,
          counter: counterPda,
          event: eventPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 4) derive PDAs for mint/vault step
      const [collateralVault] = await findCollateralVaultPda(eventPda);
      const [mintAuthority] = findMintAuthorityPda(eventPda);
      const [trueMint] = findTrueMintPda(eventPda);
      const [falseMint] = findFalseMintPda(eventPda);

      // TX #2: create_event_mints
      const sig2 = await program.methods
        .createEventMints()
        .accounts({
          creator: wallet.publicKey,
          event: eventPda,
          mintAuthority,
          trueMint,
          falseMint,
          collateralVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      setMsg(`Event created!\ncore tx: ${sig1}\nmints tx: ${sig2}`);
      nav(`/event/${eventPda.toBase58()}`);
    } catch (err) {
      console.error(err);
      setMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Create Event</h2>
      {!wallet.publicKey && <p>Connect your wallet to create an event.</p>}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <label>
          Title (10-150)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Betting end time
          <input
            type="datetime-local"
            value={betEnd}
            onChange={(e) => setBetEnd(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Commit end time
          <input
            type="datetime-local"
            value={commitEnd}
            onChange={(e) => setCommitEnd(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Reveal end time
          <input
            type="datetime-local"
            value={revealEnd}
            onChange={(e) => setRevealEnd(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        {/* Optional */}
        {/* <label>
          Truth question (optional pubkey)
          <input
            value={truthQuestion}
            onChange={(e) => setTruthQuestion(e.target.value)}
            style={{ width: "100%" }}
          />
        </label> */}

        <button type="submit" disabled={!wallet.publicKey || busy}>
          {busy ? "Creating..." : "Create Event"}
        </button>

        {msg && (
          <div
            style={{
              whiteSpace: "pre-wrap",
              color: msg.startsWith("Event created") ? "green" : "crimson",
            }}
          >
            {msg}
          </div>
        )}
      </form>
    </div>
  );
}
