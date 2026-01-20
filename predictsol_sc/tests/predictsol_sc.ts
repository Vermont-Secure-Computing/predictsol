import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredictolSc } from "../target/types/predictol_sc";

describe("predictol_sc", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PredictolSc as Program<PredictolSc>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initializeEventCounter()
    console.log("Your transaction signature", tx);
  });
});
