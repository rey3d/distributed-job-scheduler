import { describe, it, expect } from 'vitest';
import { JobStatus } from '@prisma/client';
import { isValidStateTransition } from '../src/job-engine/state-machine';

describe('State Machine Transition Rules', () => {
  it('allows valid transitions from QUEUED', () => {
    expect(isValidStateTransition(JobStatus.QUEUED, JobStatus.CLAIMED)).toBe(true);
    expect(isValidStateTransition(JobStatus.QUEUED, JobStatus.CANCELLED)).toBe(true);
  });

  it('allows valid transitions from CLAIMED', () => {
    expect(isValidStateTransition(JobStatus.CLAIMED, JobStatus.RUNNING)).toBe(true);
    expect(isValidStateTransition(JobStatus.CLAIMED, JobStatus.QUEUED)).toBe(true);
    expect(isValidStateTransition(JobStatus.CLAIMED, JobStatus.FAILED)).toBe(true);
  });

  it('allows valid transitions from RUNNING', () => {
    expect(isValidStateTransition(JobStatus.RUNNING, JobStatus.COMPLETED)).toBe(true);
    expect(isValidStateTransition(JobStatus.RUNNING, JobStatus.SCHEDULED)).toBe(true);
    expect(isValidStateTransition(JobStatus.RUNNING, JobStatus.FAILED)).toBe(true);
    expect(isValidStateTransition(JobStatus.RUNNING, JobStatus.QUEUED)).toBe(true);
  });

  it('rejects illegal state transitions', () => {
    expect(isValidStateTransition(JobStatus.COMPLETED, JobStatus.RUNNING)).toBe(false);
    expect(isValidStateTransition(JobStatus.FAILED, JobStatus.CLAIMED)).toBe(false);
    expect(isValidStateTransition(JobStatus.QUEUED, JobStatus.COMPLETED)).toBe(false);
    expect(isValidStateTransition(JobStatus.CANCELLED, JobStatus.QUEUED)).toBe(false);
  });

  it('allows self transitions (no-op)', () => {
    expect(isValidStateTransition(JobStatus.QUEUED, JobStatus.QUEUED)).toBe(true);
    expect(isValidStateTransition(JobStatus.RUNNING, JobStatus.RUNNING)).toBe(true);
  });
});
