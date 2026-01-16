import { useEffect, useMemo, useState } from "react";
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

  const program = useMemo(() => {
    if (!wallet?.publicKey || !wallet.connected) return null;
    return getProgram(wallet);
  }, [wallet.publicKey, wallet.connected]);

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
    if (!program) return;
    if (!wallet?.publicKey) return;

    setMintErr("");
    setMintSig("");

    const amountNum = Number(solAmountStr);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setMintErr("Enter a valid SOL amount > 0");
      return;
    }

    setMinting(true);

    try {
      const eventPk = new PublicKey(eventPda);

      const [collateralVault] = await findCollateralVaultPda(eventPk);
      const [mintAuthority] = findMintAuthorityPda(eventPk);
      const [trueMint] = findTrueMintPda(eventPk);
      const [falseMint] = findFalseMintPda(eventPk);

      const user = wallet.publicKey;

      // ensure ATAs exist
      const userTrueAta = await ensureAta(trueMint, user);
      const userFalseAta = await ensureAta(falseMint, user);

      // lamports
      const lamports = new BN(Math.floor(amountNum * 1e9));

      // TX #1: deposit collateral
      const sig1 = await program.methods
        .depositCollateral(lamports)
        .accounts({
          user,
          event: eventPk,
          collateralVault,
          systemProgram: SystemProgram.programId,
        })
        .rpc();


      // TX #2: mint positions
      // amount == lamports => 1 SOL => 1 TRUE + 1 FALSE (decimals=9)
      const sig2 = await program.methods
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
        .rpc();

      setMintSig(sig2);

      // refresh event data after mint
      await load();
    } catch (e) {
      console.error(e);
      setMintErr(e?.message || String(e));
    } finally {
      setMinting(false);
    }
  }

  if (!wallet.publicKey) return <p>Connect wallet.</p>;
  if (loading) return <p>Loading...</p>;
  if (err) return <p style={{ color: "crimson" }}>{err}</p>;
  if (!ev) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Event Detail</h2>
        <button onClick={load} disabled={loading || minting}>
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
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Buy Tokens (Deposit SOL → Receive TRUE + FALSE)
        </div>

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
            />
          </div>

          <button
            onClick={() => buyTokens(solAmount)}
            disabled={minting || loading}
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

      {/* Event info */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>PDA:</b> {ev.pk.toBase58()}</div>
        <div><b>Title:</b> {ev.title}</div>
        <div><b>Creator:</b> {ev.creator.toBase58()}</div>
        {/* <div><b>Event ID:</b> {ev.eventId?.toString?.()}</div> */}

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
