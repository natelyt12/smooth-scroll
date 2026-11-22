(() => {
  'use strict';

  const DEFAULT_SETTINGS = {
    enabled: true,
    duration: 750,
    stepScale: 1.0,
    keyboardSmooth: true,
    excludedDomains: []
  };

  let settings = { ...DEFAULT_SETTINGS };
  const scrollStates = new WeakMap();

  const hostname = location.hostname;

  function isSiteEnabled() {
    if (!settings.enabled) return false;
    if (hostname && Array.isArray(settings.excludedDomains)) {
      return !settings.excludedDomains.includes(hostname);
    }
    return true;
  }

  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        if (chrome.runtime && chrome.runtime.lastError) return;
        settings = { ...DEFAULT_SETTINGS, ...items };
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const [key, { newValue }] of Object.entries(changes)) {
          settings[key] = newValue;
        }
      });
    }
  }

  // Expo Out easing: fast initial response, long silky exponential decay
  function easeOutExpo(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(2, -10 * t);
  }

  function getRootScroller() {
    return document.scrollingElement || document.documentElement || document.body;
  }

  function getScrollLeft(el) {
    if (el === getRootScroller()) {
      return window.scrollX ?? el.scrollLeft;
    }
    return el.scrollLeft;
  }

  function getScrollTop(el) {
    if (el === getRootScroller()) {
      return window.scrollY ?? el.scrollTop;
    }
    return el.scrollTop;
  }

  function getMaxScroll(el) {
    const root = getRootScroller();
    if (el === root) {
      const docEl = document.documentElement;
      const maxX = Math.max(0, el.scrollWidth - (window.innerWidth || docEl.clientWidth));
      const maxY = Math.max(0, el.scrollHeight - (window.innerHeight || docEl.clientHeight));
      return { maxX, maxY };
    }
    return {
      maxX: Math.max(0, el.scrollWidth - el.clientWidth),
      maxY: Math.max(0, el.scrollHeight - el.clientHeight)
    };
  }

  function applyScroll(el, x, y) {
    if (el === getRootScroller()) {
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    } else {
      el.scrollTo({ left: x, top: y, behavior: 'instant' });
    }
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function isOverflowScrollable(overflowValue, isRoot) {
    if (isRoot) {
      return overflowValue !== 'hidden' && overflowValue !== 'clip';
    }
    return overflowValue === 'auto' || overflowValue === 'scroll' || overflowValue === 'overlay';
  }

  function canElementScroll(el, dx, dy) {
    const isRoot = el === getRootScroller();
    const style = window.getComputedStyle(el);
    const { maxX, maxY } = getMaxScroll(el);

    const refX = getScrollLeft(el);
    const refY = getScrollTop(el);

    const canY =
      dy !== 0 &&
      maxY > 0 &&
      isOverflowScrollable(style.overflowY, isRoot) &&
      ((dy < 0 && refY > 0.5) || (dy > 0 && refY < maxY - 0.5));

    const canX =
      dx !== 0 &&
      maxX > 0 &&
      isOverflowScrollable(style.overflowX, isRoot) &&
      ((dx < 0 && refX > 0.5) || (dx > 0 && refX < maxX - 0.5));

    return canX || canY;
  }

  function findScrollableTarget(startNode, dx, dy) {
    const root = getRootScroller();
    let el = startNode && startNode.nodeType === Node.TEXT_NODE
      ? startNode.parentElement
      : startNode;

    while (el && el !== document && el !== window) {
      if (el instanceof Element) {
        // Don't hijack scroll inside range sliders or native select lists
        if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'range')) {
          return null;
        }
        if (el === document.body || el === document.documentElement) {
          break;
        }
        if (canElementScroll(el, dx, dy)) {
          return el;
        }
      }
      el = el.parentElement;
    }

    if (root && canElementScroll(root, dx, dy)) {
      return root;
    }
    return null;
  }

  function stopAnimation(el, state) {
    if (state.rafId !== null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    state.currentX = getScrollLeft(el);
    state.currentY = getScrollTop(el);
    state.targetX = state.currentX;
    state.targetY = state.currentY;
  }

  function triggerSmoothScroll(el, dx, dy) {
    const { maxX, maxY } = getMaxScroll(el);
    const actualX = getScrollLeft(el);
    const actualY = getScrollTop(el);

    let state = scrollStates.get(el);
    if (!state) {
      state = {
        rafId: null,
        startX: actualX,
        startY: actualY,
        currentX: actualX,
        currentY: actualY,
        targetX: actualX,
        targetY: actualY,
        lastWrittenX: actualX,
        lastWrittenY: actualY,
        startTime: 0
      };
      scrollStates.set(el, state);
    }

    // Detect if scrollbar or page script moved scroll position externally
    const isAnimating = state.rafId !== null;
    const externalMove =
      !isAnimating ||
      Math.abs(actualX - state.lastWrittenX) > 2 ||
      Math.abs(actualY - state.lastWrittenY) > 2;

    if (externalMove) {
      state.currentX = actualX;
      state.currentY = actualY;
      state.targetX = actualX;
      state.targetY = actualY;
    }

    const nextTargetX = clamp(state.targetX + dx, 0, maxX);
    const nextTargetY = clamp(state.targetY + dy, 0, maxY);

    if (!externalMove && nextTargetX === state.targetX && nextTargetY === state.targetY) {
      return; // Already easing smoothly to this boundary
    }

    state.startX = state.currentX;
    state.startY = state.currentY;
    state.targetX = nextTargetX;
    state.targetY = nextTargetY;
    state.startTime = performance.now();

    if (state.rafId !== null) {
      return; // Existing loop will pick up the updated start/target/startTime
    }

    const step = (now) => {
      const currentActualX = getScrollLeft(el);
      const currentActualY = getScrollTop(el);

      // Abort if user grabbed scrollbar or another script jumped the page
      if (
        Math.abs(currentActualX - state.lastWrittenX) > 2.5 ||
        Math.abs(currentActualY - state.lastWrittenY) > 2.5
      ) {
        stopAnimation(el, state);
        return;
      }

      const duration = Math.max(100, Number(settings.duration) || 750);
      const elapsed = Math.max(0, now - state.startTime);
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutExpo(progress);

      const nextX = state.startX + (state.targetX - state.startX) * eased;
      const nextY = state.startY + (state.targetY - state.startY) * eased;

      state.currentX = nextX;
      state.currentY = nextY;

      applyScroll(el, nextX, nextY);

      state.lastWrittenX = getScrollLeft(el);
      state.lastWrittenY = getScrollTop(el);

      const distX = Math.abs(state.targetX - state.currentX);
      const distY = Math.abs(state.targetY - state.currentY);

      if (progress < 1 && (distX > 0.3 || distY > 0.3)) {
        state.rafId = requestAnimationFrame(step);
      } else {
        applyScroll(el, state.targetX, state.targetY);
        state.currentX = state.targetX;
        state.currentY = state.targetY;
        state.lastWrittenX = getScrollLeft(el);
        state.lastWrittenY = getScrollTop(el);
        state.rafId = null;
      }
    };

    state.lastWrittenX = actualX;
    state.lastWrittenY = actualY;
    state.rafId = requestAnimationFrame(step);
  }

  function normalizeWheelDelta(e) {
    let dx = e.deltaX;
    let dy = e.deltaY;

    // Shift + vertical wheel scrolls horizontally
    if (e.shiftKey && dx === 0 && dy !== 0) {
      dx = dy;
      dy = 0;
    }

    if (e.deltaMode === 1) {
      // DOM_DELTA_LINE
      dx *= 18;
      dy *= 18;
    } else if (e.deltaMode === 2) {
      // DOM_DELTA_PAGE
      dx *= window.innerWidth;
      dy *= window.innerHeight;
    }

    const scale = Number(settings.stepScale) || 1.0;
    return { dx: dx * scale, dy: dy * scale };
  }

  function onWheel(e) {
    if (!isSiteEnabled()) return;
    if (e.defaultPrevented) return;
    // Never interfere with browser zoom (Ctrl/Meta + Wheel)
    if (e.ctrlKey || e.metaKey) return;

    const { dx, dy } = normalizeWheelDelta(e);
    if (dx === 0 && dy === 0) return;

    const target = findScrollableTarget(e.target, dx, dy);
    if (!target) return;

    e.preventDefault();
    triggerSmoothScroll(target, dx, dy);
  }

  function isEditableElement(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return Boolean(el.closest('[contenteditable="true"]'));
  }

  function onKeyDown(e) {
    if (!isSiteEnabled() || !settings.keyboardSmooth) return;
    if (e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditableElement(document.activeElement)) return;

    let dx = 0;
    let dy = 0;
    const step = 120 * (Number(settings.stepScale) || 1.0);
    const pageStep = window.innerHeight * 0.85;

    switch (e.key) {
      case 'ArrowDown':
        dy = step;
        break;
      case 'ArrowUp':
        dy = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'PageDown':
        dy = pageStep;
        break;
      case 'PageUp':
        dy = -pageStep;
        break;
      case ' ':
        dy = e.shiftKey ? -pageStep : pageStep;
        break;
      default:
        return;
    }

    const target = findScrollableTarget(document.activeElement || getRootScroller(), dx, dy);
    if (!target) return;

    e.preventDefault();
    triggerSmoothScroll(target, dx, dy);
  }

  loadSettings();
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown, { passive: false });
})();
