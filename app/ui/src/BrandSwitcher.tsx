// Responsibility: the brand switcher at the top of the sidebar (Phase 8): the active brand's logo and name, and a list to make another brand active for New video and Automation.
import { useEffect, useRef, useState } from 'react';
import type { BrandCard } from './api';
import { logoUrl, useBrand } from './brand';

/** The brand's logo, or its first letter on a tile when it has none. */
export function BrandMark({ brand, size = 40 }: { brand: BrandCard | null; size?: number }) {
  if (brand?.logo) return <img className="brand-logo" src={logoUrl(brand.slug)} alt="" width={size} height={size} />;
  return <span className="brand-logo brand-letter" style={{ width: size, height: size }} aria-hidden="true">{[...(brand?.name ?? '؟')][0]}</span>;
}

export function BrandSwitcher() {
  const { brands, active, choose, loaded } = useBrand();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Closes on Escape and on a click outside, like the bell list.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
  }, [open]);

  const pick = async (slug: string) => {
    setProblem(null);
    if (slug === active?.slug) { setOpen(false); return; }
    const err = await choose(slug);
    if (err) setProblem(err); else setOpen(false);
  };

  return (
    <div className="brand-switch" ref={box}>
      <button type="button" className="brand" aria-expanded={open} aria-controls="brand-list" onClick={() => setOpen((o) => !o)}
        aria-label={`برند فعال: ${active?.name ?? 'هیچ'}. برای عوض کردن برند بزن.`}>
        <BrandMark brand={active} />
        <span className="brand-text"><b>استودیو موشن</b><span>{active ? active.name : loaded ? 'هنوز برندی نیست' : '…'}</span></span>
        <span className="brand-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id="brand-list" className="brand-menu">
          <p className="brand-menu-title">برند فعال برای ساخت ویدیو و اتوماسیون</p>
          {brands.length === 0 ? <p className="muted">هنوز برندی ساخته نشده.</p> : (
            <ul>
              {brands.map((b) => (
                <li key={b.slug}>
                  <button type="button" className="brand-option" aria-pressed={b.slug === active?.slug} onClick={() => void pick(b.slug)}>
                    <BrandMark brand={b} size={28} /><span>{b.name}</span>{b.slug === active?.slug && <span className="brand-check" aria-hidden="true">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a className="brand-new" href="#/brand/new" onClick={() => setOpen(false)}>+ برند تازه</a>
          <p className="muted small">کارهایی که ساخته شده‌اند برند خودشان را نگه می‌دارند.</p>
          {problem && <p className="problem" role="alert">{problem}</p>}
        </div>
      )}
    </div>
  );
}
