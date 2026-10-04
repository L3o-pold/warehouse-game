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
  boxes: { id: 'boxes', name: 'Cardboard Boxes', value: 400, heavy: false, fragile: false, locked: false, color: '#D9A066' },
  water: { id: 'water', name: 'Spring Water 24-pack', value: 350, heavy: true, fragile: false, locked: false, color: '#60A5FA' },
  led: { id: 'led', name: 'LED Panel 60×60', value: 2200, heavy: false, fragile: true, locked: false, color: '#E2E8F0' },
  helmets: { id: 'helmets', name: 'Safety Helmets', value: 900, heavy: false, fragile: false, locked: false, color: '#F59E0B' },
  tape: { id: 'tape', name: 'Packing Tape', value: 300, heavy: false, fragile: false, locked: false, color: '#C08A4B' },
  frozen: { id: 'frozen', name: 'Frozen Goods', value: 1200, heavy: false, fragile: false, locked: true, color: '#67E8F9' },
};

export const UNLOCKED_PRODUCTS: ProductId[] = (Object.keys(PRODUCTS) as ProductId[]).filter((p) => !PRODUCTS[p].locked);
