/** Small stroke icon set drawn inline (no icon library); always decorative, so hidden from screen readers. */

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

const PATHS = {
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
  truck: ['M2 6h12v10H2z', 'M14 9h4l4 4v3h-8', circle(6, 18, 2), circle(18, 18, 2)],
  box: ['M21 8l-9-5-9 5 9 5 9-5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  sliders: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', circle(15, 6, 2), circle(9, 12, 2), circle(17, 18, 2)],
  alert: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4', 'M12 17v.5'],
  sparkles: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  upload: ['M12 15V4', 'M7 9l5-5 5 5', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  search: [circle(11, 11, 6.5), 'M16 16l4.5 4.5'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  info: [circle(12, 12, 9), 'M12 11v5', 'M12 7.5v.5'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  checkCircle: [circle(12, 12, 9), 'M8 12.5l3 3 5-6'],
  alertCircle: [circle(12, 12, 9), 'M12 7.5v5.5', 'M12 16v.5'],
  clock: [circle(12, 12, 9), 'M12 7v5l3 2'],
  file: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5'],
  warehouse: ['M3 20V9l9-5 9 5v11', 'M7 20v-7h10v7', 'M7 16.5h10'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  database: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  send: ['M4 12l16-8-6 16-2.5-5.5z', 'M11.5 14.5L20 4'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  settings: [circle(12, 12, 3), 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** LogiMind mark: a route line through three stops, in the accent colour. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="7" fill="var(--accent)" />
      <path d="M7 19.5c3.5 0 4-11 7-11s3.5 11 7 11" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7" cy="19.5" r="2" fill="#fff" />
      <circle cx="14" cy="8.5" r="2" fill="#fff" />
      <circle cx="21" cy="19.5" r="2" fill="#fff" />
    </svg>
  );
}
