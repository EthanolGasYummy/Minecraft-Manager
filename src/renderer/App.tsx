import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import CreateServer from './pages/CreateServer';
import NetworkPage from './pages/Network';
import SettingsPage from './pages/Settings';
import ManageServer from './pages/ManageServer';
import Onboarding from './pages/Onboarding';
import { useAppStore } from './store/appStore';

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'uptodate' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

declare global {
  interface Window {
    api: import('./types/api').API;
  }
}

export default function App() {
  const { setServers, updateServer, setSettings, setTotalRAM, setOnboardingDone, onboardingDone } =
    useAppStore();

  const [loading, setLoading] = useState(true);
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    async function init() {
      const [servers, settings, ram, obDone] = await Promise.all([
        window.api.server.list(),
        window.api.system.getSettings(),
        window.api.system.getTotalRAM(),
        window.api.system.getOnboardingDone(),
      ]);
      setServers(servers);
      setSettings(settings);
      setTotalRAM(ram);
      setOnboardingDone(obDone);
      setLoading(false);
    }
    init();
  }, []);

  // Subscribe to pushed events from main process
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      window.api.on('server:status', ({ id, status }: any) => {
        updateServer(id, { status });
      }),
    );

    unsubs.push(
      window.api.on('server:stats', ({ id, stats }: any) => {
        updateServer(id, { stats });
      }),
    );

    unsubs.push(
      window.api.on('server:players', ({ id, players }: any) => {
        updateServer(id, { players });
      }),
    );

    unsubs.push(
      window.api.on('update:status', (data: any) => setUpdate(data)),
    );

    return () => unsubs.forEach((u) => u());
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0B0F1A',
          color: '#3B82F6',
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 1,
        }}
      >
        <span style={{ marginRight: 12 }}>⛏</span> Minecraft Manager
      </div>
    );
  }

  return (
    <HashRouter>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <TitleBar />
        {!onboardingDone ? (
          <Onboarding />
        ) : (
          <>
            {update.status === 'available' && (
              <div style={{ background: '#92400E20', borderBottom: '1px solid #F59E0B40', padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ color: '#F59E0B' }}>⬆ Update v{update.version} available</span>
                <button onClick={() => window.api.update.download()} style={{ background: '#F59E0B', color: '#000', border: 'none', borderRadius: 5, padding: '3px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Download</button>
                <button onClick={() => setUpdate({ status: 'idle' })} style={{ background: 'transparent', color: '#64748B', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            )}
            {update.status === 'downloading' && (
              <div style={{ background: '#1E3A5F', borderBottom: '1px solid #3B82F640', padding: '7px 20px', fontSize: 13, color: '#93C5FD' }}>
                ⬇ Downloading update... {update.percent}%
              </div>
            )}
            {update.status === 'downloaded' && (
              <div style={{ background: '#14532D20', borderBottom: '1px solid #10B98140', padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ color: '#10B981' }}>✓ Update downloaded — restart to install</span>
                <button onClick={() => window.api.update.install()} style={{ background: '#10B981', color: '#000', border: 'none', borderRadius: 5, padding: '3px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Restart & Install</button>
              </div>
            )}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <AnimatePresence mode="wait">
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/servers" element={<Servers />} />
                  <Route path="/servers/:id/*" element={<ManageServer />} />
                  <Route path="/create" element={<CreateServer />} />
                  <Route path="/network" element={<NetworkPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </AnimatePresence>
            </main>
          </div>
          </>
        )}
      </div>
    </HashRouter>
  );
}
