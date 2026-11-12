/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  SAMPLE_TEXTS,
  PERSIAN_VOICES,
  normalizePersianText,
  toPersianDigits,
} from './utils/persianUtils';
import { VoiceId, ToneId, HistoryItem } from './types/tts';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { VoiceSelector } from './components/VoiceSelector';
import { DiacriticsToolbar } from './components/DiacriticsToolbar';
import { HistoryDrawer } from './components/HistoryDrawer';
import { InstallMobileModal } from './components/InstallMobileModal';
import { convertWavToMp3Blob } from './utils/audioConverter';
import {
  Volume2,
  Clock,
  History,
  Sparkles,
  Loader2,
  FileText,
  Check,
  AlertCircle,
  Headphones,
  Smartphone,
} from 'lucide-react';

const LOCAL_STORAGE_HISTORY_KEY = 'avafarsi_speech_history_v1';

export default function App() {
  // Input State
  const [text, setText] = useState<string>(
    'سلام و درود! به استودیوی آوا فارسی خوش آمدید. هر متنی که می‌خواهید را بنویسید یا ویرایش کنید تا با صدایی روان و طبیعی خوانده شود.'
  );
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>('Kore');
  const [selectedTone, setSelectedTone] = useState<ToneId>('formal');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio Playback State
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [pitchShift, setPitchShift] = useState<number>(0);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  // UI state
  const [copied, setCopied] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Audio & Web Audio Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    }
  }, []);

  // Save history safely without storing giant audioBase64 strings in localStorage
  const saveHistoryItem = (item: HistoryItem) => {
    setHistory((prev) => {
      const updated = [item, ...prev.slice(0, 19)];
      try {
        const metadataOnly = updated.map((h) => ({
          id: h.id,
          timestamp: h.timestamp,
          textSnippet: h.textSnippet,
          fullText: h.fullText,
          voice: h.voice,
          tone: h.tone,
        }));
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(metadataOnly));
      } catch (err) {
        console.warn('LocalStorage save failed:', err);
      }
      return updated;
    });
  };

  // Clean AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Setup Web Audio Analyser node safely when audio element is ready
  const setupAudioContext = () => {
    if (!audioRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.8;

          try {
            const source = ctx.createMediaElementSource(audioRef.current);
            source.connect(analyser);
            analyser.connect(ctx.destination);
            sourceNodeRef.current = source;
          } catch (sourceErr) {
            console.warn('createMediaElementSource warning:', sourceErr);
          }

          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
        }
      }

      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch (err) {
      console.warn('Web Audio API setup warning:', err);
    }
  };

  // Handle Play/Pause
  const handlePlayPause = async () => {
    if (!audioRef.current || !audioBase64) return;
    setupAudioContext();

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Playback error:', err);
      }
    }
  };

  // Handle timeline seek
  const handleSeek = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Handle seek from waveform click percentage
  const handleWaveformSeek = (percentage: number) => {
    if (!audioRef.current || duration <= 0) return;
    const targetTime = percentage * duration;
    handleSeek(targetTime);
  };

  // Reset audio to start
  const handleReset = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  // Volume change
  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  // Playback speed change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Pitch change simulation via playbackRate / detune
  const handlePitchChange = (pitch: number) => {
    setPitchShift(pitch);
    // If pitch shifted, we can adjust playbackRate or detune in AudioContext
    if (audioRef.current) {
      // Set preservesPitch false if pitch offset desired
      if ('preservesPitch' in audioRef.current) {
        (audioRef.current as any).preservesPitch = pitch === 0;
      }
    }
  };

  // Toggle Loop
  const handleToggleLoop = () => {
    setIsLooping((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.loop = next;
      }
      return next;
    });
  };

  // Audio element event listeners
  const onAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.volume = volume;
      audioRef.current.loop = isLooping;
    }
  };

  const onAudioEnded = () => {
    if (!isLooping) {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  // Helper: Direct file download directly into the device's Downloads folder
  const triggerDownload = async (
    base64Data: string,
    filenamePrefix = 'AvaFarsi_speech',
    format: 'mp3' | 'wav' = 'mp3'
  ) => {
    try {
      const isMp3 = format === 'mp3';
      const ext = isMp3 ? 'mp3' : 'wav';
      const filename = `${filenamePrefix}_${Date.now()}.${ext}`;

      let targetBlob: Blob;

      if (isMp3) {
        // High quality fast client-side MP3 encoding (128kbps)
        const converted = await convertWavToMp3Blob(base64Data, 128);
        targetBlob = converted.blob;
      } else {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        targetBlob = new Blob([byteArray], { type: 'audio/wav' });
      }

      // Direct file download - directly saves to device Downloads folder without opening share dialog
      const url = URL.createObjectURL(targetBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Keep URL active for 60 seconds so mobile/desktop download manager finishes
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Client download error, falling back to server download:', err);
      try {
        const res = await fetch('/api/download-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Data,
            filename: filenamePrefix,
            format,
          }),
        });
        const serverBlob = await res.blob();
        const serverUrl = URL.createObjectURL(serverBlob);
        const serverLink = document.createElement('a');
        serverLink.href = serverUrl;
        serverLink.download = `${filenamePrefix}.${format}`;
        serverLink.style.display = 'none';
        document.body.appendChild(serverLink);
        serverLink.click();
        document.body.removeChild(serverLink);
        setTimeout(() => URL.revokeObjectURL(serverUrl), 60000);
      } catch (fallbackErr) {
        console.error('Server download error:', fallbackErr);
      }
    }
  };

  // Optional Share helper for explicitly sharing to apps
  const triggerShare = async (
    base64Data: string,
    filenamePrefix = 'AvaFarsi_speech',
    format: 'mp3' | 'wav' = 'mp3'
  ) => {
    try {
      const isMp3 = format === 'mp3';
      const ext = isMp3 ? 'mp3' : 'wav';
      const mime = isMp3 ? 'audio/mpeg' : 'audio/wav';
      const filename = `${filenamePrefix}_${Date.now()}.${ext}`;

      let targetBlob: Blob;
      if (isMp3) {
        const converted = await convertWavToMp3Blob(base64Data, 128);
        targetBlob = converted.blob;
      } else {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        targetBlob = new Blob([new Uint8Array(byteNumbers)], { type: 'audio/wav' });
      }

      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        const file = new File([targetBlob], filename, { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `فایل صوتی آوا فارسی (${format.toUpperCase()})`,
            text: 'فایل صوتی تولید شده با هوش مصنوعی آوا فارسی',
          });
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.log('Share dismissed or not supported:', e);
      }
    }
  };

  // Handle generation call to server
  const handleGenerateSpeech = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMessage('لطفاً متنی برای تبدیل به گفتار وارد نمایید.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          voice: selectedVoice,
          tone: selectedTone,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'خطایی در پردازش رخ داد.');
      }

      if (data.audioBase64) {
        setAudioBase64(data.audioBase64);
        setCurrentTime(0);

        // Save to History
        const newItem: HistoryItem = {
          id: `tts_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          textSnippet: trimmed.slice(0, 120),
          fullText: trimmed,
          voice: selectedVoice,
          tone: selectedTone,
          audioBase64: data.audioBase64,
        };
        saveHistoryItem(newItem);

        // Auto play on new generation (safe for mobile devices)
        setTimeout(() => {
          if (audioRef.current) {
            setupAudioContext();
            audioRef.current.play()
              .then(() => setIsPlaying(true))
              .catch((playErr) => {
                console.log('Mobile autoplay note:', playErr);
                setIsPlaying(false);
              });
          }
        }, 100);
      }
    } catch (err: any) {
      console.error('Speech generation error:', err);
      setErrorMessage(err.message || 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Insert Diacritic / Special Char at cursor
  const handleInsertChar = (char: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((prev) => prev + char);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    const updated = currentVal.substring(0, start) + char + currentVal.substring(end);
    setText(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + char.length, start + char.length);
    }, 0);
  };

  // Normalize Persian text
  const handleNormalize = () => {
    setText((prev) => normalizePersianText(prev));
  };

  // Clear text
  const handleClear = () => {
    setText('');
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Copy text
  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Select Sample Text
  const handleSelectSample = (sample: typeof SAMPLE_TEXTS[0]) => {
    setText(sample.text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Delete history item
  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Clear all history
  const handleClearAllHistory = () => {
    setHistory([]);
    localStorage.removeItem(LOCAL_STORAGE_HISTORY_KEY);
  };

  // Play from history
  const handlePlayFromHistory = (item: HistoryItem) => {
    setText(item.fullText);
    setSelectedVoice(item.voice);
    setSelectedTone(item.tone);
    setAudioBase64(item.audioBase64);
    setIsHistoryOpen(false);
    setTimeout(() => {
      if (audioRef.current) {
        setupAudioContext();
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 150);
  };

  // Text statistics
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;
  // Average Persian speaking rate ~ 130 words per minute
  const estimatedSeconds = Math.max(1, Math.round((wordCount / 130) * 60));

  const selectedVoiceMeta = PERSIAN_VOICES.find((v) => v.id === selectedVoice);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-amber-500/20 selection:text-amber-200" dir="rtl">
      {/* Audio element permanently mounted to maintain Web Audio stability */}
      <audio
        ref={audioRef}
        src={audioBase64 ? `data:audio/wav;base64,${audioBase64}` : undefined}
        onTimeUpdate={onAudioTimeUpdate}
        onLoadedMetadata={onAudioLoadedMetadata}
        onEnded={onAudioEnded}
        preload="auto"
        className="hidden"
      />

      {/* Top Bar Header following Top Bar Contract */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand title wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/20">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap">
                آوا فارسی
              </span>
              <span className="text-[11px] text-slate-400 mr-2 hidden sm:inline-block">
                استودیوی هوشمند تبدیل متن به گفتار روان
              </span>
            </div>
          </div>

          {/* Zone 2: Informational / Feature Notes */}
          <div className="hidden md:flex items-center gap-6 text-xs text-slate-400">
            <span>مدل Gemini 3.8 Flash Lite</span>
            <span aria-hidden="true">·</span>
            <span>کیفیت صوتی 24kHz WAV</span>
            <span aria-hidden="true">·</span>
            <span>پشتیبانی از اعراب و لحن</span>
          </div>

          {/* Zone 3: Primary Action / Mobile Install & History Drawer Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
              title="دانلود و نصب برنامه روی گوشی یا اسکن QR Code"
            >
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>دانلود روی گوشی</span>
            </button>

            <button
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700/60 text-xs font-medium transition-colors cursor-pointer"
            >
              <History className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">تاریخچه گفتار</span>
              {history.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-amber-300 text-[10px] font-mono">
                  {toPersianDigits(history.length)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Error Alert if any */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-800/60 text-rose-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-bold cursor-pointer"
            >
              بستن
            </button>
          </div>
        )}

        {/* 2-Column Split: Input Studio (Right) + Voice Persona & Waveform Studio (Left) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Right Column (7 cols): Persian Text Input & Diacritics Helper */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3.5">
              {/* Box Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-slate-100">
                    باکس متن فارسی (متن ورودی)
                  </h2>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2 font-mono tabular-nums">
                  <span>{toPersianDigits(charCount)} کاراکتر</span>
                  <span>·</span>
                  <span>{toPersianDigits(wordCount)} کلمه</span>
                  <span>·</span>
                  <span>تخمین زمان: ~{toPersianDigits(estimatedSeconds)} ثانیه</span>
                </div>
              </div>

              {/* Diacritics Toolbar */}
              <DiacriticsToolbar
                onInsertChar={handleInsertChar}
                onNormalize={handleNormalize}
                onClear={handleClear}
                onCopy={handleCopy}
                copied={copied}
              />

              {/* Textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="متن فارسی خود را اینجا تایپ کرده یا جای‌گذاری کنید..."
                  rows={8}
                  maxLength={3000}
                  className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 leading-relaxed focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all resize-y min-h-[180px]"
                />
              </div>

              {/* Sample Texts Selector */}
              <div className="pt-1">
                <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>متن‌های نمونه برای آزمایش سریع:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_TEXTS.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => handleSelectSample(sample)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-750 text-xs transition-colors cursor-pointer"
                    >
                      {sample.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Speech CTA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerateSpeech}
                  disabled={isGenerating || !text.trim()}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                    isGenerating || !text.trim()
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-105 active:scale-[0.99] text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>در حال تولید صوت هوشمند به زبان فارسی روان...</span>
                    </>
                  ) : (
                    <>
                      <Headphones className="w-5 h-5" />
                      <span>تولید گفتار با هوش مصنوعی (تبدیل به صوت)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Left Column (5 cols): Voice Selector & Real-Time Waveform */}
          <div className="lg:col-span-5 space-y-4">
            {/* Voice & Tone Configuration */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <VoiceSelector
                selectedVoice={selectedVoice}
                selectedTone={selectedTone}
                onVoiceSelect={setSelectedVoice}
                onToneSelect={setSelectedTone}
              />
            </div>

            {/* Waveform Visualizer & Status */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>طیف‌سنج و شکل موج صدا (Waveform)</span>
                </h3>
                {audioBase64 && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>فایل آماده است</span>
                  </span>
                )}
              </div>

              <WaveformVisualizer
                isPlaying={isPlaying}
                analyser={analyserRef.current}
                audioDuration={duration}
                currentTime={currentTime}
                onSeek={handleWaveformSeek}
              />
            </div>
          </div>
        </div>

        {/* Floating / Pinned Audio Player Bar when audio is generated */}
        {audioBase64 ? (
          <AudioPlayerBar
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            playbackSpeed={playbackSpeed}
            pitchShift={pitchShift}
            isLooping={isLooping}
            onPlayPause={handlePlayPause}
            onReset={handleReset}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            onSpeedChange={handleSpeedChange}
            onPitchChange={handlePitchChange}
            onToggleLoop={handleToggleLoop}
            onDownload={(format) => triggerDownload(audioBase64, `AvaFarsi_${selectedVoice}`, format)}
            onShare={(format) => triggerShare(audioBase64, `AvaFarsi_${selectedVoice}`, format)}
            voiceName={selectedVoiceMeta?.persianName || selectedVoice}
          />
        ) : (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-center space-y-2">
            <Volume2 className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-300">
              هنوز فایلی تولید نشده است
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              متن دلخواه خود را در کادر بالا بنویسید و روی دکمه «تولید گفتار با هوش مصنوعی» کلیک کنید تا صوت باکیفیت و شکل موج صوتی در این بخش نمایش داده شود.
            </p>
          </div>
        )}
      </main>

      {/* History Drawer Modal */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        items={history}
        onSelectAndPlay={handlePlayFromHistory}
        onDeleteItem={handleDeleteHistoryItem}
        onClearAll={handleClearAllHistory}
        onDownloadItem={(item, format) => triggerDownload(item.audioBase64, `AvaFarsi_${item.voice}`, format)}
      />

      {/* Install Mobile & QR Modal */}
      <InstallMobileModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Simple Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        <span>آوا فارسی — استودیوی تبدیل متن به گفتار روان با مدل صوتی پیشرفته هوش مصنوعی</span>
      </footer>
    </div>
  );
}
