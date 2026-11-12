import React, { useState } from 'react';
import { HistoryItem } from '../types/tts';
import { Play, Download, Trash2, Clock, Search, X } from 'lucide-react';
import { toPersianDigits } from '../utils/persianUtils';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onSelectAndPlay: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onDownloadItem: (item: HistoryItem, format: 'mp3' | 'wav') => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onSelectAndPlay,
  onDeleteItem,
  onClearAll,
  onDownloadItem,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredItems = items.filter(
    (item) =>
      item.fullText.includes(searchTerm) ||
      item.voice.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity">
      <div className="w-full max-w-md h-full bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-slate-100 text-sm">تاریخچه گفتارهای تولید شده</h3>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {toPersianDigits(items.length)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Bulk Clear */}
        <div className="p-3 border-b border-slate-800/80 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="جستجو در متن یا نام گوینده..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {items.length > 0 && (
            <div className="flex justify-between items-center text-xs text-slate-400 px-1">
              <span>{toPersianDigits(filteredItems.length)} مورد پیدا شد</span>
              <button
                onClick={onClearAll}
                className="text-rose-400 hover:text-rose-300 text-[11px] cursor-pointer hover:underline"
              >
                پاک کردن کل تاریخچه
              </button>
            </div>
          )}
        </div>

        {/* List of items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              {searchTerm ? 'موردی با این عبارت یافت نشد.' : 'هنوز گفتاری ذخیره نشده است.'}
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950/80 border border-slate-850 hover:border-slate-700/80 rounded-xl p-3.5 space-y-2.5 transition-all group"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-400">
                    گوینده: {item.voice}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {toPersianDigits(new Date(item.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                  {item.fullText}
                </p>

                <div className="flex items-center justify-between pt-1 border-t border-slate-850">
                  <button
                    onClick={() => onSelectAndPlay(item)}
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>پخش گفتار</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {item.audioBase64 && (
                      <>
                        <button
                          onClick={() => onDownloadItem(item, 'mp3')}
                          title="دانلود با فرمت MP3 (کم‌حجم)"
                          className="px-2 py-1 rounded-lg text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>MP3</span>
                        </button>
                        <button
                          onClick={() => onDownloadItem(item, 'wav')}
                          title="دانلود با فرمت اصلی WAV"
                          className="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>WAV</span>
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      title="حذف از تاریخچه"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
