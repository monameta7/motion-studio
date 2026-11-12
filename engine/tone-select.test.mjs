// Responsibility: prove tone-select picks the expected tone for five archetypal Mahdiyar scripts, applies only the film's brand's bias, and stays deterministic.
// Run: node --test engine/tone-select.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTone, loadRules, normalizeFa } from './tone-select.mjs';

const rules = loadRules();
const pkg = (framework, lines, extra = {}) => ({ framework, duration_target_s: 45, voice_lines: lines.map((text, i) => ({ id: i + 1, text })), claims: [], ...extra });

test('story case → narrative', () => {
  const r = selectTone(pkg('Case Spine', [
    'پارسال یه روز صاحب یه کلینیک دندان‌پزشکی به ما گفت منشی‌ش دیگه نمی‌رسه.',
    'وقتی پیام‌ها زیاد شد، نصف مشتری‌ها جواب نگرفتن و رفتن.',
    'بعدش یه AI Agent ساختیم که نوبت‌ها رو جواب می‌داد.',
    'تا اینکه سه ماه بعد، صف پیام‌ها خالی شد.',
  ]), rules, 'mahdiyar');
  assert.equal(r.tone, 'narrative', JSON.stringify(r.scores));
});

test('practical tips in second person → friendly', () => {
  const r = selectTone(pkg('Practical Framework', [
    'می‌خوای کسب‌وکارت رو با AI سریع‌تر کنی؟',
    'قدم اول: ببین کدوم کار تکراری بیشتر وقتت رو می‌گیره.',
    'قدم دوم: اون کار رو به یه ابزار ساده بسپار.',
    'تو کامنت بپرس تا برات بفرستیم.',
  ]), rules, 'mahdiyar');
  assert.equal(r.tone, 'friendly', JSON.stringify(r.scores));
});

test('stat-heavy report with claims → formal', () => {
  const r = selectTone(pkg('Data Report', [
    'طبق گزارش McKinsey در سال ۲۰۲۶، ۷۸ درصد شرکت‌ها از AI استفاده می‌کنند.',
    'سهم بازار ابزارهای اتوماسیون ۲۳ میلیارد دلار برآورد شده است.',
    'نرخ رشد سالانه ۳۴ درصد است و ۴۱ درصد مدیران آن را اولویت می‌دانند.',
  ], { claims: [{}, {}, {}, {}] }), rules, 'mahdiyar');
  assert.equal(r.tone, 'formal', JSON.stringify(r.scores));
});

test('fast, urgent pattern interrupt → energetic', () => {
  const r = selectTone(pkg('In Medias Res', [
    'همین الان رقیبت داره با AI جلو می‌زنه!',
    'فقط سه ثانیه وقت داری! دیگه نمی‌شه عقب موند!',
    'مهم‌ترین کار؟ همین امروز شروع کن!',
    'سریع، ساده، باید الان تصمیم بگیری!',
  ], { duration_target_s: 12 }), rules, 'mahdiyar');
  assert.equal(r.tone, 'energetic', JSON.stringify(r.scores));
});

test('calm reflective → meditative', () => {
  const r = selectTone(pkg('Reflection', [
    'یه نفس عمیق بکش.',
    'ذهنت رو آرام کن و روی یک کار تمرکز کن.',
    'آهسته و بی‌عجله، تعادل رو برگردون.',
    'آرامش، اول از سکوت شروع می‌شه.',
  ], { duration_target_s: 40 }), rules, 'mahdiyar');
  assert.equal(r.tone, 'meditative', JSON.stringify(r.scores));
});

test('deterministic and explains itself', () => {
  const p = pkg('', ['سلام']);
  const a = selectTone(p, rules), b = selectTone(p, rules);
  assert.deepEqual(a, b);
  assert.ok(Array.isArray(a.reasons));
  assert.ok(rules.tones.includes(a.tone));
});

test('normalises Persian digits and Arabic letters', () => {
  assert.equal(normalizeFa('۱۲ كيلو'), '12 کیلو');
});

test('brand bias applies only to its own brand (Phase 8)', () => {
  const p = pkg('', ['سلام']);
  const m = selectTone(p, rules, 'mahdiyar');
  const other = selectTone(p, rules, 'acme-coffee');
  const none = selectTone(p, rules);
  assert.equal(m.scores.energetic, +(rules.base.energetic + rules.brand_bias.mahdiyar.energetic).toFixed(2));
  assert.ok(m.reasons.some((x) => x.why === 'brand bias'));
  assert.equal(other.scores.energetic, rules.base.energetic);
  assert.ok(!other.reasons.some((x) => x.why === 'brand bias'));
  assert.deepEqual(none.scores, other.scores);
});
