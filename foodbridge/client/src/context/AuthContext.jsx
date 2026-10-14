import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('foodbridge:user') || 'null');
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('foodbridge:token') || '');

  useEffect(() => {
    if (token) {
      localStorage.setItem('foodbridge:token', token);
    } else {
      localStorage.removeItem('foodbridge:token');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('foodbridge:user', JSON.stringify(user));
    } else {
      localStorage.removeItem('foodbridge:user');
    }
  }, [user]);

  const login = async (credentials) => {
    const response = await api.post('/api/auth/login', credentials);
    const payload = response.data;

    setToken(payload.token);
    setUser(payload.user);
    return payload;
  };

  const register = async (values) => {
    const response = await api.post('/api/auth/register', values);
    const payload = response.data;

    setToken(payload.token);
    setUser(payload.user);
    return payload;
  };

  const requestPasswordReset = async (email) => {
    const response = await api.post('/api/auth/forgot-password', { email });
    return response.data;
  };

  const resetPassword = async (tokenValue, password) => {
    const response = await api.post('/api/auth/reset-password', {
      token: tokenValue,
      password
    });
    return response.data;
  };

  const logout = () => {
    setToken('');
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    token,
    login,
    register,
    requestPasswordReset,
    resetPassword,
    logout
  }), [user, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
