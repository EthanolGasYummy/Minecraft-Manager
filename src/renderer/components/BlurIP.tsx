import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';

interface Props {
  value: string;
  style?: React.CSSProperties;
}

export default function BlurIP({ value, style }: Props) {
  const { privacyMode } = useAppStore();
  const [revealed, setRevealed] = useState(false);

  if (!privacyMode) return <span style={style}>{value}</span>;

  if (revealed) {
    return <span style={style}>{value}</span>;
  }

  return (
    <span
      title="Click to reveal"
      onClick={() => { setRevealed(true); setTimeout(() => setRevealed(false), 3000); }}
      style={{
        ...style,
        filter: 'blur(6px)',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'filter 0.2s',
      }}
    >
      {value}
    </span>
  );
}
