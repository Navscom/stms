import React, { useState } from 'react';
import '../css/modal.css';

export default function LoginModal({ isOpen, onClose }) {
  const [isRegister, setIsRegister] = useState(false);
  const [passwords, setPasswords] = useState({ p1: '', p2: '' });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isRegister && passwords.p1 !== passwords.p2) return alert("Passwords match error!");
    alert("Success!");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2>{isRegister ? "Register" : "Login"}</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" required />
          <input type="password" placeholder="Password" required onChange={e => setPasswords({...passwords, p1: e.target.value})} />
          {isRegister && <input type="password" placeholder="Confirm Password" required onChange={e => setPasswords({...passwords, p2: e.target.value})} />}
          <button type="submit" className="primary-btn">{isRegister ? "Sign Up" : "Sign In"}</button>
        </form>
        <p>{isRegister ? "Have an account?" : "No account?"} 
          <span className="toggle-link" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? " Login now" : " Register now"}
          </span>
        </p>
      </div>
    </div>
  );
}