import React, { useState, useEffect, useRef } from 'react';
import Button from '../../components/Button';
import type { ServerStatus } from '../../types';

interface Props {
  serverId: string;
  status: ServerStatus;
}

interface PlayerEntry {
  name: string;
  uuid?: string;
}

interface BannedIp {
  ip: string;
  source: string;
  expires: string;
  reason: string;
}

type Tab = 'online' | 'ops' | 'whitelist' | 'banned' | 'bannedips';

export default function PlayersTab({ serverId, status }: Props) {
  const [online, setOnline] = useState<string[]>([]);
  const [ops, setOps] = useState<PlayerEntry[]>([]);
  const [whitelist, setWhitelist] = useState<PlayerEntry[]>([]);
  const [banned, setBanned] = useState<PlayerEntry[]>([]);
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([]);
  const [tab, setTab] = useState<Tab>('online');
  const [addName, setAddName] = useState('');
  const [addIp, setAddIp] = useState('');
  const [addIpReason, setAddIpReason] = useState('');

  // ip -> playerName map for alt detection (never displayed, only used to find alts)
  const ipMapRef = useRef<Map<string, string>>(new Map()); // playerName -> ip

  const refresh = async () => {
    const [o, op, wl, bn, bip] = await Promise.all([
      window.api.server.getPlayers(serverId),
      window.api.server.getOps(serverId),
      window.api.server.getWhitelist(serverId),
      window.api.server.getBannedPlayers(serverId),
      window.api.server.getBannedIps(serverId),
    ]);
    setOnline(o);
    setOps((op as any[]).map((p) => ({ name: p.name, uuid: p.uuid })));
    setWhitelist((wl as any[]).map((p) => ({ name: p.name, uuid: p.uuid })));
    setBanned((bn as any[]).map((p) => ({ name: p.name, uuid: p.uuid })));
    setBannedIps(bip as BannedIp[]);
  };

  useEffect(() => {
    refresh();
    const unsubPlayers = window.api.on('server:players', ({ id, players }: any) => {
      if (id === serverId) setOnline(players);
    });
    // Parse login IPs for alt detection
    const unsubLog = window.api.on('server:log', ({ id: logId, line }: any) => {
      if (logId !== serverId) return;
      const stripped = line.replace(/\x1B\[[0-9;]*m/g, '').replace(/§[0-9a-fk-or]/gi, '');
      const m = stripped.match(/(\w+)\[\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+\] logged in/);
      if (m) ipMapRef.current.set(m[1], m[2]);
    });
    return () => { unsubPlayers(); unsubLog(); };
  }, [serverId]);

  const sendCmd = (cmd: string) => {
    if (status !== 'online') return;
    window.api.server.sendCommand(serverId, cmd);
    setTimeout(refresh, 800);
  };

  const addPlayer = () => {
    const name = addName.trim();
    if (!name || status !== 'online') return;
    if (tab === 'whitelist') sendCmd(`whitelist add ${name}`);
    else if (tab === 'ops') sendCmd(`op ${name}`);
    setAddName('');
  };

  const doAddBannedIp = async () => {
    const ip = addIp.trim();
    if (!ip) return;
    await window.api.server.addBannedIp(serverId, ip, addIpReason.trim());
    setAddIp('');
    setAddIpReason('');
    setTimeout(refresh, 600);
  };

  const doRemoveBannedIp = async (ip: string) => {
    await window.api.server.removeBannedIp(serverId, ip);
    setTimeout(refresh, 600);
  };

  // Find if a player is an alt of someone else online
  function getAltOf(playerName: string): string | null {
    const ip = ipMapRef.current.get(playerName);
    if (!ip) return null;
    for (const [name, pIp] of ipMapRef.current.entries()) {
      if (name !== playerName && pIp === ip && online.includes(name)) return name;
    }
    return null;
  }

  const TABS = [
    { id: 'online' as Tab, label: `Online (${online.length})` },
    { id: 'ops' as Tab, label: `Ops (${ops.length})` },
    { id: 'whitelist' as Tab, label: `Whitelist (${whitelist.length})` },
    { id: 'banned' as Tab, label: `Banned (${banned.length})` },
    { id: 'bannedips' as Tab, label: `Banned IPs (${bannedIps.length})` },
  ];

  const currentList: PlayerEntry[] =
    tab === 'online' ? online.map((n) => ({ name: n })) :
    tab === 'ops' ? ops :
    tab === 'whitelist' ? whitelist :
    tab === 'banned' ? banned : [];

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      {status !== 'online' && (
        <div style={{ background: '#1A2235', border: '1px solid #2D3A4A', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#64748B' }}>
          Server is offline. Some player data may be stale.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: tab === t.id ? '#2563EB' : '#1E2A3A',
              color: tab === t.id ? '#fff' : '#64748B',
              cursor: 'pointer', fontSize: 12,
              fontWeight: tab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={refresh}>↻ Refresh</Button>
      </div>

      {/* Add row for whitelist/ops */}
      {(tab === 'whitelist' || tab === 'ops') && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            placeholder={status !== 'online' ? 'Server must be online to add players' : tab === 'whitelist' ? 'Add player to whitelist…' : 'Op a player…'}
            disabled={status !== 'online'}
            style={{
              flex: 1, padding: '7px 12px', background: '#0D1322',
              border: '1px solid #2D3A4A', borderRadius: 7,
              color: '#E2E8F0', fontSize: 13, outline: 'none',
              opacity: status !== 'online' ? 0.5 : 1,
            }}
          />
          <Button size="sm" variant="primary" onClick={addPlayer} disabled={!addName.trim() || status !== 'online'}>
            {tab === 'whitelist' ? 'Add' : 'Op'}
          </Button>
        </div>
      )}

      {/* Banned IPs tab */}
      {tab === 'bannedips' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              value={addIp}
              onChange={(e) => setAddIp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doAddBannedIp()}
              placeholder="IP address to ban (e.g. 192.168.1.1)"
              style={{
                flex: '1 1 160px', padding: '7px 12px', background: '#0D1322',
                border: '1px solid #2D3A4A', borderRadius: 7,
                color: '#E2E8F0', fontSize: 13, outline: 'none',
              }}
            />
            <input
              value={addIpReason}
              onChange={(e) => setAddIpReason(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doAddBannedIp()}
              placeholder="Reason (optional)"
              style={{
                flex: '2 1 200px', padding: '7px 12px', background: '#0D1322',
                border: '1px solid #2D3A4A', borderRadius: 7,
                color: '#E2E8F0', fontSize: 13, outline: 'none',
              }}
            />
            <Button size="sm" variant="danger" onClick={doAddBannedIp} disabled={!addIp.trim()}>
              Ban IP
            </Button>
          </div>
          {bannedIps.length === 0 ? (
            <div style={{ color: '#374151', textAlign: 'center', padding: 40 }}>No banned IPs</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bannedIps.map((b) => (
                <div
                  key={b.ip}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '10px 14px',
                    background: '#141A2B', border: '1px solid #1E2A3A', borderRadius: 8, gap: 12,
                  }}
                >
                  <div style={{ fontSize: 18, color: '#EF4444' }}>🚫</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#E2E8F0', fontFamily: 'monospace' }}>{b.ip}</div>
                    {b.reason && <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{b.reason}</div>}
                    <div style={{ fontSize: 11, color: '#374151', marginTop: 1 }}>
                      Expires: {b.expires} · Source: {b.source}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => doRemoveBannedIp(b.ip)}>
                    Unban
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Player lists */}
      {tab !== 'bannedips' && (
        currentList.length === 0 ? (
          <div style={{ color: '#374151', textAlign: 'center', padding: 40 }}>
            {tab === 'online' ? 'No players online' :
             tab === 'ops' ? 'No operators' :
             tab === 'whitelist' ? 'Whitelist is empty' :
             'No banned players'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {currentList.map((p) => {
              const altOf = tab === 'online' ? getAltOf(p.name) : null;
              return (
                <div
                  key={p.name}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '10px 14px',
                    background: '#141A2B',
                    border: `1px solid ${altOf ? '#78350F' : '#1E2A3A'}`,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ marginRight: 12 }}>
                    <PlayerHead name={p.name} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>{p.name}</span>
                      {altOf && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: '#78350F', color: '#FCD34D', letterSpacing: '0.03em',
                        }}>
                          alt of {altOf}
                        </span>
                      )}
                    </div>
                    {p.uuid && <div style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace' }}>{p.uuid}</div>}
                  </div>
                  {status === 'online' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {tab === 'online' && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => sendCmd(`op ${p.name}`)}>Op</Button>
                          <Button size="sm" variant="secondary" onClick={() => sendCmd(`kick ${p.name}`)}>Kick</Button>
                          <Button size="sm" variant="danger" onClick={() => sendCmd(`ban ${p.name}`)}>Ban</Button>
                        </>
                      )}
                      {tab === 'ops' && (
                        <Button size="sm" variant="secondary" onClick={() => sendCmd(`deop ${p.name}`)}>Deop</Button>
                      )}
                      {tab === 'whitelist' && (
                        <Button size="sm" variant="danger" onClick={() => sendCmd(`whitelist remove ${p.name}`)}>Remove</Button>
                      )}
                      {tab === 'banned' && (
                        <Button size="sm" variant="secondary" onClick={() => sendCmd(`pardon ${p.name}`)}>Pardon</Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function PlayerHead({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{
        width: 36, height: 36, borderRadius: 6, flexShrink: 0,
        background: `hsl(${Math.abs(name.split('').reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)) % 360}, 55%, 30%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, color: '#fff',
      }}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={`https://minotar.net/helm/${encodeURIComponent(name)}/36`}
      alt={name}
      onError={() => setFailed(true)}
      style={{ width: 36, height: 36, borderRadius: 4, imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}
