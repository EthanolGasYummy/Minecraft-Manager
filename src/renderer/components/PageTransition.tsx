import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export default function PageTransition({ children, style }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ height: '100%', overflow: 'auto', ...style }}
    >
      {children}
    </motion.div>
  );
}
