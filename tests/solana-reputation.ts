import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { SolanaReputation } from "../target/types/solana_reputation";

describe("solana-reputation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .solanaReputation as Program<SolanaReputation>;
  const authority = provider.wallet as anchor.Wallet;

  let configPda: PublicKey;
  let configBump: number;
  let walletReputationPda: PublicKey;
  let walletReputationBump: number;

  const targetWallet = Keypair.generate();
  const endorser = Keypair.generate();
  const unauthorized = Keypair.generate();

  const ENDORSE_AMOUNT = new anchor.BN(10);
  const PENALIZE_AMOUNT = new anchor.BN(5);
  const REASON_HASH = Array.from(Buffer.alloc(32, 0xab));

  before(async () => {
    // Derive config PDA
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), authority.publicKey.toBuffer()],
      program.programId
    );

    // Airdrop to endorser and unauthorized
    const sig1 = await provider.connection.requestAirdrop(
      endorser.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    const sig2 = await provider.connection.requestAirdrop(
      unauthorized.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig1);
    await provider.connection.confirmTransaction(sig2);
  });

  it("initialize — creates config with authority", async () => {
    await program.methods
      .initialize()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.reputationConfig.fetch(configPda);
    assert.ok(config.authority.equals(authority.publicKey));
    assert.equal(config.totalWallets.toNumber(), 0);
    assert.equal(config.bump, configBump);
  });

  it("register_wallet — registers a profile", async () => {
    // Derive wallet reputation PDA
    [walletReputationPda, walletReputationBump] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("reputation"),
          configPda.toBuffer(),
          targetWallet.publicKey.toBuffer(),
        ],
        program.programId
      );

    await program.methods
      .registerWallet()
      .accounts({
        payer: authority.publicKey,
        wallet: targetWallet.publicKey,
        config: configPda,
        walletReputation: walletReputationPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const rep = await program.account.walletReputation.fetch(
      walletReputationPda
    );
    assert.ok(rep.wallet.equals(targetWallet.publicKey));
    assert.ok(rep.config.equals(configPda));
    assert.equal(rep.score.toNumber(), 0);
    assert.equal(rep.endorsements, 0);
    assert.equal(rep.penalties, 0);
    assert.equal(rep.bump, walletReputationBump);

    // Verify total_wallets incremented
    const config = await program.account.reputationConfig.fetch(configPda);
    assert.equal(config.totalWallets.toNumber(), 1);
  });

  it("endorse — endorse a profile, score increases", async () => {
    // Derive endorsement PDA
    const [endorsementPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("endorsement"),
        endorser.publicKey.toBuffer(),
        targetWallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .endorse(ENDORSE_AMOUNT, REASON_HASH)
      .accounts({
        from: endorser.publicKey,
        config: configPda,
        walletReputation: walletReputationPda,
        endorsement: endorsementPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([endorser])
      .rpc();

    const rep = await program.account.walletReputation.fetch(
      walletReputationPda
    );
    assert.equal(rep.score.toNumber(), ENDORSE_AMOUNT.toNumber());
    assert.equal(rep.endorsements, 1);

    // Verify endorsement record
    const endorsement = await program.account.endorsement.fetch(
      endorsementPda
    );
    assert.ok(endorsement.from.equals(endorser.publicKey));
    assert.ok(endorsement.to.equals(targetWallet.publicKey));
    assert.ok(endorsement.config.equals(configPda));
    assert.equal(endorsement.amount.toNumber(), ENDORSE_AMOUNT.toNumber());
    assert.deepEqual(endorsement.reasonHash, REASON_HASH);
  });

  it("penalize — penalize a profile, score decreases", async () => {
    const repBefore = await program.account.walletReputation.fetch(
      walletReputationPda
    );
    const scoreBefore = repBefore.score.toNumber();

    await program.methods
      .penalize(PENALIZE_AMOUNT, REASON_HASH)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        walletReputation: walletReputationPda,
      })
      .rpc();

    const rep = await program.account.walletReputation.fetch(
      walletReputationPda
    );
    assert.equal(
      rep.score.toNumber(),
      scoreBefore - PENALIZE_AMOUNT.toNumber()
    );
    assert.equal(rep.penalties, 1);
  });

  it("error: unauthorized penalize", async () => {
    // Attempt to penalize using a non-authority signer
    // The config PDA is seeded with the real authority, so using a different
    // signer will fail the has_one = authority constraint
    try {
      await program.methods
        .penalize(new anchor.BN(1), REASON_HASH)
        .accounts({
          authority: unauthorized.publicKey,
          config: configPda,
          walletReputation: walletReputationPda,
        })
        .signers([unauthorized])
        .rpc();
      assert.fail("Should have thrown an unauthorized error");
    } catch (err: any) {
      // has_one constraint violation produces a ConstraintHasOne error (2001)
      // or the error message varies by anchor version
      const errStr = err.toString();
      assert.ok(
        errStr.includes("ConstraintHasOne") ||
          errStr.includes("has_one") ||
          errStr.includes("2001") ||
          errStr.includes("A has one constraint was violated"),
        `Expected has_one constraint error, got: ${errStr}`
      );
    }
  });
});
