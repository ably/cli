/**
 * Global reconnection state and logic for Ably CLI terminal
 * This is kept outside React's lifecycle to maintain state between component remounts
 */

// Global state
let attempts = 0;
let isCancelled = false;
let maxAttempts = 15;
let remainingTimeMs = 0;
let countdownTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let onCountdownTick: ((remaining: number) => void) | null = null;

/**
 * Get the backoff delay in milliseconds based on the current attempt number
 * Follows a pattern of 0s, 2s, 4s, 8s, 8s...
 * @param attempt Current attempt number (0-based)
 */
export function getBackoffDelay(attempt: number): number {
  // attempt is the number of *past* failed attempts.
  // The current attempt being scheduled is effectively attempt + 1.
  if (attempt === 0) return 0;    // Delay for the very first connection attempt (if scheduled initially)
                                 // Or, if it's the first *retry* after one failure, attempts will be 1.
  if (attempt === 1) return 2000; // First retry (after 1 failure): 2s delay
  if (attempt === 2) return 4000; // Second retry (after 2 failures): 4s delay
  return 8000;                    // Subsequent retries (3rd failure onwards): 8s delay
}

/**
 * Reset the reconnection state
 */
export function resetState(): void {
  console.log(`[GlobalReconnect] resetState called. Current attempts (before potential reset): ${attempts}, isCancelled: ${isCancelled}`);
  // ATTEMPTS ARE NO LONGER RESET HERE. They should be reset by a successful connection
  // or an explicit action to start a new connection sequence like cancelReconnect.
  // attempts = 0; 
  
  // Only clear timers if fully cancelling. If just a transient reset before a new schedule,
  // scheduleReconnect will handle its own timer. isCancelled drives this.
  if (isCancelled) { 
    if (countdownTimer) {
      console.log('[GlobalReconnect] resetState: Clearing countdownTimer because isCancelled=true');
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (reconnectTimer) {
      console.log('[GlobalReconnect] resetState: Clearing reconnectTimer because isCancelled=true');
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
  remainingTimeMs = 0; 
  // isCancelled is NOT reset here. It's reset by successfulConnectionReset or explicitly by scheduleReconnect if not at max attempts.
}

/**
 * Increment the attempt counter
 */
export function increment(): void {
  attempts++;
  console.log(`[GlobalReconnect] Attempt counter incremented to ${attempts}`);
}

/**
 * Get the current attempt count
 */
export function getAttempts(): number {
  return attempts;
}

/**
 * Get the maximum number of attempts
 */
export function getMaxAttempts(): number {
  return maxAttempts;
}

/**
 * Check if reconnection has been cancelled
 */
export function isCancelledState(): boolean {
  return isCancelled;
}

/**
 * Check if maximum attempts have been reached
 */
export function isMaxAttemptsReached(): boolean {
  return attempts >= maxAttempts;
}

/**
 * Cancel reconnection attempts
 */
export function cancelReconnect(): void {
  console.log('[GlobalReconnect] cancelReconnect called. Clearing timers and resetting attempts.');
  isCancelled = true;
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  attempts = 0; // If explicitly cancelled, reset attempts too for a clean slate.
}

/**
 * Set the function to call on each countdown tick
 * @param callback Function to call with remaining time in ms
 */
export function setCountdownCallback(callback: (remaining: number) => void): void {
  onCountdownTick = callback;
}

/**
 * Schedule reconnection with appropriate backoff
 * @param reconnectCallback Function to call when it's time to reconnect
 * @param url WebSocket URL to connect to
 */
export function scheduleReconnect(reconnectCallback: () => void, url: string): void {
  if (attempts >= maxAttempts) {
    console.log(`[GlobalReconnect] scheduleReconnect: Aborting due to maxAttemptsReached (attempts=${attempts}, max=${maxAttempts})`);
    console.warn('[GlobalReconnect] Maximum reconnection attempts reached.');
    isCancelled = true; // Set cancelled if max attempts reached, prevents further scheduling from other paths.
    return;
  }
  
  // If we are scheduling a reconnect, it means we are no longer in a user-cancelled state from this module's perspective.
  // A higher-level component might still decide to call cancelReconnect() later.
  isCancelled = false; 

  const delay = getBackoffDelay(attempts);
  console.log(`[GlobalReconnect] scheduleReconnect: Current attempts: ${attempts}, Calculated delay: ${delay}ms, isCancelled: ${isCancelled}`);
  
  remainingTimeMs = delay;
  
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  
  if (delay > 0 && onCountdownTick) {
    onCountdownTick(remainingTimeMs); 
    countdownTimer = setInterval(() => {
      remainingTimeMs = Math.max(0, remainingTimeMs - 1000);
      if (onCountdownTick) {
        onCountdownTick(remainingTimeMs);
      }
      
      if (remainingTimeMs <= 0 && countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }, 1000);
  }
  
  if (reconnectTimer) {
    console.log('[GlobalReconnect] scheduleReconnect: Clearing existing reconnectTimer before setting new one.');
    clearTimeout(reconnectTimer);
    reconnectTimer = null; // Explicitly nullify after clearing
  }
  
  console.log(`[GlobalReconnect] PRE-SETIMEOUT: About to set timer for attempt #${attempts + 1} with delay ${delay}ms.`);
  
  reconnectTimer = setTimeout(() => {
    console.log(`[GlobalReconnect] SETTIMEOUT_FIRED_RAW for attempt #${attempts + 1}. isCancelled: ${isCancelled}`);
    if (isCancelled) {
      console.log(`[GlobalReconnect] reconnectTimer FIRED but isCancelled is true. Aborting reconnectCallback for attempt #${attempts + 1}.`);
      return;
    }
    if (!reconnectCallback) {
      console.error(`[GlobalReconnect] ERROR: reconnectTimer FIRED for attempt #${attempts + 1}, but reconnectCallback is null/undefined!`);
      return;
    }
    console.log(`[GlobalReconnect] reconnectTimer FIRED. Attempting connection to ${url}, attempt #${attempts + 1}`);
    reconnectCallback();
  }, delay);
  console.log(`[GlobalReconnect] scheduleReconnect: NEW reconnectTimer scheduled with ID: ${reconnectTimer} for attempt #${attempts + 1}`);
}

// Allow overriding from outside (e.g., React prop)
export function setMaxAttempts(value: number): void {
  maxAttempts = value > 0 ? value : 1;
}

export function successfulConnectionReset(): void {
  console.log(`[GlobalReconnect] successfulConnectionReset called. Resetting attempts from ${attempts} to 0.`);
  attempts = 0;
  isCancelled = false; // Allow new retries after a successful period.
  remainingTimeMs = 0; // Reset countdown display value.
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (reconnectTimer) { 
    console.log('[GlobalReconnect] successfulConnectionReset: Clearing reconnectTimer.');
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
} 