// Sheriff badge artwork, copied exactly from the app: a flat gold star
// with ball tips and a cream medallion; the value rides in an HTML span
// over the medallion (never inside the SVG).

export function SheriffBadgeSvg() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="14" r="5.5" fill="#e9b93c" stroke="#8a5d00" strokeWidth="1.6" />
      <circle cx="84.2" cy="38.9" r="5.5" fill="#e9b93c" stroke="#8a5d00" strokeWidth="1.6" />
      <circle cx="71.2" cy="79.1" r="5.5" fill="#e9b93c" stroke="#8a5d00" strokeWidth="1.6" />
      <circle cx="28.8" cy="79.1" r="5.5" fill="#e9b93c" stroke="#8a5d00" strokeWidth="1.6" />
      <circle cx="15.8" cy="38.9" r="5.5" fill="#e9b93c" stroke="#8a5d00" strokeWidth="1.6" />
      <polygon
        points="50,14 58.8,37.9 84.2,38.9 64.3,54.6 71.2,79.1 50,65 28.8,79.1 35.7,54.6 15.8,38.9 41.2,37.9"
        fill="#f0c33c"
        stroke="#8a5d00"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon
        points="50,20 56.5,39.5 77,40.3 61.5,53.2 66.5,73 50,61.5 33.5,73 38.5,53.2 23,40.3 43.5,39.5"
        fill="#f7d354"
        stroke="none"
      />
      <circle cx="50" cy="50" r="19" fill="#fff3cf" stroke="#8a5d00" strokeWidth="2" />
      <circle cx="50" cy="50" r="15.5" fill="none" stroke="#c9971c" strokeWidth="1" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

export default function SheriffBadge({
  value,
  wrapClass,
}: {
  value: number;
  wrapClass: string;
}) {
  const val = String(value);
  return (
    <span className={wrapClass} aria-hidden="true">
      <SheriffBadgeSvg />
      <span className={`badge-value${val.length > 2 ? " long" : ""}`}>{val}</span>
    </span>
  );
}

// Pop-art NEW! starburst shown centered on an unviewed poster instead of
// its status line — spiky yellow burst, black outline, red letters.
export function NewBurst() {
  return (
    <span className="new-burst" aria-hidden="true">
      <svg viewBox="0 0 120 76">
        <g transform="rotate(-5 60 38)">
          <polygon
            points="60,2 68,22 86,6 86,24 108,14 100,30 118,32 102,38 114,52 96,48 102,68 84,56 80,74 68,58 58,76 54,58 38,72 42,54 20,64 30,46 4,50 22,38 2,26 24,30 16,8 36,22 38,2 50,20"
            fill="#ffd21f"
            stroke="#141414"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <text
            x="60"
            y="40"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'Bricolage Grotesque', sans-serif"
            fontSize="25"
            fontWeight="800"
            fontStyle="italic"
            fill="#e62117"
            stroke="#141414"
            strokeWidth="4"
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            NEW!
          </text>
        </g>
      </svg>
    </span>
  );
}
