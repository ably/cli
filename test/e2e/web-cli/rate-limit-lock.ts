/**
 * Global lock mechanism to ensure tests don't run during rate limit pauses
 * This prevents race conditions where one test is paused but another starts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCK_FILE = path.join(__dirname, '.rate-limit-lock.json');

interface LockState {
  isLocked: boolean;
  lockedAt?: number;
  lockReason?: string;
  expectedUnlockAt?: number;
}

function readLockState(): LockState {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const data = fs.readFileSync(LOCK_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('[RateLimitLock] Failed to read lock file:', error);
  }
  
  return { isLocked: false };
}

function writeLockState(state: LockState): void {
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[RateLimitLock] Failed to write lock file:', error);
  }
}

export function acquireRateLimitLock(reason: string, duration: number): void {
  const state: LockState = {
    isLocked: true,
    lockedAt: Date.now(),
    lockReason: reason,
    expectedUnlockAt: Date.now() + duration
  };
  writeLockState(state);
  console.log(`[RateLimitLock] Lock acquired: ${reason}`);
  console.log(`[RateLimitLock] Expected unlock at: ${new Date(state.expectedUnlockAt).toISOString()}`);
}

export function releaseRateLimitLock(): void {
  writeLockState({ isLocked: false });
  console.log('[RateLimitLock] Lock released');
}

export async function waitForRateLimitLock(): Promise<void> {
  let checkCount = 0;
  const maxChecks = 1200; // 10 minutes max wait (500ms intervals)
  
  while (checkCount < maxChecks) {
    const state = readLockState();
    
    if (!state.isLocked) {
      return; // Lock is available
    }
    
    // Check if lock is stale (older than 10 minutes)
    if (state.lockedAt && Date.now() - state.lockedAt > 600000) {
      console.warn('[RateLimitLock] Clearing stale lock (older than 10 minutes)');
      releaseRateLimitLock();
      return;
    }
    
    if (checkCount === 0) {
      console.log(`[RateLimitLock] Waiting for rate limit lock to be released...`);
      console.log(`[RateLimitLock] Lock reason: ${state.lockReason}`);
      if (state.expectedUnlockAt) {
        const remainingMs = Math.max(0, state.expectedUnlockAt - Date.now());
        console.log(`[RateLimitLock] Expected wait time: ${Math.round(remainingMs/1000)}s`);
      }
    }
    
    // Wait 500ms before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
    checkCount++;
    
    // Log progress every 10 seconds
    if (checkCount % 20 === 0) {
      const currentState = readLockState();
      if (currentState.expectedUnlockAt) {
        const remainingMs = Math.max(0, currentState.expectedUnlockAt - Date.now());
        console.log(`[RateLimitLock] Still waiting... ${Math.round(remainingMs/1000)}s remaining`);
      }
    }
  }
  
  console.error('[RateLimitLock] Timeout waiting for rate limit lock after 10 minutes');
  throw new Error('Rate limit lock timeout');
}

export function clearRateLimitLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      console.log('[RateLimitLock] Lock file cleared');
    }
  } catch (error) {
    console.error('[RateLimitLock] Failed to clear lock file:', error);
  }
}