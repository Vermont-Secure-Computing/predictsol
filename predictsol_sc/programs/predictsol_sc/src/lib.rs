use anchor_lang::prelude::*;
use anchor_lang::prelude::SolanaSysvar;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use anchor_lang::solana_program::program_pack::Pack;

use anchor_spl::token::{self, InitializeMint, Mint, MintTo, Token, TokenAccount};
use anchor_spl::token::spl_token;


declare_id!("BNn1nkWfB99z9b515Bk6aC5sDexX1Hf5BpfTL1zr7gtG");

// ======================================================
// PDA SEEDS
// ======================================================
pub const SEED_EVENT_COUNTER: &[u8] = b"event_counter";
pub const SEED_EVENT: &[u8] = b"event";
pub const SEED_TRUE_MINT: &[u8] = b"true_mint";
pub const SEED_FALSE_MINT: &[u8] = b"false_mint";
pub const SEED_MINT_AUTH: &[u8] = b"mint_authority";
pub const SEED_COLLATERAL_VAULT: &[u8] = b"collateral_vault";

#[inline(never)]
fn create_system_pda_0space<'info>(
    payer: &AccountInfo<'info>,
    pda: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    if pda.lamports() != 0 {
        return Ok(());
    }

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(0);

    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            pda.key,
            lamports,
            0,
            &anchor_lang::solana_program::system_program::ID,
        ),
        &[payer.clone(), pda.clone(), system_program.clone()],
        &[signer_seeds],
    )?;

    Ok(())
}

#[inline(never)]
fn create_and_init_spl_mint_pda<'info>(
    payer: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    rent_sysvar: &AccountInfo<'info>,
    mint_authority: &Pubkey,
    signer_seeds: &[&[u8]],
    decimals: u8,
) -> Result<()> {
    if mint.lamports() != 0 {
        return Ok(());
    }

    let mint_len = spl_token::state::Mint::LEN as u64;
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(mint_len as usize);

    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            mint.key,
            lamports,
            mint_len,
            token_program.key, // SPL Token Program owns the mint
        ),
        &[payer.clone(), mint.clone(), system_program.clone()],
        &[signer_seeds],
    )?;

    let cpi = CpiContext::new(
        token_program.clone(),
        InitializeMint {
            mint: mint.clone(),
            rent: rent_sysvar.clone(),
        },
    );

    token::initialize_mint(cpi, decimals, mint_authority, Some(mint_authority))?;

    Ok(())
}

// ======================================================
// PROGRAM
// ======================================================
#[program]
pub mod predictol_sc {
    use super::*;

    pub fn initialize_event_counter(ctx: Context<InitializeEventCounter>) -> Result<()> {
        ctx.accounts.counter.creator = ctx.accounts.creator.key();
        ctx.accounts.counter.count = 0;
        Ok(())
    }

    pub fn create_event_core(
        ctx: Context<CreateEventCore>,
        title: String,
        bet_end_time: i64,
        commit_end_time: i64,
        reveal_end_time: i64,
        truth_question: Option<Pubkey>,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        require!((10..=150).contains(&title.len()), PredictError::InvalidTitleLength);
        require!(bet_end_time > now, PredictError::InvalidBetEndTime);
        require!(bet_end_time < commit_end_time, PredictError::InvalidTimeOrder);
        require!(commit_end_time < reveal_end_time, PredictError::InvalidTimeOrder);

        let counter = &mut ctx.accounts.counter;
        let event_id = counter.count;

        let ev = &mut ctx.accounts.event;
        ev.creator = ctx.accounts.creator.key();
        ev.event_id = event_id;
        ev.title = title;
        ev.bet_end_time = bet_end_time;
        ev.commit_end_time = commit_end_time;
        ev.reveal_end_time = reveal_end_time;
        ev.created_at = now;
        ev.truth_question = truth_question.unwrap_or_default();
        ev.total_collateral_lamports = 0;
        ev.total_issued_per_side = 0;
        ev.resolved = false;
        ev.winning_option = 0;

        counter.count = counter.count.checked_add(1).ok_or(PredictError::MathOverflow)?;

        Ok(())
    }

