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

function getEventStatus(ev, nowTs) {
  if (!ev) return { label: "Unknown", color: "gray" };

  const now = nowTs ?? Math.floor(Date.now() / 1000);

  if (ev.resolved) {
    return { label: "Finalized", color: "blue" };
  }

  if (now < Number(ev.betEndTime)) {
    return { label: "Active", color: "green" };
  }

  return { label: "Waiting for Resolution", color: "yellow" };
}

function statusClasses(color) {
  switch (color) {
    case "green":
      return [
        "bg-green-50 border-green-200 text-green-700",
        "dark:bg-green-900/20 dark:border-green-900/40 dark:text-green-200",
      ].join(" ");
    case "yellow":
      return [
        "bg-yellow-50 border-yellow-200 text-yellow-800",
        "dark:bg-yellow-900/20 dark:border-yellow-900/40 dark:text-yellow-200",
      ].join(" ");
    case "blue":
      return [
        "bg-blue-50 border-blue-200 text-blue-700",
        "dark:bg-blue-900/20 dark:border-blue-900/40 dark:text-blue-200",
      ].join(" ");
    default:
      return [
        "bg-gray-50 border-gray-200 text-gray-700",
        "dark:bg-gray-900/40 dark:border-gray-800 dark:text-gray-200",
      ].join(" ");
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
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 9);
  return `${whole.toString()}.${fracStr}`;
}

function toDateTime(tsSec) {
  if (!tsSec) return "-";
  return new Date(Number(tsSec) * 1000).toLocaleString();
}

