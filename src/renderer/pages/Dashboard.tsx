import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import Card from '../components/Card';
import Button from '../components/Button';
import StatusDot from '../components/StatusDot';
import { useAppStore } from '../store/appStore';
import type { ServerListItem } from '../types';

const TYPE_COLORS: Record<string, string> = {
  paper: '#3B82F6', purpur: '#8B5CF6', fabric: '#F59E0B',
  forge: '#EF4444', neoforge: '#F97316', vanilla: '#10B981',
};

export default function Dashboard() {
  const { servers, setServers, updateServer } = useAppStore();
  const navigate = useNavigate();

  const refresh = async () => {
    const list = await window.api.server.list();
    setServers(list);
  };

  useEffect(() => {
    refresh();

    // Real-time updates from main process
    const unsubStatus = window.api.on('server:status', ({ id, status }: any) => {
      updateServer(id, { status });
    });
    const unsubPlayers = window.api.on('server:players', ({ id, players }: any) => {
      updateServer(id, { players });
    });
    const unsubStats = window.api.on('server:stats', ({ id, stats }: any) => {
      updateServer(id, { stats });
    });

    return () => { unsubStatus(); unsubPlayers(); unsubStats(); };
  }, []);

  const handleStart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.api.server.start(id);
    refresh();
  };

  const handleStop = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.api.server.stop(id);
    refresh();
  };

  const copyAddress = async (server: ServerListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    let addr: string;
    if (server.connectionMode === 'duckdns' && server.duckdnsSubdomain) {
      addr = `${server.duckdnsSubdomain}.duckdns.org:${server.port}`;
    } else if ((server as any).playitTunnelAddress) {
      addr = (server as any).playitTunnelAddress;
    } else {
      try {
        const ip = await window.api.network.getPublicIP();
        addr = `${ip}:${server.port}`;
      } catch {
        addr = `<your-ip>:${server.port}`;
      }
    }
    await navigator.clipboard.writeText(addr);
  };

  return (
    <PageTransition>
      <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>Dashboard</h1>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
              {servers.length} server{servers.length !== 1 ? 's' : ''} · {servers.filter((s) => s.status === 'online').length} online
            </p>
          </div>
          <Button variant="primary" icon="+" onClick={() => navigate('/create')}>
            New Server
          </Button>
        </div>

        {servers.length === 0 ? (
          <EmptyState onCreate={() => navigate('/create')} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            <AnimatePresence>
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  onClick={() => navigate(`/servers/${server.id}`)}
                  onStart={handleStart}
                  onStop={handleStop}
                  onCopy={copyAddress}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function ServerCard({
  server, onClick, onStart, onStop, onCopy,
}: {
  server: ServerListItem;
  onClick: () => void;
  onStart: (id: string, e: React.MouseEvent) => void;
  onStop: (id: string, e: React.MouseEvent) => void;
  onCopy: (s: ServerListItem, e: React.MouseEvent) => void;
}) {
  const [icon, setIcon] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const canStart = server.status === 'offline' || server.status === 'crashed';
  const canStop = server.status === 'online' || server.status === 'starting';
  const color = TYPE_COLORS[server.type] ?? '#64748B';
  const playerCount = server.players?.length ?? 0;

  useEffect(() => {
    window.api.server.getIcon(server.id).then(setIcon).catch(() => {});
  }, [server.id]);

  const handleCopy = async (e: React.MouseEvent) => {
    await onCopy(server, e);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
    >
      <Card onClick={onClick} hoverable style={{ cursor: 'pointer' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {/* Favicon or colored placeholder */}
          {icon ? (
            <img
              src={icon}
              alt=""
              style={{ width: 40, height: 40, borderRadius: 8, imageRendering: 'pixelated', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: color + '20', border: `1px solid ${color}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 700, color,
            }}>
              {server.type[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <StatusDot status={server.status} size={9} />
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {server.name}
              </h3>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              {server.type.charAt(0).toUpperCase() + server.type.slice(1)} {server.mcVersion}
            </p>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, color, flexShrink: 0,
            background: color + '18', border: `1px solid ${color}40`,
            borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: 0.8,
          }}>
            {server.type}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: playerCount > 0 ? 10 : 14 }}>
          <StatBox label="Players" value={playerCount} highlight={playerCount > 0} />
          <StatBox label="RAM" value={`${server.stats?.ramMB ?? server.ram} MB`} />
          <StatBox label="CPU" value={`${server.stats?.cpuPercent ?? 0}%`} />
          <StatBox label="Port" value={server.port} />
        </div>

        {/* Player names when online */}
        {playerCount > 0 && server.players && (
          <div style={{
            marginBottom: 14, padding: '6px 10px',
            background: '#0D1322', borderRadius: 6, border: '1px solid #1A2235',
          }}>
            <span style={{ fontSize: 11, color: '#64748B' }}>Online: </span>
            <span style={{ fontSize: 11, color: '#93C5FD' }}>{server.players.join(', ')}</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {canStart && (
            <Button variant="primary" size="sm" icon="▶" style={{ flex: 1 }} onClick={(e) => onStart(server.id, e)}>
              Start
            </Button>
          )}
          {canStop && (
            <Button variant="danger" size="sm" icon="■" style={{ flex: 1 }} onClick={(e) => onStop(server.id, e)}>
              Stop
            </Button>
          )}
          {server.status === 'starting' && (
            <Button variant="ghost" size="sm" disabled style={{ flex: 1 }}>Starting…</Button>
          )}
          {server.status === 'stopping' && (
            <Button variant="ghost" size="sm" disabled style={{ flex: 1 }}>Stopping…</Button>
          )}
          <Button
            variant="ghost" size="sm"
            icon={copiedAddr ? '✓' : '⧉'}
            onClick={handleCopy}
            title="Copy join address"
          />
        </div>
      </Card>
    </motion.div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div style={{
      background: '#0D1322', borderRadius: 7, padding: '7px 10px',
      border: `1px solid ${highlight ? '#3B82F640' : '#1A2235'}`,
    }}>
      <div style={{ fontSize: 10, color: '#4B5563', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: highlight ? '#93C5FD' : '#CBD5E1' }}>{value}</div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ textAlign: 'center', padding: '80px 40px' }}
    >
      <div style={{ fontSize: 60, marginBottom: 20 }}>⛏</div>
      <h2 style={{ fontSize: 20, color: '#94A3B8', fontWeight: 600, marginBottom: 10 }}>No servers yet</h2>
      <p style={{ fontSize: 14, color: '#4B5563', marginBottom: 28 }}>
        Create your first Minecraft server and share it with friends in minutes.
      </p>
      <Button variant="primary" icon="+" size="lg" onClick={onCreate}>
        Create Your First Server
      </Button>
    </motion.div>
  );
}
