import { useState, useEffect, createContext, useContext } from 'react';
import { auth } from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithToken: (token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  loginWithToken: () => {},
  logout: () => {},
});

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await auth.login(email, password);
    localStorage.setItem('token', token);
    setUser(user);
  };

  const register = async (email: string, password: string, name: string) => {
    const { token, user } = await auth.register(email, password, name);
    localStorage.setItem('token', token);
    setUser(user);
  };

  const loginWithToken = (token: string) => {
    localStorage.setItem('token', token);
    auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('token'));
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return { user, loading, login, register, loginWithToken, logout };
}

export function useAuth() {
  return useContext(AuthContext);
}
