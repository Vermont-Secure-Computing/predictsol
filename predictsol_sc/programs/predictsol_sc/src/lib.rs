use anchor_lang::prelude::*;
use anchor_lang::prelude::pubkey;
use anchor_lang::solana_program::{ instruction::{AccountMeta, Instruction}, program::invoke_signed, program_pack::Pack, system_instruction};

use anchor_spl::token::{self, Burn, InitializeMint, Mint, MintTo, Token, TokenAccount};
use anchor_spl::token::spl_token;

// for metadata
pub const METADATA_PROGRAM_ID: Pubkey = pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Import the truth_network program
declare_program!(truth_network);
use truth_network::{ 
    program::TruthNetwork,
    cpi::accounts::FinalizeVoting,
    //cpi::accounts::DeleteExpiredQuestion, to be used later
    cpi::finalize_voting,
    //cpi::delete_expired_question, to be used later
};

// Import the Truth-Network program
use truth_network::accounts::Question;

pub const HOUSE_WALLET: Pubkey = pubkey!("4yuDDnFAavYGyBBcWb2HkAcD5bgoZRvRJZHUgrXTWHGX");


declare_id!("E9o834tLQRWpscJNMSq3C4wUyoXPwymAS3ZDfjuK9tpu");

// ======================================================
// PDA SEEDS
// ======================================================
pub const SEED_EVENT_COUNTER: &[u8] = b"event_counter";
pub const SEED_EVENT: &[u8] = b"event";
pub const SEED_TRUE_MINT: &[u8] = b"true_mint";
pub const SEED_FALSE_MINT: &[u8] = b"false_mint";
pub const SEED_MINT_AUTH: &[u8] = b"mint_authority";
pub const SEED_COLLATERAL_VAULT: &[u8] = b"collateral_vault";

pub const DEFAULT_CONSENSUS_THRESHOLD_BPS: u16 = 8000; // 80.00%
pub const BPS_DENOM: u64 = 10_000;

pub const RESULT_PENDING: u8 = 0;
pub const RESULT_RESOLVED_WINNER: u8 = 1;
pub const RESULT_FINALIZED_NO_VOTES: u8 = 2;
pub const RESULT_FINALIZED_TIE: u8 = 3;
pub const RESULT_FINALIZED_BELOW_THRESHOLD: u8 = 4;

pub const REDEEM_FEE_BPS: u64 = 0; // no more fee on redeem

pub const UNCLAIMED_SWEEP_DELAY_SECS: i64 = 10 * 60; //15 * 24 * 60 * 60; // 15 days 

// uri token metadata
pub const TRUE_TOKEN_URI: &str = "https://black-generous-emu-9.mypinata.cloud/ipfs/bafkreicy7hmfoqp2capsz5f4lsr5nbqtyhldofl2xbrkcaynudw3qqbhiq";
pub const FALSE_TOKEN_URI: &str = "https://black-generous-emu-9.mypinata.cloud/ipfs/bafkreieywt5nxjcrcibmdedwssrpkygln57h3ddq656azeuexp7dbxl2fa";

#[inline(always)]
fn vault_keep_lamports() -> Result<u64> {
    Ok(Rent::get()?.minimum_balance(0) as u64)
}

