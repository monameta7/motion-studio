import React from 'react';
import { VoiceId, ToneId } from '../types/tts';
import { PERSIAN_VOICES, TONE_OPTIONS } from '../utils/persianUtils';
import { User, Sparkles, Mic } from 'lucide-react';

interface VoiceSelectorProps {
  selectedVoice: VoiceId;
  selectedTone: ToneId;
  onVoiceSelect: (voice: VoiceId) => void;
  onToneSelect: (tone: ToneId) => void;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  selectedVoice,
  selectedTone,
  onVoiceSelect,
  onToneSelect,
}) => {
  return (
    <div className="space-y-5">
      {/* Voice Personas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-amber-400" />
            <span>انتخاب گوینده (Voice Persona)</span>
          </label>
          <span className="text-xs text-slate-500">مبتنی بر مدل Gemini TTS</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {PERSIAN_VOICES.map((v) => {
            const isSelected = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onVoiceSelect(v.id)}
                className={`flex flex-col text-right p-3 rounded-xl border transition-all cursor-pointer relative group ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-sm shadow-amber-500/10 ring-1 ring-amber-500/30'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-200">
                        {v.persianName}
                      </span>
                      <span className="text-[11px] text-slate-400 mr-1.5 font-mono">
                        ({v.id})
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      v.gender === 'زنانه'
                        ? 'bg-pink-950/60 text-pink-300 border border-pink-800/40'
                        : 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                    }`}
                  >
                    {v.gender}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-1 line-clamp-2">
                  {v.description}
                </p>
                <div className="mt-2 text-[10px] text-amber-400/90 font-medium">
                  {v.badge}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tone / Emotion Presets */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>لحن و سبک خوانش (Tone & Style)</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((t) => {
            const isSelected = selectedTone === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToneSelect(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer flex flex-col items-start ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-200 ring-1 ring-indigo-500/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
                title={t.description}
              >
                <span className="font-semibold">{t.label}</span>
                <span className="text-[10px] opacity-75 mt-0.5 font-normal">
                  {t.description.split(' ')[0]}...
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
