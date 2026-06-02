import React, { useEffect, useRef, useState } from 'react';
import '../css/AIGuidance.css';
import { checkSafety, fetchAdvice } from '../utils/LoadData';

export { checkSafety, fetchAdvice };

export default function AIGuidance({ advice, nearest }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);
  const prevAdviceRef = useRef(advice);

  const IDLE_MS = 10000; // 10 seconds

  function clearIdleTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function startIdleTimer() {
    clearIdleTimer();
    timerRef.current = setTimeout(() => setVisible(false), IDLE_MS);
  }

  function resetIdle() {
    // Only apply idle behavior in portrait orientation
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(orientation: portrait)').matches) {
      setVisible(true);
      startIdleTimer();
    } else {
      // always visible in landscape / non-supported environments
      setVisible(true);
      clearIdleTimer();
    }
  }

  useEffect(() => {
    // initial setup
    resetIdle();

    // listen for explicit user clicks dispatched by the app and notifications
    const onUserClick = () => resetIdle();
    const onNotify = () => resetIdle();
    window.addEventListener('ai:user-click', onUserClick);
    window.addEventListener('ai:notify', onNotify);

    // watch orientation changes to enable/disable idle behavior
    let mql = null;
    let onChange = null;
    if (window.matchMedia) {
      mql = window.matchMedia('(orientation: portrait)');
      onChange = () => resetIdle();
      try {
        mql.addEventListener('change', onChange);
      } catch (e) {
        // Safari/older: fallback
        mql.addListener(onChange);
      }
    }

    return () => {
      clearIdleTimer();
      window.removeEventListener('ai:user-click', onUserClick);
      window.removeEventListener('ai:notify', onNotify);
      if (mql) {
        try {
          mql.removeEventListener('change', onChange);
        } catch (e) {
          mql.removeListener(onChange);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show again when advice prop changes (new response)
  useEffect(() => {
    if (advice && advice !== prevAdviceRef.current) {
      prevAdviceRef.current = advice;
      resetIdle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice]);

  return (
    <section className={`advice-section ${visible ? '' : 'hidden'}`} aria-hidden={!visible}>
      <div className="ai-card">
        <h2>AI Guidance</h2>
        <p>{advice || 'Click the map or select a destination to get AI safety and tourist advice.'}</p>
      </div>
    </section>
  );
}
