import { useState, type FormEvent } from 'react';

interface Props {
  onLogin: (user: string, pass: string) => void;
  error?: string;
}

export default function Login({ onLogin, error }: Props) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onLogin(user, pass);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-xl p-8 w-full max-w-sm space-y-5"
      >
        <h1 className="text-xl font-bold text-center text-slate-100">Bot News</h1>
        <p className="text-sm text-center text-slate-400">Acesse o dashboard</p>

        {error && (
          <div className="bg-red-900/40 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <input
          type="text"
          placeholder="Usuario"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
        />
        <input
          type="password"
          placeholder="Senha"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
