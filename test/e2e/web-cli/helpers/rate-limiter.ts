/**
 * Centralized rate limiter for managing WebSocket connections in Playwright tests
 * 
 * This module ensures we don't exceed the server's 10 connections per minute limit
 * by tracking and throttling connection attempts across all test contexts.
 */

import { Page } from 'playwright/test';

export interface RateLimiterConfig {
  maxConnectionsPerMinute: number;
  windowDurationMs: number;
  retryDelayMs: number;
  maxRetries: number;
}

export interface ConnectionAttempt {
  timestamp: number;
  testName: string;
  success: boolean;
}

// Default configuration matching server limits
const DEFAULT_CONFIG: RateLimiterConfig = {
  maxConnectionsPerMinute: 10,
  windowDurationMs: 60000, // 1 minute
  retryDelayMs: 10000, // 10 seconds between retries
  maxRetries: 3
};

/**
 * Global rate limiter singleton
 * Uses a sliding window algorithm to track connection attempts
 */
class GlobalRateLimiter {
  private connectionAttempts: ConnectionAttempt[] = [];
  private config: RateLimiterConfig;
  private waitQueue: Array<() => void> = [];
  private isProcessingQueue = false;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Clean up old attempts periodically
    setInterval(() => this.cleanupOldAttempts(), 10000);
  }

  /**
   * Check if a new connection can be made within rate limits
   */
  private canConnect(): boolean {
    this.cleanupOldAttempts();
    
    const recentAttempts = this.getRecentAttempts();
    return recentAttempts.length < this.config.maxConnectionsPerMinute;
  }

  /**
   * Get connection attempts within the current time window
   */
  private getRecentAttempts(): ConnectionAttempt[] {
    const cutoffTime = Date.now() - this.config.windowDurationMs;
    return this.connectionAttempts.filter(attempt => attempt.timestamp > cutoffTime);
  }

  /**
   * Clean up attempts older than the time window
   */
  private cleanupOldAttempts(): void {
    const cutoffTime = Date.now() - this.config.windowDurationMs;
    this.connectionAttempts = this.connectionAttempts.filter(
      attempt => attempt.timestamp > cutoffTime
    );
  }

  /**
   * Record a connection attempt
   */
  private recordAttempt(testName: string, success: boolean): void {
    const attempt = {
      timestamp: Date.now(),
      testName,
      success
    };
    this.connectionAttempts.push(attempt);
    console.log(`[RateLimiter] Recorded connection attempt at ${new Date().toISOString()}`);
    console.log(`[RateLimiter] Test: "${testName}", Success: ${success}, Process ID: ${process.pid}`);
    console.log(`[RateLimiter] Total attempts in window: ${this.getRecentAttempts().length}`);
  }

  /**
   * Process the wait queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    
    while (this.waitQueue.length > 0 && this.canConnect()) {
      const resolve = this.waitQueue.shift();
      if (resolve) {
        resolve();
        // Small delay between processing queue items
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.isProcessingQueue = false;
    
    // Schedule next queue processing if there are still items
    if (this.waitQueue.length > 0) {
      setTimeout(() => this.processQueue(), this.config.retryDelayMs);
    }
  }

  /**
   * Wait for rate limit clearance before allowing connection
   */
  async waitForRateLimit(testName: string): Promise<void> {
    // If we can connect immediately, do so
    if (this.canConnect()) {
      return;
    }

    // Otherwise, add to queue and wait
    console.log(`[RateLimiter] Test "${testName}" waiting for rate limit clearance...`);
    
    const recentAttempts = this.getRecentAttempts();
    console.log(`[RateLimiter] Current connections in window: ${recentAttempts.length}/${this.config.maxConnectionsPerMinute}`);
    
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
      this.processQueue();
    });
  }

  /**
   * Execute a connection with rate limiting
   */
  async executeWithRateLimit<T>(
    testName: string,
    connectionFn: () => Promise<T>
  ): Promise<T> {
    console.log(`[RateLimiter] executeWithRateLimit called for "${testName}" at ${new Date().toISOString()}`);
    console.log(`[RateLimiter] Process ID: ${process.pid}`);
    
    // Log stack trace to understand call context
    const stack = new Error('Stack trace for rate limiter execution').stack;
    console.log(`[RateLimiter] Execute stack trace:\n${stack}`);
    
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        // Wait for rate limit clearance
        await this.waitForRateLimit(testName);
        
        // Record the attempt
        this.recordAttempt(testName, false);
        
        // Execute the connection
        console.log(`[RateLimiter] Test "${testName}" attempting connection (attempt ${attempt + 1}/${this.config.maxRetries}) at ${new Date().toISOString()}`);
        console.log(`[RateLimiter] About to create WebSocket connection...`);
        const result = await connectionFn();
        
        // Mark as successful
        this.connectionAttempts.at(-1)!.success = true;
        console.log(`[RateLimiter] Test "${testName}" connected successfully at ${new Date().toISOString()}`);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`[RateLimiter] Test "${testName}" connection failed:`, error);
        
        if (attempt < this.config.maxRetries - 1) {
          console.log(`[RateLimiter] Retrying in ${this.config.retryDelayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
        }
      }
    }
    
    throw lastError || new Error('Connection failed after all retries');
  }

  /**
   * Get current rate limiter status
   */
  getStatus(): {
    recentAttempts: number;
    maxAllowed: number;
    queueLength: number;
    canConnect: boolean;
  } {
    const recentAttempts = this.getRecentAttempts();
    return {
      recentAttempts: recentAttempts.length,
      maxAllowed: this.config.maxConnectionsPerMinute,
      queueLength: this.waitQueue.length,
      canConnect: this.canConnect()
    };
  }

  /**
   * Reset the rate limiter (useful for test cleanup)
   */
  reset(): void {
    this.connectionAttempts = [];
    this.waitQueue = [];
    this.isProcessingQueue = false;
  }
}

// Create singleton instance
const globalRateLimiter = new GlobalRateLimiter();

/**
 * Rate-limited page navigation
 */
export async function navigateWithRateLimit(
  page: Page,
  url: string,
  testName: string
): Promise<void> {
  return globalRateLimiter.executeWithRateLimit(
    testName,
    async () => {
      await page.goto(url);
      // Wait a bit to ensure connection is established
      await page.waitForTimeout(1000);
    }
  );
}

/**
 * Rate-limited WebSocket connection
 */
export async function connectWithRateLimit(
  page: Page,
  connectionFn: () => Promise<void>,
  testName: string
): Promise<void> {
  return globalRateLimiter.executeWithRateLimit(testName, connectionFn);
}

/**
 * Get rate limiter status (for debugging/monitoring)
 */
export function getRateLimiterStatus() {
  return globalRateLimiter.getStatus();
}

/**
 * Reset rate limiter (useful in test hooks)
 */
export function resetRateLimiter() {
  globalRateLimiter.reset();
}

/**
 * Configure rate limiter
 */
export function configureRateLimiter(config: Partial<RateLimiterConfig>) {
  Object.assign(globalRateLimiter['config'], config);
}

/**
 * Wait for rate limit window to clear
 */
export async function waitForRateLimitWindow(): Promise<void> {
  const status = getRateLimiterStatus();
  if (status.recentAttempts > 0) {
    console.log(`[RateLimiter] Waiting for rate limit window to clear (${status.recentAttempts} recent attempts)`);
    // Wait for the full window duration plus a buffer
    await new Promise(resolve => setTimeout(resolve, 61000));
  }
}

/**
 * Decorator for rate-limited test execution
 */
export function withRateLimit(testName: string) {
  return async (testFn: () => Promise<void>): Promise<void> => {
    await globalRateLimiter.waitForRateLimit(testName);
    try {
      await testFn();
    } finally {
      // Record the test completion
      globalRateLimiter['recordAttempt'](testName, true);
    }
  };
}