import { describe, it, expect } from 'vitest';
import { RetryStrategy } from '@prisma/client';
import { calculateNextRetryDelay } from '../src/job-engine/retry-policy';

describe('Retry Policy Delay Calculations', () => {
  it('calculates FIXED retry delays correctly', () => {
    const baseDelaySec = 10;
    expect(calculateNextRetryDelay(1, RetryStrategy.FIXED, baseDelaySec)).toBe(10);
    expect(calculateNextRetryDelay(2, RetryStrategy.FIXED, baseDelaySec)).toBe(10);
    expect(calculateNextRetryDelay(3, RetryStrategy.FIXED, baseDelaySec)).toBe(10);
  });

  it('calculates LINEAR retry delays correctly', () => {
    const baseDelaySec = 5;
    expect(calculateNextRetryDelay(1, RetryStrategy.LINEAR, baseDelaySec)).toBe(5);
    expect(calculateNextRetryDelay(2, RetryStrategy.LINEAR, baseDelaySec)).toBe(10);
    expect(calculateNextRetryDelay(3, RetryStrategy.LINEAR, baseDelaySec)).toBe(15);
  });

  it('calculates EXPONENTIAL retry delays correctly', () => {
    const baseDelaySec = 2;
    // attempt 1: 2 * 2^0 = 2
    expect(calculateNextRetryDelay(1, RetryStrategy.EXPONENTIAL, baseDelaySec)).toBe(2);
    // attempt 2: 2 * 2^1 = 4
    expect(calculateNextRetryDelay(2, RetryStrategy.EXPONENTIAL, baseDelaySec)).toBe(4);
    // attempt 3: 2 * 2^2 = 8
    expect(calculateNextRetryDelay(3, RetryStrategy.EXPONENTIAL, baseDelaySec)).toBe(8);
    // attempt 4: 2 * 2^3 = 16
    expect(calculateNextRetryDelay(4, RetryStrategy.EXPONENTIAL, baseDelaySec)).toBe(16);
  });

  it('enforces maxDelayCapSec constraint on high backoffs', () => {
    const baseDelaySec = 10;
    const maxCapSec = 30; // Max cap 30s
    // Exponential for attempt 5 would be 10 * 2^4 = 160s, but capped at 30s
    expect(calculateNextRetryDelay(5, RetryStrategy.EXPONENTIAL, baseDelaySec, maxCapSec)).toBe(30);
  });
});
