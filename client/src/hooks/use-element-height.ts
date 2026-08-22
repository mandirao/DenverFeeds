import { useCallback, useRef, useState } from "react";

// Measures an element's rendered height and keeps it in sync via ResizeObserver.
// Uses a callback ref (not useEffect) so it re-attaches correctly when the
// element mounts/unmounts conditionally (e.g. hidden while loading).
export function useElementHeight<T extends HTMLElement>() {
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      setHeight(node.getBoundingClientRect().height);
      const observer = new ResizeObserver(entries => {
        // getBoundingClientRect (border-box) — not entries[0].contentRect, which
        // excludes padding/border and would under-report vs. the initial measurement.
        setHeight(entries[0].target.getBoundingClientRect().height);
      });
      observer.observe(node);
      observerRef.current = observer;
    } else {
      setHeight(0);
    }
  }, []);

  return { ref, height };
}
