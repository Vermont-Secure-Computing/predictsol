import { PublicKey } from "@solana/web3.js";
import { getConstants } from "../constants";

export async function findTruthCounterPda(asker) {
  const c = getConstants();
  return PublicKey.findProgramAddress(
    [Buffer.from("question_counter"), asker.toBuffer()],
    c.TRUTH_NETWORK_PROGRAM_ID
  );
}

export function findTruthQuestionPda(asker, questionIdU64LeBuf) {
  const c = getConstants();
  return PublicKey.findProgramAddressSync(
    [Buffer.from("question"), asker.toBuffer(), questionIdU64LeBuf],
    c.TRUTH_NETWORK_PROGRAM_ID
  );
}

export async function findTruthVaultPda(questionPda) {
  const c = getConstants();
  return PublicKey.findProgramAddress(
    [Buffer.from("vault"), questionPda.toBuffer()],
    c.TRUTH_NETWORK_PROGRAM_ID
  );
}
