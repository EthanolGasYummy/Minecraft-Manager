import React, { useState, useEffect } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';
import ProgressBar from '../../components/ProgressBar';
import type { BackupEntry, BackupSchedule } from '../../types';

interface Props { serverId: string; }

function fmtBytes(n: number): string {
  if (n > 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n > 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

export default function BackupsTab({ serverId }: Props) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule>({ enabled: false, intervalHours: 6, keepCount: 5 });
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupEntry | null>(null);

  const refresh = async () => {
    const [b, s] = await Promise.all([
      window.api.backup.list(serverId),
      window.api.backup.getSchedule(serverId),
    ]);
    setBackups(b);
    if (s) setSchedule(s);
  };

  useEffect(() => {
    refresh();
    const unsub = window.api.on('backup:progress', ({ serverId: sid, pct }: any) => {
      if (sid === serverId) setProgress(pct ?? 0);
    });
    return () => unsub();
  }, [serverId]);

  const createBackup = async () => {
    setCreating(true);
    setProgress(0);
    try {
      await window.api.backup.create(serverId);
      await refresh();
    } finally {
      setCreating(false);
      setProgress(0);
    }
  };

  const doRestore = async (backup: BackupEntry) => {
    setRestoring(backup.path);
    try {
      await window.api.backup.restore(serverId, backup.path);
    } finally {
      setRestoring(null);
      setConfirmRestore(null);
    }
  };

  const deleteBackup = async (backup: BackupEntry) => {
    await window.api.backup.delete(backup.path);
    await refresh();
  };

  const saveSchedule = async () => {
    await window.api.backup.setSchedule(serverId, schedule);
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>Backups</h2>
        <Button variant="primary" loading={creating} onClick={createBackup} icon="💾">
          Backup Now
        </Button>
      </div>

      {creating && (
        <div style={{ marginBottom: 16 }}>
          <ProgressBar value={progress} label="Creating backup…" />
        </div>
      )}

      {/* Schedule */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Automatic Backups
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#CBD5E1' }}>Enable scheduled backups</span>
            <ToggleSwitch value={schedule.enabled} onChange={(v) => setSchedule((s) => ({ ...s, enabled: v }))} />
          </div>
          {schedule.enabled && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#CBD5E1', flex: 1 }}>Interval</span>
                <select
                  value={schedule.intervalHours}
                  onChange={(e) => setSchedule((s) => ({ ...s, intervalHours: Number(e.target.value) }))}
                  style={selectStyle}
                >
                  {[1, 2, 4, 6, 12, 24].map((h) => (
                    <option key={h} value={h}>{h === 1 ? '1 hour' : `${h} hours`}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#CBD5E1', flex: 1 }}>Keep last</span>
                <select
                  value={schedule.keepCount}
                  onChange={(e) => setSchedule((s) => ({ ...s, keepCount: Number(e.target.value) }))}
                  style={selectStyle}
                >
                  {[3, 5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>{n} backups</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={saveSchedule}>Save Schedule</Button>
          {schedule.lastBackup && (
            <div style={{ fontSize: 12, color: '#4B5563' }}>
              Last backup: {new Date(schedule.lastBackup).toLocaleString()}
            </div>
          )}
        </div>
      </Card>

      {/* Backup list */}
      {backups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#374151' }}>
          No backups yet. Create one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {backups.map((b) => (
            <div
              key={b.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: '#141A2B',
                border: '1px solid #1E2A3A',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 20 }}>📦</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#CBD5E1' }}>{b.name}</div>
                <div style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>
                  {fmtBytes(b.size)} · {new Date(b.createdAt).toLocaleString()}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={restoring === b.path}
                onClick={() => setConfirmRestore(b)}
              >
                Restore
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteBackup(b)}>🗑</Button>
            </div>
          ))}
        </div>
      )}

      {/* Restore confirm dialog */}
      {confirmRestore && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000080', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ width: 380, padding: 28 }}>
            <h3 style={{ color: '#E2E8F0', marginBottom: 10 }}>Restore backup?</h3>
            <p style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>
              This will stop the server and replace its files with the backup "{confirmRestore.name}". A safety backup will be created first.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={() => setConfirmRestore(null)} style={{ flex: 1 }}>Cancel</Button>
              <Button variant="primary" loading={!!restoring} onClick={() => doRestore(confirmRestore)} style={{ flex: 1 }}>Restore</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, background: value ? '#2563EB' : '#1E2A3A', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', border: '1px solid ' + (value ? '#3B82F6' : '#2D3A4A') }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: value ? 20 : 2, transition: 'left 0.2s' }} />
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: '#0D1322',
  border: '1px solid #2D3A4A',
  borderRadius: 6,
  color: '#E2E8F0',
  fontSize: 13,
  cursor: 'pointer',
  outline: 'none',
};
