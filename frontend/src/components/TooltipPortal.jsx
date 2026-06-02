import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

export default function TooltipPortal({ content, children, placement = 'right', portraitPlacement = 'top' }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [isPortrait, setIsPortrait] = useState(window.matchMedia('(orientation: portrait)').matches);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: portrait)');
    const handleChange = (e) => setIsPortrait(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const currentPlacement = isPortrait ? portraitPlacement : placement;
      
      let left = rect.right + 12;
      let top = rect.top + rect.height / 2;
      
      if (currentPlacement === 'left') {
        left = rect.left - 12;
        top = rect.top + rect.height / 2;
      } else if (currentPlacement === 'top') {
        left = rect.left + rect.width / 2;
        top = rect.top - 12;
      } else if (currentPlacement === 'bottom') {
        left = rect.left + rect.width / 2;
        top = rect.bottom + 12;
      }
      
      setPos({ left, top });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [visible, placement, portraitPlacement, isPortrait]);

  const currentPlacement = isPortrait ? portraitPlacement : placement;
  
  let transform = 'translateY(-50%)';
  if (currentPlacement === 'top') {
    transform = 'translate(-50%, -100%)';
  } else if (currentPlacement === 'bottom') {
    transform = 'translate(-50%, 0)';
  } else if (['right', 'left'].includes(currentPlacement)) {
    transform = 'translateY(-50%)';
  }

  const tooltipNode = (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        transform,
        pointerEvents: 'none',
        zIndex: 2147483647,
      }}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: '14px',
          whiteSpace: 'nowrap',
          boxShadow: '0 6px 18px rgba(15,23,42,0.2)'
        }}
      >
        {content}
      </div>
    </div>
  );

  return (
    <span
      ref={triggerRef}
      onMouseEnter={() => setVisible(true)}
      onFocus={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onBlur={() => setVisible(false)}
      style={{ display: 'inline-block' }}
    >
      {children}
      {visible && ReactDOM.createPortal(tooltipNode, document.body)}
    </span>
  );
}
