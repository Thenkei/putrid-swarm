import { afterEach, expect, it, vi } from 'vitest';
import { newGame } from '../src/core/game';
import { serialize } from '../src/core/save';
import { CampaignStorage } from '../src/engine/campaign-storage';

class LimitedStorage {
  private readonly data = new Map<string, string>();
  limit = Infinity;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (value.length > this.limit) throw new Error('Storage quota exceeded');
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

function browser() {
  const stores = { localStorage: new LimitedStorage(), sessionStorage: new LimitedStorage() };
  vi.stubGlobal('window', stores);
  return stores;
}

afterEach(() => vi.unstubAllGlobals());

it('prioritizes the newer checkpoint in this tab and returns to durable storage when space is available', () => {
  const { localStorage } = browser();
  const first = newGame(17);
  const saves = new CampaignStorage();
  saves.save(first);
  localStorage.limit = 0;
  saves.save({ ...first, hoursLeft: 7 });
  expect(saves.scope).toBe('tab');
  const reload = new CampaignStorage();
  expect(reload.load()?.hoursLeft).toBe(7);
  expect(reload.scope).toBe('tab');
  localStorage.limit = Infinity;
  reload.save({ ...first, hoursLeft: 6 });
  expect(reload.scope).toBe('device');
  expect(new CampaignStorage().load()?.hoursLeft).toBe(6);
});

it('keeps the campaign on disk if the optional morning recording alone exceeds quota', () => {
  const { localStorage } = browser();
  const morning = { ...newGame(23), phase: 'morning' as const };
  const tape = { image: 'data:image/jpeg;base64,AAAA', times: [0, .25] };
  localStorage.limit = serialize(morning).length;
  const saves = new CampaignStorage();
  saves.save({ ...morning, morningTape: tape });
  expect(saves.scope).toBe('device');
  const loaded = new CampaignStorage().load();
  expect(loaded?.phase).toBe('morning');
  expect(loaded?.morningTape).toBeUndefined();
});

it('keeps the latest explicit save in memory when both writes fail and clears every copy on reset', () => {
  const { localStorage, sessionStorage } = browser();
  const saves = new CampaignStorage();
  saves.save(newGame(9));
  localStorage.limit = 0;
  saves.save(newGame(10));
  sessionStorage.limit = 0;
  saves.save(newGame(11));
  expect(saves.scope).toBe('page');
  expect(saves.load()?.seed).toBe(11);
  saves.clear();
  expect(saves.load()).toBeNull();
  expect(new CampaignStorage().load()).toBeNull();
});
