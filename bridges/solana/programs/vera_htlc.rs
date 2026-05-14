use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;

/**
 * Vera HTLC Program for Solana
 * 
 * Hash Time-Locked Contracts for cross-chain bridge between Hedera and Solana.
 * Enables atomic swaps with Falcon-512 signature verification.
 */

declare_id!("VERAHTLC11111111111111111111111111111111111");

#[program]
pub mod vera_htlc {
    use super::*;

    /**
     * Lock SOL or SPL tokens in HTLC contract
     */
    pub fn lock(
        ctx: Context<Lock>,
        hash: [u8; 32],
        timelock: i64,
        amount: u64
    ) -> Result<()> {
        require!(timelock > Clock::get()?.unix_timestamp, ErrorCode::InvalidTimelock);
        
        let htlc = &mut ctx.accounts.htlc;
        htlc.sender = ctx.accounts.sender.key();
        htlc.receiver = ctx.accounts.receiver.key();
        htlc.amount = amount;
        htlc.hashlock = hash;
        htlc.timelock = timelock;
        htlc.withdrawn = false;
        htlc.refunded = false;
        htlc.preimage = [0u8; 32];

        // Transfer SOL to escrow
        invoke(
            &system_instruction::transfer(
                &ctx.accounts.sender.key(),
                &ctx.accounts.htlc.to_account_info().key(),
                amount
            ),
            &[
                ctx.accounts.sender.to_account_info(),
                ctx.accounts.htlc.to_account_info(),
                ctx.accounts.system_program.to_account_info()
            ]
        )?;

        emit!(LockEvent {
            hash,
            sender: ctx.accounts.sender.key(),
            receiver: ctx.accounts.receiver.key(),
            amount,
            timelock
        });

        Ok(())
    }

    /**
     * Unlock funds with preimage
     */
    pub fn unlock(ctx: Context<Unlock>, preimage: [u8; 32]) -> Result<()> {
        let htlc = &mut ctx.accounts.htlc;
        
        require!(!htlc.withdrawn, ErrorCode::AlreadyWithdrawn);
        require!(!htlc.refunded, ErrorCode::AlreadyRefunded);
        require!(
            hash_preimage(&preimage) == htlc.hashlock,
            ErrorCode::InvalidPreimage
        );

        htlc.preimage = preimage;
        htlc.withdrawn = true;

        // Transfer to receiver
        **htlc.to_account_info().try_borrow_mut_lamports()? -= htlc.amount;
        **ctx.accounts.receiver.try_borrow_mut_lamports()? += htlc.amount;

        emit!(UnlockEvent {
            hash: htlc.hashlock,
            preimage
        });

        Ok(())
    }

    /**
     * Refund after timelock expires
     */
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let htlc = &ctx.accounts.htlc;
        
        require!(!htlc.withdrawn, ErrorCode::AlreadyWithdrawn);
        require!(!htlc.refunded, ErrorCode::AlreadyRefunded);
        require!(
            Clock::get()?.unix_timestamp > htlc.timelock,
            ErrorCode::TimelockNotExpired
        );

        // Return to sender
        **htlc.to_account_info().try_borrow_mut_lamports()? -= htlc.amount;
        **ctx.accounts.sender.try_borrow_mut_lamports()? += htlc.amount;

        Ok(())
    }

    /**
     * Verify cross-chain attestation from Hedera
     */
    pub fn verify_attestation(
        ctx: Context<VerifyAttestation>,
        falcon_signature: [u8; 1285], // Falcon-512 signature size
        message_hash: [u8; 32]
    ) -> Result<()> {
        // Verify Falcon-512 signature (placeholder - actual verification would use on-chain logic or oracle)
        let valid = verify_falcon_signature(
            &falcon_signature,
            &message_hash,
            &ctx.accounts.verifier.key()
        )?;

        require!(valid, ErrorCode::InvalidSignature);

        emit!(AttestationVerified {
            message_hash,
            verifier: ctx.accounts.verifier.key()
        });

        Ok(())
    }
}

/**
 * HTLC Account Structure
 */
#[account]
pub struct HTLCAccount {
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub hashlock: [u8; 32],
    pub timelock: i64,
    pub withdrawn: bool,
    pub refunded: bool,
    pub preimage: [u8; 32],
}

/**
 * Lock instruction accounts
 */
#[derive(Accounts)]
pub struct Lock<'info> {
    #[account(
        init,
        payer = sender,
        space = 8 + HTLCAccount::SIZE,
        seeds = [b"htlc", hash.as_ref()],
        bump
    )]
    pub htlc: Account<'info, HTLCAccount>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
    
    /// CHECK: Receiver address, no data needed
    pub receiver: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

/**
 * Unlock instruction accounts
 */
#[derive(Accounts)]
pub struct Unlock<'info> {
    #[account(
        mut,
        seeds = [b"htlc", htlc.hashlock.as_ref()],
        bump,
        constraint = htlc.receiver == receiver.key()
    )]
    pub htlc: Account<'info, HTLCAccount>,
    
    #[account(mut)]
    pub receiver: Signer<'info>,
}

/**
 * Refund instruction accounts
 */
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(
        mut,
        seeds = [b"htlc", htlc.hashlock.as_ref()],
        bump,
        constraint = htlc.sender == sender.key()
    )]
    pub htlc: Account<'info, HTLCAccount>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
}

/**
 * Attestation verification accounts
 */
#[derive(Accounts)]
pub struct VerifyAttestation<'info> {
    pub verifier: Signer<'info>,
    /// CHECK: Authority that can verify attestations
    pub authority: AccountInfo<'info>,
}

/**
 * Events
 */
#[event]
pub struct LockEvent {
    pub hash: [u8; 32],
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub timelock: i64,
}

#[event]
pub struct UnlockEvent {
    pub hash: [u8; 32],
    pub preimage: [u8; 32],
}

#[event]
pub struct AttestationVerified {
    pub message_hash: [u8; 32],
    pub verifier: Pubkey,
}

/**
 * Error Codes
 */
#[error_code]
pub enum ErrorCode {
    #[msg("Invalid timelock - must be in the future")]
    InvalidTimelock,
    
    #[msg("Already withdrawn")]
    AlreadyWithdrawn,
    
    #[msg("Already refunded")]
    AlreadyRefunded,
    
    #[msg("Invalid preimage")]
    InvalidPreimage,
    
    #[msg("Timelock not yet expired")]
    TimelockNotExpired,
    
    #[msg("Invalid Falcon signature")]
    InvalidSignature,
}

/**
 * Helper: Hash preimage using SHA-256
 */
fn hash_preimage(preimage: &[u8; 32]) -> [u8; 32] {
    use anchor_lang::solana_program::hash::hash;
    hash(preimage).to_bytes()
}

/**
 * Helper: Verify Falcon-512 signature
 * Note: This is a placeholder. Real implementation would use:
 * 1. Precompiled program for Falcon verification
 * 2. Oracle verification service
 * 3. ZK-proof verification
 */
fn verify_falcon_signature(
    _signature: &[u8; 1285],
    _message: &[u8; 32],
    _verifier: &Pubkey
) -> Result<bool> {
    // Placeholder - always returns true for demo
    // In production, this would verify the Falcon-512 signature
    Ok(true)
}

impl HTLCAccount {
    pub const SIZE: usize = 32 + 32 + 8 + 32 + 8 + 1 + 1 + 32;
}
