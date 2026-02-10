import {
    createMetadataAccountV3,
    findMetadataPda,
  } from "@metaplex-foundation/mpl-token-metadata";
  
  import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
  import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
  
  /**
   * Creates Metaplex metadata for a fungible SPL token.
   * This runs client-side (pump.fun style).
   */
  export async function createTokenMetadata({
    connection,
    wallet,
    mint,
    name,
    symbol,
    uri,
  }) {
    const umi = createUmi(connection.rpcEndpoint).use(
      walletAdapterIdentity(wallet)
    );
  
    const metadataPda = findMetadataPda(umi, { mint });
  
    const tx = createMetadataAccountV3(umi, {
      metadata: metadataPda,
      mint,
      mintAuthority: umi.identity,
      payer: umi.identity,
      updateAuthority: umi.identity,
      data: {
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      },
      isMutable: true,
    });
  
    await tx.sendAndConfirm(umi);
  }
  