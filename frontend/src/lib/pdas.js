import { PublicKey } from "@solana/web3.js";
import { getConstants } from "../constants";

function predictProgramId() {
  return getConstants().PREDICTSOL_PROGRAM_ID;
}

export async function findCounterPda(creatorPubkey) {
  return PublicKey.findProgramAddress(
    [Buffer.from("event_counter"), creatorPubkey.toBuffer()],
    predictProgramId()
  );
}

export async function findEventPda(creatorPubkey, eventIdU64LeBuffer) {
  return PublicKey.findProgramAddress(
    [Buffer.from("event"), creatorPubkey.toBuffer(), eventIdU64LeBuffer],
    predictProgramId()
  );
}

export async function findCollateralVaultPda(eventPda) {
  return PublicKey.findProgramAddress(
    [Buffer.from("collateral_vault"), eventPda.toBuffer()],
    predictProgramId()
  );
}

export function findMintAuthorityPda(eventPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), eventPda.toBuffer()],
    predictProgramId()
  );
}

export function findTrueMintPda(eventPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("true_mint"), eventPda.toBuffer()],
    predictProgramId()
  );
}

export function findFalseMintPda(eventPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("false_mint"), eventPda.toBuffer()],
    predictProgramId()
  );
}
