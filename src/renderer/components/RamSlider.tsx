import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  value: number; // MB
  onChange: (mb: number) => void;
  maxMB: number;
  minMB?: number;
}

function fmtMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  return `${mb} MB`;
}

export default function RamSlider({ value, onChange, maxMB, minMB = 512 }: Props) {
  const safeMax = Math.floor(maxMB * 0.8);
  const warn = value > safeMax;
  const pct = ((value - minMB) / (maxMB - minMB)) * 100;

  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: '#94A3B8' }}>Allocated RAM</span>
        <motion.span
          key={value}
          initial={{ scale: 0.85, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: 15, fontWeight: 700, color: warn ? '#F59E0B' : '#3B82F6' }}
        >
          {fmtMB(value)}
        </motion.span>
      </div>

      <div style={{ position: 'relative', height: 6, marginBottom: 8 }}>
        <div style={{ position: 'absolute', inset: 0, background: '#1E2A3A', borderRadius: 3 }} />
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            background: warn ? '#F59E0B' : '#2563EB', borderRadius: 3,
          }}
        />
        <input
          type="range"
          min={minMB}
          max={maxMB}
          step={256}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: 0, width: '100%',
            opacity: 0, cursor: 'pointer', height: '100%', margin: 0,
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151' }}>
        <span>{fmtMB(minMB)}</span>
        <span style={{ color: '#4B5563' }}>Recommended max: {fmtMB(safeMax)}</span>
        <span>{fmtMB(maxMB)}</span>
      </div>

      {warn && (
        <div style={{
          marginTop: 6, fontSize: 11, color: '#F59E0B',
          background: '#451A0320', padding: '4px 8px', borderRadius: 5,
        }}>
          ⚠ Over 80% of system RAM — may cause instability
        </div>
      )}
    </div>
  );
}
