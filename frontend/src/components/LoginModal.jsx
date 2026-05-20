import React, { useState } from 'react';

export default function LoginModal({ isOpen, onClose, onLoginSuccess, api }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'tourist' });
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  if (!isOpen) return null;

  const update = (key, value) => setForm({ ...form, [key]: value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Processing...');
    setIsError(false);

    if (isRegister && form.password !== form.confirmPassword) {
      setMessage('Passwords do not match.');
      setIsError(true);
      return;
    }

    const endpoint = isRegister ? 'register' : 'login';
    const payload  = isRegister
      ? { name: form.name, email: form.email, password: form.password, role: form.role }
      : { email: form.email, password: form.password };

    try {
      const res  = await fetch(`${api}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed.');
      setMessage(data.message);
      setIsError(false);
      onLoginSuccess(data.user);
    } catch (err) {
      setMessage(err.message);
      setIsError(true);
    }
  };

  const switchMode = () => {
    setIsRegister(!isRegister);
    setMessage('');
    setIsError(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>

        {/* Close button */}
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Brand */}
        <div className="modal-brand">
          <img className="modal-brand-icon" src="/icons.svg" alt="Tourism AI icon" />
          <span className="modal-brand-name">Smart Tourism AI</span>
        </div>

        {/* Title */}
        <h2>{isRegister ? 'Create account' : 'Welcome back'}</h2>
        <p className="modal-subtitle">
          {isRegister
            ? 'Register to report crowds and danger zones.'
            : 'Log in to your account to continue.'}
        </p>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <input
              placeholder="Full name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            required
          />
          {isRegister && (
            <input
              type="password"
              placeholder="Confirm password"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              required
            />
          )}
          {isRegister && (
            <select value={form.role} onChange={(e) => update('role', e.target.value)}>
              <option value="tourist">Tourist</option>
              <option value="admin">Admin</option>
            </select>
          )}
          <button type="submit" className="primary-btn">
            {isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>

        {/* Helper */}
        <p className="helper-text">Login is case-sensitive.</p>

        {/* Message */}
        {message && (
          <p className={`message${isError ? ' error' : ''}`}>{message}</p>
        )}

        {/* Toggle */}
        <p className="toggle-row">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
          <span className="toggle-link" onClick={switchMode}>
            {isRegister ? ' Log in' : ' Register'}
          </span>
        </p>

      </div>
    </div>
  );
}
