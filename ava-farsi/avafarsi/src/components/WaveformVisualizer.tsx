import React, { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
  isPlaying: boolean;
  analyser: AnalyserNode | null;
  audioDuration: number;
  currentTime: number;
  onSeek?: (percentage: number) => void;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  isPlaying,
  analyser,
  audioDuration,
  currentTime,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bufferLength = 64;
    let dataArray = new Uint8Array(bufferLength);
    if (analyser) {
      try {
        analyser.fftSize = 128;
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
      } catch (err) {
        console.warn('Analyser setup note:', err);
      }
    }

    let phase = 0;

    const render = () => {
      try {
        const width = canvas.width || 720;
        const height = canvas.height || 110;
        ctx.clearRect(0, 0, width, height);

        // Background subtle grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const centerY = height / 2;

        // Draw center reference line
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        if (analyser && isPlaying) {
          try {
            analyser.getByteFrequencyData(dataArray);
          } catch (e) {}
        }

        const barCount = 48;
        const totalSpacing = width / barCount;
        const barWidth = Math.max(3, totalSpacing - 3);

        const safeDuration = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : 0;
        const safeCurrentTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
        const progress = safeDuration > 0 ? Math.min(1, safeCurrentTime / safeDuration) : 0;

        for (let i = 0; i < barCount; i++) {
          let value = 20;

          if (isPlaying && analyser) {
            const dataIndex = Math.floor((i / barCount) * (bufferLength * 0.75));
            value = dataArray[dataIndex] || 20;
          } else {
            // Resting simulated waveform with gentle wave
            const wave = Math.sin((i / barCount) * Math.PI * 3 + phase);
            const gaussian = Math.exp(-Math.pow((i - barCount / 2) / (barCount / 3), 2));
            value = Math.max(12, 50 * gaussian * (0.8 + 0.2 * wave));
          }

          const barHeight = Math.max(4, Math.min(height * 0.85, (value / 255) * (height * 0.78)));
          const x = i * totalSpacing + (totalSpacing - barWidth) / 2;
          const yTop = centerY - barHeight / 2;

          const isPastProgress = i / barCount <= progress && safeDuration > 0;

          // Gradient styling
          const gradient = ctx.createLinearGradient(0, yTop, 0, yTop + barHeight);
          if (isPastProgress) {
            gradient.addColorStop(0, '#f59e0b'); // Amber 500
            gradient.addColorStop(0.5, '#fbbf24'); // Amber 400
            gradient.addColorStop(1, '#d97706'); // Amber 600
          } else {
            gradient.addColorStop(0, '#6366f1'); // Indigo 500
            gradient.addColorStop(0.5, '#4f46e5'); // Indigo 600
            gradient.addColorStop(1, '#3730a3'); // Indigo 800
          }

          ctx.fillStyle = gradient;
          ctx.beginPath();

          // Safe drawing for all browsers (avoids roundRect crash on Android WebViews)
          if (typeof ctx.roundRect === 'function') {
            const safeRadius = Math.max(0, Math.min(barWidth / 2, barHeight / 2, 4));
            ctx.roundRect(x, yTop, barWidth, barHeight, safeRadius);
          } else {
            ctx.rect(x, yTop, barWidth, barHeight);
          }
          ctx.fill();

          // Subtle glow effect
          if (isPlaying && isPastProgress) {
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 6;
          } else {
            ctx.shadowBlur = 0;
          }
        }

        phase += 0.04;
      } catch (renderError) {
        // Prevent canvas exceptions from breaking React
        console.warn('Canvas render caught error:', renderError);
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, analyser, currentTime, audioDuration]);

  // Handle canvas click to seek
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const safeDuration = Number.isFinite(audioDuration) ? audioDuration : 0;
    if (safeDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.min(Math.max(clickX / rect.width, 0), 1);
    onSeek(percentage);
  };

  return (
    <div className="relative w-full rounded-xl bg-slate-900/90 border border-slate-800 p-4 shadow-inner overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-radial from-amber-500/5 via-indigo-500/5 to-transparent pointer-events-none" />

      {/* Visualizer Canvas */}
      <canvas
        ref={canvasRef}
        width={720}
        height={110}
        onClick={handleCanvasClick}
        className="w-full h-28 cursor-pointer rounded-lg relative z-10 transition-opacity hover:opacity-95"
        title="برای پرش به نقطه دلخواه روی موج صوتی کلیک کنید"
      />

      <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-1 relative z-10">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isPlaying ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
            }`}
          />
          <span>{isPlaying ? 'در حال پخش گفتار' : 'طیف فرکانسی صدا'}</span>
        </div>
        <span className="text-slate-500 text-[11px]">کلیک روی موج برای پرش زمانی</span>
      </div>
    </div>
  );
};
