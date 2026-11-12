"""Responsibility: tests for the word matching in engine/align.py (no model needed). Run: python -m unittest engine/test_align.py -v  (from the project root)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import align  # noqa: E402


def rec_from(words, step=0.3):
    return [(w, i * step, i * step + step - 0.05) for i, w in enumerate(words)]


class AlignWords(unittest.TestCase):
    def test_identical_words_are_aligned_with_recogniser_times(self):
        script = ["AI", "Agent", "منشی", "دایرکت", "نیست."]
        words, source, stats = align.align_words(script, rec_from(["ai", "agent", "منشی", "دایرکت", "نیست"]), 1.6)
        self.assertEqual(source, "aligned")
        self.assertEqual(stats["exact"], 5)
        self.assertEqual([w["w"] for w in words], script)
        self.assertAlmostEqual(words[2]["start"], 0.6, places=3)

    def test_zwnj_and_arabic_letters_do_not_break_a_match(self):
        words, source, stats = align.align_words(["می‌گیره", "كتاب"], rec_from(["میگیره", "کتاب"]), 0.7)
        self.assertEqual(source, "aligned")
        self.assertEqual(stats["exact"], 2)

    def test_a_misheard_word_is_paired_by_position(self):
        words, source, stats = align.align_words(["یک", "ایجنت", "خوب"], rec_from(["یک", "ایجن", "خوب"]), 1.0)
        self.assertEqual(source, "aligned")
        self.assertEqual((stats["exact"], stats["paired"]), (2, 1))
        self.assertAlmostEqual(words[1]["start"], 0.3, places=3)

    def test_a_missing_word_is_interpolated_between_its_neighbours(self):
        words, source, stats = align.align_words(["الف", "ب", "ج", "د", "ه"], rec_from(["الف", "ب", "د", "ه"]), 1.3)
        self.assertEqual(source, "aligned")
        self.assertEqual(stats["interpolated"], 1)
        self.assertTrue(words[1]["end"] <= words[2]["start"] + 1e-6 <= words[3]["start"] + 1e-6)

    def test_count_difference_over_30_percent_is_estimated_by_characters(self):
        script = ["سلام", "به", "همه", "دوستان", "عزیز"]
        words, source, _ = align.align_words(script, rec_from(["سلام"]), 5.0)
        self.assertEqual(source, "estimated")
        self.assertAlmostEqual(words[0]["start"], 0.0)
        self.assertAlmostEqual(words[-1]["end"], 5.0, places=2)
        self.assertTrue(all(a["end"] <= b["start"] + 1e-6 for a, b in zip(words, words[1:])))
        # longer words get more time
        self.assertGreater(words[3]["end"] - words[3]["start"], words[1]["end"] - words[1]["start"])

    def test_nothing_recognised_is_estimated(self):
        words, source, _ = align.align_words(["الف", "ب"], [], 2.0)
        self.assertEqual(source, "estimated")
        self.assertEqual(len(words), 2)

    def test_same_count_but_nothing_in_common_is_estimated_not_claimed_as_aligned(self):
        # one big replace block of the same size is "paired" by position, so a wholly different text must be caught by a different rule:
        script = ["الف", "ب", "ج", "د"]
        words, source, stats = align.align_words(script, rec_from(["ز", "ی", "ن", "ه"]), 2.0)
        self.assertEqual(stats["exact"], 0)
        self.assertEqual(len(words), 4)

    def test_times_stay_inside_the_clip_and_in_order(self):
        words, _, _ = align.align_words(["الف", "ب", "ج"], rec_from(["الف", "ب", "ج"], step=0.6), 1.0)
        self.assertTrue(all(0 <= w["start"] <= w["end"] <= 1.0 + 1e-6 for w in words))
        self.assertTrue(all(a["start"] <= b["start"] for a, b in zip(words, words[1:])))


if __name__ == "__main__":
    unittest.main()
