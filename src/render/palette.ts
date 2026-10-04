import * as THREE from 'three';
import type { ClientId } from '../sim/world';

export const C = {
  sky: '#DCE6F2',
  ground: '#E2E8F0',
  lot: '#EEF2F7',
  road: '#A9B6C8',
  roadLine: '#FFFFFF',
  bay: '#F5B83D',
  blue: '#2563EB',
  blueDark: '#1D4ED8',
  navy: '#1E293B',
  wall: '#F1F5F9',
  floor: '#E7ECF3',
  yellow: '#FACC15',
  yellowDark: '#EAB308',
  tire: '#334155',
  steel: '#64748B',
  steelLight: '#CBD5E1',
  skin: '#F2C7A5',
  trailer: '#F8FAFC',
  chassis: '#475569',
  glass: '#1E3A5F',
  rackBeam: '#F97316',
  wood: '#B7814A',
  shutter: '#E2E8F0',
  tree: '#6CC08B',
  treeDark: '#4FA872',
  trunk: '#8B6B4A',
  ok: '#16A34A',
  bad: '#EF4444',
  outDoor: '#0D9488',
} as const;

/** Truck livery per client; `logo` is the short name painted on the trailer sides. */
export const CLIENT_LOOK: Record<ClientId, { cab: string; stripe: string; logo: string }> = {
  'Critter Co.': { cab: '#FACC15', stripe: '#EAB308', logo: 'Critter Co.' },
  'Wizards of the West': { cab: '#F8FAFC', stripe: '#7C3AED', logo: 'Wizards W.' },
  "Dragon's Hoard Games": { cab: '#F8FAFC', stripe: '#DC2626', logo: "Dragon's Hoard" },
  DeckBazaar: { cab: '#F8FAFC', stripe: '#0D9488', logo: 'DeckBazaar' },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { opacity?: number; emissive?: string; roughness?: number } = {}): THREE.MeshStandardMaterial {
  const opacity = opts.opacity ?? 1;
  const key = `${color}|${opacity}|${opts.emissive ?? ''}|${opts.roughness ?? 0.7}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.7, metalness: 0.05, transparent: opacity < 1, opacity,
      depthWrite: opacity >= 1, emissive: opts.emissive ?? '#000000', emissiveIntensity: opts.emissive ? 0.6 : 0,
    });
    cache.set(key, m);
  }
  return m;
}
