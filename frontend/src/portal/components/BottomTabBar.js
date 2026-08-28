import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font, tint } from '../tokens';

/**
 * Bottom tab bar. Four items per role, carried forward from the 2025 build's
 * dashboard tab strips — on a phone those become bottom nav, trimmed to four.
 *
 * Navigation is built in: each tab carries its route and the bar navigates by
 * default, so a screen only renders `<BottomTabBar role active>` and gets a
 * working nav. `onChange` overrides that (the harness passes a no-op so its
 * gallery swatch doesn't navigate). Fixing this here rather than threading
 * onChange through every screen is deliberate — the first build passed neither,
 * and eleven screens shipped with an inert primary nav.
 *
 * Icons are 20px geometric placeholders, as in the scaffold. The real icon set
 * still has to be supplied; the name on each tab is the icon meaning.
 */
export const TABS = {
  athlete: [
    { key: 'home', label: 'Home', icon: 'home', route: '/portal/home' },
    { key: 'schedule', label: 'Schedule', icon: 'calendar', route: '/portal/schedule' },
    { key: 'contract', label: 'Contract', icon: 'target', route: '/portal/contract' },
    { key: 'dna', label: 'DNA', icon: 'chart', route: '/portal/dna' },
  ],
  parent: [
    { key: 'home', label: 'Home', icon: 'home', route: '/portal/family' },
    { key: 'children', label: 'Children', icon: 'children', route: '/portal/athlete' },
    { key: 'billing', label: 'Billing', icon: 'card', route: '/portal/billing' },
    { key: 'settings', label: 'Settings', icon: 'settings', route: '/portal/settings' },
  ],
  coach: [
    { key: 'today', label: 'Today', icon: 'today', route: '/portal/coach' },
    { key: 'roster', label: 'Roster', icon: 'list', route: '/portal/roster' },
    { key: 'capture', label: 'Capture', icon: 'camera', route: '/portal/capture' },
    // The coach profile screen is not in Phase 1's seventeen; no route yet.
    { key: 'me', label: 'Me', icon: 'profile', route: null },
  ],
};

export default function BottomTabBar({ role = 'athlete', active, onChange }) {
  const items = TABS[role] || TABS.athlete;
  const navigate = useNavigate();

  const select = (tab) => {
    if (onChange) return onChange(tab.key);
    if (tab.route) return navigate(tab.route);
    return undefined; // tab exists in the IA but its screen is not built yet
  };

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
            onClick={() => select(tab)}
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
