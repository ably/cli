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
      const state = JSON.parse(data);
      if (!process.env.CI || process.env.VERBOSE_TESTS) {
        console.log(`[RateLimitLock] Read lock state: isLocked=${state.isLocked}, reason="${state.lockReason}", pid=${process.pid}`);
      }
      return state;
    }
  } catch (error) {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.warn(`[RateLimitLock] Failed to read lock file at ${new Date().toISOString()}:`, error);
    }
  }
  
  return { isLocked: false };
}

function writeLockState(state: LockState): void {
  try {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[RateLimitLock] Writing lock state: isLocked=${state.isLocked}, reason="${state.lockReason}", pid=${process.pid}`);
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error(`[RateLimitLock] Failed to write lock file at ${new Date().toISOString()}:`, error);
  }
}

export function acquireRateLimitLock(reason: string, duration: number): void {
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[RateLimitLock] Acquiring lock at ${new Date().toISOString()}, pid=${process.pid}`);
    console.log(`[RateLimitLock] Lock reason: "${reason}", duration: ${duration}ms`);
    
    // Log stack trace to understand who is acquiring the lock
    const stack = new Error('Stack trace for lock acquisition').stack;
    console.log(`[RateLimitLock] Acquire stack trace:\n${stack}`);
  }
  
  const state: LockState = {
    isLocked: true,
    lockedAt: Date.now(),
    lockReason: reason,
    expectedUnlockAt: Date.now() + duration
  };
  writeLockState(state);
  
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[RateLimitLock] Lock acquired successfully at ${new Date().toISOString()}`);
    console.log(`[RateLimitLock] Expected unlock at: ${new Date(state.expectedUnlockAt).toISOString()}`);
  }
}

export function releaseRateLimitLock(): void {
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[RateLimitLock] Releasing lock at ${new Date().toISOString()}, pid=${process.pid}`);
    
    // Log stack trace to understand who is releasing the lock
    const stack = new Error('Stack trace for lock release').stack;
    console.log(`[RateLimitLock] Release stack trace:\n${stack}`);
  }
  
  writeLockState({ isLocked: false });
  
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[RateLimitLock] Lock released successfully at ${new Date().toISOString()}`);
  }
}

export async function waitForRateLimitLock(): Promise<void> {
  const startTime = Date.now();
  
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[RateLimitLock] waitForRateLimitLock called at ${new Date().toISOString()}, pid=${process.pid}`);
    
    // Log stack trace to understand who is waiting
    const stack = new Error('Stack trace for lock wait').stack;
    console.log(`[RateLimitLock] Wait stack trace:\n${stack}`);
  }
  
  let checkCount = 0;
  const maxChecks = 1200; // 10 minutes max wait (500ms intervals)
  
  while (checkCount < maxChecks) {
    const state = readLockState();
    
    if (!state.isLocked) {
      if (!process.env.CI || process.env.VERBOSE_TESTS) {
        console.log(`[RateLimitLock] Lock is available, proceeding at ${new Date().toISOString()}`);
        console.log(`[RateLimitLock] Total wait time: ${Date.now() - startTime}ms`);
      }
      return; // Lock is available
    }
    
    // Check if lock is stale (older than 10 minutes)
    if (state.lockedAt && Date.now() - state.lockedAt > 600000) {
      console.warn(`[RateLimitLock] Clearing stale lock at ${new Date().toISOString()} (older than 10 minutes)`);
      console.warn(`[RateLimitLock] Lock was created at: ${new Date(state.lockedAt).toISOString()}`);
      releaseRateLimitLock();
      return;
    }
    
    if (checkCount === 0 && (!process.env.CI || process.env.VERBOSE_TESTS)) {
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
    if (checkCount % 20 === 0 && (!process.env.CI || process.env.VERBOSE_TESTS)) {
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
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[RateLimitLock] clearRateLimitLock called at ${new Date().toISOString()}, pid=${process.pid}`);
  }
  
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const state = readLockState();
      if (!process.env.CI || process.env.VERBOSE_TESTS) {
        console.log(`[RateLimitLock] Clearing lock file with state: isLocked=${state.isLocked}, reason="${state.lockReason}"`);
      }
      fs.unlinkSync(LOCK_FILE);
      if (!process.env.CI || process.env.VERBOSE_TESTS) {
        console.log(`[RateLimitLock] Lock file cleared successfully at ${new Date().toISOString()}`);
      }
    } else {
      if (!process.env.CI || process.env.VERBOSE_TESTS) {
        console.log(`[RateLimitLock] No lock file exists to clear`);
      }
    }
  } catch (error) {
    console.error(`[RateLimitLock] Failed to clear lock file at ${new Date().toISOString()}:`, error);
  }
}