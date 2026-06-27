import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const NAV: NavItem[] = [
  { to: '/dashboard', icon: '◉', label: 'Dashboard' },
  { to: '/servers', icon: '☰', label: 'Servers' },
  { to: '/create', icon: '+', label: 'Create Server' },
  { to: '/network', icon: '⇄', label: 'Network' },
  { to: '/settings', icon: '⚙', label: 'Settings' },
];

export default function Sidebar() {
  const location = useLocation();
  const [version, setVersion] = useState('');
  useEffect(() => { window.api.system.getAppVersion().then(setVersion).catch(() => {}); }, []);

  return (
    <nav
      style={{
        width: 200,
        background: '#0D1322',
        borderRight: '1px solid #1E2A3A',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 0',
        flexShrink: 0,
        height: '100%',
      }}
    >
      {NAV.map((item) => {
        const active =
          location.pathname === item.to ||
          (item.to === '/servers' && location.pathname.startsWith('/servers/'));

        return (
          <NavLink
            key={item.to}
            to={item.to}
            style={{ textDecoration: 'none', position: 'relative', margin: '2px 8px' }}
          >
            {active && (
              <motion.div
                layoutId="sidebar-active"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.06) 100%)',
                  borderRadius: 8,
                  borderLeft: '2px solid #3B82F6',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                color: active ? '#93C5FD' : '#64748B',
                fontWeight: active ? 600 : 400,
                fontSize: 13,
                cursor: 'pointer',
                position: 'relative',
                transition: 'color 0.15s',
              }}
            >
              <span
                style={{
                  width: 20,
                  textAlign: 'center',
                  fontSize: item.icon === '+' ? 18 : 14,
                  lineHeight: 1,
                  color: active ? '#3B82F6' : '#4B5563',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </div>
          </NavLink>
        );
      })}

      <div style={{ flex: 1 }} />
      <div style={{ padding: '10px 12px', borderTop: '1px solid #1E2A3A' }}>
        <button
          onClick={() => window.api.system.openExternal('https://ko-fi.com/solidorc')}
          style={{
            width: '100%', padding: '7px 10px',
            background: 'linear-gradient(135deg, #FF5E5B22, #FF8C0022)',
            border: '1px solid #FF5E5B44',
            borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            color: '#FF8C00', fontSize: 12, fontWeight: 600,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#FF5E5B99')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#FF5E5B44')}
        >
          <span style={{ fontSize: 14 }}>☕</span>
          Support Development
        </button>
        <div style={{ padding: '8px 8px 0', fontSize: 11, color: '#374151' }}>
          Minecraft Manager{version ? ` v${version}` : ''}
        </div>
      </div>
    </nav>
  );
}
