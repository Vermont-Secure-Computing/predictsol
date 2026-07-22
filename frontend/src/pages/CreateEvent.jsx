import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, ComputeBudgetProgram, Transaction } from "@solana/web3.js";

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
import { addDays, maxDatetimeLocal } from "../utils/dateHelpers";
import { getConstants } from "../constants";
import TxHint from "../components/TxHints";


export default function CreateEvent() {
  const { 
    CATEGORY_OPTIONS, 
    DEFAULT_COMMIT_DAYS,
    DEFAULT_REVEAL_DAYS,
    MIN_COMMIT_DAYS,
    MIN_REVEAL_DAYS } = getConstants();
  const wallet = useWallet();
  const nav = useNavigate();

  const [title, setTitle] = useState("");
  const [betEnd, setBetEnd] = useState("");
  const [commitEnd, setCommitEnd] = useState("");
  const [revealEnd, setRevealEnd] = useState("");
  const [showCreateInstructions, setShowCreateInstructions] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [category, setCategory] = useState(0);

  // prevents double submit even before React updates state
  const submitLockRef = useRef(false);

  const program = useMemo(() => {
    if (!wallet?.publicKey || !wallet.connected) return null;
    return getPredictProgram(wallet);
  }, [wallet.publicKey, wallet.connected]);

  async function sendAndConfirm(tx, label) {
    const conn = program.provider.connection;

    try {
      return await sendAndConfirmSafe({
        conn,
        wallet,
        tx,
        label,
        simulate: (c, t) => c.simulateTransaction(t),
      });
    } catch (e) {
      console.error(`[${label}] send failed:`, e);
      console.error("message:", e?.message);
      console.error("name:", e?.name);
      console.error("cause:", e?.cause);
      console.error("logs:", e?.logs);
      console.error("data:", e?.data);
      throw e;
    }
  }


  // Auto fill commit and reveal end time
  useEffect(() => {
    if (!betEnd) return;

    const commitDays = DEFAULT_COMMIT_DAYS;
    const revealDays = DEFAULT_REVEAL_DAYS;

    const nextCommit = addDays(betEnd, commitDays);
    setCommitEnd(nextCommit);

    setRevealEnd(addDays(nextCommit, revealDays));
    
  }, [betEnd]);


  useEffect(() => {
    if (!commitEnd) return;

    const revealDays = DEFAULT_REVEAL_DAYS;

    // enforce reveal minimum
    const minReveal = addDays(commitEnd, MIN_REVEAL_DAYS);

    const nextReveal = addDays(commitEnd, revealDays);
    setRevealEnd(maxDatetimeLocal(nextReveal, minReveal));
    
  }, [commitEnd]);


  async function buildCreateEventTransaction({
    title,
    category,
    bet,
    commit,
    reveal,
  }) {
    const creator = wallet.publicKey;
    const truth = getTruthProgram(wallet);

    const predictConnection = program.provider.connection;
    const truthConnection = truth.provider.connection;

    if ( predictConnection.rpcEndpoint !== truthConnection.rpcEndpoint ) {
      throw new Error(
        "PredictSol and Truth Network are using different RPC endpoints."
      );
    }

    const transaction = new Transaction();

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 10_000,
      })
    );

    /*
    * PredictSol event counter
    */

    const [counterPda] = await findCounterPda(creator);

    const counterAccount =
      await program.account.eventCounter.fetchNullable(
        counterPda
      );

    const eventId = counterAccount
      ? new BN(counterAccount.count.toString())
      : new BN(0);

    if (!counterAccount) {
      const initializeCounterInstruction =
        await program.methods
          .initializeEventCounter()
          .accounts({
            creator,
            counter: counterPda,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

      transaction.add(initializeCounterInstruction);
    }

    const eventIdBuffer = eventId.toArrayLike(
      Buffer,
      "le",
      8
    );

    const [eventPda] = await findEventPda(
      creator,
      eventIdBuffer
    );

    /*
    * Truth Network question counter
    */

    const [truthCounterPda] =
      await findTruthCounterPda(creator);

    const truthCounterAccount =
      await truth.account.questionCounter
        .fetch(truthCounterPda)
        .catch(() => null);

    const questionId = truthCounterAccount
      ? new BN(truthCounterAccount.count.toString())
      : new BN(0);

    if (!truthCounterAccount) {
      const initializeTruthCounterInstruction =
        await truth.methods
          .initializeCounter()
          .accounts({
            questionCounter: truthCounterPda,
            asker: creator,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

      transaction.add(
        initializeTruthCounterInstruction
      );
    }

    const questionIdBuffer = questionId.toArrayLike(
      Buffer,
      "le",
      8
    );

    const [truthQuestionPda] =
      findTruthQuestionPda(
        creator,
        questionIdBuffer
      );

    const [truthVaultPda] =
      await findTruthVaultPda(
        truthQuestionPda
      );

    /*
    * Create the Truth Network question.
    */

    const rewardLamports = new BN(100_000_000);

    const createTruthQuestionInstruction =
      await truth.methods
        .createQuestion(
          title,
          rewardLamports,
          commit,
          reveal
        )
        .accounts({
          asker: creator,
          questionCounter: truthCounterPda,
          question: truthQuestionPda,
          vault: truthVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

    transaction.add(
      createTruthQuestionInstruction
    );

    /*
    * Create the PredictSol event account.
    */

    const createEventCoreInstruction =
      await program.methods
        .createEventCore(
          title,
          category,
          bet,
          commit,
          reveal,
          truthQuestionPda
        )
        .accounts({
          creator,
          counter: counterPda,
          event: eventPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

    transaction.add(
      createEventCoreInstruction
    );

    /*
    * Create vault, TRUE/FALSE mints, and metadata.
    */

    const [collateralVault] = await findCollateralVaultPda(eventPda);

    const [mintAuthority] = findMintAuthorityPda(eventPda);

    const [trueMint] = findTrueMintPda(eventPda);

    const [falseMint] = findFalseMintPda(eventPda);

    const metadataProgram = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    const [trueMetadata] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          metadataProgram.toBuffer(),
          trueMint.toBuffer(),
        ],
        metadataProgram
      );

    const [falseMetadata] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          metadataProgram.toBuffer(),
          falseMint.toBuffer(),
        ],
        metadataProgram
      );

    const createMintsInstruction =
      await program.methods
        .createEventMints()
        .accounts({
          creator,
          event: eventPda,
          mintAuthority,
          trueMint,
          falseMint,
          collateralVault,
          metadataProgram,
          trueMetadata,
          falseMetadata,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

    transaction.add(createMintsInstruction);

    return {
      transaction,
      eventPda,
      truthQuestionPda,
      trueMint,
      falseMint,
      collateralVault,
    };
  }


  async function onSubmit(e) {
    e.preventDefault();

    if (!wallet.publicKey) {
      alert("Connect wallet.");
      return;
    }

    if (!program) {
      alert("Program not ready.");
      return;
    }

    if (submitLockRef.current) { return; }

    submitLockRef.current = true;

    const cleanTitle = title.trim();

    if (
      cleanTitle.length < 10 ||
      cleanTitle.length > 150
    ) {
      submitLockRef.current = false;
      alert("Title must be 10-150 characters.");
      return;
    }

    if (!betEnd || !commitEnd || !revealEnd) {
      submitLockRef.current = false;
      alert("Please set bet, commit, and reveal times.");
      return;
    }

    const selectedCategory = Number(category);

    if (
      !Number.isInteger(selectedCategory) ||
      selectedCategory < 0 ||
      selectedCategory > 3
    ) {
      submitLockRef.current = false;
      alert("Invalid category.");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      const now = Date.now();
      const betMs = new Date(betEnd).getTime();
      const commitMs = new Date(commitEnd).getTime();
      const revealMs = new Date(revealEnd).getTime();

      if (
        !Number.isFinite(betMs) ||
        !Number.isFinite(commitMs) ||
        !Number.isFinite(revealMs)
      ) {
        throw new Error("Invalid date/time input.");
      }

      if (betMs <= now) {
        throw new Error(
          "Close date must be in the future."
        );
      }

      const oneDayMs = 24 * 60 * 60 * 1000;

      if (commitMs - betMs < oneDayMs) {
        throw new Error(
          "Commit End Time must be at least 1 day after the event closes."
        );
      }

      if (revealMs - commitMs < oneDayMs) {
        throw new Error(
          "Reveal End Time must be at least 1 day after Commit End Time."
        );
      }

      const bet = new BN(Math.floor(betMs / 1000));

      const commit = new BN(Math.floor(commitMs / 1000));

      const reveal = new BN(Math.floor(revealMs / 1000));

      const {
        transaction,
        eventPda,
        truthQuestionPda,
        trueMint,
        falseMint,
      } = await buildCreateEventTransaction({
        title: cleanTitle,
        category: selectedCategory,
        bet,
        commit,
        reveal,
      });

      console.log("[createEvent] event:", eventPda.toBase58());

      console.log("[createEvent] truth question:", truthQuestionPda.toBase58());

      console.log("[createEvent] TRUE mint:", trueMint.toBase58());

      console.log("[createEvent] FALSE mint:", falseMint.toBase58());

      const signature = await sendAndConfirm(
        transaction,
        "createEvent"
      );

      setMsg(`Event created!\nTransaction: ${signature}`);

      nav(`/event/${eventPda.toBase58()}`);
    } catch (err) {
      console.error("[createEvent] failed:", err);

      if (typeof err?.getLogs === "function") {
        try {
          const logs = await err.getLogs();

          console.error(
            "[createEvent] program logs:",
            logs
          );
        } catch {
          // The wallet or RPC did not provide logs.
        }
      }

      setMsg(
        err?.message ||
          "Failed to create event."
      );
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  }

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-black/90">
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-6">
          <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Create Event
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Create a new prediction market event on PredictSol. Please read{" "}
            <span
              onClick={() => setShowCreateInstructions(true)}
              className="cursor-pointer font-semibold text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-300"
            >
              Instructions
            </span>
          </p>
        </div>
    
        {!wallet.publicKey && (
          <div className="p-4 rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 mb-6">
            Connect your wallet to create an event.
          </div>
        )}
    
        <form
          onSubmit={onSubmit}
          className="p-6 rounded-2xl border border-gray-200 bg-white shadow-sm
                    dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur
                    grid gap-5"
        >
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Title (10-150 characters) <span className="text-rose-500">*</span>
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Phrase the title as a clear TRUE/FALSE question.
            </p>
    
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="Example: Will BTC exceed $100,000 by the resolution date?"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900
                        dark:border-gray-800 dark:bg-gray-950 dark:text-white
                        focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
    
          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Category
            </label>
    
            <select
              value={category}
              onChange={(e) => setCategory(Number(e.target.value))}
              disabled={busy}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900
                        dark:border-gray-800 dark:bg-gray-950 dark:text-white
                        focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
    
          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Betting End */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Event Close <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={betEnd}
                onChange={(e) => {
                  setBetEnd(e.target.value);
                }}
                disabled={busy}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900
                          dark:border-gray-800 dark:bg-gray-950 dark:text-white
                          focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Commit and Reveal times will be auto-filled with default values after you set Betting End.
              </div>
            </div>

            {/* Commit End */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Oracle Commit End Time <span className="text-rose-500">*</span>
                </label>
              </div>

              <input
                type="datetime-local"
                value={commitEnd}
                onChange={(e) => {
                  setCommitEnd(e.target.value);
                }}
                disabled={busy || !betEnd}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900
                          disabled:opacity-60 disabled:cursor-not-allowed
                          dark:border-gray-800 dark:bg-gray-950 dark:text-white
                          focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Min: {MIN_COMMIT_DAYS} day after event close.
              </div>
            </div>

            {/* Reveal End */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Oracle Reveal End Time <span className="text-rose-500">*</span>
                </label>
              </div>

              <input
                type="datetime-local"
                value={revealEnd}
                onChange={(e) => {
                  setRevealEnd(e.target.value);
                }}
                disabled={busy || !commitEnd}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900
                          disabled:opacity-60 disabled:cursor-not-allowed
                          dark:border-gray-800 dark:bg-gray-950 dark:text-white
                          focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Min: {MIN_REVEAL_DAYS} day after commit ends.
              </div>
            </div>
          </div>

    
          {/* Submit */}
          <button
            type="submit"
            disabled={!wallet.publicKey || busy}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-lg
                      hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed
                      transition"
          >
            {busy ? "Creating..." : "Create Event"}
          </button>
          <TxHint>One wallet confirmation creates the oracle question, event, vault, and TRUE/FALSE tokens.</TxHint>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            First-time counter initialization is included automatically
            in the same transaction.
          </div>

    
          {/* Message */}
          {msg && (
            <div
              className={`p-4 rounded-xl border text-sm whitespace-pre-wrap ${
                msg.startsWith("Event created")
                  ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200"
                  : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
              }`}
            >
              {msg}
            </div>
          )}
        </form>

        {/**
         *  Modal for Create event instructions
         */}
        {showCreateInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Create Event Instructions
                  </h3>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Please read this before creating an event.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateInstructions(false)}
                  className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-900 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 max-h-[70vh] overflow-y-auto space-y-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                <p className="text-justify">
                  Creating an event entitles event creator to 0.33% of all deposited solana.  
                </p>

                <p className="text-justify">
                  Please read and understand how the predictsol contract works before interacting with it! 
                </p>

                <p className="text-justify">
                  There is no person or team who can adjust your event in any way or make any refunds, everything is final on the smart contract. 
                </p>

                <p className="text-justify">
                  Creating an event requires a clear description of the event which is either true or false upon completion, and requires selecting a 
                  "close date" after which the event is decided.  
                </p>

                <p className="text-justify">
                  The oracle voters will decide on what happened and which token (true or false) is redeemable. Oracle voters "commit" to a resolution 
                  vote before the commit end date.  Then they "reveal" their votes until the final reveal end date.  Give the oracle enough time to resolve your 
                  event!  
                </p>

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/50 dark:bg-indigo-950/20 p-3 
                dark:border-gray-800 dark:bg-gray-900/50">
                  <div className="font-semibold text-gray-900 dark:text-white">
                    To submit your event requires submitting at most four transactions: 
                  </div>

                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    <li>Create account of question creator (if this is the first coin created with your solana address) (cost ~ 0.001)</li>
                    <li>Create and fund oracle for the event (Truth it network) (cost ~ 0.1)</li>
                    <li>Token factory mints true token (cost ~ 0.001)</li>
                    <li>Token factory mints false token (cost ~ 0.001) </li>
                  </ol>
                </div>

                <p className="font-medium text-amber-700 dark:text-amber-300">
                  Please make sure you complete all these popup transactions or event creation may fail.
                </p>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateInstructions(false)}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  I Understand
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );  
}
