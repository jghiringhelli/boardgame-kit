import { describe, it, expect, beforeEach } from 'vitest';
import { getLocalPlayerId } from '../src/identity';

describe('getLocalPlayerId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a stable id across repeated calls for the same namespace', () => {
    const a = getLocalPlayerId('game-a');
    const b = getLocalPlayerId('game-a');
    expect(a).toBe(b);
  });

  it('namespaces identities so different games never collide', () => {
    const a = getLocalPlayerId('game-a');
    const b = getLocalPlayerId('game-b');
    expect(a).not.toBe(b);
  });

  it('persists the id under a namespaced localStorage key', () => {
    const id = getLocalPlayerId('game-a');
    expect(localStorage.getItem('game-a.player-identity.v1')).toBe(id);
  });
});
