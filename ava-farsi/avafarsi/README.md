# آوا فارسی (AvaFarsi) — نسخه v1.1.0
### استودیوی پیشرفته تبدیل متن به گفتار روان زبان فارسی با هوش مصنوعی
### Modern Persian (Farsi) AI Text-to-Speech Studio

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-purple.svg)](https://vitejs.dev)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4-teal.svg)](https://tailwindcss.com)
[![Gemini TTS](https://img.shields.io/badge/Gemini_TTS-3.8_Flash_Lite-amber.svg)](https://ai.google.dev)

---

## 🌟 قابلیت‌ها (Features)

- **دانلود صوتی در دو فرمت محبوب MP3 و WAV**: تبدیل بلادرنگ و سریع به MP3 کم‌حجم (۱۲۸kbps) مناسب برای پیام‌رسان‌ها و شبکه‌های اجتماعی یا دانلود با کیفیت اصلی استودیویی WAV.
- **کیفیت استودیویی صوت فارسی (24kHz)**: خوانش طبیعی، روان و شفاف با تلفظ دقیق واژگان فارسی.
- **۵ شخصیت گوینده (Voice Personas)**:
  - **آوا (Kore)**: صدای زنانه گرم، متوازن و روان
  - **نیلوفر (Zephyr)**: صدای زنانه ملایم، داستانی و آرامش‌بخش
  - **بهرام (Charon)**: صدای مردانه بم، موقر و رسمی
  - **پویا (Puck)**: صدای مردانه پرانرژی و صمیمی
  - **فرزاد (Fenrir)**: صدای رسا، شفاف و تبلیغاتی
- **۵ لحن خوانش متنوع (Tone Presets)**: رسمی و خبری، روایی و داستانی، صمیمی، آرامش‌بخش، پرانرژی.
- **نمایشگر زنده شکل موج صدا (Waveform Visualizer)**: ترسیم فرکانسی صدا روی کَنوَس HTML5 با قابلیت کلیک برای پرش زمانی.
- **تنظیمات کامل پخش صوتی**: تغییر سرعت (0.5x تا 2.0x)، تنظیم تن صدا (Pitch Detune)، نوار جابجایی زمان، تکرار و ولوم.
- **دانلود مستقیم فایل صوتی (MP3/WAV)**: ذخیره در حافظه گوشی (Downloads یا Files) و لپ‌تاپ با یک کلیک.
- **ابزارهای اعراب‌گذاری و زبان فارسی**: نوار درج حرکات (فتحه، کسره، ضمه، تنوین، تشدید، سکون)، نیم‌فاصله (ZWNJ) و استانداردسازی متون.
- **تاریخچه گفتار (History)**: ذخیره تاریخچه متون و گفتارها بدون افت حافظه مرورگر.
- **پشتیبانی از PWA**: قابلیت افزودن به صفحه اصلی گوشی (Add to Home screen) با آیکون و استایل مستقل.

---

## 🚀 راهنمای نصب و اجرای لوکال روی سیستم (Local Setup)

### پیش‌نیازها
- **Node.js** (نسخه ۱۸ به بالا)
- **کلید API جیمینای (GEMINI_API_KEY)** از [Google AI Studio](https://aistudio.google.com)

### مراحل اجرا:

۱. **کلون کردن یا دانلود مخزن:**
```bash
git clone <آدرس_مخزن_شما>
cd avafarsi
```

۲. **نصب وابستگی‌ها:**
```bash
npm install
```

۳. **تنظیم فایل محیطی (`.env`):**
یک فایل با نام `.env` در ریشه پروژه بسازید و کلید اختصاصی خود را در آن قرار دهید:
```env
GEMINI_API_KEY="کلید_API_شما_از_گوگل"
PORT=3000
```

۴. **اجرای سرور در محیط توسعه:**
```bash
npm run dev
```

۵. **باز کردن در مرورگر:**
مرورگر خود را باز کرده و به آدرس زیر بروید:
```text
http://localhost:3000
```

---

## 🛠 ساخت نسخه نهایی (Production Build)

برای ساخت نسخه بهینه شده پروداکشن:
```bash
npm run build
npm start
```

---

## 📦 ساختار پروژه (Project Structure)

```text
├── public/                 # آیکون‌ها و مانیفست PWA
├── src/
│   ├── components/         # کامپوننت‌های رابط کاربری
│   │   ├── AudioPlayerBar.tsx      # نوار کنترل صوتی
│   │   ├── DiacriticsToolbar.tsx   # نوار اعراب‌گذاری
│   │   ├── ErrorBoundary.tsx       # محافظ پایداری
│   │   ├── HistoryDrawer.tsx       # منوی تاریخچه
│   │   ├── InstallMobileModal.tsx  # پنجره راهنمای موبایل
│   │   ├── VoiceSelector.tsx       # انتخاب گوینده و لحن
│   │   └── WaveformVisualizer.tsx  # شکل موج صوتی
│   ├── hooks/
│   │   └── usePWAInstall.ts        # هوک نصب برنامه
│   ├── types/
│   │   └── tts.ts                  # تایپ‌های TypeScript
│   ├── utils/
│   │   └── persianUtils.ts         # ابزارها و متون نمونه
│   ├── App.tsx             # کامپوننت اصلی
│   ├── index.css           # استایل‌ها و فونت وزیرمتن
│   └── main.tsx            # نقطه ورود React
├── server.ts               # بک‌اند Express با اتصال امن به Gemini TTS
├── package.json
└── vite.config.ts
```

---

## 📄 لایسنس (License)
این پروژه تحت لایسنس آزاد و متن‌باز [Apache License 2.0](LICENSE) منتشر شده است.
