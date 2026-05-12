import React, { useState } from 'react';

export default function LoginModal({ isOpen, onClose, onLoginSuccess, api }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'tourist' });
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const update = (key, value) => setForm({ ...form, [key]: value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Processing...');
    if (isRegister && form.password !== form.confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    const endpoint = isRegister ? 'register' : 'login';
    const payload = isRegister
      ? { name: form.name, email: form.email, password: form.password, role: form.role }
      : { email: form.email, password: form.password };

    try {
      const res = await fetch(`${api}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed.');
      setMessage(data.message);
      onLoginSuccess(data.user);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{isRegister ? 'Register' : 'Login'}</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && <input placeholder="Full Name" value={form.name} onChange={(e) => update('name', e.target.value)} required />}
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => update('password', e.target.value)} required />
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
