import { create } from 'zustand';
import type { ServerListItem, AppSettings, NetworkInfo } from '../types';

interface AppState {
  servers: ServerListItem[];
  settings: AppSettings | null;
  networkInfo: NetworkInfo | null;
  totalRAM: number;
  onboardingDone: boolean;
  privacyMode: boolean;

  // Actions
  setServers: (servers: ServerListItem[]) => void;
  updateServer: (id: string, partial: Partial<ServerListItem>) => void;
  setSettings: (s: AppSettings) => void;
  setNetworkInfo: (n: NetworkInfo) => void;
  setTotalRAM: (ram: number) => void;
  setOnboardingDone: (done: boolean) => void;
  togglePrivacyMode: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  servers: [],
  settings: null,
  networkInfo: null,
  totalRAM: 8192,
  onboardingDone: false,
  privacyMode: (() => {
    try { const v = localStorage.getItem('privacyMode'); return v === null ? true : v === 'true'; } catch { return true; }
  })(),

  setServers: (servers) => set({ servers }),
  updateServer: (id, partial) =>
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...partial } : s)),
    })),
  setSettings: (settings) => set({ settings }),
  setNetworkInfo: (networkInfo) => set({ networkInfo }),
  setTotalRAM: (totalRAM) => set({ totalRAM }),
  setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
  togglePrivacyMode: () => set((s) => {
    const next = !s.privacyMode;
    try { localStorage.setItem('privacyMode', String(next)); } catch {}
    return { privacyMode: next };
  }),
}));
