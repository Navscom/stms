import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import './css/App.css';

function App() {
  const [advice, setAdvice] = useState("Click anywhere in the Philippines for AI advice!");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const fetchAdvice = async (lat, lng) => {
    setAdvice("Analyzing location...");
    try {
      const res = await fetch(`http://127.0.0.1:8000/ai-advice?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      setAdvice(data.advice);
    } catch (e) { setAdvice("Backend error."); }
  };

  return (
    <div style={{ padding: "30px", maxWidth: "1000px", margin: "0 auto" }}>
      <Header 
        advice={advice} 
        theme={theme} 
        onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
        onLogin={() => setIsModalOpen(true)}
      />
      <MapView onLocationClick={fetchAdvice} />
      <LoginModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

export default App;