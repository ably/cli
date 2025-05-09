/**
 * Global reconnection state and logic for Ably CLI terminal
 * This is kept outside React's lifecycle to maintain state between component remounts
 */

// Global state
let attempts = 0;
let isCancelled = false;
const maxAttempts = 15;
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
  console.log('[GlobalReconnect] Resetting state');
  attempts = 0;
  isCancelled = false;
  remainingTimeMs = 0;
  
  // Clear any pending timers
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
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
  isCancelled = true;
  
  // Clear any pending timers
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
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
  // Don't reconnect if cancelled or max attempts reached
  if (isCancelled || attempts >= maxAttempts) {
    return;
  }
  
  const delay = getBackoffDelay(attempts);
  console.log(`[GlobalReconnect] Will reconnect in ${delay}ms`);
  
  // Update remaining time state
  remainingTimeMs = delay;
  
  // Clear any existing countdown timer
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  
  // Start countdown timer if there's a delay and a callback
  if (delay > 0 && onCountdownTick) {
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
  
  // Clear any existing reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  
  console.log(`[GlobalReconnect] Scheduling attempt #${attempts + 1} in ${delay}ms`);
  
  // Schedule the actual reconnection
  reconnectTimer = setTimeout(() => {
    console.log(`[GlobalReconnect] Attempting connection to ${url}, attempt #${attempts + 1}`);
    reconnectCallback();
  }, delay);
} 