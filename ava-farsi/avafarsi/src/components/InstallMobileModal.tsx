import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  QrCode,
  Copy,
  Check,
  X,
  Share2,
  PlusSquare,
  DownloadCloud,
  CheckCircle2,
  Globe,
  Info,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallMobileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallMobileModal: React.FC<InstallMobileModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'audio'>('android');

  // Working live development URL (currently running)
  const devUrl = 'https://ais-dev-e57hfphtjdeuuoh6jtepyw-115717638455.us-east1.run.app';
  // Public shared URL (activated upon clicking Share in AI Studio)
  const preUrl = 'https://ais-pre-e57hfphtjdeuuoh6jtepyw-115717638455.us-east1.run.app';

  const [selectedUrlType, setSelectedUrlType] = useState<'dev' | 'pre'>('dev');

  const activeAppUrl =
    selectedUrlType === 'dev'
      ? devUrl
      : preUrl;

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(activeAppUrl, {
        width: 220,
        margin: 1.5,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [isOpen, activeAppUrl]);

  if (!isOpen) return null;

  const handleCopyLink = (urlToCopy: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-right relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute left-5 top-5 p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              دانلود و باز کردن روی گوشی
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              آوا فارسی را در مرورگر گوشی باز کنید یا به صفحه اصلی اضافه کنید
            </p>
          </div>
        </div>

        {/* Notice explaining Page Not Found error */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-200 leading-relaxed space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-indigo-300">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>نکته مهم برای حل خطای «Page not found»:</span>
          </div>
          <p className="text-[11px] text-slate-300">
            در گوگل کلود، آدرس اشتراک عمومی (پیشوند <code className="text-amber-300">ais-pre</code>) تنها زمانی فعال می‌شود که در بالای صفحه هوش مصنوعی روی دکمه <strong>Share (اشتراک‌گذاری)</strong> کلیک کنید.
          </p>
          <p className="text-[11px] text-slate-300">
            برای باز کردن فوری روی گوشی، از <strong>«لینک مستقیم سرور فعال (Dev)»</strong> استفاده کنید و مطمئن شوید در مرورگر گوشی با همان حساب گوگل لاگین هستید.
          </p>
        </div>

        {/* Native Install Prompt if available */}
        {isInstallable && !isInstalled && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-amber-300">نصب مستقیم برنامه</h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                برای افزودن آیکون آوا فارسی به صفحه اصلی گوشی دکمه زیر را لمس کنید:
              </p>
            </div>
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 transition-transform active:scale-95 shadow-md cursor-pointer"
            >
              نصب روی گوشی
            </button>
          </div>
        )}

        {isInstalled && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>برنامه آوا فارسی در حال حاضر روی دستگاه شما نصب شده است.</span>
          </div>
        )}

        {/* Step 1: Open on Mobile with QR Code or Link */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-indigo-400" />
              <span>مرحله ۱: اسکن بارکد با دوربین گوشی</span>
            </span>

            {/* Toggle URL Type */}
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setSelectedUrlType('dev')}
                className={`px-2 py-0.5 rounded-md cursor-pointer ${
                  selectedUrlType === 'dev'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                سرور فعال (Dev)
              </button>
              <button
                onClick={() => setSelectedUrlType('pre')}
                className={`px-2 py-0.5 rounded-md cursor-pointer ${
                  selectedUrlType === 'pre'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                لینک عمومی (Share)
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {qrCodeUrl ? (
              <div className="p-2 bg-white rounded-xl shadow-md shrink-0">
                <img
                  src={qrCodeUrl}
                  alt="QR Code برای باز کردن در گوشی"
                  className="w-28 h-28"
                />
              </div>
            ) : (
              <div className="w-28 h-28 bg-slate-800 animate-pulse rounded-xl" />
            )}

            <div className="space-y-2 flex-1 text-xs text-slate-300 leading-relaxed">
              <p>
                {selectedUrlType === 'dev' ? (
                  <>
                    دوربین گوشی خود را جلوی بارکد بگیرید تا سایت مستقیماً در مرورگر باز شود (حتماً در مرورگر کروم گوشی با ایمیل <strong>poursoleimanymahdi@gmail.com</strong> لاگین باشید).
                  </>
                ) : (
                  <>
                    این لینک عمومی است؛ قبل از باز کردن، یک‌بار دکمه <strong>Share</strong> را در بالای صفحه هوش مصنوعی فشار دهید تا فعال شود.
                  </>
                )}
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={activeAppUrl}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400 font-mono focus:outline-none"
                  dir="ltr"
                />
                <button
                  onClick={() => handleCopyLink(activeAppUrl)}
                  title="کپی لینک"
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'کپی شد' : 'کپی'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Platform Specific Guide Tabs */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-200">
              مرحله ۲: نحوه افزودن به صفحه اصلی گوشی
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('android')}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'android'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                اندروید (Chrome)
              </button>
              <button
                onClick={() => setActiveTab('ios')}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'ios'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                آیفون (Safari)
              </button>
              <button
                onClick={() => setActiveTab('audio')}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'audio'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                دانلود صوت
              </button>
            </div>
          </div>

          {activeTab === 'android' && (
            <div className="bg-slate-950/60 rounded-xl p-3.5 text-xs text-slate-300 space-y-2 leading-relaxed border border-slate-850">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  ۱
                </span>
                <span>سایت را در مرورگر <strong>Google Chrome</strong> گوشی باز کنید.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  ۲
                </span>
                <span>روی <strong>منوی سه‌نقطه (⋮)</strong> در بالای صفحه ضربه بزنید.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  ۳
                </span>
                <span>گزینه <strong>«افزودن به صفحه اصلی» (Add to Home screen)</strong> یا <strong>«نصب برنامه» (Install app)</strong> را لمس نمایید.</span>
              </div>
            </div>
          )}

          {activeTab === 'ios' && (
            <div className="bg-slate-950/60 rounded-xl p-3.5 text-xs text-slate-300 space-y-2 leading-relaxed border border-slate-850">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-indigo-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  ۱
                </span>
                <span>سایت را حتماً در مرورگر <strong>Safari</strong> باز کنید.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-indigo-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  ۲
                </span>
                <span className="flex items-center gap-1 flex-wrap">
                  دکمه <strong>اشتراک‌گذاری (Share)</strong>
                  <Share2 className="w-3.5 h-3.5 text-indigo-400 inline" />
                  در نوار پایین صفحه را لمس کنید.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-indigo-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  ۳
                </span>
                <span className="flex items-center gap-1 flex-wrap">
                  کمی به پایین اسکرول کرده و گزینه
                  <strong>«Add to Home Screen»</strong>
                  <PlusSquare className="w-3.5 h-3.5 text-indigo-400 inline" />
                  را بزنید.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="bg-slate-950/60 rounded-xl p-3.5 text-xs text-slate-300 space-y-2 leading-relaxed border border-slate-850">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                <DownloadCloud className="w-4 h-4" />
                <span>ذخیره فایل صوتی در گوشی:</span>
              </div>
              <p>
                در پلیر، دکمه طلایی‌رنگ
                <strong>«دانلود فایل صوتی (WAV)»</strong>
                را بزنید تا فایل مستقیماً در پوشه <strong>Downloads</strong> ذخیره شود یا پنجره اشتراک‌گذاری در تلگرام و واتساپ باز شود.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
        >
          متوجه شدم، بستن پنجره
        </button>
      </div>
    </div>
  );
};
