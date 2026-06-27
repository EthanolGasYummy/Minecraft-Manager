import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import Card from '../components/Card';
import Button from '../components/Button';
import { useAppStore } from '../store/appStore';
import type { ServerListItem } from '../types';
import BlurIP from '../components/BlurIP';

interface CGNATResult {
  isCGNAT: boolean;
  publicIP: string;
  localIP: string;
  reason: string;
}

interface PortResult {
  external: boolean;
  local: boolean;
  upnp: boolean;
}

export default function NetworkPage() {
  const { settings, setServers } = useAppStore();
  // Load servers fresh on mount so the selector is always populated
  const [servers, setLocalServers] = useState<ServerListItem[]>([]);
  const [cgnat, setCgnat] = useState<CGNATResult | null>(null);
  const [cgnatLoading, setCgnatLoading] = useState(false);
  const [portStatus, setPortStatus] = useState<PortResult | null>(null);
  const [portLoading, setPortLoading] = useState(false);
  const [upnpResult, setUpnpResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [upnpLoading, setUpnpLoading] = useState(false);
  const [duckdnsSubdomain, setDuckdnsSubdomain] = useState(settings?.duckdnsSubdomain ?? '');
  const [duckdnsToken, setDuckdnsToken] = useState(settings?.duckdnsToken ?? '');
  const [duckdnsResult, setDuckdnsResult] = useState<{ ok: boolean; ip: string } | null>(null);
  const [playitStatus, setPlayitStatus] = useState<{ running: boolean; tunnelAddress?: string } | null>(null);
  const [playitLoading, setPlayitLoading] = useState(false);
  const [playitClaimUrl, setPlayitClaimUrl] = useState('');
  const [playitLogs, setPlayitLogs] = useState<string[]>([]);
  const [playitTunnelsActive, setPlayitTunnelsActive] = useState(0);
  const [playitManualAddr, setPlayitManualAddr] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [tab, setTab] = useState<'duckdns' | 'playit' | 'portcheck'>('duckdns');

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const port = selectedServer?.port ?? 25565;

  useEffect(() => {
    window.api.server.list().then((list) => {
      setLocalServers(list);
      setServers(list);
      if (list.length > 0) setSelectedServerId(list[0].id);
    });
    runCGNATCheck();
  }, []);

  // Load saved playit address when selected server changes
  useEffect(() => {
    if (!selectedServerId) return;
    const saved = (selectedServer as any)?.playitTunnelAddress ?? '';
    if (saved) setPlayitManualAddr(saved);
  }, [selectedServerId]);

  useEffect(() => {
    const unsub = window.api.on('playit:status', ({ tunnelAddress, claimUrl, stopped, running, line, tunnelsActive }: any) => {
      if (running) setPlayitStatus((prev) => ({ running: true, tunnelAddress: prev?.tunnelAddress }));
      if (tunnelAddress) setPlayitStatus({ running: true, tunnelAddress });
      if (claimUrl) setPlayitClaimUrl(claimUrl);
      if (line) setPlayitLogs((prev) => [...prev.slice(-80), line]);
      if (tunnelsActive) {
        setPlayitTunnelsActive(tunnelsActive);
        // Auto-apply saved address when tunnel connects
        setPlayitManualAddr((saved) => {
          if (saved) setPlayitStatus((prev) => ({ running: true, tunnelAddress: prev?.tunnelAddress ?? saved }));
          return saved;
        });
      }
      if (stopped) { setPlayitStatus({ running: false }); setPlayitClaimUrl(''); setPlayitTunnelsActive(0); }
    });
    return () => unsub();
  }, []);

  const runCGNATCheck = async () => {
    setCgnatLoading(true);
    try {
      const result = await window.api.network.detectCGNAT();
      setCgnat(result);
    } finally {
      setCgnatLoading(false);
    }
  };

  const checkPort = async () => {
    setPortLoading(true);
    try {
      const result = await window.api.network.checkPort(port);
      setPortStatus(result);
    } finally {
      setPortLoading(false);
    }
  };

  const mapUPnP = async () => {
    setUpnpLoading(true);
    try {
      const result = await window.api.network.upnpMap(port);
      setUpnpResult(result);
    } finally {
      setUpnpLoading(false);
    }
  };

  const updateDuckDNS = async () => {
    const result = await window.api.network.duckdnsUpdate(duckdnsSubdomain, duckdnsToken);
    setDuckdnsResult(result);
    await window.api.system.setSettings({ duckdnsSubdomain, duckdnsToken });
  };

  const startPlayit = async () => {
    setPlayitLoading(true);
    try {
      const result = await window.api.network.playitStart(selectedServerId || 'default');
      // Process is spawned — show running state immediately, tunnel address arrives via push event
      setPlayitStatus({ running: true, tunnelAddress: result.tunnelAddress });
    } catch (err: any) {
      alert(`Failed to start playit: ${err?.message ?? err}`);
    } finally {
      setPlayitLoading(false);
    }
  };

  const stopPlayit = async () => {
    await window.api.network.playitStop(selectedServerId);
    setPlayitStatus({ running: false });
    setPlayitClaimUrl('');
    setPlayitLogs([]);
    setPlayitManualAddr('');
  };

  const getJoinAddress = () => {
    if (tab === 'duckdns' && duckdnsSubdomain) return `${duckdnsSubdomain}.duckdns.org:${port}`;
    if (tab === 'playit') {
      return playitStatus?.tunnelAddress || playitManualAddr || `${cgnat?.publicIP ?? '...'}:${port}`;
    }
    return `${cgnat?.publicIP ?? '...'}:${port}`;
  };

  const copyAddress = async () => {
    await navigator.clipboard.writeText(getJoinAddress());
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <PageTransition>
      <div style={{ padding: 32, maxWidth: 720 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>Network</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>
          Configure how friends connect to your server
        </p>

        {/* CGNAT banner */}
        {cgnat && (
          <div style={{
            background: cgnat.isCGNAT ? '#451A0320' : '#064E3B20',
            border: `1px solid ${cgnat.isCGNAT ? '#F59E0B40' : '#10B98140'}`,
            borderRadius: 9, padding: '12px 16px', marginBottom: 20,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18 }}>{cgnat.isCGNAT ? '⚠' : '✓'}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: cgnat.isCGNAT ? '#F59E0B' : '#10B981', marginBottom: 4 }}>
                {cgnat.isCGNAT ? 'CGNAT Detected — Use playit.gg' : 'No CGNAT detected'}
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>
                Public IP: <strong><BlurIP value={cgnat.publicIP} /></strong> · Local IP: {cgnat.localIP}
                {cgnat.isCGNAT && ` · ${cgnat.reason}`}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={runCGNATCheck} loading={cgnatLoading} style={{ marginLeft: 'auto' }}>
              Recheck
            </Button>
          </div>
        )}

        {/* Server selector */}
        {servers.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: '#64748B', marginBottom: 6, display: 'block' }}>Server</label>
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              style={{ padding: '8px 12px', background: '#141A2B', border: '1px solid #2D3A4A', borderRadius: 7, color: '#E2E8F0', fontSize: 13, cursor: 'pointer', outline: 'none', width: 300 }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — port {s.port}</option>
              ))}
            </select>
          </div>
        )}

        {servers.length === 0 && (
          <div style={{ background: '#141A2B', border: '1px solid #1E2A3A', borderRadius: 9, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#64748B' }}>
            No servers yet — create one first, then come back here to configure sharing.
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['duckdns', 'playit', 'portcheck'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '7px 16px', borderRadius: 7, border: tab === t ? 'none' : '1px solid #1E2A3A',
                background: tab === t ? '#2563EB' : '#141A2B',
                color: tab === t ? '#fff' : '#64748B',
                cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400,
              } as React.CSSProperties}
            >
              {t === 'duckdns' ? '🌐 DuckDNS' : t === 'playit' ? '🔗 playit.gg' : '🔌 Port Check'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'duckdns' && (
            <motion.div key="duckdns" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', marginBottom: 6 }}>DuckDNS</h3>
                <p style={{ fontSize: 12, color: '#64748B', marginBottom: 18, lineHeight: 1.6 }}>
                  Zero-latency — traffic goes directly to you. Requires port forwarding on your router.
                  Get a free subdomain at{' '}
                  <span onClick={() => window.api.system.openExternal('https://www.duckdns.org')} style={{ color: '#3B82F6', cursor: 'pointer', textDecoration: 'underline' }}>
                    duckdns.org
                  </span>.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4 }}>Subdomain</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={duckdnsSubdomain} onChange={(e) => setDuckdnsSubdomain(e.target.value)} placeholder="myserver" style={inputStyle} />
                      <span style={{ fontSize: 13, color: '#4B5563', whiteSpace: 'nowrap' }}>.duckdns.org</span>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4 }}>Token</label>
                    <input type="password" value={duckdnsToken} onChange={(e) => setDuckdnsToken(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <Button variant="primary" onClick={updateDuckDNS} disabled={!duckdnsSubdomain || !duckdnsToken}>
                    Update DuckDNS
                  </Button>
                  {duckdnsResult && (
                    <div style={{ fontSize: 12, color: duckdnsResult.ok ? '#10B981' : '#EF4444' }}>
                      {duckdnsResult.ok ? '✓ DuckDNS updated successfully' : '✕ Update failed — check your subdomain and token'}
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  UPnP Port Forwarding
                </h3>
                <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 1.6 }}>
                  Auto-forward port {port} on your router (requires UPnP enabled in router settings).
                </p>
                <Button variant="secondary" loading={upnpLoading} onClick={mapUPnP}>
                  Auto-Forward Port {port}
                </Button>
                {upnpResult && (
                  <div style={{ marginTop: 10, fontSize: 13, color: upnpResult.success ? '#10B981' : '#EF4444' }}>
                    {upnpResult.success ? `✓ Port ${port} forwarded via UPnP` : `✕ UPnP failed: ${upnpResult.error}`}
                  </div>
                )}
                {upnpResult && !upnpResult.success && (
                  <div style={{ marginTop: 12, background: '#0D1322', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#94A3B8', lineHeight: 1.6 }}>
                    <strong style={{ color: '#CBD5E1' }}>Manual port forwarding:</strong><br />
                    1. Open <strong>192.168.1.1</strong> (or your router's IP) in a browser<br />
                    2. Log in and find "Port Forwarding" (under Advanced or Firewall)<br />
                    3. Add rule: Protocol <strong>TCP</strong>, External Port <strong>{port}</strong>, Internal IP <strong>{cgnat?.localIP ?? 'your PC IP'}</strong>, Internal Port <strong>{port}</strong><br />
                    4. Save and restart if prompted
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {tab === 'playit' && (
            <motion.div key="playit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', marginBottom: 6 }}>playit.gg Tunnel</h3>
                <p style={{ fontSize: 12, color: '#64748B', marginBottom: 18, lineHeight: 1.6 }}>
                  No port forwarding required. Your IP is hidden. Traffic is relayed — adds some latency. Best for CGNAT users or those who can't port-forward.
                </p>
                {!playitStatus?.running ? (
                  <Button variant="primary" loading={playitLoading} onClick={startPlayit}>
                    Start Tunnel
                  </Button>
                ) : (
                  <div>
                    <div style={{ background: '#064E3B30', border: '1px solid #10B98140', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: '#10B981', fontWeight: 600, marginBottom: 6 }}>
                        {playitStatus.tunnelAddress ? 'Tunnel Active' : playitTunnelsActive > 0 ? `${playitTunnelsActive} tunnel${playitTunnelsActive > 1 ? 's' : ''} connected` : 'Starting…'}
                      </div>
                      {playitStatus.tunnelAddress ? (
                        <div style={{ fontSize: 15, color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>
                          {playitStatus.tunnelAddress}
                        </div>
                      ) : playitTunnelsActive > 0 ? (
                        <div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>
                            playit v1.0+ stores addresses server-side. Find yours at{' '}
                            <span
                              onClick={() => window.api.system.openExternal('https://playit.gg/account/tunnels')}
                              style={{ color: '#3B82F6', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              playit.gg/account/tunnels
                            </span>
                            , then paste it below:
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              value={playitManualAddr}
                              onChange={(e) => setPlayitManualAddr(e.target.value)}
                              placeholder="e.g. 147.185.221.17:25565"
                              style={{ flex: 1, padding: '7px 10px', background: '#0D1322', border: '1px solid #2D3A4A', borderRadius: 7, color: '#E2E8F0', fontSize: 13, outline: 'none', fontFamily: 'monospace' }}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!playitManualAddr.trim()}
                              onClick={() => {
                                const addr = playitManualAddr.trim();
                                setPlayitStatus({ running: true, tunnelAddress: addr });
                                if (selectedServerId) {
                                  window.api.server.updateConfig(selectedServerId, { playitTunnelAddress: addr });
                                }
                              }}
                            >
                              Set
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>Connecting…</div>
                      )}
                    </div>
                    {playitClaimUrl && (
                      <div style={{ background: '#1E3A5F30', border: '1px solid #3B82F640', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#93C5FD', lineHeight: 1.6 }}>
                        ⚠ A browser window opened to authorize playit. Complete authorization, then the tunnel address will appear above.
                      </div>
                    )}
                    <Button variant="danger" size="sm" onClick={stopPlayit}>Stop Tunnel</Button>
                  </div>
                )}
                {/* Live playit log output */}
                {playitLogs.length > 0 && (
                  <div style={{ marginTop: 14, background: '#070B14', border: '1px solid #1E2A3A', borderRadius: 8, padding: '10px 12px', maxHeight: 180, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>
                    {playitLogs.map((line, i) => (
                      <div key={i} style={{ color: line.toLowerCase().includes('error') ? '#EF4444' : line.toLowerCase().includes('tunnel') || line.toLowerCase().includes('connect') ? '#93C5FD' : '#64748B' }}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {tab === 'portcheck' && (
            <motion.div key="portcheck" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', marginBottom: 6 }}>Port Check</h3>
                <p style={{ fontSize: 12, color: '#64748B', marginBottom: 18 }}>
                  Test whether port {port} is reachable from the internet.
                </p>
                <Button variant="secondary" loading={portLoading} onClick={checkPort}>
                  Check Port {port}
                </Button>
                {portStatus && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <PortRow label="Externally reachable" ok={portStatus.external} />
                    <PortRow label="Server listening locally" ok={portStatus.local} />
                  </div>
                )}
                {portStatus && !portStatus.external && (
                  <div style={{ marginTop: 14, fontSize: 12, color: '#F59E0B', background: '#451A0320', borderRadius: 8, padding: '10px 14px', lineHeight: 1.6 }}>
                    Port not reachable externally. Check that your server is running, your firewall allows port {port}, and port forwarding / DuckDNS is configured correctly.
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Copy join address — always visible */}
        <div style={{ marginTop: 24, background: '#141A2B', border: '1px solid #2563EB40', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Join Address</div>
            <BlurIP value={getJoinAddress()} style={{ fontSize: 15, fontFamily: 'monospace', color: '#E2E8F0', fontWeight: 600 }} />
          </div>
          <Button variant="primary" onClick={copyAddress} icon={copiedAddress ? '✓' : '⧉'}>
            {copiedAddress ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}

function PortRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 14 }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize: 13, color: ok ? '#10B981' : '#EF4444' }}>{label}</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  background: '#0D1322',
  border: '1px solid #2D3A4A',
  borderRadius: 7,
  color: '#E2E8F0',
  fontSize: 13,
  outline: 'none',
};
