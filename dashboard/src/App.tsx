import { useState } from 'react';
import { setAuth, isAuthenticated, fetchContents, clearAuth } from './lib/api';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [loginError, setLoginError] = useState('');

  async function handleLogin(user: string, pass: string) {
    setAuth(user, pass);
    try {
      await fetchContents(1);
      setAuthed(true);
      setLoginError('');
    } catch {
      clearAuth();
      setLoginError('Usuario ou senha invalidos');
    }
  }

  if (!authed) {
    return <Login onLogin={handleLogin} error={loginError} />;
  }

  return <Dashboard onLogout={() => setAuthed(false)} />;
}