#[inline(never)]
fn create_system_pda_0space<'info>(
    payer: &AccountInfo<'info>,
    pda: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let required_lamports = Rent::get()?.minimum_balance(0) as u64;
    let current = pda.lamports();

    // Already funded enough: nothing to do.
    if current >= required_lamports {
        return Ok(());
    }

    // PDA does not exist yet (0 lamports) -> create it rent-exempt.
    if current == 0 {
        invoke_signed(
            &system_instruction::create_account(
                payer.key,
                pda.key,
                required_lamports,
                0, // 0 space
                &anchor_lang::solana_program::system_program::ID,
            ),
            &[
                payer.clone(),
                pda.clone(),
                system_program.clone(),
            ],
            &[signer_seeds],
        )?;
        return Ok(());
    }

    // PDA already exists but is underfunded -> top up with a transfer.
    let top_up = required_lamports.saturating_sub(current);

    anchor_lang::solana_program::program::invoke(
        &system_instruction::transfer(payer.key, pda.key, top_up),
        &[
            payer.clone(),
            pda.clone(),
            system_program.clone(),
        ],
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

#[inline(always)]
fn payout_after_fee(amount: u64) -> Result<u64> {
    let fee = amount
        .checked_mul(REDEEM_FEE_BPS).ok_or_else(|| error!(PredictError::MathOverflow))?
        .checked_div(BPS_DENOM).ok_or_else(|| error!(PredictError::MathOverflow))?;
    amount.checked_sub(fee).ok_or_else(|| error!(PredictError::MathOverflow))
}

// metadata helper - title prefix
fn short_prefix(title: &str) -> String {
    title
        .chars()
        .filter(|c| !c.is_whitespace())
        .take(5)
        .collect()
}

const IX_CREATE_METADATA_ACCOUNT_V3: u8 = 33;

fn ix_create_metadata_account_v3(
    metadata: Pubkey,
    mint: Pubkey,
    mint_authority: Pubkey,
    payer: Pubkey,
    update_authority: Pubkey,
    data: DataV2,
    is_mutable: bool,
) -> Result<Instruction> {
    let args = CreateMetadataAccountArgsV3 {
        data,
        is_mutable,
        collection_details: None,
    };

    let mut ix_data = vec![IX_CREATE_METADATA_ACCOUNT_V3];
    ix_data.extend_from_slice(&args.try_to_vec()?);

    let accounts = vec![
        AccountMeta::new(metadata, false),                 
        AccountMeta::new_readonly(mint, false),          
        AccountMeta::new_readonly(mint_authority, true),   
        AccountMeta::new(payer, true),                   
        AccountMeta::new_readonly(update_authority, true), 
        AccountMeta::new_readonly(system_program::ID, false),
        AccountMeta::new_readonly(sysvar::rent::ID, false),
    ];

    Ok(Instruction {
        program_id: METADATA_PROGRAM_ID,
        accounts,
        data: ix_data,
    })
}


// Borsh / Anchor-serialize structs
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Creator {
    pub address: Pubkey,
    pub verified: bool,
    pub share: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Collection {
    pub verified: bool,
    pub key: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum UseMethod {
    Burn,
    Multiple,
    Single,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Uses {
    pub use_method: UseMethod,
    pub remaining: u64,
    pub total: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DataV2 {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub seller_fee_basis_points: u16,
    pub creators: Option<Vec<Creator>>,
    pub collection: Option<Collection>,
    pub uses: Option<Uses>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum CollectionDetails {
    V1 { size: u64 },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMetadataAccountArgsV3 {
    pub data: DataV2,
    pub is_mutable: bool,
    pub collection_details: Option<CollectionDetails>,
}


// For the event category
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Politics = 0,
    Finance = 1,
    Sports = 2,
    Other = 3,
}

// ============================================================
// Create event, create mint, buy token and mint token helpers
// ============================================================
fn compute_fee_splits(lamports: u64) -> Result<(u64, u64, u64, u64, u64)> {
    let fee = lamports / 100; // 1%
    let net = lamports.checked_sub(fee).ok_or(PredictError::MathOverflow)?;

    let third = fee / 3;
    let truth_cut = third;
    let creator_cut = third;
    let house_cut = fee
        .checked_sub(truth_cut.checked_add(creator_cut).ok_or(PredictError::MathOverflow)?)
        .ok_or(PredictError::MathOverflow)?;

    Ok((fee, truth_cut, creator_cut, house_cut, net))
}

fn transfer_in<'info>(
    user: &Signer<'info>,
    vault: &SystemAccount<'info>,
    system_program: &Program<'info, System>,
    lamports: u64,
) -> Result<()> {
    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &user.key(),
        &vault.key(),
        lamports,
    );

    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            user.to_account_info(),
            vault.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;

    Ok(())
}

fn transfer_from_vault_to_truth<'info>(
    collateral_vault: &AccountInfo<'info>,
    truth_vault: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    event_key: &Pubkey,
    vault_bump: u8,
    lamports: u64,
) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }

    let seeds: [&[u8]; 3] = [
        SEED_COLLATERAL_VAULT,
        event_key.as_ref(),
        &[vault_bump],
    ];

    invoke_signed(
        &system_instruction::transfer(collateral_vault.key, truth_vault.key, lamports),
        &[
            collateral_vault.clone(),
            truth_vault.clone(),
            system_program.clone(),
        ],
        &[&seeds],
    )?;

    Ok(())
}

#[inline(never)]
fn transfer_from_collateral_vault<'info>(
    collateral_vault: &AccountInfo<'info>,
    dest: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    event_key: &Pubkey,
    vault_bump: u8,
    lamports: u64,
) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }

    let seeds: [&[u8]; 3] = [
        SEED_COLLATERAL_VAULT,
        event_key.as_ref(),
        &[vault_bump],
    ];

    invoke_signed(
        &system_instruction::transfer(collateral_vault.key, dest.key, lamports),
        &[
            collateral_vault.clone(),
            dest.clone(),
            system_program.clone(),
        ],
        &[&seeds],
    )?;

    Ok(())
}


#[inline(never)]
fn sweep_house_commission<'info>(
    ev: &mut Account<'info, Event>,
    collateral_vault: &AccountInfo<'info>,
    house_treasury: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    vault_bump: u8,
) -> Result<()> {
    let amount = ev.pending_house_commission;
    if amount == 0 {
        return Ok(());
    }

    // rent safety
    let keep = vault_keep_lamports()?;
    let vault_lamports = collateral_vault.lamports();
    require!(
        vault_lamports >= keep.saturating_add(amount),
        PredictError::VaultInsufficientFunds
    );

    let event_key = ev.key();

    transfer_from_collateral_vault(
        collateral_vault,
        house_treasury,
        system_program,
        &event_key,
        vault_bump,
        amount,
    )?;

    ev.pending_house_commission = 0;
    Ok(())
}


fn mint_net_positions<'info>(
    accs: &BuyPositionsWithFee<'info>,
    net: u64,
    mint_auth_bump: u8,
) -> Result<()> {
    let event_key = accs.event.key();
    let seeds = &[
        SEED_MINT_AUTH,
        event_key.as_ref(),
        &[mint_auth_bump],
    ];
    let signer = &[&seeds[..]];

    token::mint_to(
        CpiContext::new(
            accs.token_program.to_account_info(),
            token::MintTo {
                mint: accs.true_mint.to_account_info(),
                to: accs.user_true_ata.to_account_info(),
                authority: accs.mint_authority.to_account_info(),
            },
        )
        .with_signer(signer),
        net,
    )?;

    token::mint_to(
        CpiContext::new(
            accs.token_program.to_account_info(),
            token::MintTo {
                mint: accs.false_mint.to_account_info(),
                to: accs.user_false_ata.to_account_info(),
                authority: accs.mint_authority.to_account_info(),
            },
        )
        .with_signer(signer),
        net,
    )?;

    Ok(())
}

