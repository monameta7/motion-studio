// Responsibility: the UI's early check of the input's [ ] build directions (the server's intake check is the rule; this only warns before Start, D41).

/** Persian message when a `[` is never closed or a `]` has no `[`; null when the brackets are balanced. */
export function bracketProblem(text: string): string | null {
  let depth = 0;
  for (const ch of text) {
    if (ch === '[') depth++;
    else if (ch === ']' && --depth < 0) return 'در متن یک «]» بدون «[» هست؛ متن داخل کروشه توضیح ساخت است و باید بسته شود.';
  }
  return depth > 0 ? 'در متن یک «[» باز مانده؛ متن داخل کروشه توضیح ساخت است و باید با «]» بسته شود.' : null;
}
