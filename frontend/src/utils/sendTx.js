function isAlreadyProcessedError(e) {
  const m = (e?.message || String(e)).toLowerCase();
  return (
    m.includes("already been processed") ||
    m.includes("already processed") ||
    m.includes("alreadyprocessed")
  );
}

function isBlockhashError(e) {
  const m = (e?.message || String(e)).toLowerCase();
  return m.includes("blockhash not found") || m.includes("transaction expired");
}

async function confirmByLatest(conn, sig, latest) {
  return conn.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed"
  );
}

export async function sendAndConfirmSafe({ conn, wallet, tx, label, simulate }) {
  tx.feePayer = wallet.publicKey;

  const latest = await conn.getLatestBlockhash("finalized");
  tx.recentBlockhash = latest.blockhash;

  if (simulate) {
    console.log(`[${label}] simulating...`);
    await simulate(conn, tx, label);
  }

  try {
    console.log(`[${label}] wallet sending...`);
    const sig = await wallet.sendTransaction(tx, conn, {
      skipPreflight: false,
      preflightCommitment: "processed",
      maxRetries: 3,
    });

    console.log(`[${label}] sig:`, sig);
    await confirmByLatest(conn, sig, latest);
    console.log(`[${label}] confirmed`);
    return sig;
  } catch (e) {
    if (isAlreadyProcessedError(e)) {
      throw new Error("This action was already submitted. Please wait a moment and refresh.");
    }

    if (isBlockhashError(e)) {
      console.warn(`[${label}] blockhash issue; retrying once with fresh blockhash...`);
      const latest2 = await conn.getLatestBlockhash("finalized");
      tx.recentBlockhash = latest2.blockhash;

      const sig2 = await wallet.sendTransaction(tx, conn, {
        skipPreflight: false,
        preflightCommitment: "processed",
        maxRetries: 3,
      });

      await confirmByLatest(conn, sig2, latest2);
      return sig2;
    }

    throw e;
  }
}

