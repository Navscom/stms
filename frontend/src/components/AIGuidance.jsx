import React from 'react';
import '../css/AIGuidance.css';
import { checkSafety, fetchAdvice } from '../utils/LoadData';

export { checkSafety, fetchAdvice };

export default function AIGuidance({ advice, nearest }) {
  return (
    <section className="advice-section">
      <div className="ai-card">
        <h2>AI Guidance</h2>
        <p>{advice || 'Click the map or select a destination to get AI safety and tourist advice.'}</p>
      </div>
    </section>
  );
}
