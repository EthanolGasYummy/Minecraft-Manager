import React from 'react';
import { motion } from 'framer-motion';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: string;
}

const VARIANTS = {
  primary: {
    background: '#2563EB',
    color: '#fff',
    border: 'none',
    hover: '#3B82F6',
  },
  secondary: {
    background: '#1E2A3A',
    color: '#CBD5E1',
    border: '1px solid #2D3A4A',
    hover: '#243044',
  },
  danger: {
    background: '#7F1D1D',
    color: '#FCA5A5',
    border: 'none',
    hover: '#991B1B',
  },
  ghost: {
    background: 'transparent',
    color: '#64748B',
    border: 'none',
    hover: '#1E2A3A',
  },
};

const SIZES = {
  sm: { padding: '5px 12px', fontSize: 12 },
  md: { padding: '8px 16px', fontSize: 13 },
  lg: { padding: '10px 20px', fontSize: 14 },
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  children,
  disabled,
  style,
  ...props
}: Props) {
  const v = VARIANTS[variant];
  const s = SIZES[size];

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      style={{
        ...s,
        background: v.background,
        color: v.color,
        border: v.border ?? 'none',
        borderRadius: 7,
        fontWeight: 500,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        opacity: disabled || loading ? 0.5 : 1,
        transition: 'background 0.15s',
        letterSpacing: 0.2,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) (e.currentTarget as HTMLButtonElement).style.background = v.hover;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = v.background;
      }}
      {...(props as any)}
    >
      {loading ? <Spinner /> : icon ? <span style={{ fontSize: s.fontSize }}>{icon}</span> : null}
      {children}
    </motion.button>
  );
}

function Spinner() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
      style={{ display: 'inline-block', fontSize: 12 }}
    >
      ◌
    </motion.span>
  );
}
