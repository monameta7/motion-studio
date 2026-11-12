// Responsibility: the active brand for every screen (Phase 8): the brand list from /api/brands, the active one, and switching it, shared through one React context.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type BrandCard, type BrandsView } from './api';

export interface BrandState {
  brands: BrandCard[];
  /** The active brand (null until loaded, or when there is no brand yet). */
  active: BrandCard | null;
  /** Makes `slug` the active brand; resolves with a Persian error message, or null when it worked. */
  choose: (slug: string) => Promise<string | null>;
  loaded: boolean;
}

const BrandContext = createContext<BrandState>({ brands: [], active: null, choose: async () => null, loaded: false });

export const logoUrl = (slug: string) => `/api/brands/${encodeURIComponent(slug)}/logo.png`;

export function BrandProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<BrandsView | null>(null);
  useEffect(() => { api.get<BrandsView>('/api/brands').then(setView, () => setView({ brands: [], active: null })); }, []);
  const choose = useCallback(async (slug: string) => {
    try { setView(await api.put<BrandsView>('/api/brands/active', { slug })); return null; } catch (e) { return e instanceof ApiError ? e.message : 'برند عوض نشد؛ دوباره امتحان کن.'; }
  }, []);
  const brands = view?.brands ?? [];
  const value: BrandState = { brands, active: brands.find((b) => b.slug === view?.active) ?? null, choose, loaded: view !== null };
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = (): BrandState => useContext(BrandContext);
