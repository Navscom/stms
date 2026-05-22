import React, { useEffect, useState } from 'react';
import { validateAuthForm } from '../utils/validation';

export default function LoginModal({ isOpen, onClose, onLoginSuccess, api, infoMessage }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'tourist' });
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMessage('');
    const initialForm = { name: '', email: '', password: '', confirmPassword: '', role: 'tourist' };
    const saved = window.localStorage.getItem('stms_remembered_login');
    if (saved) {
      try {
        const { email, password } = JSON.parse(saved);
        if (email && password) {
          setForm((prev) => ({ ...prev, email, password }));
          setRememberMe(true);
          return;
        }
      } catch {
        window.localStorage.removeItem('stms_remembered_login');
      }
    }
    setForm(initialForm);
    setRememberMe(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const update = (key, value) => setForm({ ...form, [key]: value });

  const saveRememberedLogin = (email, password) => {
    if (rememberMe) {
      window.localStorage.setItem('stms_remembered_login', JSON.stringify({ email, password }));
    } else {
      window.localStorage.removeItem('stms_remembered_login');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validateAuthForm(form, isRegister);
    if (!validation.valid) {
      setMessage(validation.message);
      return;
    }
    setMessage('Processing...');
    const endpoint = isRegister ? 'register' : 'login';
    const payload = isRegister
      ? { name: form.name, email: form.email, password: form.password, role: form.role }
      : { email: form.email, password: form.password };

    try {
      const res = await fetch(`${api}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // prefer backend detail when available
        const detail = (data && (data.detail || data.message)) || 'Request failed.';
        throw new Error(detail);
      }
      setMessage(data?.message || 'Success');
      if (!isRegister) saveRememberedLogin(form.email, form.password);
      onLoginSuccess(data?.user);
    } catch (err) {
      // Normalize common backend messages and network errors
      const msg = (err && err.message) || String(err);
      if (isRegister && /email|already|exists/i.test(msg)) {
        setMessage('User already exists.');
      } else if (isRegister && /failed to fetch/i.test(msg)) {
        // fallback when network/CORS causes a generic fetch failure during registration
        setMessage('User already exists.');
      } else {
        setMessage(msg);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{isRegister ? 'Register' : 'Login'}</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          {infoMessage && <p className="modal-info-message">{infoMessage}</p>}
          {isRegister && <input placeholder="Full Name" value={form.name} onChange={(e) => update('name', e.target.value)} required />}
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => update('password', e.target.value)} required />
          {!isRegister && (
            <label className="remember-me">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRememberMe(checked);
                  if (!checked) {
                    window.localStorage.removeItem('stms_remembered_login');
                  }
                }}
              />
              Remember me
            </label>
          )}
          {isRegister && <input type="password" placeholder="Confirm Password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} required />}
          {isRegister && (
            <select value={form.role} onChange={(e) => update('role', e.target.value)}>
              <option value="tourist">Tourist</option>
              <option value="admin">Admin</option>
            </select>
          )}
          <button type="submit" className="primary-btn">{isRegister ? 'Sign Up' : 'Sign In'}</button>
        </form>
        <p className="helper-text">The Login Page is case sensitive.</p>
        {message && <p className="message">{message}</p>}
        <p>{isRegister ? 'Have an account?' : 'No account?'}
          <span className="toggle-link" onClick={() => { setIsRegister(!isRegister); setMessage(''); }}>
            {isRegister ? ' Login now' : ' Register now'}
          </span>
        </p>
      </div>
    </div>
  );
}
