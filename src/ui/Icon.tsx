const PATHS: Record<string, string> = {
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  clipboard: 'M9 3h6v3H9zM6 5h12v16H6zM9 11h6M9 15h4',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  hammer: 'M14 4l6 6-3 3-6-6zM11 7l-7 7 3 3 7-7',
  x: 'M6 6l12 12M18 6L6 18',
  forklift: 'M4 17V9h6l3 5v3M16 4v13h5M6 21a2 2 0 100-4 2 2 0 000 4zM12 21a2 2 0 100-4 2 2 0 000 4z',
  rack: 'M5 3v18M19 3v18M5 9h14M5 15h14',
  doorIn: 'M4 21V5l8-2 8 2v16M12 9v8M9 14l3 3 3-3',
  doorOut: 'M4 21V5l8-2 8 2v16M12 17V9M9 12l3-3 3 3',
  grid: 'M4 4h16v16H4zM4 12h16M12 4v16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  warehouse: 'M3 21V9l9-5 9 5v12M7 21v-7h10v7',
  check: 'M5 12l5 5 9-10',
  chevron: 'M9 6l6 6-6 6',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  wrench: 'M15 5a4 4 0 104 4l-9 9-3-3 9-9',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v.5',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
};

export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name] ?? PATHS.box} />
    </svg>
  );
}
