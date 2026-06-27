import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  value: number; // 0–100
  label?: string;
  color?: string;
  height?: number;
}

export default function ProgressBar({ value, label, color = '#2563EB', height = 6 }: Props) {
  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#64748B' }}>{label}</span>
          <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{value}%</span>
        </div>
      )}
      <div
        style={{
          background: '#1E2A3A',
          borderRadius: height / 2,
          height,
          overflow: 'hidden',
        }}
      >
        <motion.div
          animate={{ width: `${Math.min(value, 100)}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          style={{
            height: '100%',
            background: color,
            borderRadius: height / 2,
          }}
        />
      </div>
    </div>
  );
}
