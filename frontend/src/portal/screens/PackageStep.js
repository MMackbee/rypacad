import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import PackageCard from '../components/PackageCard';
import { Body, SectionLabel } from '../components/Primitives';
// Pure pricing helpers stay importable; the catalogue itself arrives through
// usePackages so a price change is data, not a code change in this screen.
import { DROP_IN, monthlyTotal } from '../data/packages';
import { usePackages } from '../hooks';

/**
 * 02 · Registration, step 3 — package selection.
 *
 * Revision 2 said names, count and prices were undecided, so this step carried a
 * "TIERS NOT DECIDED" caution banner, dashed `$ ——` slots and a "TIER SLOT"
 * marker. All three are gone: prices are confirmed and those elements are now
 * wrong on screen. Rendering from data was right under rev 2 and stays.
 *
 * Two shapes of choice, which is why this is not one flat list:
 *   - a golf package and an optional fitness add-on *stack*, and the parent
 *     needs a running total as they combine them
 *   - Elite *replaces* both rather than stacking, so choosing it clears the
 *     other two and choosing either of those clears Elite
 *
 * At $1,000 Elite equals the top golf package plus the top fitness package
 * exactly, with Phil and Yannick time on top — so the comparison is only
 * legible if the total is visible while the parent builds the stack.
 */
export default function PackageStep() {
  const { data: catalogue } = usePackages();
  const [golf, setGolf] = useState(null);
  const [fitness, setFitness] = useState(null);
  const [elite, setElite] = useState(null);

  // The two selection modes are mutually exclusive, enforced in one place.
  const pickGolf = (p) => {
    setElite(null);
    setGolf((cur) => (cur?.id === p.id ? null : p));
  };
  const pickFitness = (p) => {
    setElite(null);
    setFitness((cur) => (cur?.id === p.id ? null : p));
  };
  const pickElite = (t) => {
    setGolf(null);
    setFitness(null);
    setElite((cur) => (cur?.id === t.id ? null : t));
  };

  const total = elite ? elite.price : monthlyTotal({ golf, fitness });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <SectionLabel>Golf package</SectionLabel>
        {(catalogue?.golf ?? []).map((p) => (
          <PackageCard
            key={p.id}
            pkg={p}
            selected={golf?.id === p.id}
            onSelect={() => pickGolf(p)}
          />
        ))}
        {catalogue?.dropIn ? (
          <PackageCard
            pkg={catalogue.dropIn}
            cadence="per session"
            selected={golf?.id === catalogue.dropIn.id}
            onSelect={() => pickGolf(catalogue.dropIn)}
            footnote="No monthly commitment. Booking opens three days ahead rather than on the full schedule."
          />
        ) : null}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <SectionLabel>Fitness add-on</SectionLabel>
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
            optional, bought separately
          </span>
        </div>
        {(catalogue?.fitness ?? []).map((p) => (
          <PackageCard
            key={p.id}
            pkg={p}
            selected={fitness?.id === p.id}
            onSelect={() => pickFitness(p)}
          />
        ))}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <SectionLabel>Or choose Elite</SectionLabel>
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
            replaces the two above
          </span>
        </div>
        {(catalogue?.elite ?? []).map((t) => (
          <PackageCard
            key={t.id}
            pkg={t}
            emphasised
            selected={elite?.id === t.id}
            onSelect={() => pickElite(t)}
            rows={eliteRows(t)}
            footnote={<EliteOpenItems tier={t} />}
          />
        ))}
      </section>

      <TotalRow total={total} elite={elite} golf={golf} fitness={fitness} />
    </div>
  );
}

/** Only what is actually known. Unset counts are handled in EliteOpenItems. */
function eliteRows(tier) {
  const rows = ['Everything in the 16 + 4 package', 'Fitness training included'];
  if (tier.facility247) rows.push('24/7 facility access');
  return rows;
}

/**
 * Phil and Yannick session counts are `null` in packages.js on purpose — they
 * are not set yet. Rendering them as absent keeps the layout honest and lets the
 * numbers be filled in later without touching this component. Do not substitute
 * a plausible-looking count.
 */
function EliteOpenItems({ tier }) {
  const open = [
    ['Sessions with Phil', tier.philSessions],
    ['Mental performance with Yannick', tier.yannickSessions],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {open.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ flex: 1, color: color.textTertiary }}>{label}</span>
          <span
            style={{
              font: `600 10px ${font.mono}`,
              color: color.secondary,
              border: `1px dashed ${color.secondary}`,
              borderRadius: radius.badge,
              padding: '2px 6px',
              flex: 'none',
            }}
          >
            {value == null ? 'COUNT NOT SET' : value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The running total. Present even at zero, because its job is to be the thing
 * the parent watches while combining a package with an add-on.
 *
 * Drop-in is priced per session, not per month, so it never folds into a
 * monthly number - "$65 / session + $200 / mo" is two figures, and collapsing
 * them into "$265 / mo" would present a package half the price of 8 + 3 while
 * delivering eleven fewer sessions.
 */
function TotalRow({ total, elite, golf, fitness }) {
  const dropIn = golf?.id === DROP_IN.id;

  const parts = elite
    ? [elite.name]
    : [golf && golf.name, fitness && `fitness ${fitness.name}`].filter(Boolean);

  const figures = elite
    ? [{ amount: elite.price, unit: '/ mo' }]
    : dropIn
    ? [
        { amount: golf.price, unit: '/ session' },
        ...(fitness ? [{ amount: fitness.price, unit: '/ mo' }] : []),
      ]
    : total
    ? [{ amount: total, unit: '/ mo' }]
    : [];

  return (
    <div
      style={{
        borderTop: `1px solid ${color.frameRule}`,
        paddingTop: 15,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <SectionLabel>{dropIn ? 'Total' : 'Monthly total'}</SectionLabel>
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 5 }}>
          {parts.length ? parts.join(' + ') : 'Nothing selected yet'}
        </Body>
      </div>
      <div style={{ textAlign: 'right', flex: 'none' }}>
        {figures.length === 0 ? (
          <>
            <span style={{ font: `700 26px ${font.head}`, color: color.faintText }}>$0</span>
            <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}> / mo</span>
          </>
        ) : (
          figures.map((f, i) => (
            <span key={f.unit}>
              {i > 0 ? (
                <span style={{ font: `400 14px ${font.body}`, color: color.textTertiary }}> + </span>
              ) : null}
              <span style={{ font: `700 ${i === 0 ? 26 : 20}px ${font.head}`, color: color.primary }}>
                ${f.amount}
              </span>
              <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                {' '}
                {f.unit}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
