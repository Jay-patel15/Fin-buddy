/**
 * Auth helpers shared by all /api/auth/* endpoints and /api/data.
 * Files prefixed with `_` are not routed by Vercel (private).
 */

import jwt from 'jsonwebtoken';

const COOKIE_NAME = process.env.COOKIE_NAME || 'fb_session';
const COOKIE_DAYS = Number(process.env.COOKIE_DAYS || 7);
const JWT_SECRET  = process.env.JWT_SECRET;

export const cookieName = () => COOKIE_NAME;

export function signToken(payload) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${COOKIE_DAYS}d` });
}

export function verifyToken(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.verify(token, JWT_SECRET);
}

export function setSessionCookie(res, token) {
  const maxAgeSec = COOKIE_DAYS * 24 * 60 * 60;
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function readSession(req) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE_NAME + '='));
  if (!found) return null;
  const token = found.slice(COOKIE_NAME.length + 1);
  if (!token) return null;
  try { return verifyToken(token); }
  catch (_) { return null; }
}

export function requireAuth(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return null;
  }
  return session; // { id, email, iat, exp }
}
