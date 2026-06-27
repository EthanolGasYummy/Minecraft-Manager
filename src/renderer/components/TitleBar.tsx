import React from 'react';
import { useAppStore } from '../store/appStore';

export default function TitleBar() {
  const { privacyMode, togglePrivacyMode } = useAppStore();

  const handle = (action: 'minimize' | 'maximize' | 'close') => {
    window.api.system[action]();
  };

  return (
    <div
      style={{
        height: 32,
        background: '#0B0F1A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #1E2A3A',
        flexShrink: 0,
        userSelect: 'none',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
        <span style={{ fontSize: 14 }}>⛏</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', letterSpacing: 0.5 }}>
          Minecraft Manager
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={togglePrivacyMode}
          title={privacyMode ? 'Privacy ON — IPs hidden (click to disable)' : 'Privacy mode — blur IPs for screen sharing'}
          style={{
            width: 36,
            height: 32,
            border: 'none',
            background: privacyMode ? '#1E2A3A' : 'transparent',
            color: privacyMode ? '#3B82F6' : '#64748B',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {privacyMode ? '🔒' : '👁'}
        </button>
        {(['minimize', 'maximize', 'close'] as const).map((action) => (
          <button
            key={action}
            onClick={() => handle(action)}
            style={{
              width: 46,
              height: 32,
              border: 'none',
              background: 'transparent',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.background = action === 'close' ? '#C0392B' : '#1E2A3A';
              el.style.color = '#E2E8F0';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.background = 'transparent';
              el.style.color = '#64748B';
            }}
          >
            {action === 'minimize' ? '─' : action === 'maximize' ? '□' : '✕'}
          </button>
        ))}
      </div>
    </div>
  );
}
