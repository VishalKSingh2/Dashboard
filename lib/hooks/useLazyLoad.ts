import { useEffect, useState, useRef } from 'react';

/**
 * Custom hook for lazy loading components using IntersectionObserver
 * Only loads content when it becomes visible in viewport
 */
export function useLazyLoad(options?: IntersectionObserverInit) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Once loaded, don't observe anymore
    if (hasLoaded) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasLoaded(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: '50px', // Load slightly before visible
        threshold: 0.1,
        ...options,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [hasLoaded, options]);

  return { ref, isVisible, hasLoaded };
}
