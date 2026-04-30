/* ============================================================
   Auth client — talks to /api/auth/* on the same Vercel deployment.
   The session lives in an httpOnly cookie set by the server, so we
   never see the token here.
   ============================================================ */

const AuthClient = (() => {
  const _post = async (path, body) => {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || ('http ' + res.status));
    }
    return data;
  };

  const me = async () => {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return null;
    return data.user || null;
  };

  const login    = (email, password) => _post('/api/auth/login', { email, password });
  const register = (email, password) => _post('/api/auth/register', { email, password });
  const logout   = () => _post('/api/auth/logout');

  return { me, login, register, logout };
})();
