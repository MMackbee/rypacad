import React, { useState } from 'react';
import { color, font } from '../tokens';
import PackageCard from '../components/PackageCard';
import { Body, SectionLabel } from '../components/Primitives';
import { ELITE, SINGLE_TOKEN, TOKEN_PACKAGES } from '../data/packages';

/**
 * 02 · Registration, step 3 — package selection (Sprint 12 pin, contract
 * v2.0, "the token model"). Rewritten from the Sprint 1-11 two-pool
 * golf+fitness stack: ONE package selection now, from the token catalogue
 * (`TOKEN_PACKAGES`, t-6…t-20) plus a single-token option (`SINGLE_TOKEN`,
 * the old Drop-in slot's equivalent — one token, no standing commitment) and
 * Elite as a distinct choice, not a tier that replaces a stack because there
 * is no longer a stack to replace. No fitness add-on step (fitness packages
 * are retired — a token buys any session type now, contract §1) and no
 * running total across multiple picks — a family chooses ONE package.
 * Prices render straight from the catalogue with "pending" beside them when
 * `pkg.pending` is true (contract §1: awaiting Luke's OK) — never hardcoded.
 */
export default function PackageStep() {
  const [selected, setSelected] = useState(null);
  const pick = (p) => setSelected((cur) => (cur?.id === p.id ? null : p));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <SectionLabel>Token package</SectionLabel>
        {TOKEN_PACKAGES.map((p) => (
          <PackageCard key={p.id} pkg={p} selected={selected?.id === p.id} onSelect={() => pick(p)} />
        ))}
        <PackageCard
          pkg={SINGLE_TOKEN}
          selected={selected?.id === SINGLE_TOKEN.id}
          onSelect={() => pick(SINGLE_TOKEN)}
          footnote="One token, one period. No standing commitment."
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <SectionLabel>Or choose Elite</SectionLabel>
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
            unlimited · 24/7 access
          </span>
        </div>
        <PackageCard
          pkg={ELITE}
          emphasised
          selected={selected?.id === ELITE.id}
          onSelect={() => pick(ELITE)}
          rows={[
            'Unlimited tokens — every session, every type',
            '24/7 facility access',
            `Books ${ELITE.windowDays} days out`,
          ]}
        />
      </section>

      <SelectedRow pkg={selected} />
    </div>
  );
}

/** The chosen package as a fact, not a running total — there is only ever one. */
function SelectedRow({ pkg }) {
  return (
    <div
      style={{
        borderTop: `1px solid ${color.frameRule}`,
        paddingTop: 15,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <SectionLabel>Selected</SectionLabel>
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 5 }}>
          {pkg ? pkg.name : 'Nothing selected yet'}
        </Body>
      </div>
      <div style={{ textAlign: 'right', flex: 'none' }}>
        {pkg ? (
          <>
            <span style={{ font: `700 26px ${font.head}`, color: color.primary }}>${pkg.price}</span>
            <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
              {' '}
              / period{pkg.pending ? ' · pending' : ''}
            </span>
          </>
        ) : (
          <>
            <span style={{ font: `700 26px ${font.head}`, color: color.faintText }}>$0</span>
            <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}> / period</span>
          </>
        )}
      </div>
    </div>
  );
}
