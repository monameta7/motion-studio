// Responsibility: the StyleMeta contract of docs/04, `styles/<slug>/style.json`: one visual style of the video workspace (D86 g), shared by every brand like `refs/`.
import { z } from 'zod';
import { isoDateTime, sha256, slug } from './common.js';
import { hasArabicScript } from './video.js';

export const StyleMeta = z.strictObject({
  slug,
  /** What the app shows (the owner's own title, for example «31 Glass and Light 3D Render»). Enters a prompt only through `text`. */
  title: z.string().trim().min(1).max(80),
  /**
   * The style text copied word for word into every prompt of a job and into its style lock; English only (D93).
   * null = a picture and a title only: no job may use it. The owner's styles carry «<name>. <card line>» (D99, Phase 11.5).
   */
  text: z.string().trim().min(1).refine((t) => !hasArabicScript(t), 'style text is English only (D93)').nullable(),
  /** The picture card inside the style folder. */
  image: z.string().regex(/^card\.(png|jpg|webp)$/),
  image_sha256: sha256,
  source: z.enum(['owner', 'starter', 'user']),
  created_at: isoDateTime,
  updated_at: isoDateTime,
  last_used_at: isoDateTime.nullable(),
});
export type StyleMeta = z.infer<typeof StyleMeta>;
