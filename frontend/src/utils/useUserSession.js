import { useEffect, useState } from 'react';

export function useUserSession() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem('stms_user')) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      window.sessionStorage.setItem('stms_user', JSON.stringify(user));
    } else {
      window.sessionStorage.removeItem('stms_user');
    }
  }, [user]);

  return [user, setUser];
}
