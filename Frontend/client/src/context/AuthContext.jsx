import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, setStoredUser, getStoredUser, getToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const [profile, setProfile] = useState(() => getStoredProfile(getStoredUser()));
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setStoredUser(null);
    setUser(null);
    setProfile(null);
  }, []);

  const login = useCallback(async (email, password) => {
    setToken(null);
    setStoredUser(null);
    const { user: loggedInUser, token } = await api.login(email, password);
    setToken(token);
    setStoredUser(loggedInUser);
    setUser(loggedInUser);
    setProfile(getStoredProfile(loggedInUser));
    return loggedInUser;
  }, []);

  const register = useCallback(async (payload) => {
    setToken(null);
    setStoredUser(null);
    const { user: newUser, token } = await api.register(payload);
    setToken(token);
    setStoredUser(newUser);
    setUser(newUser);
    setProfile(getStoredProfile(newUser));
    return newUser;
  }, []);

  const updateProfile = useCallback((updates) => {
    if (!user) return;
    const nextProfile = { ...profile, ...updates };
    localStorage.setItem(profileStorageKey(user), JSON.stringify(nextProfile));
    setProfile(nextProfile);
  }, [profile, user]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .me()
      .then(({ user: freshUser }) => {
        setStoredUser(freshUser);
        setUser(freshUser);
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const profileUser = user ? { ...user, ...profile } : null;

  return (
    <AuthContext.Provider value={{ user: profileUser, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

function profileStorageKey(user) {
  return `profile:${user.id}`;
}

function getStoredProfile(user) {
  if (!user) return null;
  const raw = localStorage.getItem(profileStorageKey(user));
  return raw ? JSON.parse(raw) : {};
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
