import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../components/Button';
import { useAppStore } from '../store/appStore';

interface CGNATInfo {
  isCGNAT: boolean;
  publicIP: string;
  localIP: string;
  reason: string;
}

type Step = 'welcome' | 'system' | 'modes' | 'done';

export default function Onboarding() {
  const { totalRAM, setOnboardingDone } = useAppStore();
  const [step, setStep] = useState<Step>('welcome');
  const [cgnat, setCgnat] = useState<CGNATInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (step === 'system') {
      runChecks();
    }
  }, [step]);

  const runChecks = async () => {
    setChecking(true);
    try {
      const result = await window.api.network.detectCGNAT();
      setCgnat(result);
    } catch {}
    setChecking(false);
  };

  const finish = async () => {
    await window.api.system.setOnboardingDone();
    setOnboardingDone(true);
  };

  const STEPS: Step[] = ['welcome', 'system', 'modes', 'done'];
  const idx = STEPS.indexOf(step);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0F1A',
        padding: 32,
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 36 }}>
          {STEPS.map((s, i) => (
            <motion.div
              key={s}
              animate={{ width: s === step ? 28 : 8, background: i <= idx ? '#2563EB' : '#1E2A3A' }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{ height: 4, borderRadius: 2 }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <SlideStep key="welcome">
              <div style={{ textAlign: 'center', paddingBottom: 8 }}>
                <div style={{ fontSize: 64, marginBottom: 20 }}>⛏</div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: '#E2E8F0', marginBottom: 12 }}>
                  Welcome to<br />Minecraft Manager
                </h1>
                <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 32 }}>
                  Host a Minecraft server from this PC and share it with friends — no terminal, no manual Java install, no router configuration needed.
                </p>
                <Button variant="primary" size="lg" onClick={() => setStep('system')} style={{ width: '100%' }}>
                  Get Started →
                </Button>
              </div>
            </SlideStep>
          )}

          {step === 'system' && (
            <SlideStep key="system">
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', marginBottom: 20 }}>Checking your system</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                <CheckRow label="System RAM" value={`${(totalRAM / 1024).toFixed(1)} GB detected`} ok />
                <CheckRow label="Java" value="Managed automatically — no action needed" ok />
                <CheckRow
                  label="Network (CGNAT)"
                  value={checking ? 'Checking…' : cgnat ? (cgnat.isCGNAT ? `CGNAT detected (${cgnat.publicIP})` : `No CGNAT — port forwarding available (${cgnat.publicIP})`) : 'Unknown'}
                  ok={!cgnat?.isCGNAT}
                  loading={checking}
                />
              </div>
              {cgnat?.isCGNAT && (
                <div style={{ background: '#451A0320', border: '1px solid #F59E0B40', borderRadius: 9, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#F59E0B', lineHeight: 1.6 }}>
                  ⚠ Your ISP is using carrier-grade NAT (CGNAT). Port forwarding won't work for you — we recommend using <strong>playit.gg</strong> mode on the next screen.
                </div>
              )}
              <Button variant="primary" size="lg" onClick={() => setStep('modes')} disabled={checking} style={{ width: '100%' }}>
                Continue →
              </Button>
            </SlideStep>
          )}

          {step === 'modes' && (
            <SlideStep key="modes">
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', marginBottom: 8 }}>How friends join</h2>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
                Two modes to share your server. You can switch per-server later.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                <ModeCard
                  icon="🌐"
                  title="DuckDNS (Recommended)"
                  badge={cgnat?.isCGNAT ? undefined : 'BEST FOR YOU'}
                  badgeColor="#10B981"
                  description="Zero-added latency. Traffic goes directly to you. Requires a free DuckDNS account and port forwarding (or UPnP). Friends join via your DuckDNS hostname."
                  pros={['No latency overhead', 'Free & simple setup', 'Works with most home routers']}
                  cons={['Requires port forwarding', 'Your public IP is resolvable from the hostname']}
                />
                <ModeCard
                  icon="🔗"
                  title="playit.gg Tunnel"
                  badge={cgnat?.isCGNAT ? 'BEST FOR YOU' : undefined}
                  badgeColor="#3B82F6"
                  description="No port forwarding needed. Your IP is hidden. Traffic is relayed through playit servers — adds some latency. Best for CGNAT users."
                  pros={['No port forwarding', 'IP hidden from players', 'Works behind CGNAT']}
                  cons={['Adds latency (relay)', 'Requires internet for tunnel']}
                />
              </div>
              <Button variant="primary" size="lg" onClick={() => setStep('done')} style={{ width: '100%' }}>
                Got it →
              </Button>
            </SlideStep>
          )}

          {step === 'done' && (
            <SlideStep key="done">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 60, marginBottom: 20 }}>🚀</div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: '#E2E8F0', marginBottom: 12 }}>You're ready!</h2>
                <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 32 }}>
                  Create your first server — it only takes about a minute. We'll download everything you need automatically.
                </p>
                <Button variant="primary" size="lg" onClick={finish} style={{ width: '100%' }}>
                  Create My First Server
                </Button>
              </div>
            </SlideStep>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SlideStep({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function CheckRow({ label, value, ok, loading }: { label: string; value: string; ok: boolean; loading?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#141A2B', borderRadius: 8, padding: '12px 16px', border: '1px solid #1E2A3A' }}>
      <span style={{ fontSize: 18 }}>{loading ? '⏳' : ok ? '✅' : '⚠️'}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function ModeCard({
  icon, title, badge, badgeColor, description, pros, cons,
}: {
  icon: string;
  title: string;
  badge?: string;
  badgeColor?: string;
  description: string;
  pros: string[];
  cons: string[];
}) {
  return (
    <div style={{ background: '#141A2B', border: '1px solid #1E2A3A', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#E2E8F0' }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeColor + '18', border: `1px solid ${badgeColor}40`, borderRadius: 4, padding: '2px 7px', marginLeft: 4 }}>
            {badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.6 }}>{description}</p>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          {pros.map((p) => <div key={p} style={{ fontSize: 11, color: '#10B981', marginBottom: 3 }}>✓ {p}</div>)}
        </div>
        <div>
          {cons.map((c) => <div key={c} style={{ fontSize: 11, color: '#EF4444', marginBottom: 3 }}>✕ {c}</div>)}
        </div>
      </div>
    </div>
  );
}
