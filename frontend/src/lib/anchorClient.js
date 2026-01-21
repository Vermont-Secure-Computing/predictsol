import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { getConstants } from "../constants";
import { getIdls, assertIdlMatchesProgramId } from "../idls";

export function getConnection() {
  const c = getConstants();
  return new Connection(c.DEFAULT_RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
}

export function getPredictProgram(wallet) {
  const c = getConstants();
  const { predictsolIDL } = getIdls(c.NETWORK);

  assertIdlMatchesProgramId(predictsolIDL, c.PREDICTSOL_PROGRAM_ID, "PredictSol");

  const conn = getConnection();
  const provider = new AnchorProvider(conn, wallet, { preflightCommitment: "processed" });
  return new Program(predictsolIDL, provider);
}

export function getTruthProgram(wallet) {
  const c = getConstants();
  const { truthNetworkIDL } = getIdls(c.NETWORK);

  const conn = getConnection();
  const provider = new AnchorProvider(conn, wallet, { preflightCommitment: "processed" });

  return new Program(truthNetworkIDL, provider);
}
