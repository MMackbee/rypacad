import React, { useEffect, useState } from 'react';
import PhoneFrame from './PhoneFrame';

/**
 * The assessment screens' layout (spec 5: "a shared layout replaces the
 * 430 px column for these screens"): phone (< 700 px) one athlete at a time,
 * tablet (700-1100 px) two columns, desktop (> 1100 px) the full grid of the
 * four athletes and a results table. Every other portal screen keeps
 * PhoneFrame's phone column.
 */
export const PHONE_BELOW = 700;
export const TABLET_UP_TO = 1100;
export const FRAME_MAX_WIDTH = { phone: 430, tablet: 1100, desktop: 1440 };

export function layoutFor(width) {
  if (typeof width !== 'number' || !Number.isFinite(width) || width < PHONE_BELOW) return 'phone';
  return width <= TABLET_UP_TO ? 'tablet' : 'desktop';
}

const widthNow = () => (typeof window === 'undefined' ? 0 : window.innerWidth);

/** The window's layout class, following resizes and rotations. */
export function useLayoutClass() {
  const [layout, setLayout] = useState(() => layoutFor(widthNow()));
  useEffect(() => {
    const onResize = () => setLayout(layoutFor(widthNow()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layout;
}

/** PhoneFrame's chrome (pinned header and footer, one scroller) at the width the layout class allows. */
export default function AssessmentFrame({ bare = false, layout = 'phone', header, footer, children }) {
  return (
    <PhoneFrame bare={bare} header={header} footer={footer} style={bare ? { maxWidth: FRAME_MAX_WIDTH[layout] ?? FRAME_MAX_WIDTH.phone } : undefined}>
      {children}
    </PhoneFrame>
  );
}
