import { Connection } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { IDL, PROGRAM_ID, NETWORK } from "../config";

export function getProvider(wallet) {
  const connection = new Connection(NETWORK, "confirmed");
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

export function getProgram(wallet) {
  const provider = getProvider(wallet);
  return new Program(IDL, provider);
}
