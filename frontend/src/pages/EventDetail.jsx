import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

import {
  findCollateralVaultPda,
  findMintAuthorityPda,
  findTrueMintPda,
  findFalseMintPda,
} from "../lib/pdas";
import { getProgram } from "../lib/anchorClient";

import { sendAndConfirmSafe } from "../utils/sendTx";

function toBaseUnits(amountStr) {
  const n = Number(amountStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  const units = Math.floor(n * 1e9);
  if (units <= 0) return null;
  return new BN(units);
}

export default function EventDetail() {
  const { eventPda } = useParams();
  const wallet = useWallet();

  const [ev, setEv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Buy UI state
  const [solAmount, setSolAmount] = useState("0.1");
  const [minting, setMinting] = useState(false);
  const [mintErr, setMintErr] = useState("");
  const [mintSig, setMintSig] = useState("");

  // Redeem UI state
  const [redeemAmount, setRedeemAmount] = useState("0.1");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemErr, setRedeemErr] = useState("");
  const [redeemSig, setRedeemSig] = useState("");

  // prevents double submit even before setState updates)
  const buyLockRef = useRef(false);
  const redeemLockRef = useRef(false);

  const program = useMemo(() => {
    if (!wallet?.publicKey || !wallet.connected) return null;
    return getProgram(wallet);
  }, [wallet.publicKey, wallet.connected]);

  async function safeSimulate(conn, tx, label) {
    const tries = [
      () => conn.simulateTransaction(tx),
      () => conn.simulateTransaction(tx, { commitment: "processed" }),
    ];

    let last;
    for (const run of tries) {
      try {
        const sim = await run();
        const err = sim?.value?.err;

        if (err) {
          const logs = sim?.value?.logs || [];
          console.log(`[${label}] simulation logs:`, logs);
          throw Object.assign(new Error(`Simulation failed: ${JSON.stringify(err)}`), {
            simErr: err,
            simLogs: logs,
          });
        }

        return sim; // ok
      } catch (e) {
        last = e;

        // if it's not an "invalid arguments" signature mismatch, stop retrying
        const msg = (e?.message || String(e)).toLowerCase();
        if (!msg.includes("invalid arguments")) throw e;
      }
    }
    throw last || new Error("simulateTransaction failed");
  }



  // async function sendAndConfirm(tx, label) {
  //   const conn = program.provider.connection;

  //   tx.feePayer = wallet.publicKey;
  //   const latest = await conn.getLatestBlockhash("finalized");
  //   tx.recentBlockhash = latest.blockhash;

  //   console.log(`[${label}] simulating...`);
  //   await safeSimulate(conn, tx, label);

  //   console.log(`[${label}] wallet sending...`);
  //   const sig = await wallet.sendTransaction(tx, conn);

  //   console.log(`[${label}] sig:`, sig);

  //   await conn.confirmTransaction(
  //     {
  //       signature: sig,
  //       blockhash: latest.blockhash,
  //       lastValidBlockHeight: latest.lastValidBlockHeight,
  //     },
  //     "confirmed"
  //   );

  //   console.log(`[${label}] confirmed`);
  //   return sig;
  // }

  async function sendAndConfirm(tx, label) {
    const conn = program.provider.connection;
    return sendAndConfirmSafe({ conn, wallet, tx, label, simulate: safeSimulate });
  }


  async function load() {
    if (!program || !eventPda) return;
    setErr("");
    setLoading(true);
    try {
      const pk = new PublicKey(eventPda);
      const data = await program.account.event.fetch(pk);
      setEv({ pk, ...data });
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!program || !eventPda) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, eventPda]);

  const toDate = (bnOrNum) => {
    const n = bnOrNum?.toNumber?.() ?? bnOrNum;
    return n ? new Date(n * 1000).toLocaleString() : "-";
  };

  function isBettingActive(ev) {
    if (!ev?.betEndTime) return false;
    const now = Math.floor(Date.now() / 1000);
    return now < ev.betEndTime.toNumber();
  }

  async function ensureAta(mint, owner) {
    const ata = getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const info = await program.provider.connection.getAccountInfo(ata);
    if (info) return ata;

    console.log("[ensureAta] creating ATA:", ata.toBase58());

    const ix = createAssociatedTokenAccountInstruction(
      owner, // payer
      ata, // ata
      owner, // owner
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);
    const sig = await wallet.sendTransaction(tx, program.provider.connection);
    await program.provider.connection.confirmTransaction(sig, "confirmed");
    return ata;
  }

  async function buyTokens(solAmountStr) {
    if (!program || !wallet?.publicKey) return;
    if (buyLockRef.current) return;
    buyLockRef.current = true;

    setMintErr("");
    setMintSig("");

    const amountNum = Number(solAmountStr);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      buyLockRef.current = false;
      setMintErr("Enter a valid SOL amount > 0");
      return;
    }

    // only allow buys during betting period
    if (!isBettingActive(ev)) {
      buyLockRef.current = false;
      setMintErr("Betting period ended. Buying is disabled.");
      return;
    }

    setMinting(true);

    try {
      const eventPk = new PublicKey(eventPda);
      const user = wallet.publicKey;

      const [collateralVault] = await findCollateralVaultPda(eventPk);
      const [mintAuthority] = findMintAuthorityPda(eventPk);
      const [trueMint] = findTrueMintPda(eventPk);
      const [falseMint] = findFalseMintPda(eventPk);

      console.log("[buy] event:", eventPk.toBase58());
      console.log("[buy] vault:", collateralVault.toBase58());
      console.log("[buy] trueMint:", trueMint.toBase58());
      console.log("[buy] falseMint:", falseMint.toBase58());

      // ensure ATAs exist
      const userTrueAta = await ensureAta(trueMint, user);
      const userFalseAta = await ensureAta(falseMint, user);

      console.log("[buy] userTrueAta:", userTrueAta.toBase58());
      console.log("[buy] userFalseAta:", userFalseAta.toBase58());

      const lamports = new BN(Math.floor(amountNum * 1e9));

      // TX #1: deposit collateral (send via wallet adapter)
      const tx1 = await program.methods
        .depositCollateral(lamports)
        .accounts({
          user,
          event: eventPk,
          collateralVault,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      await sendAndConfirm(tx1, "depositCollateral");

      // TX #2: mint positions (send via wallet adapter)
      const tx2 = await program.methods
        .mintPositions(lamports)
        .accounts({
          user,
          event: eventPk,
          mintAuthority,
          trueMint,
          falseMint,
          userTrueAta,
          userFalseAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();

      const sig2 = await sendAndConfirm(tx2, "mintPositions");

      setMintSig(sig2);
      await load();
    } catch (e) {
      console.error("[buy] failed:", e);
      if (typeof e?.getLogs === "function") {
        try {
          console.log("[buy] logs:", await e.getLogs());
        } catch {}
      }
      setMintErr(e?.message || String(e));
    } finally {
      setMinting(false);
      buyLockRef.current = false;
    }
  }

  async function redeemPairWhileActive(redeemAmountStr) {

    if (!program || !wallet?.publicKey) return;
    if (redeemLockRef.current) return;
    redeemLockRef.current = true;

    setRedeemErr("");
    setRedeemSig("");

    // only show/allow redeem while betting active
    if (!isBettingActive(ev)) {
      redeemLockRef.current = false;
      setRedeemErr("Betting period ended. Pair-redeem is disabled.");
      return;
    }

    const amount = toBaseUnits(redeemAmountStr);
    if (!amount) {
      redeemLockRef.current = false;
      setRedeemErr("Enter a valid amount > 0 (example: 0.1)");
      return;
    }
    setRedeeming(true);

    try {
      const eventPk = new PublicKey(eventPda);
      const user = wallet.publicKey;

      const [collateralVault] = await findCollateralVaultPda(eventPk);
      const [trueMint] = findTrueMintPda(eventPk);
      const [falseMint] = findFalseMintPda(eventPk);

      const userTrueAta = getAssociatedTokenAddressSync(trueMint, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const userFalseAta = getAssociatedTokenAddressSync(falseMint, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

      const info1 = await program.provider.connection.getAccountInfo(userTrueAta);
      const info2 = await program.provider.connection.getAccountInfo(userFalseAta);
      if (!info1 || !info2) {
        throw new Error("Missing TRUE/FALSE ATA. You probably don't hold both tokens for this event.");
      }

      const [trueBal, falseBal] = await Promise.all([
        program.provider.connection.getTokenAccountBalance(userTrueAta),
        program.provider.connection.getTokenAccountBalance(userFalseAta),
      ]);

      const trueUi = Number(trueBal.value.amount);  // base units as string -> Number if safe
      const falseUi = Number(falseBal.value.amount);

      if (amount.toNumber() > trueUi || amount.toNumber() > falseUi) {
        setRedeeming(false);
        setRedeemErr("The requested amount is greater than your balance.");
        return;
      }

      console.log("[redeem] amount(base):", amount.toString());
      console.log("[redeem] vault:", collateralVault.toBase58());
      console.log("[redeem] trueMint:", trueMint.toBase58());
      console.log("[redeem] falseMint:", falseMint.toBase58());
      console.log("[redeem] userTrueAta:", userTrueAta.toBase58());
      console.log("[redeem] userFalseAta:", userFalseAta.toBase58());

      const tx = await program.methods
        .redeemPairWhileActive(amount)
        .accounts({
          user,
          event: eventPk,
          collateralVault,
          trueMint,
          falseMint,
          userTrueAta,
          userFalseAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendAndConfirm(tx, "redeemPairWhileActive");

      setRedeemSig(sig);
      await load();
    } catch (e) {
      console.error("[redeem] failed:", e);
      if (typeof e?.getLogs === "function") {
        try {
          console.log("[redeem] logs:", await e.getLogs());
        } catch {}
      }
      setRedeemErr(e?.message || String(e));
    } finally {
      setRedeeming(false);
      redeemLockRef.current = false;
    }
  }

  if (!wallet.publicKey) return <p>Connect wallet.</p>;
  if (loading) return <p>Loading...</p>;
  if (err) return <p style={{ color: "crimson" }}>{err}</p>;
  if (!ev) return null;

  const bettingActive = isBettingActive(ev);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Event Detail</h2>
        <button onClick={load} disabled={loading || minting || redeeming}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Buy Tokens UI */}
      <div
        style={{
          marginTop: 14,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 10,
          background: "#fafafa",
          opacity: bettingActive ? 1 : 0.6,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Buy Tokens (Deposit SOL → Receive TRUE + FALSE)
        </div>

        {!bettingActive && (
          <div style={{ fontSize: 12, color: "crimson", marginBottom: 10 }}>
            Betting period ended — buying is disabled.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>SOL amount</label>
            <input
              value={solAmount}
              onChange={(e) => setSolAmount(e.target.value)}
              placeholder="e.g. 0.1"
              style={{
                width: 160,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                outline: "none",
              }}
              inputMode="decimal"
              disabled={!bettingActive}
            />
          </div>

          <button
            onClick={() => buyTokens(solAmount)}
            disabled={!bettingActive || minting || loading || redeeming}
            style={{
              marginTop: 18,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: minting ? "#eee" : "#111",
              color: minting ? "#111" : "#fff",
              cursor: minting ? "not-allowed" : "pointer",
            }}
          >
            {minting ? "Processing..." : "Buy TRUE + FALSE"}
          </button>

          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.8 }}>
            Expected: 1 SOL → 1 TRUE + 1 FALSE
          </div>
        </div>

        {mintErr && <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>{mintErr}</div>}

        {mintSig && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <b>TX:</b>{" "}
            <a href={`https://solscan.io/tx/${mintSig}?cluster=devnet`} target="_blank" rel="noreferrer">
              {mintSig}
            </a>
          </div>
        )}
      </div>

      {/* Redeem Pair UI (only while betting active) */}
      {bettingActive && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Redeem (While Betting Active)
          </div>

          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
            Redeem requires equal amounts of TRUE + FALSE. Fee: 1%. Example: 1 TRUE + 1 FALSE → 0.99 SOL.
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Amount (tokens)</label>
              <input
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                placeholder="e.g. 0.1"
                style={{
                  width: 160,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  outline: "none",
                }}
                inputMode="decimal"
              />
            </div>

            <button
              type="button"
              onClick={() => redeemPairWhileActive(redeemAmount)}
              disabled={redeeming || loading || minting}
              style={{
                marginTop: 18,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: redeeming ? "#eee" : "#111",
                color: redeeming ? "#111" : "#fff",
                cursor: redeeming ? "not-allowed" : "pointer",
              }}
            >
              {redeeming ? "Redeeming..." : "Redeem TRUE+FALSE → SOL"}
            </button>

            <div style={{ marginTop: 18, fontSize: 12, opacity: 0.8 }}>
              You burn {redeemAmount || "0"} TRUE and {redeemAmount || "0"} FALSE
            </div>
          </div>

          {redeemErr && <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>{redeemErr}</div>}

          {redeemSig && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <b>TX:</b>{" "}
              <a href={`https://solscan.io/tx/${redeemSig}?cluster=devnet`} target="_blank" rel="noreferrer">
                {redeemSig}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Event info */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>PDA:</b> {ev.pk.toBase58()}</div>
        <div><b>Title:</b> {ev.title}</div>
        <div><b>Creator:</b> {ev.creator.toBase58()}</div>

        <hr style={{ margin: "12px 0" }} />

        <div><b>Bet end:</b> {toDate(ev.betEndTime)}</div>
        <div><b>Commit end:</b> {toDate(ev.commitEndTime)}</div>
        <div><b>Reveal end:</b> {toDate(ev.revealEndTime)}</div>
        <div><b>Created at:</b> {toDate(ev.createdAt)}</div>

        <hr style={{ margin: "12px 0" }} />

        <div><b>Collateral vault:</b> {ev.collateralVault.toBase58()}</div>
        <div><b>Total collateral:</b> {ev.totalCollateralLamports?.toString?.() ?? "0"} lamports</div>
        <div><b>Total issued/side:</b> {ev.totalIssuedPerSide?.toString?.() ?? "0"}</div>

        <hr style={{ margin: "12px 0" }} />

        <div><b>TRUE mint address:</b> {ev.trueMint?.toBase58?.() ?? "-"}</div>
        <div><b>FALSE mint address:</b> {ev.falseMint?.toBase58?.() ?? "-"}</div>

        <hr style={{ margin: "12px 0" }} />

        <div><b>Resolved:</b> {String(ev.resolved)}</div>
        <div><b>Winning option:</b> {ev.winningOption?.toString?.()}</div>
      </div>
    </div>
  );
}
