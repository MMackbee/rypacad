import React from 'react';
import { color, font, tint } from '../tokens';

/**
 * Bottom tab bar. Four items per role, carried forward from the 2025 build's
 * dashboard tab strips — on a phone those become bottom nav, trimmed to four.
 *
 * Icons here are 20px geometric placeholders, as in the scaffold. The real icon
 * set still has to be supplied; the name on each tab below is the icon meaning.
 */
export const TABS = {
  athlete: [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'schedule', label: 'Schedule', icon: 'calendar' },
    { key: 'contract', label: 'Contract', icon: 'target' },
    { key: 'dna', label: 'DNA', icon: 'chart' },
  ],
  parent: [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'children', label: 'Children', icon: 'children' },
    { key: 'billing', label: 'Billing', icon: 'card' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
  coach: [
    { key: 'today', label: 'Today', icon: 'today' },
    { key: 'roster', label: 'Roster', icon: 'list' },
    { key: 'capture', label: 'Capture', icon: 'camera' },
    { key: 'me', label: 'Me', icon: 'profile' },
  ],
};

export default function BottomTabBar({ role = 'athlete', active, onChange }) {
  const items = TABS[role] || TABS.athlete;

  return (
    <nav
      style={{
        borderTop: `1px solid ${color.frameRule}`,
        padding: '9px 8px 20px',
        background: color.bg,
        display: 'flex',
      }}
    >
      {items.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange && onChange(tab.key)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              padding: '6px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            <span
              aria-hidden="true"
              data-icon={tab.icon}
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: on ? tint.greenStrong : 'transparent',
                border: `1.5px solid ${on ? color.primary : color.mutedText}`,
              }}
            />
            <span
              style={{
                font: `500 10px ${font.body}`,
                color: on ? color.primary : color.textTertiary,
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