    pub fn create_event_mints(ctx: Context<CreateEventMints>) -> Result<()> {
        let event_key = ctx.accounts.event.key();

        let payer_ai = ctx.accounts.creator.to_account_info();
        let system_ai = ctx.accounts.system_program.to_account_info();
        let token_ai = ctx.accounts.token_program.to_account_info();
        let rent_ai = ctx.accounts.rent.to_account_info();

        // 1) collateral vault PDA (system-owned, 0 space)
        let vault_bump = ctx.bumps.collateral_vault;
        let vault_seeds: [&[u8]; 3] = [
            SEED_COLLATERAL_VAULT,
            event_key.as_ref(),
            &[vault_bump],
        ];
        create_system_pda_0space(
            &payer_ai,
            &ctx.accounts.collateral_vault.to_account_info(),
            &system_ai,
            &vault_seeds,
        )?;

        // 2) TRUE mint PDA
        let true_bump = ctx.bumps.true_mint;
        let true_seeds: [&[u8]; 3] = [
            SEED_TRUE_MINT,
            event_key.as_ref(),
            &[true_bump],
        ];
        create_and_init_spl_mint_pda(
            &payer_ai,
            &ctx.accounts.true_mint.to_account_info(),
            &token_ai,
            &system_ai,
            &rent_ai,
            &ctx.accounts.mint_authority.key(),
            &true_seeds,
            9,
        )?;

        // 3) FALSE mint PDA
        let false_bump = ctx.bumps.false_mint;
        let false_seeds: [&[u8]; 3] = [
            SEED_FALSE_MINT,
            event_key.as_ref(),
            &[false_bump],
        ];
        create_and_init_spl_mint_pda(
            &payer_ai,
            &ctx.accounts.false_mint.to_account_info(),
            &token_ai,
            &system_ai,
            &rent_ai,
            &ctx.accounts.mint_authority.key(),
            &false_seeds,
            9,
        )?;

        // 4) Save addresses to event
        let ev = &mut ctx.accounts.event;
        ev.collateral_vault = ctx.accounts.collateral_vault.key();
        ev.true_mint = ctx.accounts.true_mint.key();
        ev.false_mint = ctx.accounts.false_mint.key();

        Ok(())
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, lamports: u64) -> Result<()> {
        require!(lamports > 0, PredictError::InvalidAmount);

        // Move lamports using System Program (you cannot mutate user lamports directly)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.collateral_vault.key(),
            lamports,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Accounting
        ctx.accounts.event.total_collateral_lamports = ctx
            .accounts
            .event
            .total_collateral_lamports
            .checked_add(lamports)
            .ok_or(PredictError::MathOverflow)?;

        Ok(())
    }


    pub fn mint_positions(ctx: Context<MintPositions>, amount: u64) -> Result<()> {
        let bump = ctx.bumps.mint_authority;
        let event_key = ctx.accounts.event.key();

        let seeds = &[
            SEED_MINT_AUTH,
            event_key.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        token::mint_to(ctx.accounts.mint_true_ctx().with_signer(signer), amount)?;
        token::mint_to(ctx.accounts.mint_false_ctx().with_signer(signer), amount)?;

        ctx.accounts.event.total_issued_per_side = ctx
            .accounts
            .event
            .total_issued_per_side
            .checked_add(amount)
            .ok_or(PredictError::MathOverflow)?;

        Ok(())
    }
}

// ======================================================
// STATE
// ======================================================
#[account]
pub struct EventCounter {
    pub creator: Pubkey,
    pub count: u64,
}

#[account]
pub struct Event {
    pub creator: Pubkey,
    pub event_id: u64,
    pub truth_question: Pubkey,
    pub title: String,
    pub bet_end_time: i64,
    pub commit_end_time: i64,
    pub reveal_end_time: i64,
    pub created_at: i64,
    pub total_collateral_lamports: u64,
    pub total_issued_per_side: u64,
    pub collateral_vault: Pubkey,
    pub true_mint: Pubkey,
    pub false_mint: Pubkey,
    pub resolved: bool,
    pub winning_option: u8,
}

// ======================================================
// CONTEXTS
// ======================================================
#[derive(Accounts)]
pub struct InitializeEventCounter<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init, payer = creator, space = 8 + 32 + 8, seeds = [SEED_EVENT_COUNTER, creator.key().as_ref()], bump)]
    pub counter: Account<'info, EventCounter>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEventCore<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub counter: Account<'info, EventCounter>,
    #[account(init, payer = creator, space = 8 + 512, seeds = [SEED_EVENT, creator.key().as_ref(), &counter.count.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEventMints<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub event: Account<'info, Event>,

    /// CHECK: This is a PDA that only acts as the mint authority signer.
    /// No data is read from this account; we only use it as a program-derived signer.
    #[account(seeds = [SEED_MINT_AUTH, event.key().as_ref()], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    /// CHECK: PDA mint account created & initialized in `create_event_mints`.
    #[account(mut, seeds = [SEED_TRUE_MINT, event.key().as_ref()], bump)]
    pub true_mint: UncheckedAccount<'info>,

    /// CHECK: PDA mint account created & initialized in `create_event_mints`.
    #[account(mut, seeds = [SEED_FALSE_MINT, event.key().as_ref()], bump)]
    pub false_mint: UncheckedAccount<'info>,

    /// CHECK: PDA system account created in `create_event_mints` (system-owned, space=0).
    #[account(mut, seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump
    )]
    pub collateral_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct MintPositions<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub event: Account<'info, Event>,

    /// CHECK: PDA mint authority signer; seeds constraint enforces the address.
    #[account(seeds = [SEED_MINT_AUTH, event.key().as_ref()], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub true_mint: Account<'info, Mint>,
    #[account(mut)]
    pub false_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_true_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_false_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}


// ======================================================
// CPI HELPERS
// ======================================================
impl<'info> MintPositions<'info> {
    fn mint_true_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            MintTo {
                mint: self.true_mint.to_account_info(),
                to: self.user_true_ata.to_account_info(),
                authority: self.mint_authority.to_account_info(),
            },
        )
    }

    fn mint_false_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            MintTo {
                mint: self.false_mint.to_account_info(),
                to: self.user_false_ata.to_account_info(),
                authority: self.mint_authority.to_account_info(),
            },
        )
    }
}

// ======================================================
// ERRORS
// ======================================================
#[error_code]
pub enum PredictError {
    #[msg("Invalid title length")]
    InvalidTitleLength,
    #[msg("Invalid bet end time")]
    InvalidBetEndTime,
    #[msg("Invalid time order")]
    InvalidTimeOrder,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid amount")]
    InvalidAmount,
}
