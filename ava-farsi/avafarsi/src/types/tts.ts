export type VoiceId = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export type ToneId = 'formal' | 'narrative' | 'friendly' | 'meditative' | 'energetic';

export interface VoiceOption {
  id: VoiceId;
  persianName: string;
  gender: 'زنانه' | 'مردانه';
  description: string;
  badge: string;
}

export interface ToneOption {
  id: ToneId;
  label: string;
  description: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  textSnippet: string;
  fullText: string;
  voice: VoiceId;
  tone: ToneId;
  audioBase64: string;
  duration?: number;
}

export interface SampleText {
  id: string;
  title: string;
  category: 'ادبی و شعر' | 'گزارش و خبر' | 'داستانی و پادکست' | 'انگیزشی';
  text: string;
}
