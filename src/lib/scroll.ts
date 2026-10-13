/** Smooth scrolling unless the user asked the OS to reduce motion. */
export function motionBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'auto';
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'auto';
  }
}

/**
 * Scroll the notes column, the article, or the PDF stack.
 * Those panes scroll inside the reader; the window does not.
 */
export function scrollInPane(el: HTMLElement, block: 'start' | 'center') {
  const behavior = motionBehavior();
  const root = el.closest('.reader-body, .article-pane, .pdf-stack');
  if (!(root instanceof HTMLElement)) {
    el.scrollIntoView({ behavior, block });
    return;
  }
  const rootRect = root.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const delta =
    block === 'center'
      ? rect.top - rootRect.top - root.clientHeight / 2 + rect.height / 2
      : rect.top - rootRect.top - 8;
  root.scrollTo({ top: Math.max(0, root.scrollTop + delta), behavior });
}
