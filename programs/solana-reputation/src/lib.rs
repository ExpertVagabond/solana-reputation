use anchor_lang::prelude::*;

declare_id!("ChWH3iGNS4cwrpH1jz1BRVZqVteS177yr6Pe4Y8MFBQ");

#[program]
pub mod solana_reputation {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.total_wallets = 0;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn register_wallet(ctx: Context<RegisterWallet>) -> Result<()> {
        let rep = &mut ctx.accounts.wallet_reputation;
        rep.wallet = ctx.accounts.wallet.key();
        rep.config = ctx.accounts.config.key();
        rep.score = 0;
        rep.endorsements = 0;
        rep.penalties = 0;
        rep.last_updated = Clock::get()?.unix_timestamp;
        rep.bump = ctx.bumps.wallet_reputation;

        let config = &mut ctx.accounts.config;
        config.total_wallets = config.total_wallets.checked_add(1).ok_or(RepError::Overflow)?;
        Ok(())
    }

    pub fn endorse(ctx: Context<Endorse>, amount: i64, reason_hash: [u8; 32]) -> Result<()> {
        require!(amount > 0, RepError::InvalidAmount);
        let now = Clock::get()?.unix_timestamp;

        let endorsement = &mut ctx.accounts.endorsement;
        endorsement.from = ctx.accounts.from.key();
        endorsement.to = ctx.accounts.wallet_reputation.wallet;
        endorsement.config = ctx.accounts.config.key();
        endorsement.amount = amount;
        endorsement.reason_hash = reason_hash;
        endorsement.timestamp = now;
        endorsement.bump = ctx.bumps.endorsement;

        let rep = &mut ctx.accounts.wallet_reputation;
        rep.score = rep.score.checked_add(amount).ok_or(RepError::Overflow)?;
        rep.endorsements = rep.endorsements.checked_add(1).ok_or(RepError::Overflow)?;
        rep.last_updated = now;
        Ok(())
    }

    pub fn penalize(ctx: Context<Penalize>, amount: i64, reason_hash: [u8; 32]) -> Result<()> {
        require!(amount > 0, RepError::InvalidAmount);
        let now = Clock::get()?.unix_timestamp;

        let rep = &mut ctx.accounts.wallet_reputation;
        rep.score = rep.score.checked_sub(amount).ok_or(RepError::Overflow)?;
        rep.penalties = rep.penalties.checked_add(1).ok_or(RepError::Overflow)?;
        rep.last_updated = now;

        emit!(PenaltyEvent {
            wallet: rep.wallet,
            authority: ctx.accounts.authority.key(),
            amount,
            reason_hash,
            timestamp: now,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + ReputationConfig::INIT_SPACE,
        seeds = [b"config", authority.key().as_ref()], bump)]
    pub config: Account<'info, ReputationConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterWallet<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the wallet being registered
    pub wallet: AccountInfo<'info>,
    #[account(mut, seeds = [b"config", config.authority.as_ref()], bump = config.bump)]
    pub config: Account<'info, ReputationConfig>,
    #[account(init, payer = payer, space = 8 + WalletReputation::INIT_SPACE,
        seeds = [b"reputation", config.key().as_ref(), wallet.key().as_ref()], bump)]
    pub wallet_reputation: Account<'info, WalletReputation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Endorse<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    pub config: Account<'info, ReputationConfig>,
    #[account(mut, seeds = [b"reputation", config.key().as_ref(), wallet_reputation.wallet.as_ref()], bump = wallet_reputation.bump)]
    pub wallet_reputation: Account<'info, WalletReputation>,
    #[account(init, payer = from, space = 8 + Endorsement::INIT_SPACE,
        seeds = [b"endorsement", from.key().as_ref(), wallet_reputation.wallet.as_ref()], bump)]
    pub endorsement: Account<'info, Endorsement>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Penalize<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config", config.authority.as_ref()], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ReputationConfig>,
    #[account(mut, seeds = [b"reputation", config.key().as_ref(), wallet_reputation.wallet.as_ref()], bump = wallet_reputation.bump)]
    pub wallet_reputation: Account<'info, WalletReputation>,
}

#[account]
#[derive(InitSpace)]
pub struct ReputationConfig {
    pub authority: Pubkey,
    pub total_wallets: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WalletReputation {
    pub wallet: Pubkey,
    pub config: Pubkey,
    pub score: i64,
    pub endorsements: u32,
    pub penalties: u32,
    pub last_updated: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Endorsement {
    pub from: Pubkey,
    pub to: Pubkey,
    pub config: Pubkey,
    pub amount: i64,
    pub reason_hash: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}

#[event]
pub struct PenaltyEvent {
    pub wallet: Pubkey,
    pub authority: Pubkey,
    pub amount: i64,
    pub reason_hash: [u8; 32],
    pub timestamp: i64,
}

#[error_code]
pub enum RepError {
    #[msg("Amount must be positive")]
    InvalidAmount,
    #[msg("Overflow")]
    Overflow,
}
