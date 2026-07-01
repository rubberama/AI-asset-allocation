/**
 * EtacollaLogo — the brand mark + wordmark.
 *
 * The mark is an allocation ring: three concentric arcs in the asset-class
 * brand colors (violet / green / amber) that read as a portfolio donut — the
 * literal subject of the product. Ported from the approved design reference
 * (design-reference/Etacolla-standalone.html). The wordmark is set in Archivo
 * ExtraBold with the reference's wide +1px optical tracking.
 */

const RING = { violet: "#A78BFA", green: "#34D399", amber: "#FBBF24" } as const;
const WORDMARK_FONT = "'Archivo',sans-serif";

export function EtacollaMark({ size = 22, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Etacolla"
      style={spin ? { animation: "etacollaMarkIn .9s cubic-bezier(.16,1,.3,1) both" } : undefined}
    >
      {/* arcs are laid head-to-tail around a circumference of ~214 (2·π·34) */}
      <circle cx="50" cy="50" r="34" fill="none" stroke={RING.violet} strokeWidth="11" strokeDasharray="120 214" transform="rotate(-90 50 50)" />
      <circle cx="50" cy="50" r="34" fill="none" stroke={RING.green} strokeWidth="11" strokeDasharray="70 214" strokeDashoffset="-120" transform="rotate(-90 50 50)" />
      <circle cx="50" cy="50" r="34" fill="none" stroke={RING.amber} strokeWidth="11" strokeDasharray="40 214" strokeDashoffset="-190" transform="rotate(-90 50 50)" />
    </svg>
  );
}

export function EtacollaLogo({
  size = 22,
  wordmark = true,
  wordmarkSize,
  orientation = "row",
  gap,
  spin = false,
  color = "#fff",
}: {
  /** ring mark diameter in px */
  size?: number;
  /** show the "Etacolla" wordmark next to / under the mark */
  wordmark?: boolean;
  /** wordmark font-size in px (defaults proportional to the mark) */
  wordmarkSize?: number;
  /** stack the wordmark under the mark ("column") or beside it ("row") */
  orientation?: "row" | "column";
  /** override the space between mark and wordmark */
  gap?: number;
  /** play the one-time draw-in on mount (use on the hero, not in chrome) */
  spin?: boolean;
  /** wordmark color */
  color?: string;
}) {
  const ws = wordmarkSize ?? Math.round(size * 0.82);
  const column = orientation === "column";
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: column ? "column" : "row",
        alignItems: "center",
        gap: gap ?? (column ? Math.round(size * 0.32) : Math.round(size * 0.42)),
        lineHeight: 1,
      }}
    >
      {spin && (
        <style>{`
          @keyframes etacollaMarkIn {
            from { opacity: 0; transform: rotate(-120deg) scale(.82); }
            to   { opacity: 1; transform: rotate(0) scale(1); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes etacollaMarkIn { from { opacity: 1; transform: none; } to { opacity: 1; transform: none; } }
          }
        `}</style>
      )}
      <EtacollaMark size={size} spin={spin} />
      {wordmark && (
        <span
          style={{
            fontFamily: WORDMARK_FONT,
            fontWeight: 800,
            fontSize: ws,
            letterSpacing: `${(ws * 0.038).toFixed(2)}px`,
            color,
          }}
        >
          Etacolla
        </span>
      )}
    </span>
  );
}
