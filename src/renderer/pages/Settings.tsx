import React, { useState, useEffect } from 'react';
import PageTransition from '../components/PageTransition';
import Card from '../components/Card';
import Button from '../components/Button';
import RamSlider from '../components/RamSlider';
import { useAppStore } from '../store/appStore';

interface ManagedJava {
  major: number;
  path: string;
  managed: boolean;
  version: string;
}

export default function SettingsPage() {
  const { settings, totalRAM, setSettings } = useAppStore();
  const [defaultDir, setDefaultDir] = useState(settings?.defaultInstallDir ?? '');
  const [defaultRam, setDefaultRam] = useState(settings?.defaultRam ?? 4096);
  const [savedMsg, setSavedMsg] = useState('');
  const [managedJavas, setManagedJavas] = useState<ManagedJava[]>([]);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    window.api.java.listManaged().then((j) => setManagedJavas(j as ManagedJava[]));
    window.api.system.getAppVersion().then(setAppVersion);
    if (settings) {
      setDefaultDir(settings.defaultInstallDir);
      setDefaultRam(settings.defaultRam);
    }
  }, [settings]);

  const save = async () => {
    const updated = { ...settings, defaultInstallDir: defaultDir, defaultRam };
    await window.api.system.setSettings(updated);
    setSettings(updated as any);
    setSavedMsg('Settings saved');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const pickDir = async () => {
    const dir = await window.api.files.pickFolder();
    if (dir) setDefaultDir(dir);
  };

  const deleteJava = async (major: number) => {
    await window.api.java.deleteManaged(major);
    const list = await window.api.java.listManaged();
    setManagedJavas(list as ManagedJava[]);
  };

  return (
    <PageTransition>
      <div style={{ padding: 32, maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>Settings</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {savedMsg && <span style={{ fontSize: 13, color: '#10B981' }}>{savedMsg}</span>}
            <Button variant="primary" onClick={save}>Save</Button>
          </div>
        </div>

        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>General</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Default Server Install Directory</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  value={defaultDir}
                  onChange={(e) => setDefaultDir(e.target.value)}
                  style={inputStyle}
                />
                <Button size="sm" variant="secondary" onClick={pickDir}>Browse</Button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Default RAM for new servers</label>
              <div style={{ marginTop: 10 }}>
                <RamSlider value={defaultRam} onChange={setDefaultRam} maxMB={totalRAM} />
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Managed Java Runtimes</SectionTitle>
          <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>
            Java versions downloaded automatically by Minecraft Manager. These are used to run your servers and kept separate from any system-wide Java installation.
          </p>
          {managedJavas.length === 0 ? (
            <div style={{ color: '#374151', fontSize: 13 }}>
              No managed Java runtimes yet. They will be downloaded automatically when you first start a server.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {managedJavas.map((j) => (
                <div
                  key={j.major}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#0D1322',
                    borderRadius: 7,
                    padding: '10px 14px',
                    border: '1px solid #1A2235',
                  }}
                >
                  <span style={{ fontSize: 18, marginRight: 12 }}>☕</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>Java {j.major}</div>
                    <div style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace', marginTop: 2 }}>{j.path}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteJava(j.major)}>🗑</Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>About</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#64748B' }}>
            <div>Minecraft Manager v{appVersion}</div>
            <div>
              <span
                onClick={() => window.api.system.openExternal('https://account.mojang.com/documents/minecraft_eula')}
                style={{ color: '#3B82F6', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Minecraft EULA
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
              This app hosts Minecraft servers locally. An unsigned app may be flagged by Windows SmartScreen — click "More info → Run anyway" if prompted. No hidden processes or network scanning.
            </div>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 }}>
      {children}
    </h3>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#CBD5E1', fontWeight: 500 };
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
