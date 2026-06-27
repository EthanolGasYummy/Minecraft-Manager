import React, { useState, useEffect, useCallback } from 'react';
import type { ServerStatus } from '../../types';

interface WorldInfo {
  name: string;
  path: string;
  size: number;
  borderSize: number | null;
}

interface Props {
  serverId: string;
  status: ServerStatus;
}

const DEFAULT_BORDER = 59_999_968;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function worldEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('nether') || lower.endsWith('_nether')) return '🔥';
  if (lower.includes('end') || lower.endsWith('_the_end')) return '🌌';
  return '🌍';
}

function formatBorder(size: number): string {
  const d = Math.round(size).toLocaleString();
  return `${d} × ${d} blocks`;
}

function BorderRow({ world, serverId, status, onUpdated }: {
  world: WorldInfo;
  serverId: string;
  status: ServerStatus;
  onUpdated: () => void;
}) {
  const isOnline = status === 'online';
  const hasCustomBorder = world.borderSize !== null && world.borderSize < DEFAULT_BORDER;

  const [inputVal, setInputVal] = useState(
    hasCustomBorder ? String(Math.round(world.borderSize!)) : ''
  );
  const [setting, setSetting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const setBorder = async () => {
    const num = parseInt(inputVal, 10);
    if (!num || num <= 0) return;
    setSetting(true);
    setFeedback(null);
    try {
      await window.api.server.sendCommand(serverId, `worldborder set ${num}`);
      setFeedback(`Set to ${num.toLocaleString()} × ${num.toLocaleString()} blocks`);
      setTimeout(() => {
        setFeedback(null);
        onUpdated();
      }, 1500);
    } catch {
      setFeedback('Failed to set border');
    } finally {
      setSetting(false);
    }
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1A2235' }}>
      <div style={{ fontSize: 11, color: '#4B5563', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        World Border
      </div>
      {hasCustomBorder ? (
        <div style={{ fontSize: 13, color: '#93C5FD', fontWeight: 600, marginBottom: 8 }}>
          {formatBorder(world.borderSize!)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>No custom border set</div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: '#08090F', border: '1px solid #2D3A4A', borderRadius: 7, overflow: 'hidden', flex: 1, maxWidth: 280 }}>
          <input
            type="number"
            min={1}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isOnline && setBorder()}
            placeholder="Size (e.g. 1000)"
            disabled={!isOnline}
            style={{
              flex: 1, padding: '6px 10px', background: 'transparent', border: 'none',
              color: '#E2E8F0', fontSize: 12, outline: 'none',
              opacity: isOnline ? 1 : 0.4,
            }}
          />
          {inputVal && !isNaN(parseInt(inputVal)) && parseInt(inputVal) > 0 && (
            <span style={{ fontSize: 11, color: '#4B5563', paddingRight: 8, whiteSpace: 'nowrap' }}>
              = {parseInt(inputVal).toLocaleString()} × {parseInt(inputVal).toLocaleString()}
            </span>
          )}
        </div>
        <button
          onClick={setBorder}
          disabled={!isOnline || setting || !inputVal}
          title={!isOnline ? 'Server must be online to change the border' : ''}
          style={{
            padding: '6px 14px',
            background: isOnline && inputVal ? '#1E3A5F' : 'none',
            border: '1px solid ' + (isOnline && inputVal ? '#2563EB' : '#1E2A3A'),
            borderRadius: 7, color: isOnline && inputVal ? '#93C5FD' : '#374151',
            fontSize: 12, fontWeight: 600, cursor: isOnline && inputVal ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
          }}
        >
          {setting ? '…' : 'Set Border'}
        </button>
      </div>
      {!isOnline && (
        <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>Start the server to change the world border</div>
      )}
      {feedback && (
        <div style={{ fontSize: 12, color: '#4ADE80', marginTop: 6 }}>{feedback}</div>
      )}
    </div>
  );
}

export default function WorldsTab({ serverId, status }: Props) {
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<WorldInfo | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.server.getWorlds(serverId);
      setWorlds(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load worlds');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  const isOffline = status === 'offline' || status === 'crashed';

  const doReset = async () => {
    if (!confirm) return;
    setResetting(confirm.name);
    setConfirm(null);
    try {
      await window.api.server.resetWorld(serverId, confirm.name);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Reset failed');
    } finally {
      setResetting(null);
    }
  };

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#E2E8F0' }}>World Manager</h2>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '5px 14px', background: 'none', border: '1px solid #2D3A4A',
            borderRadius: 7, color: '#94A3B8', fontSize: 12, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '…' : '⟳ Refresh'}
        </button>
      </div>

      {!isOffline && (
        <div style={{
          background: '#78350F22', border: '1px solid #78350F',
          borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#FCD34D',
        }}>
          ⚠ Stop the server before resetting a world.
        </div>
      )}

      {error && (
        <div style={{ background: '#7F1D1D22', border: '1px solid #7F1D1D', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#FCA5A5' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#4B5563', fontSize: 13 }}>Loading worlds…</div>
      ) : worlds.length === 0 ? (
        <div style={{ color: '#4B5563', fontSize: 13 }}>No world folders detected.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {worlds.map((w) => (
            <div
              key={w.name}
              style={{
                background: '#0D1322', border: '1px solid #1E2A3A', borderRadius: 10,
                padding: '14px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 22 }}>{worldEmoji(w.name)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>{formatBytes(w.size)}</div>
                </div>
                <button
                  onClick={() => { setError(null); setConfirm(w); }}
                  disabled={!isOffline || resetting === w.name}
                  title={!isOffline ? 'Stop the server first' : 'Delete all chunks and reset this world'}
                  style={{
                    padding: '6px 14px',
                    background: isOffline && resetting !== w.name ? '#7F1D1D33' : 'none',
                    border: '1px solid ' + (isOffline && resetting !== w.name ? '#7F1D1D' : '#1E2A3A'),
                    borderRadius: 7, color: isOffline && resetting !== w.name ? '#FCA5A5' : '#374151',
                    fontSize: 12, fontWeight: 600, cursor: isOffline && resetting !== w.name ? 'pointer' : 'default',
                  }}
                >
                  {resetting === w.name ? 'Resetting…' : '🗑 Reset'}
                </button>
              </div>

              <BorderRow world={w} serverId={serverId} status={status} onUpdated={load} />
            </div>
          ))}
        </div>
      )}

      {/* Confirm modal */}
      {confirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: '#00000090', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setConfirm(null)}
        >
          <div
            style={{ background: '#141A2B', border: '1px solid #2D3A4A', borderRadius: 14, padding: 28, width: 380, maxWidth: '90vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#E2E8F0', marginBottom: 10 }}>
              Reset "{confirm.name}"?
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>
              This will permanently delete all chunks ({formatBytes(confirm.size)}). A new world will generate fresh on next server start.
            </div>
            <div style={{ fontSize: 12, color: '#FCA5A5', marginBottom: 22 }}>
              This cannot be undone. Consider making a backup first.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirm(null)}
                style={{ padding: '8px 18px', background: 'none', border: '1px solid #2D3A4A', borderRadius: 8, color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={doReset}
                style={{ padding: '8px 18px', background: '#7F1D1D', border: 'none', borderRadius: 8, color: '#FCA5A5', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Yes, Reset World
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
