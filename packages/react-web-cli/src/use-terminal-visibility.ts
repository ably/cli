import React, { useEffect, useState, useRef } from 'react';

/**
 * useTerminalVisibility detects whether the referenced element is currently visible to the user.
 * Visibility is defined as BOTH:
 *   1. The DOM element is intersecting the viewport (≥1 px)
 *   2. The browser tab/window is in the foreground (`document.visibilityState === 'visible'`).
 */
export function useTerminalVisibility(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState<boolean>(false);

  // Hold the most recent intersection result in a ref so the page visibility
  // listener can recalculate quickly without waiting for a new IO callback.
  const lastIntersectionRef = useRef<boolean>(false);

  useEffect(() => {
    function recompute(intersecting: boolean | null = null) {
      const isIntersecting = intersecting != null ? intersecting : lastIntersectionRef.current;
      const pageVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
      setVisible(isIntersecting && pageVisible);
    }

    if (!ref.current || typeof IntersectionObserver === 'undefined') {
      setVisible(true); // Assume visible if we cannot observe (SSR or unsupported)
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      lastIntersectionRef.current = entry.isIntersecting;
      recompute(entry.isIntersecting);
    }, { threshold: 0 });

    observer.observe(ref.current);

    function handlePageVis() {
      recompute();
    }

    document.addEventListener('visibilitychange', handlePageVis);

    // Initial computation
    recompute();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handlePageVis);
    };
  }, [ref]);

  return visible;
} 