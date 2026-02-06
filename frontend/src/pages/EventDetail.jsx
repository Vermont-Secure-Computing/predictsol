import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

import { getPredictProgram, getTruthProgram } from "../lib/anchorClient";
import { getPredictReadonlyProgram, getTruthReadonlyProgram } from "../lib/anchorReadOnly";

import { sendAndConfirmSafe } from "../utils/sendTx";
import { getConstants } from "../constants";

function toBaseUnits(amountStr) {
  const n = Number(amountStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  const units = Math.floor(n * 1e9);
  if (units <= 0) return null;
  return new BN(units);
}

function bnToNum(x) {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "bigint") return Number(x);
  if (typeof x?.toNumber === "function") return x.toNumber();
  return Number(x) || 0;
}

const RESULT = {
  PENDING: 0,
  RESOLVED_WINNER: 1,
  FINALIZED_NO_VOTES: 2,
  FINALIZED_TIE: 3,
  FINALIZED_BELOW_THRESHOLD: 4,
};

function pctFromBps(bps) {
  const n = typeof bps?.toNumber === "function" ? bps.toNumber() : Number(bps ?? 0);
  return (n / 100).toFixed(2);
}

function bnToStr(x) {
  return x?.toString?.() ?? String(x ?? "0");
}

function resultLabel(ev) {
  const s = Number(ev?.resultStatus ?? 0);

  if (!ev?.resolved) return "Not finalized";
  switch (s) {
    case RESULT.RESOLVED_WINNER:
      return "Winner";
    case RESULT.FINALIZED_NO_VOTES:
      return "No votes";
    case RESULT.FINALIZED_TIE:
      return "Tie";
    case RESULT.FINALIZED_BELOW_THRESHOLD:
      return "Below threshold";
    default:
      return "Finalized";
  }
}

function winnerLabel(ev) {
  const opt = Number(ev?.winningOption ?? 0);
  if (!ev?.resolved) return "-";
  if (Number(ev?.resultStatus ?? 0) !== RESULT.RESOLVED_WINNER) return "No winner";
  return opt === 1 ? "TRUE" : opt === 2 ? "FALSE" : "No winner";
}

function hasWinner(ev) {
  return (
    !!ev?.resolved &&
    Number(ev?.resultStatus ?? 0) === RESULT.RESOLVED_WINNER &&
    (Number(ev?.winningOption ?? 0) === 1 || Number(ev?.winningOption ?? 0) === 2)
  );
}

function baseToUiStr(baseStr, decimals = 9) {
  const x = BigInt(baseStr || "0");
  const whole = x / BigInt(10 ** decimals);
  const frac = x % BigInt(10 ** decimals);
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4); // 4 dp
  return `${whole.toString()}.${fracStr}`;
}



