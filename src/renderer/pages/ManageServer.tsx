import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import Button from '../components/Button';
import StatusDot from '../components/StatusDot';
import { useAppStore } from '../store/appStore';
import ConsoleTab from './manage/ConsoleTab';
import PlayersTab from './manage/PlayersTab';
import FilesTab from './manage/FilesTab';
import ServerSettingsTab from './manage/ServerSettingsTab';
import BackupsTab from './manage/BackupsTab';
import PluginsTab from './manage/PluginsTab';
import PaperSettingsTab from './manage/PaperSettingsTab';
import WorldsTab from './manage/WorldsTab';
import BlurIP from '../components/BlurIP';

const SUPPORTED_MODS = ['paper', 'purpur', 'fabric', 'forge', 'neoforge'];

function getTabs(serverType: string) {
  const base = [
    { to: 'console', label: 'Console', icon: '>' },
    { to: 'players', label: 'Players', icon: '👤' },
    { to: 'files', label: 'Files', icon: '📁' },
    { to: 'settings', label: 'Settings', icon: '⚙' },
    { to: 'backups', label: 'Backups', icon: '💾' },
  ];
  if (SUPPORTED_MODS.includes(serverType)) {
    const label = serverType === 'paper' || serverType === 'purpur' ? 'Plugins' : 'Mods';
    base.splice(2, 0, { to: 'mods', label, icon: '🧩' });
  }
  if (serverType === 'paper' || serverType === 'purpur') {
    const settingsIdx = base.findIndex((t) => t.to === 'settings');
    base.splice(settingsIdx, 0, { to: 'paper', label: 'Paper', icon: '📄' });
  }
  const settingsIdx = base.findIndex((t) => t.to === 'settings');
  base.splice(settingsIdx, 0, { to: 'worlds', label: 'Worlds', icon: '🌍' });
  return base;
}

