import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import Button from '../components/Button';
import Card from '../components/Card';
import RamSlider from '../components/RamSlider';
import ProgressBar from '../components/ProgressBar';
import { useAppStore } from '../store/appStore';
import type { ServerType, VersionInfo } from '../types';

const TYPES: { id: ServerType; label: string; desc: string; color: string }[] = [
  { id: 'paper', label: 'Paper', desc: 'High-performance, plugin-friendly', color: '#3B82F6' },
  { id: 'purpur', label: 'Purpur', desc: 'Paper fork with extra features', color: '#8B5CF6' },
  { id: 'fabric', label: 'Fabric', desc: 'Lightweight mod loader', color: '#F59E0B' },
  { id: 'forge', label: 'Forge', desc: 'Classic modding platform', color: '#EF4444' },
  { id: 'neoforge', label: 'NeoForge', desc: 'Modern Forge successor', color: '#F97316' },
  { id: 'vanilla', label: 'Vanilla', desc: 'Official Mojang server', color: '#10B981' },
];

const TOTAL_STEPS = 5;

type Step = 'name' | 'type' | 'version' | 'folder' | 'ram' | 'installing';

export default function CreateServer() {
  const navigate = useNavigate();
  const { totalRAM, settings, setServers } = useAppStore();

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [type, setType] = useState<ServerType>('paper');
  const [mcVersion, setMcVersion] = useState('');
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  const [installDir, setInstallDir] = useState('');
  const [ram, setRam] = useState(Math.min(4096, Math.floor(totalRAM * 0.5)));
  const [eulaAccepted, setEulaAccepted] = useState(false);

  const [installProgress, setInstallProgress] = useState(0);
  const [installMsg, setInstallMsg] = useState('');
  const [installError, setInstallError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  // Track the created server ID so retries don't create a second server
  const [createdServerId, setCreatedServerId] = useState<string | null>(null);

  const defaultDir = settings?.defaultInstallDir ?? '';

  useEffect(() => {
    if (installDir === '' && defaultDir) {
      setInstallDir(`${defaultDir}\\${name || 'my-server'}`);
    }
  }, [defaultDir, name]);

  useEffect(() => {
    if (step === 'version') {
      loadVersions();
    }
  }, [step, type]);

  // Listen to download progress events
  useEffect(() => {
    const unsub = window.api.on('download:progress', ({ pct, msg }: any) => {
      setDownloadProgress(pct ?? 0);
      if (msg) setInstallMsg(msg);
    });
    return () => unsub();
  }, []);

  const loadVersions = async () => {
    setVersionsLoading(true);
    setVersionsError('');
    try {
      const v = await window.api.download.getVersions(type);
      setVersions(v);
      if (v.length > 0) setMcVersion(v[0].id);
    } catch (e: any) {
      setVersionsError(e.message ?? 'Failed to load versions');
    } finally {
      setVersionsLoading(false);
    }
  };

  const stepIndex = (['name', 'type', 'version', 'folder', 'ram'] as Step[]).indexOf(step);

  const install = async () => {
    setStep('installing');
    setInstallProgress(5);
    setInstallError('');

    try {
      // Only create the server record once — retries reuse the same ID
      let serverId = createdServerId;
      if (!serverId) {
        const config = {
          name,
          type,
          mcVersion,
          installDir,
          port: 25565,
          ram,
          autoRestart: false,
          maxRestarts: 3,
          connectionMode: 'direct',
        };
        setInstallMsg('Creating server configuration…');
        const created = await window.api.server.create(config);
        serverId = created.id;
        setCreatedServerId(created.id);
      }
      setInstallProgress(10);

      setInstallMsg('Resolving Java runtime…');
      await window.api.java.ensureRuntime(mcVersion);
      setInstallProgress(30);

      setInstallMsg(`Downloading ${type} ${mcVersion} server…`);
      await window.api.download.downloadJar(type, mcVersion, installDir);
      setInstallProgress(90);

      setInstallMsg('Finalizing…');
      const list = await window.api.server.list();
      setServers(list);
      setInstallProgress(100);

      setTimeout(() => navigate(`/servers/${serverId}`), 600);
    } catch (e: any) {
      setInstallError(e.message ?? 'Installation failed');
      setInstallProgress(0);
    }
  };

  const pickFolder = async () => {
    const dir = await window.api.files.pickFolder();
    if (dir) setInstallDir(dir + '\\' + (name || 'my-server'));
  };

  const canNext = () => {
    if (step === 'name') return name.trim().length > 0;
    if (step === 'type') return !!type;
    if (step === 'version') return !!mcVersion;
    if (step === 'folder') return installDir.trim().length > 0;
    if (step === 'ram') return eulaAccepted;
    return false;
  };

  const next = () => {
    const flow: Step[] = ['name', 'type', 'version', 'folder', 'ram'];
    const i = flow.indexOf(step);
    if (i < flow.length - 1) setStep(flow[i + 1] as Step);
    else install();
  };

  const back = () => {
    const flow: Step[] = ['name', 'type', 'version', 'folder', 'ram'];
    const i = flow.indexOf(step);
    if (i > 0) setStep(flow[i - 1] as Step);
  };

  return (
    <PageTransition>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
        }}
      >
        <div style={{ width: '100%', maxWidth: 540 }}>
          {step !== 'installing' && (
            <StepIndicator current={stepIndex} total={TOTAL_STEPS} />
          )}

          <AnimatePresence mode="wait">
            {step === 'name' && (
              <StepCard key="name" title="Name your server" subtitle="Pick something memorable">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canNext() && next()}
                  placeholder="My Minecraft Server"
                  style={inputStyle}
                />
              </StepCard>
            )}

            {step === 'type' && (
              <StepCard key="type" title="Choose server type" subtitle="Pick the platform for your server">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {TYPES.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setType(t.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 9,
                        border: `2px solid ${type === t.id ? t.color : '#1E2A3A'}`,
                        background: type === t.id ? t.color + '12' : '#0D1322',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: type === t.id ? t.color : '#CBD5E1', marginBottom: 3 }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </StepCard>
            )}

            {step === 'version' && (
              <StepCard key="version" title="Select version" subtitle={`Available ${type} versions`}>
                {versionsLoading ? (
                  <div style={{ textAlign: 'center', padding: 30, color: '#64748B' }}>
                    Loading versions…
                  </div>
                ) : versionsError ? (
                  <div style={{ color: '#EF4444', fontSize: 13, textAlign: 'center' }}>
                    {versionsError}
                    <br />
                    <Button variant="ghost" size="sm" onClick={loadVersions} style={{ marginTop: 8 }}>
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {versions.slice(0, 40).map((v) => (
                      <div
                        key={v.id}
                        onClick={() => setMcVersion(v.id)}
                        style={{
                          padding: '9px 14px',
                          borderRadius: 7,
                          background: mcVersion === v.id ? '#2563EB18' : 'transparent',
                          border: `1px solid ${mcVersion === v.id ? '#2563EB' : '#1A2235'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 13,
                          color: mcVersion === v.id ? '#93C5FD' : '#94A3B8',
                          transition: 'all 0.12s',
                        }}
                      >
                        <span>{v.label}</span>
                        {v.recommended && (
                          <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600, background: '#10B98118', padding: '2px 6px', borderRadius: 4 }}>
                            STABLE
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </StepCard>
            )}

            {step === 'folder' && (
              <StepCard key="folder" title="Install location" subtitle="Where to store the server files">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={installDir}
                    onChange={(e) => setInstallDir(e.target.value)}
                    placeholder="C:\Minecraft\my-server"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <Button variant="secondary" onClick={pickFolder}>
                    Browse
                  </Button>
                </div>
                <p style={{ fontSize: 11, color: '#4B5563', marginTop: 8 }}>
                  A new folder will be created if it doesn't exist.
                </p>
              </StepCard>
            )}

            {step === 'ram' && (
              <StepCard key="ram" title="Allocate RAM" subtitle="More RAM = more players & mods, but leave some for your OS">
                <RamSlider value={ram} onChange={setRam} maxMB={totalRAM} />
                <div style={{ marginTop: 24, padding: '14px 16px', background: '#0D1322', borderRadius: 8, border: '1px solid #1E2A3A' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 8 }}>
                    Minecraft End User License Agreement
                  </div>
                  <p style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
                    By creating a server you agree to Mojang's{' '}
                    <span
                      onClick={() => window.api.system.openExternal('https://account.mojang.com/documents/minecraft_eula')}
                      style={{ color: '#3B82F6', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      End User License Agreement
                    </span>
                    .
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={eulaAccepted}
                      onChange={(e) => setEulaAccepted(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#2563EB' }}
                    />
                    <span style={{ fontSize: 13, color: '#CBD5E1' }}>I accept the Minecraft EULA</span>
                  </label>
                </div>
              </StepCard>
            )}

            {step === 'installing' && (
              <motion.div key="installing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 40, marginBottom: 20 }}>
                    {installError ? '❌' : installProgress === 100 ? '✅' : '⬇'}
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: '#E2E8F0', marginBottom: 8 }}>
                    {installError ? 'Installation failed' : installProgress === 100 ? 'Done!' : 'Installing…'}
                  </h2>
                  <p style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>
                    {installError || installMsg}
                  </p>
                  {!installError && (
                    <ProgressBar
                      value={Math.max(installProgress, downloadProgress * 0.6 + 30)}
                      color={installProgress === 100 ? '#10B981' : '#2563EB'}
                    />
                  )}
                  {installError && (
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
                      <Button variant="secondary" onClick={() => setStep('ram')}>Back</Button>
                      <Button variant="primary" onClick={install}>Retry</Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {step !== 'installing' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              {stepIndex > 0 && (
                <Button variant="secondary" onClick={back} style={{ flex: 1 }}>
                  Back
                </Button>
              )}
              <Button
                variant="primary"
                disabled={!canNext()}
                onClick={next}
                style={{ flex: 2 }}
              >
                {step === 'ram' ? 'Install Server' : 'Continue'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ width: i === current ? 24 : 8, background: i <= current ? '#2563EB' : '#1E2A3A' }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ height: 4, borderRadius: 2 }}
        />
      ))}
    </div>
  );
}

function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.18 }}
    >
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>{subtitle}</p>
      </div>
      <Card>{children}</Card>
    </motion.div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#0D1322',
  border: '1px solid #2D3A4A',
  borderRadius: 8,
  color: '#E2E8F0',
  fontSize: 14,
  outline: 'none',
};