export default function EventDetail() {

  const navigate = useNavigate();
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

  // truth network state
  const [truthQ, setTruthQ] = useState(null);
  const [truthLoading, setTruthLoading] = useState(false);

  // finalize voting state
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeErr, setFinalizeErr] = useState("");
  const [finalizeSig, setFinalizeSig] = useState("");

  // Redeem after event is final state
  const [postRedeemAmount, setPostRedeemAmount] = useState("0.1");
  const [postRedeeming, setPostRedeeming] = useState(false);
  const [postRedeemErr, setPostRedeemErr] = useState("");
  const [postRedeemSig, setPostRedeemSig] = useState("");
  const [postRedeemSide, setPostRedeemSide] = useState("TRUE");
  const postRedeemLockRef = useRef(false);

  const [userToken, setUserToken] = useState({
    trueAta: null,
    falseAta: null,
    trueExists: false,
    falseExists: false,
    trueBalBase: "0",   // string base units
    falseBalBase: "0",  // string base units
    loading: false,
    err: "",
  });

  const [claimingCreator, setClaimingCreator] = useState(false);
  const [claimCreatorErr, setClaimCreatorErr] = useState("");
  const [claimCreatorSig, setClaimCreatorSig] = useState("");
  const [vaultLamports, setVaultLamports] = useState(0);

  const [vaultMin, setVaultMin] = useState(null);

  // prevents double submit even before setState updates
  const buyLockRef = useRef(false);
  const redeemLockRef = useRef(false);

  const walletConnected = !!wallet?.publicKey && wallet.connected;

  const constants = getConstants();

  const now = Math.floor(Date.now() / 1000);
  const bettingClosed = ev && now >= ev.betEndTime.toNumber();
  //const bettingClosed = true;

  const program = useMemo(() => {
    return walletConnected ? getPredictProgram(wallet) : getPredictReadonlyProgram();
  }, [wallet.publicKey, wallet.connected]);

  const truthProgram = useMemo(() => {
    return walletConnected ? getTruthProgram(wallet) : getTruthReadonlyProgram();
  }, [wallet.publicKey, wallet.connected])


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await program.provider.connection.getMinimumBalanceForRentExemption(0);
      if (!cancelled) setVaultMin(v);
    })();
    return () => { cancelled = true; };
  }, [program?.provider?.connection]);

  const VAULT_MIN = vaultMin ?? 0; // fallback
  
 
  async function loadUserTokenState(evData) {
    if (!walletConnected) {
      setUserToken((s) => ({ ...s, loading: false }));
      return;
    }
    if (!evData?.trueMint || !evData?.falseMint) return;

    setUserToken((s) => ({ ...s, loading: true, err: "" }));

    try {
      const user = wallet.publicKey;
      const trueMint = evData.trueMint;
      const falseMint = evData.falseMint;

      const trueAta = getAssociatedTokenAddressSync(trueMint, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const falseAta = getAssociatedTokenAddressSync(falseMint, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

      const conn = program.provider.connection;

      // fetch account infos in parallel
      const [trueInfo, falseInfo] = await Promise.all([
        conn.getAccountInfo(trueAta),
        conn.getAccountInfo(falseAta),
      ]);

      let trueBalBase = "0";
      let falseBalBase = "0";

      // fetch balances only if ATA exists (avoids errors)
      if (trueInfo) {
        const b = await conn.getTokenAccountBalance(trueAta);
        trueBalBase = b?.value?.amount ?? "0";
      }
      if (falseInfo) {
        const b = await conn.getTokenAccountBalance(falseAta);
        falseBalBase = b?.value?.amount ?? "0";
      }

      setUserToken({
        trueAta,
        falseAta,
        trueExists: !!trueInfo,
        falseExists: !!falseInfo,
        trueBalBase,
        falseBalBase,
        loading: false,
        err: "",
      });
    } catch (e) {
      setUserToken((s) => ({
        ...s,
        loading: false,
        err: e?.message || String(e),
      }));
    }
  }

  useEffect(() => {
    if (!ev) return;
    loadUserTokenState(ev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletConnected, wallet.publicKey?.toBase58(), ev?.pk?.toBase58?.()]);


  const hasAnyToken =
    BigInt(userToken.trueBalBase || "0") > 0n || BigInt(userToken.falseBalBase || "0") > 0n;

  const hasBothTokens =
    BigInt(userToken.trueBalBase || "0") > 0n && BigInt(userToken.falseBalBase || "0") > 0n;


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

  async function sendAndConfirm(tx, label) {
    if (!walletConnected) throw new Error("Connect wallet to perform this action.");
    const conn = program.provider.connection;
    return sendAndConfirmSafe({ conn, wallet, tx, label, simulate: safeSimulate });
  }


  async function load() {
    if (!program || !eventPda) return;

     const conn = program.provider.connection;
    console.log("RPC:", conn.rpcEndpoint);
    console.log("Balance:", await conn.getBalance(wallet.publicKey));
    console.log("Genesis:", await conn.getGenesisHash());

    setErr("");
    setLoading(true);
    try {
      const pk = new PublicKey(eventPda);
      const data = await program.account.event.fetch(pk);

      const merged = { pk, ...data };
      setEv(merged);
      console.log("event: ", merged)

      await loadUserTokenState(merged);

      //load truth question 
      setTruthLoading(true)

      try {
        const q = await loadTruthQuestion(merged)
        setTruthQ(q);
      } catch (e) {
        setTruthQ(null);
      } finally {
        setTruthLoading(false);
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // load truth network event details
  async function loadTruthQuestion(evData) {
    const truthPk = evData?.truthQuestion;
    if (!truthPk) return null;
    
    const zero = new PublicKey("11111111111111111111111111111111");
    if (truthPk.toBase58() === zero.toBase58()) return null;

    const q = await truthProgram.account.question.fetch(truthPk);
    console.log("truth net: ", q)
    return q;
  }


  useEffect(() => {
    if (!program || !eventPda) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, eventPda]);

  useEffect(() => {
    const conn = program?.provider?.connection;
    const vault = ev?.collateralVault;
    if (!conn || !vault) return;

    let cancelled = false;
    let subId;

    (async () => {
      try {
        const bal = await conn.getBalance(vault, "confirmed");
        if (!cancelled) setVaultLamports(bal);

        subId = conn.onAccountChange(
          vault,
          (accInfo) => {
            console.log("accInfo lamports: ", accInfo.lamports)
            if (!cancelled) setVaultLamports(accInfo.lamports);
          },
          "confirmed"
        );
      } catch {}
    })();

    return () => {
      cancelled = true;
      if (subId != null) {
        conn.removeAccountChangeListener(subId);
      }
    };
  }, [program?.provider?.connection, ev?.collateralVault?.toBase58?.()]);



  const toDate = (bnOrNum) => {
    const n = bnOrNum?.toNumber?.() ?? bnOrNum;
    return n ? new Date(n * 1000).toLocaleString() : "-";
  };

  function isBettingActive(ev) {
    if (!ev?.betEndTime) return false;
    const now = Math.floor(Date.now() / 1000);
    return now < ev.betEndTime.toNumber();
  }

  const UNCLAIMED_SWEEP_DELAY_SECS = 10 * 60;

  const resolvedAt = Number(ev?.resolvedAt?.toNumber?.() ?? ev?.resolvedAt ?? 0);
  const sweepAfterTs = resolvedAt > 0 ? resolvedAt + UNCLAIMED_SWEEP_DELAY_SECS : 0;
  const afterWindow = resolvedAt > 0 && now >= resolvedAt + UNCLAIMED_SWEEP_DELAY_SECS;

  const totalIssuedZero = BigInt(ev?.totalIssuedPerSide?.toString?.() || "0") === 0n;
  const vaultEmpty = vaultLamports <= VAULT_MIN;

  const outstandingTrue = BigInt(ev?.outstanding_true?.toString?.() ?? "0");
  const outstandingFalse = BigInt(ev?.outstanding_false?.toString?.() ?? "0");
  const outstandingZero = (outstandingTrue === 0n && outstandingFalse === 0n);

  const canDeleteByPhase = !afterWindow ?
    (vaultEmpty && outstandingZero)
    : (vaultEmpty && (ev?.unclaimedSwept || outstandingZero))


  console.log("vaultMin: ", vaultMin)
  console.log("VAULT_MIN: ", VAULT_MIN)
  console.log("after window: ", !afterWindow)
  console.log("total issued is 0: ", totalIssuedZero)
  console.log("after window: ", afterWindow)
  console.log("unclaimed swept: ", ev?.unclaimedSwept)
  console.log("outstandingZero: ",outstandingZero)
  console.log("vaultEmpty: ",vaultEmpty)
  console.log("should show delete: ", (afterWindow && vaultEmpty && (ev?.unclaimedSwept || outstandingZero)))
  console.log("canDeleteByPhase: ", canDeleteByPhase)

  const sweepReady =
    ev?.resolved &&
    !ev?.unclaimedSwept &&
    now >= sweepAfterTs;
  console.log("sweep ready: ", sweepReady)

  const vaultHasSweepable = vaultLamports > VAULT_MIN;
  console.log("vaultHasSweepable: ", vaultHasSweepable)

  const pendingCreatorCommissionBase = BigInt(ev?.pendingCreatorCommission?.toString?.() || "0");
  const pendingHouseCommissionBase = BigInt(ev?.pendingHouseCommission?.toString?.() || "0");

  const creatorCommissionZero = pendingCreatorCommissionBase === 0n;
  console.log("creatorCommissionZero: ", creatorCommissionZero)
  const houseCommissionZero = pendingHouseCommissionBase === 0n;
  console.log("houseCommissionZero: ", houseCommissionZero)

  function isTruthDeletable() {
    const committedVoters = Number(truthQ?.committedVoters ?? truthQ?.committed_voters ?? 0);
    const voterRecordsCount = Number(truthQ?.voterRecordsCount ?? truthQ?.voter_records_count ?? 0);
    const voterRecordsClosed = Number(truthQ?.voterRecordsClosed ?? truthQ?.voter_records_closed ?? 0);
    const totalDistributed = BigInt((truthQ?.totalDistributed ?? truthQ?.total_distributed ?? 0).toString?.() ?? String(truthQ?.totalDistributed ?? truthQ?.total_distributed ?? 0));
    const snapshotReward = BigInt((truthQ?.snapshotReward ?? truthQ?.snapshot_reward ?? 0).toString?.() ?? String(truthQ?.snapshotReward ?? truthQ?.snapshot_reward ?? 0));
    const originalReward = BigInt((truthQ?.originalReward ?? truthQ?.original_reward ?? 0).toString?.() ?? String(truthQ?.originalReward ?? truthQ.original_reward ?? 0));
    const allVoterRecordsClosed = voterRecordsCount === 0 || voterRecordsClosed === voterRecordsCount;
    const rewardsSettled = totalDistributed >= snapshotReward || originalReward === 0n;

    return (
      committedVoters === 0 ||
      (allVoterRecordsClosed && rewardsSettled)
    );         
    
  } 

  const showSweepButton =
    walletConnected &&
    sweepReady &&
    vaultHasSweepable &&
    creatorCommissionZero;
  console.log("showSweepButton: ", showSweepButton)

  const showDeleteEventButton =
    walletConnected &&
    isCreator(ev) &&
    !!ev?.resolved &&
    creatorCommissionZero &&
    houseCommissionZero &&
    canDeleteByPhase &&
    isTruthDeletable()
  console.log("truth q: ", truthQ)
  console.log("is truth deletable: ", isTruthDeletable())
  console.log("show delete event button: ", showDeleteEventButton)

  console.log("walletConnedted: ", walletConnected)
  console.log("isCreator: ", isCreator(ev))
  console.log("ev?.resolved: ", ev?.resolved)
  console.log("creatorCommissionZero: ", creatorCommissionZero)
  console.log("pendingHouseCommissionBase: ", pendingHouseCommissionBase)
  console.log("vault lamports is less than vault min: ", vaultLamports <= VAULT_MIN)
  


  console.log("pendingCreatorCommission: ", BigInt(ev?.pendingCreatorCommission?.toString?.() || "0"))
  console.log("pendingCreatorCommission: ", BigInt(ev?.pendingCreatorCommission?.toString?.() || "0") === 0n)
  console.log("vault lamports: ", vaultLamports)
  console.log("totalIssuedPerSide: ", BigInt(ev?.totalIssuedPerSide?.toString?.() || "0"))
  console.log("totalIssuedPerSide: ", BigInt(ev?.totalIssuedPerSide?.toString?.() || "0") === 0n)




  async function ensureAta(mint, owner) {
    if (!walletConnected) throw new Error("Connect wallet to ceate ATA.")
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

  function asPubkey(x) {
    if (!x) return null;
    if (x instanceof PublicKey) return x;
    if (typeof x === "string") return new PublicKey(x);
    if (typeof x?.toBase58 === "function") return new PublicKey(x.toBase58());
    return null;
  }

  async function buyTokens(solAmountStr) {
    if (!walletConnected) return setMintErr("Connect wallet to buy.");
    if (!program) return;
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

    // must have linked truth question loaded (because we need its vault)
    if (!ev?.truthQuestion) {
      buyLockRef.current = false;
      setMintErr("This event is not linked to a Truth Network question.");
      return;
    }

    if (!truthQ) {
      buyLockRef.current = false;
      setMintErr("Truth Network question not loaded yet. Click Refresh and try again.");
      return;
    }

    const truthVaultPk = asPubkey(
      truthQ?.vaultAddress ?? truthQ?.vault_address ?? truthQ?.vault
    );

    if (!truthVaultPk) {
      buyLockRef.current = false;
      setMintErr("Truth vault address missing/invalid from Truth Network question.");
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

      // ensure ATAs exist (may cost extra tx only if they don't exist)
      const userTrueAta = await ensureAta(trueMint, user);
      const userFalseAta = await ensureAta(falseMint, user);

      const lamports = new BN(Math.floor(amountNum * 1e9));

      const tx = await program.methods
        .buyPositionsWithFee(lamports)
        .accounts({
          user,
          event: eventPk,
          collateralVault,
          mintAuthority,
          trueMint,
          falseMint,
          userTrueAta,
          userFalseAta,
          truthNetworkQuestion: ev.truthQuestion, // already a Pubkey in your ev data
          truthNetworkVault: truthVaultPk,        // from truthQ
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendAndConfirm(tx, "buyPositionsWithFee");

      setMintSig(sig);
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

    if (!walletConnected) return setRedeemErr("Connect wallet to redeem.");
    if (!program) return;
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

      if (!userToken.trueExists || !userToken.falseExists) {
        throw new Error("Missing TRUE/FALSE ATA. You probably don't hold both tokens for this event.");
      }
      const userTrueAta = userToken.trueAta;
      const userFalseAta = userToken.falseAta;

      if (BigInt(amount.toString()) > BigInt(userToken.trueBalBase || "0")) {
        throw new Error("Amount > TRUE balance.");
      }
      if (BigInt(amount.toString()) > BigInt(userToken.falseBalBase || "0")) {
        throw new Error("Amount > FALSE balance.");
      }

      const info1 = await program.provider.connection.getAccountInfo(userTrueAta);
      const info2 = await program.provider.connection.getAccountInfo(userFalseAta);
      if (!info1 || !info2) {
        throw new Error("Missing TRUE/FALSE ATA. You probably don't hold both tokens for this event.");
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

  async function redeemWinnerAfterFinal(amountStr) {
    if (!walletConnected) return setPostRedeemErr("Connect wallet to redeem.");
    if (!program) return;
    if (postRedeemLockRef.current) return;
    postRedeemLockRef.current = true;

    setPostRedeemErr("");
    setPostRedeemSig("");

    if (!ev?.resolved) {
      postRedeemLockRef.current = false;
      setPostRedeemErr("Event is not finalized yet.");
      return;
    }

    // must be a real winner (winningOption 1 or 2 AND status winner)
    const status = Number(ev?.resultStatus ?? 0);
    const winOpt = Number(ev?.winningOption ?? 0);
    if (status !== RESULT.RESOLVED_WINNER || (winOpt !== 1 && winOpt !== 2)) {
      postRedeemLockRef.current = false;
      setPostRedeemErr("No winner for this event. Use the no-winner redeem instead.");
      return;
    }

    const amount = toBaseUnits(amountStr);
    if (!amount) {
      postRedeemLockRef.current = false;
      setPostRedeemErr("Enter a valid amount > 0 (example: 0.1)");
      return;
    }

    setPostRedeeming(true);
    try {
      const eventPk = new PublicKey(eventPda);
      const user = wallet.publicKey;

      const [collateralVault] = await findCollateralVaultPda(eventPk);
      const [trueMint] = findTrueMintPda(eventPk);
      const [falseMint] = findFalseMintPda(eventPk);

      const mint = winOpt === 1 ? trueMint : falseMint;

      const userAta = getAssociatedTokenAddressSync(
        mint,
        user,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const info = await program.provider.connection.getAccountInfo(userAta);
      if (!info) throw new Error("Missing winning token ATA.");

      // const bal = await program.provider.connection.getTokenAccountBalance(userAta);
      // if (BigInt(amount.toString()) > BigInt(bal.value.amount)) {
      //   throw new Error("The requested amount is greater than your balance.");
      // }
      const side = Number(ev?.winningOption ?? 0);
      const balBase = side === 1 ? userToken.trueBalBase : userToken.falseBalBase;
      if (BigInt(amount.toString()) > BigInt(balBase || "0")) {
        throw new Error("The requested amount is greater than your balance.");
      }

      const tx = await program.methods
        .redeemWinnerAfterFinal(amount)
        .accounts({
          user,
          event: eventPk,
          collateralVault,
          mint,
          userAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendAndConfirm(tx, "redeemWinnerAfterFinal");
      setPostRedeemSig(sig);
      await load();
    } catch (e) {
      console.error("[redeemWinnerAfterFinal] failed:", e);
      setPostRedeemErr(e?.message || String(e));
    } finally {
      setPostRedeeming(false);
      postRedeemLockRef.current = false;
    }
  }

  async function redeemNoWinnerAfterFinal(amountStr, sideStr /* "TRUE" | "FALSE" */) {
    if (!walletConnected) return setPostRedeemErr("Connect wallet to redeem.");
    if (!program) return;
    if (postRedeemLockRef.current) return;
    postRedeemLockRef.current = true;

    setPostRedeemErr("");
    setPostRedeemSig("");

    if (!ev?.resolved) {
      postRedeemLockRef.current = false;
      setPostRedeemErr("Event is not finalized yet.");
      return;
    }

    // must be finalized but with NO winner
    const status = Number(ev?.resultStatus ?? 0);
    const noWinnerStatuses = [
      RESULT.FINALIZED_NO_VOTES,
      RESULT.FINALIZED_TIE,
      RESULT.FINALIZED_BELOW_THRESHOLD,
    ];

    if (!noWinnerStatuses.includes(status)) {
      postRedeemLockRef.current = false;
      setPostRedeemErr("This event has a winner. Use winner redemption instead.");
      return;
    }

    const amount = toBaseUnits(amountStr);
    if (!amount) {
      postRedeemLockRef.current = false;
      setPostRedeemErr("Enter a valid amount > 0 (example: 0.1)");
      return;
    }

    const side = String(sideStr || "").toUpperCase();
    if (side !== "TRUE" && side !== "FALSE") {
      postRedeemLockRef.current = false;
      setPostRedeemErr('Invalid side. Use "TRUE" or "FALSE".');
      return;
    }

    setPostRedeeming(true);
    try {
      const eventPk = new PublicKey(eventPda);
      const user = wallet.publicKey;

      const [collateralVault] = await findCollateralVaultPda(eventPk);
      const [trueMint] = findTrueMintPda(eventPk);
      const [falseMint] = findFalseMintPda(eventPk);

      const mint = side === "TRUE" ? trueMint : falseMint;

      const userAta = getAssociatedTokenAddressSync(
        mint,
        user,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const info = await program.provider.connection.getAccountInfo(userAta);
      if (!info) throw new Error(`Missing ${side} token ATA.`);

      //const bal = await program.provider.connection.getTokenAccountBalance(userAta);
      const balBase = side === "TRUE" ? userToken.trueBalBase : userToken.falseBalBase;
      if (BigInt(amount.toString()) > BigInt(balBase || "0")) {
        throw new Error("The requested amount is greater than your balance.");
      }

      const sideU8 = side === "TRUE" ? 1 : 2;
      const tx = await program.methods
        .redeemNoWinnerAfterFinal(sideU8, amount)
        .accounts({
          user,
          event: eventPk,
          collateralVault,
          mint,
          userAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendAndConfirm(tx, "redeemNoWinnerAfterFinal");
      setPostRedeemSig(sig);
      await load();
    } catch (e) {
      console.error("[redeemNoWinnerAfterFinal] failed:", e);
      setPostRedeemErr(e?.message || String(e));
    } finally {
      setPostRedeeming(false);
      postRedeemLockRef.current = false;
    }
  }



  /**
   * finalize voting helpers
   */
  function canGetResult(ev, truthQ) {
    if (!ev || !truthQ) return false;

    const now = Math.floor(Date.now() / 1000);

    // must be closed
    const bettingClosed = now >= ev.betEndTime.toNumber();
    // must be greater than reveal end time
    const revealEnded = now >= truthQ.revealEndTime.toNumber();
    // must not be resolved yet
    const notResolved = !ev.resolved;

    return bettingClosed && revealEnded && notResolved;
  }

  function truthRevealEnded(truthQ) {
    if (!truthQ?.revealEndTime) return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= truthQ.revealEndTime.toNumber();
  }


  /**
   * finalize voting handler
   */
  async function getResult() {
    if (!walletConnected) {
      setFinalizeErr("Connect wallet to finalize and store the result.");
      return;
    }
    setFinalizeErr("");
    setFinalizeSig("");

    if (!canGetResult(ev, truthQ)) {
      setFinalizeErr("Result is not available yet.");
      return;
    }

    // block if already resolved/finalized
    if (ev?.resolved) {
      setFinalizeErr("Event is already finalized.");
      return;
    }

    // check if truthQ loaded
    if (!truthQ) {
      setFinalizeErr("Load the Truth Network question first.");
      return;
    }

    // check if truth network reveal end time has ended
    if (!truthRevealEnded(truthQ)) {
      setFinalizeErr("Truth Network reveal phase is still active. Please try again after reveal ends.");
      return;
    }

    const v1 = bnToNum(truthQ.votes_option_1 ?? truthQ.votesOption1);
    const v2 = bnToNum(truthQ.votes_option_2 ?? truthQ.votesOption2);
    

    setFinalizing(true);
    try {
      const eventPk = new PublicKey(eventPda);

      const truthQuestionPk = ev.truthQuestion;
      if (!truthQuestionPk) throw new Error("This event is not linked to a Truth Network question.");

      const [collateralVault] = await findCollateralVaultPda(eventPk);

      const tx = await program.methods
        .fetchAndStoreWinner()
        .accounts({
          event: eventPk,
          collateralVault,
          truthNetworkQuestion: truthQuestionPk,
          truthNetworkProgram: constants.TRUTH_NETWORK_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendAndConfirm(tx, "fetchAndStoreWinner");
      setFinalizeSig(sig);

      await load();
    } catch (e) {
      console.error("[getResult] failed:", e);
      setFinalizeErr(e?.message || String(e));
    } finally {
      setFinalizing(false);
    }
  }

  function isCreator(ev) {
    try {
      return !!wallet?.publicKey && !!ev?.creator && wallet.publicKey.equals(ev.creator);
    } catch {
      return false;
    }
  }

  function bnToBigInt(x) {
    if (!x) return 0n;
    if (typeof x === "bigint") return x;
    if (typeof x?.toString === "function") return BigInt(x.toString());
    return BigInt(String(x));
  }

  async function claimCreatorCommission() {
    if (!walletConnected) return setClaimCreatorErr("Connect wallet to claim commission.");
    if (!program) return;

    setClaimCreatorErr("");
    setClaimCreatorSig("");

    // must be creator
    if (!isCreator(ev)) {
      setClaimCreatorErr("Only the event creator can claim commission.");
      return;
    }

    // must be after betting ends
    const now = Math.floor(Date.now() / 1000);
    if (now < (ev?.betEndTime?.toNumber?.() ?? 0)) {
      setClaimCreatorErr("Betting is still active. Claim is available after betting ends.");
      return;
    }

    // must have something to claim
    const pending = bnToBigInt(ev?.pendingCreatorCommission);
    if (pending <= 0n) {
      setClaimCreatorErr("Nothing to claim.");
      return;
    }

    setClaimingCreator(true);
    try {
      const eventPk = new PublicKey(eventPda);
      const [collateralVault] = await findCollateralVaultPda(eventPk);

      const tx = await program.methods
        .claimCreatorCommission()
        .accounts({
          creator: wallet.publicKey,
          event: eventPk,
          collateralVault,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendAndConfirm(tx, "claimCreatorCommission");
      setClaimCreatorSig(sig);
      await load();
    } catch (e) {
      console.error("[claimCreatorCommission] failed:", e);
      setClaimCreatorErr(e?.message || String(e));
    } finally {
      setClaimingCreator(false);
    }
  }


  async function handleSweepUnclaimed() {
    try {
      const eventPk = new PublicKey(eventPda);
      const [collateralVault] = await findCollateralVaultPda(eventPk);

      const tx = await program.methods
        .sweepUnclaimedToHouse()
        .accounts({
          event: eventPk,
          collateralVault,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      await sendAndConfirm(tx, "sweepUnclaimedToHouse");
      await load();
    } catch (e) {
      console.error("[sweep] failed:", e);
    }
  }

  async function handleDeleteEvent() {
    try {
      const eventPk = new PublicKey(eventPda);
      const [collateralVault] = await findCollateralVaultPda(eventPk);

      const tx = await program.methods
        .deleteEvent()
        .accounts({
          creator: wallet.publicKey,
          event: eventPk,
          collateralVault,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      await sendAndConfirm(tx, "deleteEvent");

      // optional: redirect back to events list
      navigate("/");
    } catch (e) {
      console.error("[deleteEvent] failed:", e);
    }
  }



  if (loading) return <p>Loading...</p>;
  if (err) return <p style={{ color: "crimson" }}>{err}</p>;
  if (!ev) return null;

  const bettingActive = isBettingActive(ev);

  function categoryLabel(cat) {
   
    if (typeof cat?.toNumber === "function") {
      console.log("category is a function")
      const n = cat.toNumber();
      return constants.CATEGORY_OPTIONS.find(o => o.value === n)?.label ?? `Unknown (${n})`;
    }
    if (typeof cat === "number") {
      console.log("category is a number")
      return constants.CATEGORY_OPTIONS.find(o => o.value === cat)?.label ?? `Unknown (${cat})`;
    }

    if (cat && typeof cat === "object") {
      console.log("category is an object")
      const key = Object.keys(cat)[0];
      if (!key) return "Unknown";
      return key[0].toUpperCase() + key.slice(1);
    }

    return "Unknown";
  }


  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{ev.title}</h2>
        
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!walletConnected && (
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              Read-only mode (connect wallet to interact)
            </span>
          )}
          <button onClick={load} disabled={loading || minting || redeeming || finalizing || postRedeeming}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        
      </div>
      <div><b>Category:</b> {categoryLabel(ev.category)}</div>

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
              disabled={!bettingActive || !walletConnected}
            />
          </div>

          <button
            onClick={() => buyTokens(solAmount)}
            disabled={!walletConnected || !bettingActive || minting || loading || redeeming || finalizing || postRedeeming}
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
            Expected: 1 SOL → 0.99 TRUE + 0.99 FALSE (1% fee)
          </div>
        </div>

        {!walletConnected && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
            Connect wallet to buy.
          </div>
        )}

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

      {walletConnected && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          {userToken.loading ? (
            <span style={{ opacity: 0.8 }}>Checking your token balances...</span>
          ) : hasAnyToken ? (
            <span className="font-green">
              You already have tokens for this event:
              {" "}
              TRUE: <b>{baseToUiStr(userToken.trueBalBase)}</b>,
              {" "}
              FALSE: <b>{baseToUiStr(userToken.falseBalBase)}</b>
            </span>
          ) : (
            <span style={{ opacity: 0.8 }}>You don’t hold TRUE/FALSE tokens for this event yet.</span>
          )}
        </div>
      )}


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
            Redeem requires equal amounts of TRUE + FALSE. Example: 1 TRUE + 1 FALSE = 0.99 SOL.
          </div>

          {!walletConnected ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
              Connect wallet to redeem.
            </div>
          ): userToken.loading ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Checking your token balances...
            </div>
          ): !hasBothTokens ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              You need BOTH TRUE and FALSE to redeem as a pair.
            </div>
          ): (
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
                  disabled={!walletConnected}
                />
              </div>

              <button
                type="button"
                onClick={() => redeemPairWhileActive(redeemAmount)}
                disabled={loading || minting || redeeming || finalizing || postRedeeming || !hasBothTokens} 
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
          )
          }


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

      {bettingClosed && ev.resolved && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10, background: "#fafafa" }}>
          <div style={{ fontWeight: 700 }}>Event finalized</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
            Outcome: <b>{resultLabel(ev)}</b> — {winnerLabel(ev)}
            {Number(ev?.resultStatus ?? 0) === RESULT.RESOLVED_WINNER && (
              <>
                {" "}
                (<b>{pctFromBps(ev.winningPercentBps)}</b>%)
              </>
            )}
          </div>

          {/* Claim Commission (creator only, after betting ends) */}
          {walletConnected && isCreator(ev) && pendingCreatorCommissionBase > 0n && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                Pending creator commission:{" "}
                <b>{baseToUiStr(ev?.pendingCreatorCommission?.toString?.() ?? "0")}</b> SOL
              </div>

              <button
                onClick={claimCreatorCommission}
                disabled={claimingCreator || loading || minting || redeeming || finalizing || postRedeeming}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: claimingCreator ? "#eee" : "#111",
                  color: claimingCreator ? "#111" : "#fff",
                  cursor: claimingCreator ? "not-allowed" : "pointer",
                }}
              >
                {claimingCreator ? "Claiming..." : "Claim Commission"}
              </button>

              {claimCreatorErr && (
                <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>
                  {claimCreatorErr}
                </div>
              )}

              {claimCreatorSig && (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <b>TX:</b>{" "}
                  <a
                    href={`https://solscan.io/tx/${claimCreatorSig}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {claimCreatorSig}
                  </a>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {ev?.resolved && !ev?.unclaimedSwept && (
        <div className="mt-4 p-4 rounded-lg bg-yellow-50 border border-yellow-300">
          <p className="text-sm text-yellow-800">
            Unclaimed SOL will be swept to the House in{" "}
            <strong>
              {Math.max(0, sweepAfterTs - now)} seconds
            </strong>.
          </p>

          {showSweepButton && (
            <button
              onClick={handleSweepUnclaimed}
              className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Sweep Unclaimed SOL to House
            </button>
          )}
        </div>
      )}

      {showDeleteEventButton && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-300">
          <p className="text-sm text-red-800 mb-2">
            This event is fully settled and can be deleted.
          </p>

          <button
            onClick={handleDeleteEvent}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete Event
          </button>
        </div>
      )}


      {/* Event info */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>PDA:</b> {ev.pk.toBase58()}</div>
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
        <div><b>Pending creator commission:</b> {baseToUiStr(ev?.pendingCreatorCommission?.toString?.() ?? "0")} SOL</div>
        <div><b>Pending house commission:</b> {baseToUiStr(ev?.pendingHouseCommission?.toString?.() ?? "0")} SOL</div>
        <div><b>Truth commission sent:</b> {baseToUiStr(ev?.totalTruthCommissionSent?.toString?.() ?? "0")} SOL</div>


        <hr style={{ margin: "12px 0" }} />

        <div><b>TRUE mint address:</b> {ev.trueMint?.toBase58?.() ?? "-"}</div>
        <div><b>FALSE mint address:</b> {ev.falseMint?.toBase58?.() ?? "-"}</div>

        <hr style={{ margin: "12px 0" }} />

        <div><b>Resolved:</b> {String(ev.resolved)}</div>
        <div><b>Status:</b> {resultLabel(ev)} (code {String(ev.resultStatus ?? 0)})</div>
        <div><b>Winner:</b> {winnerLabel(ev)}</div>

        <div style={{ marginTop: 6 }}>
          <b>Winning %:</b>{" "}
          {ev.resolved ? `${pctFromBps(ev.winningPercentBps)}%` : "-"}
        </div>

        <div style={{ marginTop: 6 }}>
          <b>Votes:</b>{" "}
          TRUE {bnToStr(ev.votesOption1)} - FALSE {bnToStr(ev.votesOption2)}
        </div>

        <div style={{ marginTop: 6 }}>
          <b>Votes:</b>{" "}
          TRUE {bnToStr(ev.votesOption1 ?? ev.votes_option_1)} - FALSE {bnToStr(ev.votesOption2 ?? ev.votes_option_2)}
        </div>


        <div style={{ marginTop: 6 }}>
          <b>Threshold:</b> {pctFromBps(ev.consensusThresholdBps)}%
        </div>

        <div style={{ marginTop: 6 }}>
          <b>Resolved at:</b> {ev.resolvedAt ? toDate(ev.resolvedAt) : "-"}
        </div>

      </div>

      {/* Get Result UI */}
      {canGetResult(ev, truthQ) && !ev.resolved && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Get Result (Finalize Truth + Store Winner)</div>

          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
            This will call Truth Network <code>finalize_voting</code> and then store the winner in this event.
            {truthLoading ? (
              <span> (loading truth status...)</span>
            ) : truthQ ? (
              <span>
                {" "}
                Reveal ends: <b>{toDate(truthQ.revealEndTime)}</b>{" "}
              </span>
            ) : (
              <span> (no truth question loaded)</span>
            )}
          </div>

          <button
            onClick={getResult}
            disabled={!walletConnected || finalizing || loading || minting || redeeming || finalizing || postRedeeming || ev.resolved}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: finalizing ? "#eee" : "#111",
              color: finalizing ? "#111" : "#fff",
              cursor: finalizing ? "not-allowed" : "pointer",
            }}
          >
            {finalizing ? "Finalizing..." : "Get Result"}
          </button>

          {!walletConnected && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
              Connect wallet to finalize and store result.
            </div>
          )}

          {finalizeErr && <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>{finalizeErr}</div>}

          {finalizeSig && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <b>TX:</b>{" "}
              <a href={`https://solscan.io/tx/${finalizeSig}?cluster=devnet`} target="_blank" rel="noreferrer">
                {finalizeSig}
              </a>
            </div>
          )}
        </div>
      )}


      {/* Post-finalization Redeem UI */}
      {bettingClosed && ev.resolved && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10, background: "#fafafa" }}>
          

          {hasWinner(ev) ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Winner is <b>{winnerLabel(ev)}</b>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
                expected: 1 <b>{winnerLabel(ev)}</b> token = 1 SOL
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, opacity: 0.8 }}>Amount (tokens)</label>
                  <input
                    value={postRedeemAmount}
                    onChange={(e) => setPostRedeemAmount(e.target.value)}
                    placeholder="e.g. 0.1"
                    style={{ width: 160, padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", outline: "none" }}
                    inputMode="decimal"
                    disabled={!walletConnected}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => redeemWinnerAfterFinal(postRedeemAmount)}
                  disabled={!walletConnected || postRedeeming || loading || minting || redeeming || finalizing || !hasAnyToken}
                  style={{
                    marginTop: 18,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: postRedeeming ? "#eee" : "#111",
                    color: postRedeeming ? "#111" : "#fff",
                    cursor: postRedeeming ? "not-allowed" : "pointer",
                  }}
                >
                  {postRedeeming ? "Redeeming..." : `Redeem ${winnerLabel(ev)} → SOL`}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                There is <b>no winner</b> for this event ({resultLabel(ev)}).
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
                 You can redeem TRUE or FALSE.
                {" "}(expected: 1 token = 0.5 SOL)
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, opacity: 0.8 }}>Side</label>
                  <select
                    value={postRedeemSide}
                    onChange={(e) => setPostRedeemSide(e.target.value)}
                    style={{ width: 160, padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", outline: "none" }}
                    disabled={!walletConnected}
                  >
                    <option value="TRUE">TRUE</option>
                    <option value="FALSE">FALSE</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, opacity: 0.8 }}>Amount (tokens)</label>
                  <input
                    value={postRedeemAmount}
                    onChange={(e) => setPostRedeemAmount(e.target.value)}
                    placeholder="e.g. 0.1"
                    style={{ width: 160, padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", outline: "none" }}
                    inputMode="decimal"
                    disabled={!walletConnected}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => redeemNoWinnerAfterFinal(postRedeemAmount, postRedeemSide)}
                  disabled={!walletConnected || postRedeeming || loading || minting || redeeming || finalizing || !hasAnyToken}
                  style={{
                    marginTop: 18,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: postRedeeming ? "#eee" : "#111",
                    color: postRedeeming ? "#111" : "#fff",
                    cursor: postRedeeming ? "not-allowed" : "pointer",
                  }}
                >
                  {postRedeeming ? "Redeeming..." : `Redeem ${postRedeemSide} → SOL`}
                </button>
              </div>
            </>
          )}

          {!walletConnected && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
              Connect wallet to redeem.
            </div>
          )}

          {postRedeemErr && <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>{postRedeemErr}</div>}

          {postRedeemSig && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <b>TX:</b>{" "}
              <a href={`https://solscan.io/tx/${postRedeemSig}?cluster=devnet`} target="_blank" rel="noreferrer">
                {postRedeemSig}
              </a>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
