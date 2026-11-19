import { useCallback, useRef } from "react";

/**
 * For a `.scroll-fade` element: marks whether there is more content above / below the
 * visible part (`data-more-above`, `data-more-below`), which fades that edge out. Updated
 * on scroll, on resize and when the content changes. Writes the attributes directly, so
 * scrolling does not re-render the component.
 *
 * Returns a callback ref: it also works for an element that mounts later (a list that
 * only appears once its data has loaded).
 */
export function useScrollFade<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    const update = () => {
      // 1 px of slack: fractional scroll positions on Retina displays.
      el.toggleAttribute("data-more-above", el.scrollTop > 1);
      el.toggleAttribute("data-more-below", el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resized = new ResizeObserver(update);
    resized.observe(el);
    const changed = new MutationObserver(update);
    changed.observe(el, { childList: true, subtree: true });
    cleanup.current = () => {
      el.removeEventListener("scroll", update);
      resized.disconnect();
      changed.disconnect();
    };
  }, []);
}
