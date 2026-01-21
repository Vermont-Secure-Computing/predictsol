import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// predictsol
import { getPredictProgram } from "../lib/anchorClient";
import {
  findCounterPda,
  findEventPda,
  findCollateralVaultPda,
  findMintAuthorityPda,
  findTrueMintPda,
  findFalseMintPda,
} from "../lib/pdas";

// truth network
import { getTruthProgram } from "../lib/anchorClient";
import { 
  findTruthCounterPda, 
  findTruthQuestionPda, 
  findTruthVaultPda 
} from "../lib/truthPdas";

import { sendAndConfirmSafe } from "../utils/sendTx";


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

  // prevents double submit even before React updates state
  const submitLockRef = useRef(false);

  const program = useMemo(() => {
    if (!wallet?.publicKey || !wallet.connected) return null;
    return getPredictProgram(wallet);
  }, [wallet.publicKey, wallet.connected]);

  async function sendAndConfirm(tx, label) {
    const conn = program.provider.connection;
    return sendAndConfirmSafe({ conn, wallet, tx, label, simulate: null });
  }


  async function ensureCounter() {
    const [counterPda] = await findCounterPda(wallet.publicKey);
    const counterAcc = await program.account.eventCounter.fetchNullable(counterPda);

    if (counterAcc) {
      console.log("[ensureCounter] counter exists:", counterPda.toBase58(), "count:", counterAcc.count?.toString?.());
      return { counterPda, counterAcc };
    }

    console.log("[ensureCounter] counter missing, initializing:", counterPda.toBase58());

    const tx = await program.methods
      .initializeEventCounter()
      .accounts({
        creator: wallet.publicKey,
        counter: counterPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const sig = await sendAndConfirm(tx, "initializeEventCounter");

    const counterAcc2 = await program.account.eventCounter.fetch(counterPda);
    console.log("[ensureCounter] initialized via", sig, "new count:", counterAcc2.count?.toString?.());

    return { counterPda, counterAcc: counterAcc2 };
  }

  /**
   * create the event on the truth network
   */
  async function createTruthQuestion({ title, commit, reveal }) {
    const truth = getTruthProgram(wallet);
    const conn = truth.provider.connection;

    const asker = wallet.publicKey;

    // 1) counter PDA
    const [counterPda] = await findTruthCounterPda(asker);
    let counterAcc = await truth.account.questionCounter.fetch(counterPda).catch(() => null);


    // 2) init counter if missing (TX)
    if (!counterAcc) {
      const txInit = await truth.methods
        .initializeCounter()
        .accounts({
          questionCounter: counterPda,
          asker,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      await sendAndConfirmSafe({ conn, wallet, tx: txInit, label: "truth:initCounter", simulate: null });
      counterAcc = await truth.account.questionCounter.fetch(counterPda);
    }

    // 3) derive question PDA using current count
    const qid = new BN(counterAcc.count);
    const qidLe = qid.toArrayLike(Buffer, "le", 8);
    const [questionPda] = findTruthQuestionPda(asker, qidLe);

    // 4) vault PDA
    const [vaultPda] = await findTruthVaultPda(questionPda);

    // if question already exists, just return it
    const existing = await truth.account.question.fetch(questionPda).catch(() => null);
    if (existing) {
      console.log("[truth] question already exists:", questionPda.toBase58());
      return questionPda;
    }

    // 5) create question (TX)
    const rewardLamports = new BN(100_000_000); // 0.1 SOL default reward (adjust later)

    const txCreate = await truth.methods
      .createQuestion(title, rewardLamports, commit, reveal)
      .accounts({
        asker,
        questionCounter: counterPda,
        question: questionPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    try {
      await sendAndConfirmSafe({ conn, wallet, tx: txCreate, label: "truth:createQuestion", simulate: null });
    } catch (e) {
      // if send failed but account exists, treat as success
      const existsAfter = await truth.account.question.fetch(questionPda).catch(() => null);
      if (existsAfter) {
        console.warn("[truth] create tx errored but question exists; continuing.");
        return questionPda;
      }
      throw e;
    }

    return questionPda;
  }


  async function onSubmit(e) {
    e.preventDefault();

    if (!wallet.publicKey) return alert("Connect wallet");
    if (!program) return alert("Program not ready");

    if (submitLockRef.current) return;
    submitLockRef.current = true;

    if (title.trim().length < 10 || title.trim().length > 150) {
      submitLockRef.current = false;
      return alert("Title must be 10-150 characters.");
    }
    if (!betEnd || !commitEnd || !revealEnd) {
      submitLockRef.current = false;
      return alert("Please set bet/commit/reveal times.");
    }

    setBusy(true);
    setMsg("");

    try {
      // 1) ensure counter exists
      const { counterPda, counterAcc } = await ensureCounter();

      const eventId = new BN(counterAcc.count);
      const eventIdLe = eventId.toArrayLike(Buffer, "le", 8);

      // 2) derive Event PDA
      const [eventPda] = await findEventPda(wallet.publicKey, eventIdLe);

      console.log("[createEvent] counter:", counterPda.toBase58());
      console.log("[createEvent] eventId:", eventId.toString());
      console.log("[createEvent] eventPda:", eventPda.toBase58());

      // 3) args
      const now = Date.now();

      const betMs = new Date(betEnd).getTime();
      const commitMs = new Date(commitEnd).getTime();
      const revealMs = new Date(revealEnd).getTime();

      if (!Number.isFinite(betMs) || !Number.isFinite(commitMs) || !Number.isFinite(revealMs)) {
        return alert("Invalid date/time input.");
      }

      if (betMs <= now) return alert("Close date must be in the future.");

      if (commitMs - betMs < 1 * 24 * 60 * 60 * 1000) {
        return alert("Commit End Time must be at least 1 day after Betting Close Date.");
      }

      if (revealMs - commitMs < 1 * 24 * 60 * 60 * 1000) {
        return alert("Reveal End Time must be at least 1 day after Commit End Time.");
      }

      const bet = new BN(Math.floor(betMs / 1000));
      const commit = new BN(Math.floor(commitMs / 1000));
      const reveal = new BN(Math.floor(revealMs / 1000));


      const truthQuestionPda = await createTruthQuestion({
        title: title.trim(),
        commit,
        reveal,
      });
      console.log("[createEvent] truthQuestionPda:", truthQuestionPda.toBase58());


      // TX #1: create_event_core
      const tx1 = await program.methods
        .createEventCore(title.trim(), bet, commit, reveal, truthQuestionPda)
        .accounts({
          creator: wallet.publicKey,
          counter: counterPda,
          event: eventPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig1 = await sendAndConfirm(tx1, "createEventCore");

      // 4) derive PDAs for mint/vault step
      const [collateralVault] = await findCollateralVaultPda(eventPda);
      const [mintAuthority] = findMintAuthorityPda(eventPda);
      const [trueMint] = findTrueMintPda(eventPda);
      const [falseMint] = findFalseMintPda(eventPda);

      console.log("[createEvent] collateralVault:", collateralVault.toBase58());
      console.log("[createEvent] mintAuthority:", mintAuthority.toBase58());
      console.log("[createEvent] trueMint:", trueMint.toBase58());
      console.log("[createEvent] falseMint:", falseMint.toBase58());

      // TX #2: create_event_mints
      const tx2 = await program.methods
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
        .transaction();

      const sig2 = await sendAndConfirm(tx2, "createEventMints");

      setMsg(`Event created!\ncore tx: ${sig1}\nmints tx: ${sig2}`);
      nav(`/event/${eventPda.toBase58()}`);
    } catch (err) {
      console.error(err);

      if (typeof err?.getLogs === "function") {
        try {
          const logs = await err.getLogs();
          console.log("SendTransactionError logs:", logs);
        } catch {}
      }

      setMsg(err?.message || String(err));
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  }

  return (
    <div>
      <h2>Create Event</h2>
      {!wallet.publicKey && <p>Connect your wallet to create an event.</p>}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <label>
          Title (10-150)
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Betting end time
          <input type="datetime-local" value={betEnd} onChange={(e) => setBetEnd(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Commit end time
          <input type="datetime-local" value={commitEnd} onChange={(e) => setCommitEnd(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Reveal end time
          <input type="datetime-local" value={revealEnd} onChange={(e) => setRevealEnd(e.target.value)} style={{ width: "100%" }} />
        </label>

        <button type="submit" disabled={!wallet.publicKey || busy}>
          {busy ? "Creating..." : "Create Event"}
        </button>

        {msg && (
          <div style={{ whiteSpace: "pre-wrap", color: msg.startsWith("Event created") ? "green" : "crimson" }}>
            {msg}
          </div>
        )}
      </form>
    </div>
  );
}
