import { deserialize, serialize } from '../core/save';
import type { GameState } from '../core/types';

const CAMPAIGN = 'putrid-swarm.save.v1';
const TAB_COPY = 'putrid-swarm.save.tab.v1';
type Store = 'localStorage' | 'sessionStorage';

function write(store: Store, key: string, value: string): boolean {
  try {
    window[store].setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function read(store: Store, key: string): GameState | null {
  try {
    const value = window[store].getItem(key);
    return value ? deserialize(value) : null;
  } catch {
    return null;
  }
}

function remove(store: Store, key: string): void {
  try { window[store].removeItem(key); } catch { /* Storage can be disabled. */ }
}

/** The latest committed checkpoint in this tab takes precedence over an older disk save. */
export class CampaignStorage {
  scope: 'device' | 'tab' | 'page' = 'device';
  private pending: string | null = null;

  save(state: GameState): void {
    const full = serialize(state);
    let compact = full;
    let saved = write('localStorage', CAMPAIGN, full);
    if (!saved && state.morningTape) {
      const { morningTape: _tape, ...campaign } = state;
      compact = serialize(campaign);
      saved = write('localStorage', CAMPAIGN, compact);
    }
    if (saved) {
      remove('sessionStorage', TAB_COPY);
      this.scope = 'device';
      this.pending = null;
      return;
    }

    // Keep the cassette when it fits in the tab. Either way the campaign comes first.
    const inTab = write('sessionStorage', TAB_COPY, full) || (compact !== full && write('sessionStorage', TAB_COPY, compact));
    this.pending = full;
    this.scope = inTab ? 'tab' : 'page';
  }

  load(): GameState | null {
    if (this.pending) return deserialize(this.pending);
    const tab = read('sessionStorage', TAB_COPY);
    if (tab) {
      this.scope = 'tab';
      return tab;
    }
    this.scope = 'device';
    return read('localStorage', CAMPAIGN);
  }

  clear(): void {
    remove('localStorage', CAMPAIGN);
    remove('sessionStorage', TAB_COPY);
    this.pending = null;
    this.scope = 'device';
  }
}
