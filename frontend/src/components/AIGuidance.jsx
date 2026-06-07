import React, { useEffect, useRef, useState } from 'react';
import '../css/AIGuidance.css';
import { checkSafety, fetchAdvice } from '../utils/LoadData';

export { checkSafety, fetchAdvice };

export default function AIGuidance({ advice, routeAdvice, nearest, loading = false }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);
  const prevAdviceRef = useRef(advice);
  const prevRouteAdviceRef = useRef(routeAdvice);

  const IDLE_MS = 15000; // 15 seconds

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
    setVisible(true);
    startIdleTimer();
  }

  useEffect(() => {
    // initial setup
    resetIdle();

    // keep the loading message visible while backend data is still being fetched
    if (loading) {
      setVisible(true);
    }

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
    if (routeAdvice && routeAdvice !== prevRouteAdviceRef.current) {
      prevRouteAdviceRef.current = routeAdvice;
      resetIdle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice, routeAdvice]);

  const shouldShow = loading || visible;
  const message = loading
    ? 'Information in the area is loading. Please wait while the backend starts up.'
    : routeAdvice || advice || 'Click the map or select a destination to get AI safety and tourist advice.';

  return (
    <section className={`advice-section ${shouldShow ? '' : 'hidden'}`} aria-hidden={!shouldShow}>
      <div className="ai-card">
        <h2>AI Guidance</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}
