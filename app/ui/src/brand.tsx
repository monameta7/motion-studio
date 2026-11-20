// Responsibility: the active brand for every screen (Phase 8): the brand list from /api/brands, the active one, switching it and deleting a brand (D85), shared through one React context.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type BrandCard, type BrandsView } from './api';

export interface BrandState {
  brands: BrandCard[];
  /** The active brand (null until loaded, or when there is no brand yet). */
  active: BrandCard | null;
  /** Makes `slug` the active brand; resolves with a Persian error message, or null when it worked. */
  choose: (slug: string) => Promise<string | null>;
  /** Deletes `slug` (to brand/_trash); resolves with a Persian error message, or null when it worked. */
  remove: (slug: string) => Promise<string | null>;
  loaded: boolean;
}

const BrandContext = createContext<BrandState>({ brands: [], active: null, choose: async () => null, remove: async () => null, loaded: false });

/** The brand's logo; `w` (96 or 160) asks for a small copy (Phase 12: the original can be over 600 kB and is shown at 40 px). */
export const logoUrl = (slug: string, w?: 96 | 160) => `/api/brands/${encodeURIComponent(slug)}/logo.png${w ? `?w=${w}` : ''}`;

export function BrandProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<BrandsView | null>(null);
  useEffect(() => { api.get<BrandsView>('/api/brands').then(setView, () => setView({ brands: [], active: null })); }, []);
  const choose = useCallback(async (slug: string) => {
    try { setView(await api.put<BrandsView>('/api/brands/active', { slug })); return null; } catch (e) { return e instanceof ApiError ? e.message : 'برند عوض نشد؛ دوباره امتحان کن.'; }
  }, []);
  const remove = useCallback(async (slug: string) => {
    try { setView(await api.del<BrandsView>(`/api/brands/${encodeURIComponent(slug)}`)); return null; } catch (e) { return e instanceof ApiError ? e.message : 'برند حذف نشد؛ دوباره امتحان کن.'; }
  }, []);
  const brands = view?.brands ?? [];
  const value: BrandState = { brands, active: brands.find((b) => b.slug === view?.active) ?? null, choose, remove, loaded: view !== null };
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = (): BrandState => useContext(BrandContext);
