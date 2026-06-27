import React from 'react';
import { motion } from 'framer-motion';
import type { ServerStatus } from '../types';

const STATUS_COLORS: Record<ServerStatus, string> = {
  offline: '#374151',
  starting: '#F59E0B',
  online: '#10B981',
  crashed: '#EF4444',
  stopping: '#F97316',
};

const STATUS_LABELS: Record<ServerStatus, string> = {
  offline: 'Offline',
  starting: 'Starting…',
  online: 'Online',
  crashed: 'Crashed',
  stopping: 'Stopping…',
};

interface Props {
  status: ServerStatus;
  size?: number;
  showLabel?: boolean;
}

export default function StatusDot({ status, size = 8, showLabel = false }: Props) {
  const color = STATUS_COLORS[status] ?? '#374151';
  const pulse = status === 'starting' || status === 'online' || status === 'stopping';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
        {pulse && (
          <motion.span
            animate={{ scale: [1, 2], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: color,
            }}
          />
        )}
        <span
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            display: 'block',
            position: 'relative',
          }}
        />
      </span>
      {showLabel && (
        <span style={{ fontSize: 12, color, fontWeight: 500 }}>{STATUS_LABELS[status]}</span>
      )}
    </span>
  );
}