fn apply_accounting(
    ev: &mut Account<Event>,
    deposited: u64,
    net: u64,
    truth_cut: u64,
    creator_cut: u64,
    house_cut: u64,
) -> Result<()> {
    ev.total_collateral_lamports = ev
        .total_collateral_lamports
        .checked_add(deposited)
        .ok_or(PredictError::MathOverflow)?;

    ev.outstanding_true = ev
        .outstanding_true
        .checked_add(net)
        .ok_or(PredictError::MathOverflow)?;

    ev.outstanding_false = ev
        .outstanding_false
        .checked_add(net)
        .ok_or(PredictError::MathOverflow)?;

    ev.total_issued_per_side = ev
        .total_issued_per_side
        .checked_add(net)
        .ok_or(PredictError::MathOverflow)?;

    ev.total_truth_commission_sent = ev
        .total_truth_commission_sent
        .checked_add(truth_cut)
        .ok_or(PredictError::MathOverflow)?;

    ev.pending_creator_commission = ev
        .pending_creator_commission
        .checked_add(creator_cut)
        .ok_or(PredictError::MathOverflow)?;

    ev.pending_house_commission = ev
        .pending_house_commission
        .checked_add(house_cut)
        .ok_or(PredictError::MathOverflow)?;

    Ok(())
}

