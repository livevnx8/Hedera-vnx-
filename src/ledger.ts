import { v4 as uuidv4 } from 'uuid';
import { db, getOrCreateBalance, nowIso, updateBalance } from './db.js';

export function creditDeposit(customerId: string, depositId: string, usdCredited: number) {
  const bal = getOrCreateBalance(customerId);
  const newAvail = bal.available_usd + usdCredited;
  db.prepare('INSERT INTO ledger_entries (id, customer_id, type, amount_usd, deposit_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuidv4(),
    customerId,
    'deposit',
    usdCredited,
    depositId,
    nowIso()
  );
  updateBalance(customerId, newAvail, bal.held_usd);
  return { availableUsd: newAvail, heldUsd: bal.held_usd };
}

export function placeHold(customerId: string, jobId: string, amountUsd: number) {
  const bal = getOrCreateBalance(customerId);
  if (bal.available_usd < amountUsd) {
    return { ok: false as const, availableUsd: bal.available_usd, heldUsd: bal.held_usd };
  }

  db.prepare('INSERT INTO ledger_entries (id, customer_id, type, amount_usd, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuidv4(),
    customerId,
    'hold',
    -amountUsd,
    jobId,
    nowIso()
  );

  const newAvail = bal.available_usd - amountUsd;
  const newHeld = bal.held_usd + amountUsd;
  updateBalance(customerId, newAvail, newHeld);

  return { ok: true as const, availableUsd: newAvail, heldUsd: newHeld };
}

export function captureAndRelease(customerId: string, jobId: string, holdAmountUsd: number, actualCostUsd: number) {
  const bal = getOrCreateBalance(customerId);

  if (bal.held_usd < holdAmountUsd) {
    throw new Error('Invariant violation: held balance smaller than hold.');
  }

  const releaseUsd = Math.max(0, holdAmountUsd - actualCostUsd);
  const captureUsd = Math.min(holdAmountUsd, actualCostUsd);

  db.prepare('INSERT INTO ledger_entries (id, customer_id, type, amount_usd, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuidv4(),
    customerId,
    'capture',
    -captureUsd,
    jobId,
    nowIso()
  );

  if (releaseUsd > 0) {
    db.prepare('INSERT INTO ledger_entries (id, customer_id, type, amount_usd, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuidv4(),
      customerId,
      'release',
      releaseUsd,
      jobId,
      nowIso()
    );
  }

  const newHeld = bal.held_usd - holdAmountUsd;
  const newAvail = bal.available_usd + releaseUsd;
  updateBalance(customerId, newAvail, newHeld);

  return { availableUsd: newAvail, heldUsd: newHeld, actualCostUsd: captureUsd, releasedUsd: releaseUsd };
}

export function releaseHold(customerId: string, jobId: string, holdAmountUsd: number) {
  const bal = getOrCreateBalance(customerId);

  const releaseUsd = holdAmountUsd;
  db.prepare('INSERT INTO ledger_entries (id, customer_id, type, amount_usd, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuidv4(),
    customerId,
    'release',
    releaseUsd,
    jobId,
    nowIso()
  );

  const newHeld = bal.held_usd - holdAmountUsd;
  const newAvail = bal.available_usd + releaseUsd;
  updateBalance(customerId, newAvail, newHeld);

  return { availableUsd: newAvail, heldUsd: newHeld };
}