export default function ManageServer() {
  const { id } = useParams<{ id: string }>();
  const { servers, setServers } = useAppStore();
  const navigate = useNavigate();
  const server = servers.find((s) => s.id === id);
  const tabs = server ? getTabs(server.type) : [];

  const [joinAddress, setJoinAddress] = useState('');
  const [copied, setCopied] = useState(false);
  const [tps, setTps] = useState<number[] | null>(null);

  const refresh = async () => {
    const list = await window.api.server.list();
    setServers(list);
  };

  useEffect(() => { refresh(); }, [id]);

  // TPS log listener
  useEffect(() => {
    const unsub = window.api.on('server:log', ({ id: logId, line }: any) => {
      if (logId !== id) return;
      const stripped = line.replace(/§[0-9a-fk-or]/gi, '').replace(/\x1B\[[0-9;]*m/g, '');
      const m = stripped.match(/TPS from last 1m, 5m, 15m:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
      if (m) setTps([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    });
    return () => unsub();
  }, [id]);

  // TPS polling (paper/purpur only, every 30s)
  useEffect(() => {
    if (!server) return;
    if (server.type !== 'paper' && server.type !== 'purpur') return;
    if (server.status !== 'online') { setTps(null); return; }
    window.api.server.sendCommand(server.id, 'tps').catch(() => {});
    const interval = setInterval(() => {
      if (server.status === 'online') window.api.server.sendCommand(server.id, 'tps').catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [server?.id, server?.type, server?.status]);

  // Resolve the join address when the server changes
  useEffect(() => {
    if (!server) return;
    if (server.connectionMode === 'duckdns' && server.duckdnsSubdomain) {
      setJoinAddress(`${server.duckdnsSubdomain}.duckdns.org:${server.port}`);
    } else if ((server as any).playitTunnelAddress) {
      setJoinAddress((server as any).playitTunnelAddress);
    } else {
      window.api.network.getPublicIP()
        .then((ip) => setJoinAddress(`${ip}:${server.port}`))
        .catch(() => setJoinAddress(`<your-ip>:${server.port}`));
    }
  }, [server?.id, server?.port, server?.connectionMode, server?.duckdnsSubdomain, (server as any)?.playitTunnelAddress]);

  const copyJoinAddress = async () => {
    if (!joinAddress) return;
    await navigator.clipboard.writeText(joinAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!server) {
    return <Navigate to="/servers" replace />;
  }

  const canStart = server.status === 'offline' || server.status === 'crashed';
  const canStop = server.status === 'online' || server.status === 'starting';

  return (
    <PageTransition style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 28px 0',
          borderBottom: '1px solid #1E2A3A',
          background: '#0D1322',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <Button variant="ghost" size="sm" icon="←" onClick={() => navigate('/servers')}>
            Back
          </Button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusDot status={server.status} size={10} />
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>
                {server.name}
              </h1>
              <span
                style={{
                  fontSize: 11,
                  color: '#64748B',
                  background: '#141A2B',
                  border: '1px solid #1E2A3A',
                  borderRadius: 4,
                  padding: '2px 7px',
                }}
              >
                {server.type} {server.mcVersion}
              </span>
              {tps && (
                <span
                  title={`TPS — 1m: ${tps[0]} · 5m: ${tps[1]} · 15m: ${tps[2]}`}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 4,
                    padding: '2px 7px',
                    background: tps[0] >= 19 ? '#14532D33' : tps[0] >= 15 ? '#78350F33' : '#7F1D1D33',
                    border: `1px solid ${tps[0] >= 19 ? '#14532D' : tps[0] >= 15 ? '#78350F' : '#7F1D1D'}`,
                    color: tps[0] >= 19 ? '#4ADE80' : tps[0] >= 15 ? '#FCD34D' : '#FCA5A5',
                  }}
                >
                  TPS {tps[0]}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#4B5563', marginTop: 4 }}>
              Port {server.port} · {server.ram} MB · {server.installDir}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="ghost" size="sm" icon="📁"
              onClick={() => window.api.files.openFolder(server.installDir)}
              title="Open server folder">
              Folder
            </Button>
            {/* Copy join address */}
            {joinAddress && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#0D1322',
                  border: '1px solid #2563EB40',
                  borderRadius: 8,
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
                onClick={copyJoinAddress}
                title="Copy join address"
              >
                <BlurIP value={joinAddress} style={{ fontSize: 12, fontFamily: 'monospace', color: '#93C5FD', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
                <span style={{ fontSize: 13, color: copied ? '#10B981' : '#3B82F6' }}>
                  {copied ? '✓' : '⧉'}
                </span>
              </div>
            )}
            {canStart && (
              <Button variant="primary" size="sm" icon="▶"
                onClick={async () => { await window.api.server.start(server.id); refresh(); }}>
                Start
              </Button>
            )}
            {canStop && (
              <Button variant="danger" size="sm" icon="■"
                onClick={async () => { await window.api.server.stop(server.id); refresh(); }}>
                Stop
              </Button>
            )}
            {server.status === 'online' && (
              <Button variant="secondary" size="sm"
                onClick={async () => { await window.api.server.restart(server.id); refresh(); }}>
                Restart
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              style={({ isActive }) => ({
                textDecoration: 'none',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#93C5FD' : '#64748B',
                borderBottom: isActive ? '2px solid #3B82F6' : '2px solid transparent',
                transition: 'color 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              })}
            >
              <span style={{ fontSize: 12 }}>{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Routes>
          <Route index element={<Navigate to="console" replace />} />
          <Route path="console" element={<ConsoleTab serverId={id!} status={server.status} />} />
          <Route path="players" element={<PlayersTab serverId={id!} status={server.status} />} />
          <Route path="files" element={<FilesTab serverId={id!} installDir={server.installDir} />} />
          <Route path="mods" element={<PluginsTab installDir={server.installDir} serverType={server.type} mcVersion={server.mcVersion} />} />
          {(server.type === 'paper' || server.type === 'purpur') && (
            <Route path="paper" element={<PaperSettingsTab installDir={server.installDir} />} />
          )}
          <Route path="worlds" element={<WorldsTab serverId={id!} status={server.status} />} />
          <Route path="settings" element={<ServerSettingsTab serverId={id!} server={server} />} />
          <Route path="backups" element={<BackupsTab serverId={id!} />} />
        </Routes>
      </div>
    </PageTransition>
  );
}
