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
        {nearest?.length > 0 && (
          <div className="ai-card-meta">
            <strong>Nearest destinations:</strong>
            <ul>
              {nearest.slice(0, 3).map((dest) => (
                <li key={dest.id}>{dest.name} — {dest.distance_km} km</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
