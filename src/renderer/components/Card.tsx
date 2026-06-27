import React from 'react';

interface Props {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padding?: number | string;
  onClick?: () => void;
  hoverable?: boolean;
}

export default function Card({ children, style, padding = 20, onClick, hoverable }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#141A2B',
        border: '1px solid #1E2A3A',
        borderRadius: 12,
        padding,
        cursor: onClick ? 'pointer' : 'default',
        transition: hoverable ? 'border-color 0.15s, box-shadow 0.15s' : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (hoverable) {
          (e.currentTarget as HTMLDivElement).style.borderColor = '#2563EB';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 1px #2563EB22';
        }
      }}
      onMouseLeave={(e) => {
        if (hoverable) {
          (e.currentTarget as HTMLDivElement).style.borderColor = '#1E2A3A';
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        }
      }}
    >
      {children}
    </div>
  );
}
