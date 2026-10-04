import type { ProductId } from './world';

export interface Product {
  id: ProductId;
  name: string;
  value: number;
  heavy: boolean;
  fragile: boolean;
  locked: boolean;
  color: string;
}

export const PRODUCTS: Record<ProductId, Product> = {
  starters: { id: 'starters', name: 'Shadow Realm Starter Decks', value: 400, heavy: false, fragile: false, locked: false, color: '#DC2626' },
  playmats: { id: 'playmats', name: 'Playmat Rolls', value: 350, heavy: true, fragile: false, locked: false, color: '#1F2937' },
  collector: { id: 'collector', name: 'Arcane Duels Collector Boosters', value: 2200, heavy: false, fragile: true, locked: false, color: '#7C3AED' },
  boosters: { id: 'boosters', name: 'Pocket Critters Booster Display', value: 900, heavy: false, fragile: false, locked: false, color: '#FACC15' },
  sleeves: { id: 'sleeves', name: 'WyrmGuard Sleeves & Deck Boxes', value: 300, heavy: false, fragile: false, locked: false, color: '#14B8A6' },
  slabs: { id: 'slabs', name: 'Graded Card Slabs', value: 5000, heavy: false, fragile: false, locked: true, color: '#E5E7EB' },
};

export const UNLOCKED_PRODUCTS: ProductId[] = (Object.keys(PRODUCTS) as ProductId[]).filter((p) => !PRODUCTS[p].locked);
