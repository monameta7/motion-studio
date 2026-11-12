import React from 'react';
import { DIACRITICS } from '../utils/persianUtils';
import { Sparkles, Trash2, Copy, Check } from 'lucide-react';

interface DiacriticsToolbarProps {
  onInsertChar: (char: string) => void;
  onNormalize: () => void;
  onClear: () => void;
  onCopy: () => void;
  copied: boolean;
}

export const DiacriticsToolbar: React.FC<DiacriticsToolbarProps> = ({
  onInsertChar,
  onNormalize,
  onClear,
  onCopy,
  copied,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs">
      {/* Diacritic buttons */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-slate-400 ml-1.5 font-medium">اعراب‌گذاری سریع:</span>
        {DIACRITICS.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => onInsertChar(item.char)}
            title={item.name}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/60 font-semibold transition-all cursor-pointer text-sm"
          >
            {item.name.includes('نیم') ? (
              <span className="text-xs font-normal text-amber-300">نیم‌فاصله</span>
            ) : (
              item.char
            )}
          </button>
        ))}
      </div>

      {/* Utilities: Normalize, Copy, Clear */}
      <div className="flex items-center gap-1.5 mr-auto">
        <button
          type="button"
          onClick={onNormalize}
          title="اصلاح خودکار کلمات عربی به فارسی و حذف فواصل نامرتب"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/40 transition-colors cursor-pointer text-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>ویرایش و استانداردسازی</span>
        </button>

        <button
          type="button"
          onClick={onCopy}
          title="کپی متن"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={onClear}
          title="پاک کردن متن"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/50 hover:text-rose-300 text-slate-400 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
