import { PublicKey } from "@solana/web3.js";
//import { PROGRAM_ID } from "./anchorClient";
import { PROGRAM_ID } from "../config";

export async function findCounterPda(creatorPubkey) {
  return PublicKey.findProgramAddress(
    [Buffer.from("event_counter"), creatorPubkey.toBuffer()],
    PROGRAM_ID
  );
}

export async function findEventPda(creatorPubkey, eventIdU64LeBuffer) {
  return PublicKey.findProgramAddress(
    [Buffer.from("event"), creatorPubkey.toBuffer(), eventIdU64LeBuffer],
    PROGRAM_ID
  );
}

export async function findCollateralVaultPda(eventPda) {
  return PublicKey.findProgramAddress(
    [Buffer.from("collateral_vault"), eventPda.toBuffer()],
    PROGRAM_ID
  );
}

export function findMintAuthorityPda(eventPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), eventPda.toBuffer()],
    PROGRAM_ID
  );
}

export function findTrueMintPda(eventPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("true_mint"), eventPda.toBuffer()],
    PROGRAM_ID
  );
}

export function findFalseMintPda(eventPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("false_mint"), eventPda.toBuffer()],
    PROGRAM_ID
  );
}

