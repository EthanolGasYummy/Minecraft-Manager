import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import Button from '../components/Button';
import StatusDot from '../components/StatusDot';
import { useAppStore } from '../store/appStore';

type ImportStep =
  | { kind: 'choose' }
  | { kind: 'folder'; type: string; mcVersion: string; port: number; name: string; installDir: string; ram: number }
  | { kind: 'mcm'; config: any; installDir: string; name: string; ram: number };

const RAM_OPTIONS = [512, 1024, 2048, 4096, 6144, 8192];

export default function Servers() {
  const { servers, setServers, totalRAM } = useAppStore();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  const refresh = async () => {
    const list = await window.api.server.list();
    setServers(list);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await window.api.server.delete(deleteTarget, deleteFiles);
    await refresh();
    setDeleteTarget(null);
  };

  const openImport = () => { setImportStep({ kind: 'choose' }); setImportError(''); };
  const closeImport = () => { setImportStep(null); setImportError(''); };

  const pickFolder = async () => {
    setImportError('');
    const dir = await window.api.files.pickFolder();
    if (!dir) return;
    try {
      const detected = await window.api.server.importDir(dir);
      const defaultRam = Math.min(4096, Math.floor(totalRAM / 2 / 512) * 512) || 2048;
    // eslint-disable-next-line no-constant-binary-expression
      setImportStep({ kind: 'folder', ...detected, ram: defaultRam });
    } catch (e: any) {
      setImportError(e?.message ?? 'Failed to read folder');
    }
  };

  const pickMcmFile = async () => {
    setImportError('');
    const data = await window.api.server.readImportFile();
    if (!data) return;
    if (!data.mcmVersion || !data.server) { setImportError('Invalid .mcm file'); return; }
    const srv = data.server;
    const defaultRam = srv.ram ?? (Math.min(4096, Math.floor(totalRAM / 2 / 512) * 512) || 2048);
    setImportStep({ kind: 'mcm', config: srv, installDir: '', name: srv.name ?? 'Imported Server', ram: defaultRam });
  };

  const pickFolderForMcm = async () => {
    const dir = await window.api.files.pickFolder();
    if (!dir || importStep?.kind !== 'mcm') return;
    setImportStep({ ...importStep, installDir: dir });
  };

  const confirmImport = async () => {
    if (!importStep || importStep.kind === 'choose') return;
    setImporting(true);
    setImportError('');
    try {
      if (importStep.kind === 'folder') {
        await window.api.server.create({
          name: importStep.name,
          type: importStep.type,
          mcVersion: importStep.mcVersion,
          port: importStep.port,
          ram: importStep.ram,
          autoRestart: false,
          maxRestarts: 3,
          installDir: importStep.installDir,
        });
      } else {
        if (!importStep.installDir) { setImportError('Please pick an install folder'); setImporting(false); return; }
        const { backupSchedule, ...serverFields } = importStep.config;
        await window.api.server.create({
          ...serverFields,
          name: importStep.name,
          ram: importStep.ram,
          installDir: importStep.installDir,
        });
      }
      await refresh();
      closeImport();
    } catch (e: any) {
      setImportError(e?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <PageTransition>
      <div style={{ padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>Servers</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={openImport}>Import</Button>
            <Button variant="primary" icon="+" onClick={() => navigate('/create')}>New Server</Button>
          </div>
        </div>

        {servers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#4B5563' }}>
            No servers. Create one or import an existing one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {servers.map((server, i) => (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                style={{
                  background: '#141A2B', border: '1px solid #1E2A3A', borderRadius: 10,
                  padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onClick={() => navigate(`/servers/${server.id}`)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2D3A4A'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1E2A3A'; }}
              >
                <StatusDot status={server.status} size={9} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>{server.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {server.type} {server.mcVersion} · Port {server.port} · {server.ram} MB RAM
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{server.players?.length ?? 0} players</div>
                <StatusDot status={server.status} showLabel size={7} />
                <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  {(server.status === 'offline' || server.status === 'crashed') && (
                    <Button size="sm" variant="primary" icon="▶"
                      onClick={async () => { await window.api.server.start(server.id); refresh(); }}>
                      Start
                    </Button>
                  )}
                  {(server.status === 'online' || server.status === 'starting') && (
                    <Button size="sm" variant="danger" icon="■"
                      onClick={async () => { await window.api.server.stop(server.id); refresh(); }}>
                      Stop
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="🗑" onClick={() => setDeleteTarget(server.id)} />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Delete dialog */}
        {deleteTarget && (
          <Modal onClose={() => setDeleteTarget(null)}>
            <h3 style={{ color: '#E2E8F0', marginBottom: 10 }}>Delete server?</h3>
            <p style={{ color: '#64748B', fontSize: 13, marginBottom: 18 }}>
              This will remove the server configuration. Optionally delete all files.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} style={{ accentColor: '#EF4444' }} />
              <span style={{ fontSize: 13, color: '#94A3B8' }}>Also delete server files from disk</span>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} style={{ flex: 1 }}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} style={{ flex: 1 }}>Delete</Button>
            </div>
          </Modal>
        )}

        {/* Import modal */}
        {importStep && (
          <Modal onClose={closeImport} width={440}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ color: '#E2E8F0', margin: 0 }}>Import Server</h3>
              <button onClick={closeImport} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            {importError && (
              <div style={{ padding: '8px 12px', background: '#2D1515', border: '1px solid #7F1D1D', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#FCA5A5' }}>
                {importError}
              </div>
            )}

            {/* Step 1: choose source */}
            {importStep.kind === 'choose' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ color: '#64748B', fontSize: 13, marginBottom: 4 }}>Choose how to import:</p>
                <ChoiceCard
                  icon="📁"
                  title="Existing Server Folder"
                  desc="Add a Minecraft server you already have on disk"
                  onClick={pickFolder}
                />
                <ChoiceCard
                  icon="📄"
                  title="From Config File (.mcm)"
                  desc="Restore settings exported from this app"
                  onClick={pickMcmFile}
                />
              </div>
            )}

            {/* Step 2a: folder detected */}
            {importStep.kind === 'folder' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#0D1322', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748B' }}>
                  <div style={{ color: '#94A3B8', fontWeight: 600, marginBottom: 6 }}>Detected</div>
                  <div>Type: <span style={{ color: '#CBD5E1' }}>{importStep.type}</span></div>
                  <div>Version: <span style={{ color: '#CBD5E1' }}>{importStep.mcVersion}</span></div>
                  <div>Port: <span style={{ color: '#CBD5E1' }}>{importStep.port}</span></div>
                  <div style={{ marginTop: 4, wordBreak: 'break-all' }}>Folder: <span style={{ color: '#CBD5E1' }}>{importStep.installDir}</span></div>
                </div>
                <FieldRow label="Server Name">
                  <input
                    value={importStep.name}
                    onChange={(e) => setImportStep({ ...importStep, name: e.target.value })}
                    style={inputStyle}
                  />
                </FieldRow>
                <FieldRow label="RAM">
                  <RamSelect value={importStep.ram} onChange={(v) => setImportStep({ ...importStep, ram: v })} max={totalRAM} />
                </FieldRow>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <Button variant="secondary" onClick={() => setImportStep({ kind: 'choose' })} style={{ flex: 1 }}>Back</Button>
                  <Button variant="primary" loading={importing} onClick={confirmImport} disabled={!importStep.name.trim()} style={{ flex: 1 }}>Import</Button>
                </div>
              </div>
            )}

            {/* Step 2b: .mcm config */}
            {importStep.kind === 'mcm' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#0D1322', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748B' }}>
                  <div style={{ color: '#94A3B8', fontWeight: 600, marginBottom: 6 }}>Config File</div>
                  <div>Type: <span style={{ color: '#CBD5E1' }}>{importStep.config.type}</span></div>
                  <div>Version: <span style={{ color: '#CBD5E1' }}>{importStep.config.mcVersion}</span></div>
                  <div>Port: <span style={{ color: '#CBD5E1' }}>{importStep.config.port}</span></div>
                </div>
                <FieldRow label="Server Name">
                  <input
                    value={importStep.name}
                    onChange={(e) => setImportStep({ ...importStep, name: e.target.value })}
                    style={inputStyle}
                  />
                </FieldRow>
                <FieldRow label="RAM">
                  <RamSelect value={importStep.ram} onChange={(v) => setImportStep({ ...importStep, ram: v })} max={totalRAM} />
                </FieldRow>
                <FieldRow label="Install Folder">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: importStep.installDir ? '#CBD5E1' : '#374151', flex: 1, wordBreak: 'break-all' }}>
                      {importStep.installDir || 'No folder selected'}
                    </span>
                    <Button size="sm" variant="secondary" onClick={pickFolderForMcm}>Browse…</Button>
                  </div>
                </FieldRow>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <Button variant="secondary" onClick={() => setImportStep({ kind: 'choose' })} style={{ flex: 1 }}>Back</Button>
                  <Button variant="primary" loading={importing} onClick={confirmImport}
                    disabled={!importStep.name.trim() || !importStep.installDir} style={{ flex: 1 }}>
                    Import
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        )}
      </div>
    </PageTransition>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Modal({ children, onClose, width = 360 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#00000080', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#141A2B', border: '1px solid #2D3A4A', borderRadius: 12, padding: 28, width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ChoiceCard({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px',
        background: '#0D1322', border: '1px solid #2D3A4A', borderRadius: 10,
        cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3B82F6'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2D3A4A'; }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#4B5563' }}>{desc}</div>
      </div>
    </button>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function RamSelect({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const opts = [512, 1024, 2048, 4096, 6144, 8192].filter((v) => v <= max || v === 512);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
    >
      {opts.map((mb) => (
        <option key={mb} value={mb}>{mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}</option>
      ))}
    </select>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 12px', background: '#0D1322',
  border: '1px solid #2D3A4A', borderRadius: 7,
  color: '#E2E8F0', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
