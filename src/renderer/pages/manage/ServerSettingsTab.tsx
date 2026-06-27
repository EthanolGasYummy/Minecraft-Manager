import React, { useState, useEffect } from 'react';
import Button from '../../components/Button';
import RamSlider from '../../components/RamSlider';
import Card from '../../components/Card';
import { useAppStore } from '../../store/appStore';
import type { ServerListItem } from '../../types';

interface Props {
  serverId: string;
  server: ServerListItem;
}

const GAMEMODE_OPTIONS = ['survival', 'creative', 'adventure', 'spectator'];
const DIFFICULTY_OPTIONS = ['peaceful', 'easy', 'normal', 'hard'];

interface PropertyField {
  key: string;
  label: string;
  type: 'toggle' | 'select' | 'number' | 'text';
  options?: string[];
  min?: number;
  max?: number;
}

const PROPERTY_FIELDS: PropertyField[] = [
  { key: 'gamemode', label: 'Default Game Mode', type: 'select', options: GAMEMODE_OPTIONS },
  { key: 'difficulty', label: 'Difficulty', type: 'select', options: DIFFICULTY_OPTIONS },
  { key: 'pvp', label: 'PvP', type: 'toggle' },
  { key: 'enable-whitelist', label: 'Whitelist', type: 'toggle' },
  { key: 'online-mode', label: 'Online Mode (Verify accounts)', type: 'toggle' },
  { key: 'max-players', label: 'Max Players', type: 'number', min: 1, max: 500 },
  { key: 'view-distance', label: 'View Distance', type: 'number', min: 2, max: 32 },
  { key: 'simulation-distance', label: 'Simulation Distance', type: 'number', min: 2, max: 32 },
  { key: 'spawn-protection', label: 'Spawn Protection (blocks)', type: 'number', min: 0, max: 100 },
  { key: 'motd', label: 'Server Description (MOTD)', type: 'text' },
  { key: 'allow-nether', label: 'Allow Nether', type: 'toggle' },
  { key: 'generate-structures', label: 'Generate Structures', type: 'toggle' },
  { key: 'spawn-animals', label: 'Spawn Animals', type: 'toggle' },
  { key: 'spawn-monsters', label: 'Spawn Monsters', type: 'toggle' },
  { key: 'server-port', label: 'Server Port', type: 'number', min: 1024, max: 65535 },
];

const JAVA_VERSIONS = [
  { label: 'Auto (recommended)', value: 0 },
  { label: 'Java 17', value: 17 },
  { label: 'Java 21', value: 21 },
  { label: 'Java 25', value: 25 },
];

const MC_COLORS: Record<string, string> = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
  'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
};

interface MotdSeg { text: string; color: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; }

function parseMotd(raw: string): MotdSeg[][] {
  return (raw || '').split('\\n').map((line) => {
    const segs: MotdSeg[] = [];
    let cur: MotdSeg = { text: '', color: '#AAAAAA', bold: false, italic: false, underline: false, strike: false };
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if ((ch === '§' || ch === '&') && i + 1 < line.length) {
        if (cur.text) { segs.push({ ...cur }); cur = { ...cur, text: '' }; }
        const code = line[i + 1].toLowerCase();
        if (MC_COLORS[code]) cur = { text: '', color: MC_COLORS[code], bold: false, italic: false, underline: false, strike: false };
        else if (code === 'l') cur = { ...cur, text: '', bold: true };
        else if (code === 'm') cur = { ...cur, text: '', strike: true };
        else if (code === 'n') cur = { ...cur, text: '', underline: true };
        else if (code === 'o') cur = { ...cur, text: '', italic: true };
        else if (code === 'r') cur = { text: '', color: '#AAAAAA', bold: false, italic: false, underline: false, strike: false };
        i += 2;
      } else {
        cur = { ...cur, text: cur.text + ch };
        i++;
      }
    }
    if (cur.text) segs.push(cur);
    return segs;
  });
}

