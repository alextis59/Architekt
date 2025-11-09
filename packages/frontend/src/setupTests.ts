import '@testing-library/jest-dom';

class ResizeObserverPolyfill {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  // @ts-expect-error jsdom test environment does not define ResizeObserver
  window.ResizeObserver = ResizeObserverPolyfill;
}