const shortTxMid = (sig, left = 12, right = 12) =>
  sig && sig.length > left + right
    ? `${sig.slice(0, left)}…${sig.slice(-right)}`
    : sig;


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
    trueBalBase: "0", 
    falseBalBase: "0",
    loading: false,
    err: "",
  });

  const [claimingCreator, setClaimingCreator] = useState(false);
  const [claimCreatorErr, setClaimCreatorErr] = useState("");
  const [claimCreatorSig, setClaimCreatorSig] = useState("");
  const [vaultLamports, setVaultLamports] = useState(0);

  const [vaultMin, setVaultMin] = useState(null);

  // state for sweep unclaimed SOL confirmation modal
  const [showSweepConfirm, setShowSweepConfirm] = useState(false);
  const [sweeping, setSweeping] = useState(false);


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

  const VAULT_MIN = vaultMin ?? 0;
  const DUST_TOL = 10;
  
 
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

        return sim; 
      } catch (e) {
        last = e;
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
    // console.log("RPC:", conn.rpcEndpoint);
    // console.log("Balance:", await conn.getBalance(wallet.publicKey));
    // console.log("Genesis:", await conn.getGenesisHash());

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

  const vaultEmpty = vaultLamports <= VAULT_MIN + DUST_TOL;

  const outstandingTrue = BigInt(ev?.outstanding_true?.toString?.() ?? "0");
  const outstandingFalse = BigInt(ev?.outstanding_false?.toString?.() ?? "0");
  const outstandingZero = (outstandingTrue === 0n && outstandingFalse === 0n);

  const canDeleteByPhase = !afterWindow ?
    (vaultEmpty && outstandingZero)
    : (vaultEmpty && (ev?.unclaimedSwept || outstandingZero))


  console.log("vaultLamports: ", vaultLamports)
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
    canDeleteByPhase
    //isTruthDeletable()
  console.log("truth q: ", truthQ)
  //console.log("is truth deletable: ", isTruthDeletable())
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


  // use for redeeming pair (redeem while active)
  function getMaxRedeemUiAmount() {
    if (userToken.loading) return "0";

    const t = userToken.trueBalBase ?? 0n;
    const f = userToken.falseBalBase ?? 0n;
    const minBase = t < f ? t : f;
    return baseToUiStr(minBase);
  }

  function getWinnerTokenBase(ev, userToken) {
    // winning_option: 1 TRUE, 2 FALSE
    const win = Number(ev?.winningOption ?? ev?.winning_option ?? 0);

    if (win === 1) return userToken?.trueBalBase ?? 0n;
    if (win === 2) return userToken?.falseBalBase ?? 0n;

    // no winner
    return 0n;
  }

  function getMaxPostRedeemWinnerUi(ev) {
    if (userToken.loading) return "0";
    return baseToUiStr(getWinnerTokenBase(ev, userToken));
  }

  function getMaxPostRedeemNoWinnerUi(side) {
    if (userToken.loading) return "0";
    const base = side === "TRUE" ? (userToken.trueBalBase ?? 0n) : (userToken.falseBalBase ?? 0n);
    return baseToUiStr(base);
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

    if (amountNum < constants.MIN_BUY_SOL) {
      buyLockRef.current = false;
      setMintErr(`Minimum buy amount is ${constants.MIN_BUY_SOL} SOL`);
      return;
    }

    // only allow buys during betting period
    if (!isBettingActive(ev)) {
      buyLockRef.current = false;
      setMintErr("Betting period ended. Buying is disabled.");
      return;
    }

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
          truthNetworkQuestion: ev.truthQuestion, 
          truthNetworkVault: truthVaultPk,
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
      if (!program) throw new Error("Program not ready");
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
    <div className="min-h-screen w-full bg-gray-50 dark:bg-black/90">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 dark:text-white dark:text-white break-words">
              {ev.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1
                 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-200">
                Category: <span className="ml-1 font-medium text-gray-900 dark:text-white dark:text-white">{categoryLabel(ev.category)}</span>
              </span>

              {(() => {
                const st = getEventStatus(ev, now);
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(
                      st.color
                    )}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                    {st.label}
                  </span>

                );
              })()}


              {!walletConnected && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700
                 dark:bg-gray-900/60 dark:text-gray-300 dark:border dark:border-gray-800">
                  Read-only mode (connect wallet to interact)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading || minting || redeeming || finalizing || postRedeeming}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT: 2/3 content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Market / Outcome header card
            <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur">
              <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                {/* Example: "This market resolves to TRUE if ..." 
              </div>
            </div>*/}

            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm
              dark:border-green-900/40 dark:bg-green-900/20 dark:backdrop-blur">
              <div className="text-sm text-gray-600 dark:text-gray-300">Market</div>
              {(() => {
                const st = getEventStatus(ev, now);
                return (
                  <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{st.label}</div>
                );
              })()}
              

              {ev?.resolved && (
                <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600 dark:text-gray-600">
                  <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{resultLabel(ev)}</div>

                  Outcome: <span className="font-semibold">{winnerLabel(ev)}</span>
                  {Number(ev?.resultStatus ?? 0) === RESULT.RESOLVED_WINNER ? (
                    <span className="text-gray-600 dark:text-gray-900"> · {pctFromBps(ev.winningPercentBps)}%</span>
                  ) : null}

                  <div>
                    <span className="text-xs text-gray-600 dark:text-gray-600">Votes: </span>
                    <span className="text-xs text-gray-900 dark:text-gray-900">
                      TRUE {bnToStr(ev.votesOption1 ?? ev.votes_option_1)} — FALSE {bnToStr(ev.votesOption2 ?? ev.votes_option_2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-600 dark:text-gray-600">Winning Percentage: </span>
                    <span className="text-xs text-gray-900 dark:text-gray-900">
                      {pctFromBps(ev.winningPercentBps)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Event info / Details (this is your big info block, styled nicer) */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-gray-900 dark:text-white">Event details</div>
                <div className="text-xs text-gray-500">On-chain references</div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Event PDA</div>
                    <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{ev.pk.toBase58()}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Creator</div>
                    <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{ev.creator.toBase58()}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">TRUE mint</div>
                    <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{ev.trueMint?.toBase58?.() ?? "-"}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">FALSE mint</div>
                    <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{ev.falseMint?.toBase58?.() ?? "-"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Betting end</div>
                    <div className="mt-1 text-gray-900 dark:text-white">{toDate(ev.betEndTime)}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Commit end</div>
                    <div className="mt-1 text-gray-900 dark:text-white">{toDate(ev.commitEndTime)}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Reveal end</div>
                    <div className="mt-1 text-gray-900 dark:text-white">{toDate(ev.revealEndTime)}</div>
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                  <div className="text-xs text-gray-500">Collateral vault</div>
                  <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{ev.collateralVault.toBase58()}</div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Total collateral</div>
                    <div className="mt-1 text-gray-900 dark:text-white">{ev.totalCollateralLamports?.toString?.() ?? "0"} lamports</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Issued / side</div>
                    <div className="mt-1 text-gray-900 dark:text-white">{ev.totalIssuedPerSide?.toString?.() ?? "0"}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 border border-gray-200
                dark:bg-gray-950/40 dark:border-gray-800">
                    <div className="text-xs text-gray-500">Winning Threshold</div>
                    <div className="mt-1 text-gray-900 dark:text-white">{pctFromBps(ev.consensusThresholdBps)}%</div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* RIGHT: actions */}
          <div className="lg:col-span-1">
            <div className="space-y-4 lg:sticky lg:top-6">

              {/* Winner / status banner 
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm
                dark:border-green-900/40 dark:bg-green-900/20 dark:backdrop-blur">
                <div className="text-sm text-gray-600 dark:text-gray-300">Market</div>
                <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{resultLabel(ev)}</div>

                {ev?.resolved && (
                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600 dark:text-gray-600">
                    Outcome: <span className="font-semibold">{winnerLabel(ev)}</span>
                    {Number(ev?.resultStatus ?? 0) === RESULT.RESOLVED_WINNER ? (
                      <span className="text-gray-600 dark:text-gray-900"> · {pctFromBps(ev.winningPercentBps)}%</span>
                    ) : null}

                    <div>
                      <span className="text-xs text-gray-600 dark:text-gray-600">Votes: </span>
                      <span className="text-xs text-gray-900 dark:text-gray-900">
                        TRUE {bnToStr(ev.votesOption1 ?? ev.votes_option_1)} — FALSE {bnToStr(ev.votesOption2 ?? ev.votes_option_2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-600 dark:text-gray-600">Winning Percentage: </span>
                      <span className="text-xs text-gray-900 dark:text-gray-900">
                        {pctFromBps(ev.winningPercentBps)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>*/}

              {/* Wallet token balances hint*/}
              {walletConnected && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur text-sm">
                  {userToken.loading ? (
                    <span className="text-gray-600 dark:text-gray-300">Checking your token balances...</span>
                  ) : hasAnyToken ? (
                    <span className="text-green-700">
                      You already have tokens for this event: TRUE <b>{baseToUiStr(userToken.trueBalBase)}</b>, FALSE{" "}
                      <b>{baseToUiStr(userToken.falseBalBase)}</b>
                    </span>
                  ) : (
                    <span className="text-gray-600 dark:text-gray-300">You don’t hold TRUE/FALSE tokens for this event yet.</span>
                  )}
                </div>
              )}

              {/* ACTIONS block */}
              {/* 1) Buy Tokens */}
              {bettingActive && (<div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur">
                {/* === START: Buy Tokens UI === */}
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
                      className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none
                        focus:ring-2 focus:ring-indigo-500
                        dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100 dark:placeholder:text-gray-500"
                      inputMode="decimal"
                      disabled={!bettingActive || !walletConnected}
                    />
                  </div>

                  <button
                    onClick={() => buyTokens(solAmount)}
                    disabled={!walletConnected || !bettingActive || minting || loading || redeeming || finalizing || postRedeeming}
                    className={`
                      mt-4 px-4 py-2 rounded-lg font-medium transition
                      ${minting
                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                        : "text-white bg-green-600 hover:bg-green-700 active:bg-green-800"}
                    `}

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
                    <a
                      href={`https://solscan.io/tx/${mintSig}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-500 hover:underline break-all dark:text-indigo-300"
                      title={mintSig}
                    >
                      {shortTxMid(mintSig)}
                    </a>

                  </div>
                )}
                {/* === END: Buy Tokens UI === */}
              </div>)}

              {/* 2) Redeem while active (if active) */}
              {bettingActive && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur">
                  {/* Redeem Pair UI (only while betting active) */}
    
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

                        <div className="flex items-center gap-2">
                          <input
                            value={redeemAmount}
                            onChange={(e) => setRedeemAmount(e.target.value)}
                            placeholder="e.g. 0.1"
                            className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none
                              focus:ring-2 focus:ring-indigo-500
                              dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100 dark:placeholder:text-gray-500"
                            inputMode="decimal"
                            disabled={!walletConnected}
                          />

                          <button
                            type="button"
                            onClick={() => setRedeemAmount(getMaxRedeemUiAmount())}
                            disabled={!walletConnected || userToken.loading || !hasBothTokens}
                            className="
                              px-3 py-2 rounded-lg text-xs font-semibold border
                              border-gray-200 bg-gray-50 text-gray-800
                              hover:bg-gray-100 active:bg-gray-200
                              disabled:opacity-50 disabled:cursor-not-allowed
                              dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100
                              dark:hover:bg-gray-900 dark:active:bg-gray-800
                            "
                            title="Set maximum redeemable (min(TRUE, FALSE))"
                          >
                            MAX
                          </button>
                        </div>

                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Max: {getMaxRedeemUiAmount()}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => redeemPairWhileActive(redeemAmount)}
                        disabled={loading || minting || redeeming || finalizing || postRedeeming || !hasBothTokens} 
                        className={`
                          mt-4 px-4 py-2 rounded-lg font-medium transition
                          ${minting
                            ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                            : "text-white bg-green-600 hover:bg-green-700 active:bg-green-800"}
                        `}

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
                      <a 
                        href={`https://solscan.io/tx/${redeemSig}?cluster=devnet`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-500 hover:underline break-all dark:text-indigo-300"
                      >
                        {shortTxMid(redeemSig)}
                      </a>
                    </div>
                  )}
       
                </div>
              )}

              {/* 3) Get Result / Finalize (if available) */}
              {canGetResult(ev, truthQ) && !ev.resolved && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur">
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
                    className={`
                      px-4 py-2 rounded-lg font-medium transition
                      ${finalizing
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700"}
                    `}
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

              {/* 4) Post-finalize redeem */}
              {bettingClosed && ev.resolved && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur text-gray-600 dark:text-gray-300">
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

                          <div className="flex items-center gap-2">
                            <input
                              value={postRedeemAmount}
                              onChange={(e) => setPostRedeemAmount(e.target.value)}
                              placeholder="e.g. 0.1"
                              className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none
                                focus:ring-2 focus:ring-indigo-500
                                dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100 dark:placeholder:text-gray-500"
                              inputMode="decimal"
                              disabled={!walletConnected}
                            />

                            <button
                              type="button"
                              onClick={() => setPostRedeemAmount(getMaxPostRedeemWinnerUi(ev))}
                              disabled={!walletConnected || userToken.loading}
                              className="
                                px-3 py-2 rounded-lg text-xs font-semibold border
                                border-gray-200 bg-gray-50 text-gray-800
                                hover:bg-gray-100 active:bg-gray-200
                                disabled:opacity-50 disabled:cursor-not-allowed
                                dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100
                                dark:hover:bg-gray-900 dark:active:bg-gray-800
                              "
                              title="Set maximum redeemable (min(TRUE, FALSE))"
                            >
                              MAX
                            </button>
                          </div>

                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Max: {getMaxPostRedeemNoWinnerUi(postRedeemSide)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => redeemWinnerAfterFinal(postRedeemAmount)}
                          disabled={!walletConnected || postRedeeming || loading || minting || redeeming || finalizing || !hasAnyToken}
                          className={`
                            mt-4 px-4 py-2 rounded-lg font-medium transition
                            ${postRedeeming
                              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                              : "text-white bg-green-600 hover:bg-green-700 active:bg-green-800"}
                          `}
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
                            className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none
                              focus:ring-2 focus:ring-indigo-500
                              dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100 dark:placeholder:text-gray-500"
                            disabled={!walletConnected}
                          >
                            <option value="TRUE">TRUE</option>
                            <option value="FALSE">FALSE</option>
                          </select>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 12, opacity: 0.8 }}>Amount (tokens)</label>

                          <div className="flex items-center gap-2">
                            <input
                              value={postRedeemAmount}
                              onChange={(e) => setPostRedeemAmount(e.target.value)}
                              placeholder="e.g. 0.1"
                              className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none
                                focus:ring-2 focus:ring-indigo-500
                                dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100 dark:placeholder:text-gray-500"
                              inputMode="decimal"
                              disabled={!walletConnected}
                            />

                            <button
                              type="button"
                              onClick={() => setPostRedeemAmount(getMaxPostRedeemNoWinnerUi(postRedeemSide))}
                              disabled={!walletConnected || userToken.loading}
                              className="
                                px-3 py-2 rounded-lg text-xs font-semibold border
                                border-gray-200 bg-gray-50 text-gray-800
                                hover:bg-gray-100 active:bg-gray-200
                                disabled:opacity-50 disabled:cursor-not-allowed
                                dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100
                                dark:hover:bg-gray-900 dark:active:bg-gray-800
                              "
                              title="Set maximum redeemable (min(TRUE, FALSE))"
                            >
                              MAX
                            </button>
                          </div>

                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Max: {getMaxPostRedeemNoWinnerUi(postRedeemSide)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => redeemNoWinnerAfterFinal(postRedeemAmount, postRedeemSide)}
                          disabled={!walletConnected || postRedeeming || loading || minting || redeeming || finalizing || !hasAnyToken}
                          className={`
                            mt-4 px-4 py-2 rounded-lg font-medium transition
                            ${postRedeeming
                              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                              : "text-white bg-green-600 hover:bg-green-700 active:bg-green-800"}
                          `}
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
                      <a 
                        href={`https://solscan.io/tx/${postRedeemSig}?cluster=devnet`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-500 hover:underline break-all dark:text-indigo-300"
                      >
                        {shortTxMid(postRedeemSig)}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* 5) Claim commission (creator) */}
              {walletConnected && isCreator(ev) && bettingClosed && ev.resolved && pendingCreatorCommissionBase > 0n && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm
                dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur">
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
                  {walletConnected && isCreator(ev) && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                        Pending creator commission:{" "}
                        <b>{baseToUiStr(ev?.pendingCreatorCommission?.toString?.() ?? "0")}</b> SOL
                      </div>

                      <button
                        onClick={claimCreatorCommission}
                        disabled={claimingCreator || loading || minting || redeeming || finalizing || postRedeeming}
                        className={`
                          mt-4 px-4 py-2 rounded-lg font-medium transition
                          ${claimingCreator
                            ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                            : "text-white bg-green-600 hover:bg-green-700 active:bg-green-800"}
                        `}
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

              {/* 6) Sweep / Delete controls */}
              {ev?.resolved && !ev?.unclaimedSwept && !showDeleteEventButton &&(
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm text-yellow-800">
                    Unclaimed SOL can be swept to the House starting at{" "}
                    <strong>
                      {toDateTime(sweepAfterTs)}
                    </strong>.
                  </p>

                  {showSweepButton &&
                    <button
                      onClick={() => setShowSweepConfirm(true)}
                      className="
                        px-4 py-2 rounded-lg font-medium text-white transition
                        bg-red-600 hover:bg-red-700 active:bg-red-800
                      "
                    >
                      Sweep Unclaimed SOL to House
                    </button>
                  } 

                </div>
              )}

              {showDeleteEventButton && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-800 mb-2">
                    This event is fully settled and can be deleted.
                  </p>

                  <button
                    onClick={handleDeleteEvent}
                    className="
                      px-4 py-2 rounded-lg font-medium text-white transition
                      bg-red-600 hover:bg-red-700 active:bg-red-800
                    "
                  >
                    Delete Event
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {showSweepConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => (sweeping ? null : setShowSweepConfirm(false))}
            />

            {/* modal */}
            <div className="relative w-[92%] max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl
                            dark:border-gray-800 dark:bg-gray-900">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                Confirm sweep
              </div>

              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                This will transfer any <b>unclaimed SOL</b> from the event’s collateral vault to the <b>House</b>.
                This action is <b>irreversible</b>.
              </p>

              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-900
                dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
                After unclaimed funds are swept, users can no longer redeem tokens for this event.
                Any remaining TRUE/FALSE tokens will no longer be claimable for SOL after this action.
              </div>


              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={sweeping}
                  onClick={() => setShowSweepConfirm(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50
                            disabled:opacity-60
                            dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={sweeping}
                  onClick={async () => {
                    setSweeping(true);
                    try {
                      await handleSweepUnclaimed();
                      setShowSweepConfirm(false);
                    } finally {
                      setSweeping(false);
                    }
                  }}
                  className="px-4 py-2 rounded-lg font-medium text-white transition
                            bg-red-600 hover:bg-red-700 active:bg-red-800
                            disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {sweeping ? "Sweeping..." : "Yes, sweep now"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );

}