fn no_outstanding_tokens(ev: &Event) -> bool {
    if !ev.resolved {
        return ev.outstanding_true == 0 && ev.outstanding_false == 0;
    }

    // Winner case: only winning side must be fully redeemed
    if ev.result_status == RESULT_RESOLVED_WINNER {
        return match ev.winning_option {
            1 => ev.outstanding_true == 0,
            2 => ev.outstanding_false == 0,
            _ => false,
        };
    }

    // No-winner cases: allow delete only if both sides redeemed
    ev.outstanding_true == 0 && ev.outstanding_false == 0
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
        category: u8,
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
        require!(category <= 3, PredictError::InvalidCategory);

        let counter = &mut ctx.accounts.counter;
        let event_id = counter.count;

        let ev = &mut ctx.accounts.event;
        ev.creator = ctx.accounts.creator.key();
        ev.event_id = event_id;
        ev.title = title;
        ev.category = category;
        ev.bet_end_time = bet_end_time;
        ev.commit_end_time = commit_end_time;
        ev.reveal_end_time = reveal_end_time;
        ev.created_at = now;
        ev.truth_question = truth_question.unwrap_or_default();
        ev.total_collateral_lamports = 0;
        ev.total_issued_per_side = 0;
        ev.outstanding_true = 0;
        ev.outstanding_false = 0;
        ev.resolved = false;
        ev.winning_option = 0;
        ev.winning_percent_bps = 0;
        ev.votes_option_1 = 0;
        ev.votes_option_2 = 0;
        ev.consensus_threshold_bps = DEFAULT_CONSENSUS_THRESHOLD_BPS;
        ev.resolved_at = 0;
        ev.result_status = RESULT_PENDING;
        ev.total_truth_commission_sent = 0;
        ev.pending_creator_commission = 0;
        ev.pending_house_commission = 0;
        ev.unclaimed_swept = false;
        ev.swept_at = 0;

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

        // ---------- Create Metadata for TRUE ----------
        let prefix = short_prefix(&ctx.accounts.event.title);
        let true_name = format!("PS-{}-TRUE", prefix);
        let false_name = format!("PS-{}-FALSE", prefix);

        let true_symbol = "TRUE".to_string();
        let false_symbol = "FALSE".to_string();

        //let uri = "".to_string(); // blank for now
        let true_uri = TRUE_TOKEN_URI.to_string();
        let false_uri = FALSE_TOKEN_URI.to_string();

        let true_metadata = ctx.accounts.true_metadata.key();
        let false_metadata = ctx.accounts.false_metadata.key();


        // signer seeds for mint authority
        let auth_bump = ctx.bumps.mint_authority;
        let auth_seeds = &[
            SEED_MINT_AUTH,
            event_key.as_ref(),
            &[auth_bump],
        ];
        let signer = &[&auth_seeds[..]];

        // Build metadata struct
        let true_data = DataV2 {
            name: true_name,
            symbol: true_symbol,
            uri: true_uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let false_data = DataV2 {
            name: false_name,
            symbol: false_symbol,
            uri: false_uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        // TRUE metadata CPI
        let ix = ix_create_metadata_account_v3(
            true_metadata,
            ctx.accounts.true_mint.key(),
            ctx.accounts.mint_authority.key(),
            ctx.accounts.creator.key(),
            ctx.accounts.mint_authority.key(), // update authority = same PDA
            true_data,
            true, // is_mutable
        )?;

        invoke_signed(
            &ix,
            &[
                //ctx.accounts.metadata_program.to_account_info(),
                ctx.accounts.true_metadata.to_account_info(),
                ctx.accounts.true_mint.to_account_info(),
                ctx.accounts.mint_authority.to_account_info(),
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.mint_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            signer,
        )?;


        // FALSE metadata CPI
        let ix = ix_create_metadata_account_v3(
            false_metadata,
            ctx.accounts.false_mint.key(),
            ctx.accounts.mint_authority.key(),
            ctx.accounts.creator.key(),
            ctx.accounts.mint_authority.key(),
            false_data,
            true, // is_mutable
        )?;

        invoke_signed(
            &ix,
            &[
                //ctx.accounts.metadata_program.to_account_info(),
                ctx.accounts.false_metadata.to_account_info(),
                ctx.accounts.false_mint.to_account_info(),
                ctx.accounts.mint_authority.to_account_info(),
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.mint_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            signer,
        )?;


        // 4) Save addresses to event
        let ev = &mut ctx.accounts.event;
        ev.collateral_vault = ctx.accounts.collateral_vault.key();
        ev.true_mint = ctx.accounts.true_mint.key();
        ev.false_mint = ctx.accounts.false_mint.key();

        Ok(())
    }

    pub fn buy_positions_with_fee(ctx: Context<BuyPositionsWithFee>, lamports: u64) -> Result<()> {
        require!(lamports > 0, PredictError::InvalidAmount);

        // 1) verify truth vault matches the truth question
        require_keys_eq!(
            ctx.accounts.truth_network_vault.key(),
            ctx.accounts.truth_network_question.vault_address,
            PredictError::InvalidTruthVault
        );

        // 2) fee split
        let (fee, truth_cut, creator_cut, house_cut, net) = compute_fee_splits(lamports)?;

        // 3) transfer user -> collateral vault (full lamports)
        transfer_in(&ctx.accounts.user, &ctx.accounts.collateral_vault, &ctx.accounts.system_program, lamports)?;

        // 4) move only truth cut to truth vault
        let vault_bump = ctx.bumps.collateral_vault;
        transfer_from_vault_to_truth(
            &ctx.accounts.collateral_vault.to_account_info(),
            &ctx.accounts.truth_network_vault.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.event.key(),
            vault_bump,
            truth_cut,
        )?;

        // 5) mint net TRUE + FALSE
        let mint_auth_bump = ctx.bumps.mint_authority;
        mint_net_positions(&ctx.accounts, net, mint_auth_bump)?;


        // 6) accounting
        apply_accounting(&mut ctx.accounts.event, lamports, net, truth_cut, creator_cut, house_cut)?;

        Ok(())
    }



    pub fn redeem_pair_while_active(ctx: Context<RedeemPairWhileActive>, amount: u64) -> Result<()> {
        require!(amount > 0, PredictError::InvalidAmount);

        // Must be during betting period ("pair redeem")
        let now = Clock::get()?.unix_timestamp;
        require!(now < ctx.accounts.event.bet_end_time, PredictError::BettingPeriodEnded);

        // the event should not be resolved
        require!(!ctx.accounts.event.resolved, PredictError::EventAlreadyResolved);

        // User wallet must have enough TRUE and FALSE to burn
        require!(ctx.accounts.user_true_ata.amount >= amount, PredictError::InsufficientTrueBalance);
        require!(ctx.accounts.user_false_ata.amount >= amount, PredictError::InsufficientFalseBalance);

        // Burn TRUE tokens
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.true_mint.to_account_info(),
                    from: ctx.accounts.user_true_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Burn FALSE tokens
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.false_mint.to_account_info(),
                    from: ctx.accounts.user_false_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // fee = 1% (100 bps)
        let fee = amount
            .checked_mul(REDEEM_FEE_BPS).ok_or(PredictError::MathOverflow)?
            .checked_div(BPS_DENOM).ok_or(PredictError::MathOverflow)?;

        let payout = amount.checked_sub(fee).ok_or(PredictError::MathOverflow)?;

        // Identify the "zero-line"— the amount of money that must stay 
        // in the account so it isn't deleted by the network.
        // Fetches the current rent configuration from the Solana network
        let keep = vault_keep_lamports()?;
        let vault_lamports = ctx.accounts.collateral_vault.to_account_info().lamports();

        require!(
            vault_lamports >= keep.saturating_add(payout),
            PredictError::VaultInsufficientFunds
        );

        // Vault PDA signs the SOL transfer
        let event_key = ctx.accounts.event.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let vault_seeds: [&[u8]; 3] = [
            SEED_COLLATERAL_VAULT,
            event_key.as_ref(),
            &[vault_bump],
        ];

        invoke_signed(
            &system_instruction::transfer(
                &ctx.accounts.collateral_vault.key(),
                &ctx.accounts.user.key(),
                payout,
            ),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.user.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&vault_seeds],
        )?;

        // Accounting updates
        // Keeps event state updated for later redemption stages
        ctx.accounts.event.total_collateral_lamports = ctx.accounts.event
            .total_collateral_lamports
            .checked_sub(payout)
            .ok_or(PredictError::MathOverflow)?;

        // ctx.accounts.event.total_issued_per_side = ctx.accounts.event
        //     .total_issued_per_side
        //     .checked_sub(amount)
        //     .ok_or(PredictError::MathOverflow)?;

        ctx.accounts.event.outstanding_true = ctx.accounts.event
            .outstanding_true
            .checked_sub(amount)
            .ok_or(PredictError::MathOverflow)?;

        ctx.accounts.event.outstanding_false = ctx.accounts.event
            .outstanding_false
            .checked_sub(amount)
            .ok_or(PredictError::MathOverflow)?;

        Ok(())
    }


    pub fn fetch_and_store_winner(ctx: Context<FetchAndStoreWinner>) -> Result<()> {
        let ev = &mut ctx.accounts.event;
        let q = &mut ctx.accounts.truth_network_question;

        let now = Clock::get()?.unix_timestamp;

        // Betting must be finished
        require!(now >= ev.bet_end_time, PredictError::BettingStillActive);

        // Don't allow calling twice
        require!(!ev.resolved, PredictError::EventAlreadyResolved);

        require_keys_eq!(ev.truth_question, q.key(), PredictError::TruthQuestionMismatch);

        require!(now >= q.reveal_end_time, PredictError::TruthVotingStillActive);

        // CPI: finalize voting on Truth Network
        let question_id = q.id;
        let cpi_ctx = CpiContext::new(
            ctx.accounts.truth_network_program.to_account_info(),
            FinalizeVoting { question: q.to_account_info() },
        );
        finalize_voting(cpi_ctx, question_id)?;

        // Refresh the account after CPI
        q.reload()?;

        // Save votes
        let v1 = q.votes_option_1;
        let v2 = q.votes_option_2;
        let total_votes = v1.checked_add(v2).ok_or(PredictError::MathOverflow)?;

        ev.votes_option_1 = v1;
        ev.votes_option_2 = v2;
        ev.resolved_at = now;

        // Mark event as resolved
        ev.resolved = true;

        // sweep house commission once, regardless of outcome
        let vault_bump = ctx.bumps.collateral_vault;
        sweep_house_commission(
            ev,
            &ctx.accounts.collateral_vault.to_account_info(),
            &ctx.accounts.house_treasury.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            vault_bump,
        )?;

        // no votes
        if total_votes == 0 {
            ev.winning_option = 0;
            ev.winning_percent_bps = 0;
            ev.result_status = RESULT_FINALIZED_NO_VOTES;
            return Ok(());
        }

        // tie
        if q.winning_option == 0 {
            ev.winning_option = 0;
            ev.winning_percent_bps = 5000;
            ev.result_status = RESULT_FINALIZED_TIE;
            return Ok(());
        }

        // winner (1 or 2)
        require!(
            q.winning_option == 1 || q.winning_option == 2,
            PredictError::InvalidWinningOption
        );

        let winning_votes = if q.winning_option == 1 {v1} else {v2};

        // winning_percent_bps = winning_votes * 10000 / total_votes
        let wp_bps_u64 = winning_votes
            .checked_mul(BPS_DENOM)
            .ok_or(PredictError::MathOverflow)?
            .checked_div(total_votes)
            .ok_or(PredictError::MathOverflow)?;

        let wp_bps: u16 = wp_bps_u64.min(10_000) as u16;
        ev.winning_percent_bps = wp_bps;

        // if winner but below threshold => resolved but NO winner
        if wp_bps < ev.consensus_threshold_bps {
            ev.winning_option = 0;
            ev.result_status = RESULT_FINALIZED_BELOW_THRESHOLD;
            return Ok(());
        }

        // Store result into PredictSol event
        ev.winning_option = q.winning_option;
        ev.result_status = RESULT_RESOLVED_WINNER;
        ev.swept_at = 0;

        Ok(())
    }


    pub fn redeem_winner_after_final(ctx: Context<RedeemWinnerAfterFinal>, amount: u64) -> Result<()> {
        require!(amount > 0, PredictError::InvalidAmount);

        let ev = &mut ctx.accounts.event;
        require!(ev.resolved, PredictError::EventNotResolved);
        require!(ev.result_status == RESULT_RESOLVED_WINNER, PredictError::InvalidResultStatus);
        require!(!ev.unclaimed_swept, PredictError::RedemptionExpired);

        // Determine which token mint is winning
        let winning_mint = if ev.winning_option == 1 {
            ev.true_mint
        } else if ev.winning_option == 2 {
            ev.false_mint
        } else {
            return err!(PredictError::InvalidWinningOption);
        };

        // Ensure the provided mint/ata matches the winning side
        require_keys_eq!(ctx.accounts.mint.key(), winning_mint, PredictError::NotWinningToken);

        // User must have enough winning tokens to burn
        require!(ctx.accounts.user_ata.amount >= amount, PredictError::InsufficientTrueBalance);

        // Burn winning token
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        match ev.winning_option {
            1 => {
                ev.outstanding_true = ev.outstanding_true.checked_sub(amount).ok_or(PredictError::MathOverflow)?;
            }
            2 => {
                ev.outstanding_false = ev.outstanding_false.checked_sub(amount).ok_or(PredictError::MathOverflow)?;
            }
            _ => return err!(PredictError::InvalidWinningOption),
        }

        // ev.total_issued_per_side = ev
        //     .total_issued_per_side
        //     .checked_sub(amount)
        //     .ok_or(PredictError::MathOverflow)?;

        // payout = amount minus fee (e.g. 1.0 -> 0.99)
        let payout = payout_after_fee(amount)?;

        // Rent safety
        let keep = vault_keep_lamports()?;
        let vault_lamports = ctx.accounts.collateral_vault.to_account_info().lamports();
        require!(
            vault_lamports >= keep.saturating_add(payout),
            PredictError::VaultInsufficientFunds
        );

        // Vault PDA signs SOL transfer
        let event_key = ev.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let vault_seeds: [&[u8]; 3] = [SEED_COLLATERAL_VAULT, event_key.as_ref(), &[vault_bump]];

        invoke_signed(
            &system_instruction::transfer(&ctx.accounts.collateral_vault.key(), &ctx.accounts.user.key(), payout),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.user.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&vault_seeds],
        )?;

        // Update the collateral vault
        ev.total_collateral_lamports = ev.total_collateral_lamports
            .checked_sub(payout)
            .ok_or(PredictError::MathOverflow)?;

        Ok(())
    }

    pub fn redeem_no_winner_after_final(
        ctx: Context<RedeemNoWinnerAfterFinal>,
        side: u8,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, PredictError::InvalidAmount);

        let ev = &mut ctx.accounts.event;
        require!(ev.resolved, PredictError::EventNotResolved);
        require!(!ev.unclaimed_swept, PredictError::RedemptionExpired);

        // result status must be a no votes, tie or below threshold
        // must not equal to RESULT_RESOLVED_WINNER 
        require!(ev.result_status != RESULT_RESOLVED_WINNER, PredictError::InvalidResultStatus);

        // side must match the mint provided
        let expected_mint = match side {
            1 => ev.true_mint,
            2 => ev.false_mint,
            _ => return err!(PredictError::InvalidWinningOption),
        };
        require_keys_eq!(ctx.accounts.mint.key(), expected_mint, PredictError::InvalidMint);

        // burn the token the user is redeeming
        require!(ctx.accounts.user_ata.amount >= amount, PredictError::InsufficientTrueBalance);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // ev.total_issued_per_side = ev
        //     .total_issued_per_side
        //     .checked_sub(amount)
        //     .ok_or(PredictError::MathOverflow)?;

        match side {
            1 => {
                ev.outstanding_true = ev.outstanding_true.checked_sub(amount).ok_or(PredictError::MathOverflow)?;
            }
            2 => {
                ev.outstanding_false = ev.outstanding_false.checked_sub(amount).ok_or(PredictError::MathOverflow)?;
            }
            _ => return err!(PredictError::InvalidWinningOption),
        }

        // here we pay half (since redeeming only one side. example 1 TRUE = 0.5 SOL)
        let pair_payout = payout_after_fee(amount)?;
        let payout = pair_payout.checked_div(2).ok_or(PredictError::MathOverflow)?;

        // rent safety
        let keep = vault_keep_lamports()?;
        let vault_lamports = ctx.accounts.collateral_vault.to_account_info().lamports();
        require!(
            vault_lamports >= keep.saturating_add(payout),
            PredictError::VaultInsufficientFunds
        );

        // vault signs SOL transfer
        let event_key = ev.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let vault_seeds: [&[u8]; 3] = [SEED_COLLATERAL_VAULT, event_key.as_ref(), &[vault_bump]];

        invoke_signed(
            &system_instruction::transfer(&ctx.accounts.collateral_vault.key(), &ctx.accounts.user.key(), payout),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.user.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&vault_seeds],
        )?;

        // update collateral vault 
        ev.total_collateral_lamports = ev.total_collateral_lamports
            .checked_sub(payout)
            .ok_or(PredictError::MathOverflow)?;

        Ok(())
    }


    pub fn claim_creator_commission(ctx: Context<ClaimCreatorCommission>) -> Result<()> {
        let ev = &mut ctx.accounts.event;
        let now = Clock::get()?.unix_timestamp;

        require!(now >= ev.bet_end_time, PredictError::BettingStillActive);
        require_keys_eq!(ctx.accounts.creator.key(), ev.creator, PredictError::Unauthorized);

        let amount = ev.pending_creator_commission;
        require!(amount > 0, PredictError::NothingToClaim);

        // rent safety
        let keep = vault_keep_lamports()?;
        let vault_lamports = ctx.accounts.collateral_vault.to_account_info().lamports();
        require!(vault_lamports >= keep.saturating_add(amount), PredictError::VaultInsufficientFunds);

        // transfer
        let event_key = ev.key();
        let vault_bump = ctx.bumps.collateral_vault;

        transfer_from_collateral_vault(
            &ctx.accounts.collateral_vault.to_account_info(),
            &ctx.accounts.creator.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &event_key,
            vault_bump,
            amount,
        )?;

        ev.pending_creator_commission = 0;
        Ok(())
    }

    pub fn sweep_unclaimed_to_house(ctx: Context<SweepUnclaimedToHouse>) -> Result<()> {
        let ev = &mut ctx.accounts.event;
        let now = Clock::get()?.unix_timestamp;

        require!(ev.resolved, PredictError::EventNotResolved);
        require!(!ev.unclaimed_swept, PredictError::AlreadySwept);

        // only after X days
        require!(
            now >= ev.resolved_at.saturating_add(UNCLAIMED_SWEEP_DELAY_SECS),
            PredictError::SweepNotYetAvailable
        );

        let vault_ai = ctx.accounts.collateral_vault.to_account_info();
        let keep = vault_keep_lamports()?;

        let vault_lamports = vault_ai.lamports();
        require!(vault_lamports > keep, PredictError::NothingToSweep);

        let amount = vault_lamports.saturating_sub(keep);
        require!(amount > 0, PredictError::NothingToSweep);
        
        let vault_bump = ctx.bumps.collateral_vault;

        transfer_from_collateral_vault(
            &vault_ai,
            &ctx.accounts.house_treasury.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ev.key(),
            vault_bump,
            amount,
        )?;

        ev.total_collateral_lamports = ev.total_collateral_lamports.saturating_sub(amount);
        ev.unclaimed_swept = true;
        ev.swept_at = now;

        Ok(())
    }

    pub fn delete_event(ctx: Context<DeleteEvent>) -> Result<()> {
        let ev = &ctx.accounts.event;
        let now = Clock::get()?.unix_timestamp;

        require!(ev.resolved, PredictError::EventNotResolved);
        require_keys_eq!(ctx.accounts.creator.key(), ev.creator, PredictError::Unauthorized);

        require!(ev.pending_creator_commission == 0, PredictError::CreatorCommissionNotClaimed);
        require!(ev.pending_house_commission == 0, PredictError::HouseCommissionNotCleared);

        // compute keep
        let keep = vault_keep_lamports()?;
        let vault_lamports = ctx.accounts.collateral_vault.to_account_info().lamports();

        let resolved_at = ev.resolved_at;
        require!(resolved_at > 0, PredictError::InvalidResolvedAt);

        let after_window = now >= resolved_at.saturating_add(UNCLAIMED_SWEEP_DELAY_SECS);
        let no_outstanding = no_outstanding_tokens(ev);
        let vault_empty = vault_lamports <= keep;

        if !after_window {
            // BEFORE window: strict, only deletable if no one ever bought / all burned if no winner / winning side - all burned
            require!(no_outstanding, PredictError::OutstandingTokens);
            require!(vault_empty, PredictError::VaultNotEmpty);
        } else {
            // AFTER window:
            // - if sweep happened, ok (tokens may exist but is expired)
            // - if sweep not happened, only allow when there is nothing to sweep (vault empty) and no outstanding tokens
            if !ev.unclaimed_swept {
                require!(no_outstanding, PredictError::OutstandingTokens);
                require!(vault_empty, PredictError::VaultNotEmpty);
            }
        }

        // Always require vault empty (only rent/keep allowed)
        require!(vault_empty, PredictError::VaultNotEmpty);
        

        // drain last lamports (close the vault)
        if vault_lamports > 0 {
            let event_key = ctx.accounts.event.key();
            let vault_bump = ctx.bumps.collateral_vault;
            let seeds: [&[u8]; 3] = [SEED_COLLATERAL_VAULT, event_key.as_ref(), &[vault_bump]];

            invoke_signed(
                &system_instruction::transfer(
                    ctx.accounts.collateral_vault.key,
                    ctx.accounts.creator.key,
                    vault_lamports,
                ),
                &[
                    ctx.accounts.collateral_vault.to_account_info(),
                    ctx.accounts.creator.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[&seeds],
            )?;
        }

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
    pub winning_percent_bps: u16,    
    pub votes_option_1: u64,         
    pub votes_option_2: u64,         
    pub consensus_threshold_bps: u16,
    pub resolved_at: i64,            
    pub result_status: u8,    

    pub total_truth_commission_sent: u64,
    pub pending_creator_commission: u64,
    pub pending_house_commission: u64,

    pub unclaimed_swept: bool,
    pub swept_at: i64,

    pub outstanding_true: u64,
    pub outstanding_false: u64,
    pub category: u8,
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
    #[account(init, payer = creator, space = 8 + (296 + 1 + 154), seeds = [SEED_EVENT, creator.key().as_ref(), &counter.count.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEventMints<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub event: Account<'info, Event>,

    /// CHECK: PDA signer
    #[account(seeds = [SEED_MINT_AUTH, event.key().as_ref()], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    /// CHECK: PDA true mint account
    #[account(mut, seeds = [SEED_TRUE_MINT, event.key().as_ref()], bump)]
    pub true_mint: UncheckedAccount<'info>,

    /// CHECK: PDA false mint
    #[account(mut, seeds = [SEED_FALSE_MINT, event.key().as_ref()], bump)]
    pub false_mint: UncheckedAccount<'info>,

    /// CHECK: PDA system account
    #[account(mut, seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,

    /// CHECK: Metaplex Toke Metadata program
    #[account(address = METADATA_PROGRAM_ID)]
    pub metadata_program: UncheckedAccount<'info>,

    /// CHECK: Metaplex metadata PDA for TRUE mint
    #[account(mut, seeds = [b"metadata", METADATA_PROGRAM_ID.as_ref(), true_mint.key().as_ref()], bump, seeds::program = METADATA_PROGRAM_ID)]
    pub true_metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex metadata PDA for FALSE mint
    #[account(mut, seeds = [b"metadata", METADATA_PROGRAM_ID.as_ref(), false_mint.key().as_ref()], bump, seeds::program = METADATA_PROGRAM_ID )]
    pub false_metadata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyPositionsWithFee<'info> {
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

    /// CHECK: PDA mint authority signer
    #[account(seeds = [SEED_MINT_AUTH, event.key().as_ref()], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut, constraint = event.true_mint == true_mint.key() @ PredictError::InvalidMint)]
    pub true_mint: Account<'info, Mint>,
    #[account(mut, constraint = event.false_mint == false_mint.key() @ PredictError::InvalidMint)]
    pub false_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_true_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_false_ata: Account<'info, TokenAccount>,

    // ---- Truth network read + vault ----
    #[account(mut)]
    pub truth_network_question: Account<'info, Question>,

    /// CHECK: vault is system-owned PDA in Truth-Network (no data), but must be mutable
    #[account(mut)]
    pub truth_network_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct FetchAndStoreWinner<'info> {
    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(mut)]
    pub truth_network_question: Account<'info, Question>,

    pub truth_network_program: Program<'info, TruthNetwork>,

    /// CHECK: Fixed house wallet
    #[account(mut, address = HOUSE_WALLET)]
    pub house_treasury: AccountInfo<'info>,

    /// CHECK: Collateral vault PDA
    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump
    )]
    pub collateral_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}



