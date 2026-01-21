import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getConstants } from "../constants";
import { getIdls } from "../idls";

const READONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
};

export function getReadonlyConnection() {
  const c = getConstants();
  return new Connection(c.DEFAULT_RPC_URL, "confirmed");
}

export function getPredictReadonlyProgram() {
  const c = getConstants();
  const { predictsolIDL } = getIdls(c.NETWORK);
  const conn = getReadonlyConnection();
  const provider = new AnchorProvider(conn, READONLY_WALLET, {
    preflightCommitment: "processed",
  });
  return new Program(predictsolIDL, provider);
}

export function getTruthReadonlyProgram() {
  const c = getConstants();
  const { truthNetworkIDL } = getIdls(c.NETWORK);
  const conn = getReadonlyConnection();
  const provider = new AnchorProvider(conn, READONLY_WALLET, {
    preflightCommitment: "processed",
  });
  return new Program(truthNetworkIDL, provider);
}