function MotdPreview({ motd, icon, serverName }: { motd: string; icon: string | null; serverName: string }) {
  const lines = parseMotd(motd);
  return (
    <div style={{
      background: '#131313', border: '1px solid #3A3A3A', borderRadius: 4,
      padding: '8px 10px', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      {icon ? (
        <img src={icon} alt="" style={{ width: 44, height: 44, imageRendering: 'pixelated', flexShrink: 0, borderRadius: 2 }} />
      ) : (
        <div style={{ width: 44, height: 44, background: '#2A2A2A', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⛏</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 500 }}>{serverName || 'Minecraft Server'}</span>
          <span style={{ fontSize: 11, color: '#AAAAAA', whiteSpace: 'nowrap', marginLeft: 8 }}>0/20</span>
        </div>
        {(lines.length === 0 || (lines.length === 1 && lines[0].length === 0)) ? (
          <div style={{ fontSize: 12, color: '#555555', fontStyle: 'italic' }}>A Minecraft Server</div>
        ) : (
          lines.slice(0, 2).map((segs, li) => (
            <div key={li} style={{ fontSize: 12, lineHeight: 1.5, minHeight: 18 }}>
              {segs.map((seg, si) => (
                <span key={si} style={{
                  color: seg.color,
                  fontWeight: seg.bold ? 700 : 400,
                  fontStyle: seg.italic ? 'italic' : 'normal',
                  textDecoration: [seg.underline && 'underline', seg.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
                }}>{seg.text}</span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function VersionUpdater({ serverId, server }: { serverId: string; server: any }) {
  const supportsUpdate = server.type === 'paper' || server.type === 'purpur';
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [info, setInfo] = useState<{ latestBuild: number; currentBuild: number | null; hasUpdate: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const check = async () => {
    setChecking(true); setError(null); setDone(false);
    try {
      const result = await window.api.server.checkForUpdate(serverId);
      setInfo(result);
    } catch (e: any) { setError(e?.message ?? 'Check failed'); }
    finally { setChecking(false); }
  };

  const update = async () => {
    setUpdating(true); setError(null);
    try {
      const result = await window.api.server.updateServer(serverId);
      setInfo((prev) => prev ? { ...prev, currentBuild: result.build, hasUpdate: false } : null);
      setDone(true);
    } catch (e: any) { setError(e?.message ?? 'Update failed'); }
    finally { setUpdating(false); }
  };

  if (!supportsUpdate) return null;

  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Server Version
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#CBD5E1', fontWeight: 600 }}>
            {server.type.charAt(0).toUpperCase() + server.type.slice(1)} {server.mcVersion}
          </div>
          {info && (
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              {info.currentBuild ? `Current: build #${info.currentBuild} · ` : ''}
              Latest: build #{info.latestBuild}
              {!info.hasUpdate && <span style={{ color: '#4ADE80', marginLeft: 8 }}>✓ Up to date</span>}
              {info.hasUpdate && <span style={{ color: '#FCD34D', marginLeft: 8 }}>Update available</span>}
            </div>
          )}
          {done && <div style={{ fontSize: 12, color: '#4ADE80', marginTop: 4 }}>Updated successfully — restart the server to apply</div>}
          {error && <div style={{ fontSize: 12, color: '#FCA5A5', marginTop: 4 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={check}
            disabled={checking || updating}
            style={{
              padding: '6px 14px', background: 'none', border: '1px solid #2D3A4A',
              borderRadius: 7, color: '#94A3B8', fontSize: 12, cursor: checking ? 'default' : 'pointer',
            }}
          >
            {checking ? 'Checking…' : 'Check for Update'}
          </button>
          {info?.hasUpdate && (
            <button
              onClick={update}
              disabled={updating || server.status === 'online' || server.status === 'starting'}
              title={server.status === 'online' ? 'Stop the server first' : ''}
              style={{
                padding: '6px 14px',
                background: updating ? 'none' : '#1E3A5F',
                border: `1px solid ${updating ? '#2D3A4A' : '#2563EB'}`,
                borderRadius: 7,
                color: updating ? '#4B5563' : '#93C5FD',
                fontSize: 12, fontWeight: 600,
                cursor: (updating || server.status === 'online') ? 'default' : 'pointer',
              }}
            >
              {updating ? 'Updating…' : `Update to #${info.latestBuild}`}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ServerSettingsTab({ serverId, server }: Props) {
  const { totalRAM, setServers } = useAppStore();
  const [props, setProps] = useState<Record<string, string>>({});
  const [ram, setRam] = useState(server.ram);
  const [autoRestart, setAutoRestart] = useState(server.autoRestart);
  const [maxRestarts, setMaxRestarts] = useState(server.maxRestarts);
  const [javaVersion, setJavaVersion] = useState<number>((server as any).javaVersion ?? 0);
  const [autoStartOnLaunch, setAutoStartOnLaunch] = useState<boolean>((server as any).autoStartOnLaunch ?? false);
  const [schedEnabled, setSchedEnabled] = useState<boolean>((server as any).scheduledRestart?.enabled ?? false);
  const [schedHour, setSchedHour] = useState<number>((server as any).scheduledRestart?.hour ?? 4);
  const [schedMinute, setSchedMinute] = useState<number>((server as any).scheduledRestart?.minute ?? 0);
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.api.server.getIcon(serverId).then(setIcon).catch(() => {});
  }, [serverId]);

  useEffect(() => {
    window.api.server.getProperties(serverId).then(setProps);
    setRam(server.ram);
    setAutoRestart(server.autoRestart);
    setMaxRestarts(server.maxRestarts);
    setJavaVersion((server as any).javaVersion ?? 0);
    setAutoStartOnLaunch((server as any).autoStartOnLaunch ?? false);
    setSchedEnabled((server as any).scheduledRestart?.enabled ?? false);
    setSchedHour((server as any).scheduledRestart?.hour ?? 4);
    setSchedMinute((server as any).scheduledRestart?.minute ?? 0);
  }, [serverId, server.ram, server.autoRestart, server.maxRestarts, (server as any).javaVersion, (server as any).autoStartOnLaunch]);

  const exportConfig = async () => {
    const content = await window.api.server.exportConfig(serverId);
    if (content) await window.api.server.saveExportFile(content, server.name);
  };

  const save = async () => {
    setSaving(true);
    await window.api.server.setProperties(serverId, props);
    await window.api.server.updateConfig(serverId, {
      ram, autoRestart, maxRestarts, autoStartOnLaunch,
      javaVersion: javaVersion === 0 ? undefined : javaVersion,
      scheduledRestart: { enabled: schedEnabled, hour: schedHour, minute: schedMinute },
    });
    const list = await window.api.server.list();
    setServers(list);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setProp = (key: string, value: string) => setProps((p) => ({ ...p, [key]: value }));

  const uploadIcon = async () => {
    const file = await window.api.files.pickFile([{ name: 'PNG Image', extensions: ['png'] }]);
    if (!file) return;
    await window.api.server.setIcon(serverId, file);
    const fresh = await window.api.server.getIcon(serverId);
    setIcon(fresh);
  };

  const removeIcon = async () => {
    await window.api.server.removeIcon(serverId);
    setIcon(null);
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>Server Settings</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={exportConfig}>Export Config</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {saved ? '✓ Saved' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <VersionUpdater serverId={serverId} server={server} />

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Server Icon
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {icon ? (
            <img src={icon} alt="icon" style={{ width: 64, height: 64, borderRadius: 8, imageRendering: 'pixelated', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 8, background: '#141A2B', border: '1px dashed #2D3A4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#374151', flexShrink: 0 }}>
              ⛏
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={uploadIcon}>
              {icon ? 'Change Icon' : 'Upload Icon'}
            </Button>
            {icon && (
              <Button size="sm" variant="danger" onClick={removeIcon}>Remove</Button>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#4B5563' }}>PNG, 64×64 recommended</span>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Performance
        </h3>
        <RamSlider value={ram} onChange={setRam} maxMB={totalRAM} />
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>Java Version</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Override if plugins need a specific version (e.g. Java 25)</div>
          </div>
          <select
            value={javaVersion}
            onChange={(e) => setJavaVersion(Number(e.target.value))}
            style={{ ...selectStyle, width: 160 }}
          >
            {JAVA_VERSIONS.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>Auto-Restart on Crash</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Automatically restart if the server crashes</div>
          </div>
          <Toggle value={autoRestart} onChange={setAutoRestart} />
        </div>
        {autoRestart && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#94A3B8' }}>Max restarts per session</span>
            <input
              type="number"
              min={1}
              max={20}
              value={maxRestarts}
              onChange={(e) => setMaxRestarts(Number(e.target.value))}
              style={{ ...numInput, width: 60 }}
            />
          </div>
        )}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>Auto-start on App Launch</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Automatically start this server when the app opens</div>
          </div>
          <Toggle value={autoStartOnLaunch} onChange={setAutoStartOnLaunch} />
        </div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>Scheduled Daily Restart</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Restart the server automatically at a set time each day</div>
          </div>
          <Toggle value={schedEnabled} onChange={setSchedEnabled} />
        </div>
        {schedEnabled && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#94A3B8' }}>Restart daily at</span>
            <input
              type="number" min={0} max={23} value={schedHour}
              onChange={(e) => setSchedHour(Math.max(0, Math.min(23, Number(e.target.value))))}
              style={{ ...numInput, width: 54, textAlign: 'center' }}
            />
            <span style={{ fontSize: 14, color: '#64748B' }}>:</span>
            <input
              type="number" min={0} max={59} value={String(schedMinute).padStart(2, '0')}
              onChange={(e) => setSchedMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
              style={{ ...numInput, width: 54, textAlign: 'center' }}
            />
            <span style={{ fontSize: 12, color: '#4B5563' }}>
              (local time · gives players 60s warning)
            </span>
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          server.properties
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {PROPERTY_FIELDS.map((field) => {
            if (field.key === 'motd') {
              return (
                <div key="motd" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 13, color: '#CBD5E1' }}>{field.label}</label>
                  <input
                    type="text"
                    value={props['motd'] ?? ''}
                    onChange={(e) => setProp('motd', e.target.value)}
                    placeholder="A Minecraft Server"
                    style={{ ...numInput, width: '100%', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 11, color: '#374151' }}>
                    Use §a–§f for colors, §l bold, §o italic, §r reset · \n for a second line · &amp; also works
                  </div>
                  <MotdPreview motd={props['motd'] ?? ''} icon={icon} serverName={server.name} />
                </div>
              );
            }
            return (
              <div key={field.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <label style={{ fontSize: 13, color: '#CBD5E1', flex: 1 }}>{field.label}</label>
                {field.type === 'toggle' && (
                  <Toggle
                    value={props[field.key] === 'true'}
                    onChange={(v) => setProp(field.key, v ? 'true' : 'false')}
                  />
                )}
                {field.type === 'select' && (
                  <select
                    value={props[field.key] ?? field.options?.[0] ?? ''}
                    onChange={(e) => setProp(field.key, e.target.value)}
                    style={selectStyle}
                  >
                    {field.options?.map((o) => (
                      <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                    ))}
                  </select>
                )}
                {field.type === 'number' && (
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={props[field.key] ?? ''}
                    onChange={(e) => setProp(field.key, e.target.value)}
                    style={{ ...numInput, width: 80 }}
                  />
                )}
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={props[field.key] ?? ''}
                    onChange={(e) => setProp(field.key, e.target.value)}
                    style={{ ...numInput, width: 240 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div style={{ marginTop: 16, padding: '10px 14px', background: '#0D1322', borderRadius: 8, fontSize: 12, color: '#4B5563' }}>
        Changes take effect after the next server restart.
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: value ? '#2563EB' : '#1E2A3A',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        border: '1px solid ' + (value ? '#3B82F6' : '#2D3A4A'),
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 2,
          left: value ? 20 : 2,
          transition: 'left 0.2s',
        }}
      />
    </div>
  );
}

const numInput: React.CSSProperties = {
  padding: '5px 10px',
  background: '#0D1322',
  border: '1px solid #2D3A4A',
  borderRadius: 6,
  color: '#E2E8F0',
  fontSize: 13,
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...numInput,
  width: 140,
  cursor: 'pointer',
};