#[derive(Accounts)]
pub struct RedeemPairWhileActive<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump,
        constraint = event.collateral_vault == collateral_vault.key() @ PredictError::InvalidVault
    )]
    pub collateral_vault: SystemAccount<'info>,

    #[account(
        mut,
        constraint = event.true_mint == true_mint.key() @ PredictError::InvalidMint
    )]
    pub true_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = event.false_mint == false_mint.key() @ PredictError::InvalidMint
    )]
    pub false_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_true_ata.owner == user.key() @ PredictError::InvalidTokenAccountOwner,
        constraint = user_true_ata.mint == true_mint.key() @ PredictError::InvalidTokenAccountMint
    )]
    pub user_true_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_false_ata.owner == user.key() @ PredictError::InvalidTokenAccountOwner,
        constraint = user_false_ata.mint == false_mint.key() @ PredictError::InvalidTokenAccountMint
    )]
    pub user_false_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RedeemWinnerAfterFinal<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump,
        constraint = event.collateral_vault == collateral_vault.key() @ PredictError::InvalidVault
    )]
    pub collateral_vault: SystemAccount<'info>,

    // Winning mint (TRUE or FALSE)
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    // User ATA for winning mint
    #[account(
        mut,
        constraint = user_ata.owner == user.key() @ PredictError::InvalidTokenAccountOwner,
        constraint = user_ata.mint == mint.key() @ PredictError::InvalidTokenAccountMint
    )]
    pub user_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct RedeemNoWinnerAfterFinal<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump,
        constraint = event.collateral_vault == collateral_vault.key() @ PredictError::InvalidVault
    )]
    pub collateral_vault: SystemAccount<'info>,

    // TRUE or FALSE mint
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    // User ATA for that mint
    #[account(
        mut,
        constraint = user_ata.owner == user.key() @ PredictError::InvalidTokenAccountOwner,
        constraint = user_ata.mint == mint.key() @ PredictError::InvalidTokenAccountMint
    )]
    pub user_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimCreatorCommission<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump,
        constraint = event.collateral_vault == collateral_vault.key() @ PredictError::InvalidVault
    )]
    pub collateral_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SweepUnclaimedToHouse<'info> {
    #[account(mut)]
    pub event: Account<'info, Event>,

    /// CHECK: Fixed house wallet
    #[account(mut, address = HOUSE_WALLET)]
    pub house_treasury: AccountInfo<'info>,

    /// CHECK: Collateral vault PDA
    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump
    )]
    pub collateral_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeleteEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
        constraint = event.creator == creator.key() @ PredictError::Unauthorized
    )]
    pub event: Account<'info, Event>,

    /// CHECK: Collateral vault PDA
    #[account(
        mut,
        seeds = [SEED_COLLATERAL_VAULT, event.key().as_ref()],
        bump
    )]
    pub collateral_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
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
    #[msg("Betting period has ended")]
    BettingPeriodEnded,
    #[msg("Event already resolved")]
    EventAlreadyResolved,
    #[msg("Insufficient TRUE balance")]
    InsufficientTrueBalance,
    #[msg("Insufficient FALSE balance")]
    InsufficientFalseBalance,
    #[msg("Vault has insufficient funds")]
    VaultInsufficientFunds,
    #[msg("Invalid vault for this event")]
    InvalidVault,
    #[msg("Invalid mint for this event")]
    InvalidMint,
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,
    #[msg("Invalid token account mint")]
    InvalidTokenAccountMint,
    #[msg("Betting is still active")]
    BettingStillActive,
    #[msg("Truth question mismatch")]
    TruthQuestionMismatch,
    #[msg("Truth voting is still active")]
    TruthVotingStillActive,
    #[msg("Invalid winning option from Truth Network")]
    InvalidWinningOption,
    #[msg("Event is not finalized yet")]
    EventNotResolved,
    #[msg("Invalid result status for this action")]
    InvalidResultStatus,
    #[msg("This token is not the winning side")]
    NotWinningToken,
    #[msg("Invalid truth vault")]
    InvalidTruthVault,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Unclaimed sweep not yet available")]
    SweepNotYetAvailable,
    #[msg("Nothing to sweep")]
    NothingToSweep,
    #[msg("Event still has outstanding tokens")]
    OutstandingTokens,
    #[msg("Vault is not empty")]
    VaultNotEmpty,
    #[msg("Sweep is not ready yet")]
    SweepNotReady,
    #[msg("Already swept")]
    AlreadySwept,
    #[msg("Creator commission must be claimed first")]
    CreatorCommissionNotClaimed,
    #[msg("House commission not cleared")]
    HouseCommissionNotCleared,
    #[msg("Redemption window expired (unclaimed funds swept)")]
    RedemptionExpired,
    #[msg("Invalid category")]
    InvalidCategory,
    #[msg("Invalid resolved_at timestamp")]
    InvalidResolvedAt,
}


