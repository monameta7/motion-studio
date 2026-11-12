import { SampleText, VoiceOption, ToneOption } from '../types/tts';

export const PERSIAN_VOICES: VoiceOption[] = [
  {
    id: 'Kore',
    persianName: 'آوا',
    gender: 'زنانه',
    description: 'صدای رسا، گرم، روان و مناسب برای انواع متون',
    badge: 'پیش‌فرض و محبوب',
  },
  {
    id: 'Zephyr',
    persianName: 'نیلوفر',
    gender: 'زنانه',
    description: 'صدای ملایم، آرامش‌بخش و لطیف، عالی برای پادکست و داستان',
    badge: 'داستانی و لطیف',
  },
  {
    id: 'Charon',
    persianName: 'بهرام',
    gender: 'مردانه',
    description: 'صدای بم، پرصلابت، موقر و فوق‌العاده برای اخبار و محتوای رسمی',
    badge: 'رسمی و باوقار',
  },
  {
    id: 'Puck',
    persianName: 'پویا',
    gender: 'مردانه',
    description: 'صدای باانرژی، جوان، صمیمی و مناسب آموزش و گفتگو',
    badge: 'صمیمی و پویا',
  },
  {
    id: 'Fenrir',
    persianName: 'فرزاد',
    gender: 'مردانه',
    description: 'صدای رسا، شفاف و گوینده تیزرهای تبلیغاتی',
    badge: 'رسا و تبلیغاتی',
  },
];

export const TONE_OPTIONS: ToneOption[] = [
  {
    id: 'formal',
    label: 'رسمی و خبری',
    description: 'تلفظ دقیق و رسمی مناسب اخبار و متون علمی',
  },
  {
    id: 'narrative',
    label: 'روایی و داستانی',
    description: 'لحن قصه‌گویی با احساسات و مکث‌های طبیعی',
  },
  {
    id: 'friendly',
    label: 'صمیمی و محاوره‌ای',
    description: 'گرم، خودمانی و مناسب پادکست‌های اجتماعی',
  },
  {
    id: 'meditative',
    label: 'آرامش‌بخش و ملایم',
    description: 'سرعت آرام و مکث‌های ملایم مناسب مدیتیشن',
  },
  {
    id: 'energetic',
    label: 'پرانرژی و انگیزشی',
    description: 'لحن انگیزشی و پرهیجان با ریتم بالا',
  },
];

export const SAMPLE_TEXTS: SampleText[] = [
  {
    id: 'saadi',
    title: 'شعر سعدی (بنی‌آدم)',
    category: 'ادبی و شعر',
    text: 'بَنی‌آدَم اعضایِ یِکدیگَرَند\nکه در آفرینِش زِ یک گوهَرَند\nچو عُضوی به دَرد آوَرَد روزگار\nدِگَر عُضوها را نَمانَد قَرار',
  },
  {
    id: 'hafez',
    title: 'غزل حافظ شیرازی',
    category: 'ادبی و شعر',
    text: 'سَحَر با باد می‌گفتَم حَدیثِ آرزومَندی\nخِطاب آمد که واثِق شو به اَلطافِ خداوَندی\nدُعایِ صبح و آهِ شب کِلیدِ گَنجِ مقصود است\nبدین راه و رَوِش می‌رو که با دلدار پیوَندی',
  },
  {
    id: 'tech_news',
    title: 'گزارش پیشرفت هوش مصنوعی',
    category: 'گزارش و خبر',
    text: 'فناوری‌های نوین پردازش زبان طبیعی و تبدیل متن به گفتار، گامی بزرگ در جهت برقراری ارتباط طبیعی‌تر میان انسان و سامانه‌های دیجیتال برداشته‌اند. امروزه مدل‌های پیشرفته هوش مصنوعی قادرند احساسات، ریتم و لحن کلام را با دقتی شگفت‌انگیز شبیه‌سازی نمایند.',
  },
  {
    id: 'story',
    title: 'داستان شب آرام',
    category: 'داستانی و پادکست',
    text: 'نسیم خنک پاییزی آرام از میان برگ‌های طلایی چنار عبور می‌کرد. فنجان چای داغ روی میز چوبی ایوان بخار می‌کرد و سکوت دلنشین کوهستان، آرامشی عمیق را به قلب رهگذران هدیه می‌بخشید.',
  },
  {
    id: 'motivation',
    title: 'انگیزشی و رشد فردی',
    category: 'انگیزشی',
    text: 'هر روز فرصتی نو برای آفریدن لحظه‌های ماندگار است. رویاهایت را با انگیزه، تلاش مستمر و ایمان قلبی دنبال کن؛ چرا که بزرگ‌ترین دستاوردها با قدم‌های کوچک اما استوار آغاز می‌شوند.',
  },
];

// Diacritic symbols mapping
export const DIACRITICS = [
  { char: '\u064E', name: 'فتحه (ـَ)' },
  { char: '\u0650', name: 'کسره (ـِ)' },
  { char: '\u064F', name: 'ضمه (ـُ)' },
  { char: '\u0651', name: 'تشدید (ـّ)' },
  { char: '\u0652', name: 'سکون (ـْ)' },
  { char: '\u064B', name: 'تنوین نصب (ـً)' },
  { char: '\u064D', name: 'تنوین جر (ـٍ)' },
  { char: '\u064C', name: 'تنوین رفع (ـٌ)' },
  { char: '\u200C', name: 'نیم‌فاصله' },
];

// Normalize Persian text
export function normalizePersianText(text: string): string {
  return text
    .replace(/\u064A/g, '\u06CC') // Arabic Yeh to Persian Ye
    .replace(/\u0643/g, '\u06A9') // Arabic Kaf to Persian Keh
    .replace(/\u06C0/g, '\u0647\u0654') // Heh with yeh
    .replace(/[\u202A-\u202E]/g, '') // Remove directional overrides
    .replace(/[ \t]+/g, ' '); // Clean multiple consecutive spaces
}

// Format English numbers to Persian digits
export function toPersianDigits(n: number | string): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.toString().replace(/[0-9]/g, (w) => persianDigits[parseInt(w, 10)]);
}

// Format seconds into MM:SS
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;
  return `${mm}:${ss}`;
}
