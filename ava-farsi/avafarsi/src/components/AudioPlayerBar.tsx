import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Repeat,
  Gauge,
  Sliders,
  FileAudio,
  Share2,
} from 'lucide-react';
import { formatTime, toPersianDigits } from '../utils/persianUtils';

interface AudioPlayerBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackSpeed: number;
  pitchShift: number; // in cents (-400 to +400)
  isLooping: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onSpeedChange: (speed: number) => void;
  onPitchChange: (pitch: number) => void;
  onToggleLoop: () => void;
  onDownload: (format: 'mp3' | 'wav') => void;
  onShare?: (format: 'mp3' | 'wav') => void;
  voiceName: string;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackSpeed,
  pitchShift,
  isLooping,
  onPlayPause,
  onReset,
  onSeek,
  onVolumeChange,
  onSpeedChange,
  onPitchChange,
  onToggleLoop,
  onDownload,
  onShare,
  voiceName,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'mp3' | 'wav'>('mp3');
  const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Top row: Track Information & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
            {voiceName ? voiceName.slice(0, 1) : 'آ'}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>فایل صوتی تولید شده</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-normal">
                گوینده: {voiceName}
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              کیفیت بالا با قابلیت دانلود مستقیم در دو فرمت محبوب MP3 و WAV
            </p>
          </div>
        </div>

        {/* Download Group with Format Switcher */}
        <div className="flex items-center gap-2">
          {/* Format Selector Pill */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => setSelectedFormat('mp3')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1 ${
                selectedFormat === 'mp3'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="فرمت استاندارد MP3 (کم‌حجم و مناسب گوشی، تلگرام و پیام‌رسان‌ها)"
            >
              <span>MP3</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFormat('wav')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1 ${
                selectedFormat === 'wav'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="فرمت اصلی استودیویی WAV (بدون فشرده‌سازی)"
            >
              <span>WAV</span>
            </button>
          </div>

          {/* Direct File Download Button (Directly saves to Downloads folder) */}
          <button
            type="button"
            onClick={() => onDownload(selectedFormat)}
            title="دانلود و ذخیره مستقیم در پوشه دانلودها"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:brightness-105 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md hover:shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>دانلود مستقیم {selectedFormat.toUpperCase()}</span>
          </button>

          {/* Optional Share Button */}
          {onShare && (
            <button
              type="button"
              onClick={() => onShare(selectedFormat)}
              title="اشتراک‌گذاری در واتساپ، تلگرام یا برنامه‌ها"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-300 border border-slate-700 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrubber / Progress timeline */}
      {(() => {
        const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const safeCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
              <span>{toPersianDigits(formatTime(safeCurrentTime))}</span>
              <span>{toPersianDigits(formatTime(safeDuration))}</span>
            </div>
            <div className="relative flex items-center group">
              <input
                type="range"
                min={0}
                max={safeDuration > 0 ? safeDuration : 100}
                step={0.1}
                value={safeCurrentTime}
                onChange={(e) => onSeek(parseFloat(e.target.value) || 0)}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer focus:outline-none accent-amber-500 group-hover:h-2.5 transition-all"
                dir="ltr"
              />
            </div>
          </div>
        );
      })()}

      {/* Main playback and tuning controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        {/* Play / Reset / Loop cluster */}
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            title="شروع مجدد از ابتدا"
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onPlayPause}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 hover:from-amber-500 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/25 transition-transform active:scale-95 cursor-pointer font-bold"
            title={isPlaying ? 'توقف موقت' : 'پخش گفتار'}
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current mr-0.5" />}
          </button>

          <button
            onClick={onToggleLoop}
            title={isLooping ? 'تکرار خودکار فعال است' : 'فعال‌سازی پخش پیوسته/تکرار'}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
              isLooping
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Playback Speed selector */}
        <div className="flex items-center gap-2 bg-slate-800/60 p-1 rounded-xl border border-slate-750">
          <Gauge className="w-4 h-4 text-slate-400 mr-1" />
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2.5 py-1 text-xs rounded-lg font-mono transition-all cursor-pointer ${
                playbackSpeed === s
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Pitch Shift tuning */}
        <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-750">
          <Sliders className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-300">تنظیم تن صدا:</span>
          <input
            type="range"
            min={-400}
            max={400}
            step={50}
            value={pitchShift}
            onChange={(e) => onPitchChange(parseInt(e.target.value, 10))}
            className="w-20 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400"
            title={`تنظیم زیروبمی: ${pitchShift > 0 ? `+${pitchShift}` : pitchShift} سنت`}
            dir="ltr"
          />
          <span className="text-[11px] font-mono text-slate-400 min-w-8 text-center tabular-nums">
            {pitchShift === 0 ? 'عادی' : pitchShift > 0 ? `+${pitchShift}` : pitchShift}
          </span>
          {pitchShift !== 0 && (
            <button
              onClick={() => onPitchChange(0)}
              className="text-[10px] text-amber-400 hover:underline cursor-pointer"
            >
              ریست
            </button>
          )}
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVolumeChange(volume === 0 ? 1 : 0)}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
            title={volume === 0 ? 'فعال‌سازی صدا' : 'قطع صدا'}
          >
            {volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
};
