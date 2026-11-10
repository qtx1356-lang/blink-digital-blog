const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 10000;
const OWNER = process.env.GITHUB_OWNER || 'qtx1356-lang';
const REPO = process.env.GITHUB_REPO || 'blink-digital-blog';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE_PATH = 'assets/articles.json';
const ALLOWED_USER = (process.env.ADMIN_ALLOWED_USER || OWNER).toLowerCase();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const sessions = new Map();
const pendingStates = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...headers
  });
  res.end(JSON.stringify(body));
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}
function cookie(name, value, maxAge) {
  return name + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}
function clearCookie(name) {
  return name + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
function sessionFor(req) {
  const id = cookies(req).blink_session;
  const session = id && sessions.get(id);
  if (!session || session.expiresAt < Date.now()) {
    if (id) sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}
async function readBody(req, limit = 2 * 1024 * 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('Request is too large.');
  }
  return body ? JSON.parse(body) : {};
}
async function github(pathname, token, options = {}) {
  const response = await fetch('https://api.github.com' + pathname, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Blink-Digital-Blog-Admin',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'GitHub API returned ' + response.status);
  return data;
}
async function loadArticles(token) {
  const encodedPath = FILE_PATH.split('/').map(encodeURIComponent).join('/');
  const file = await github('/repos/' + OWNER + '/' + REPO + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(BRANCH), token);
  const json = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
  return { articles: JSON.parse(json), sha: file.sha };
}
function validArticles(value) {
  if (!Array.isArray(value) || value.length > 500) return false;
  return value.every(a => a && typeof a === 'object' &&
    typeof a.id === 'string' && typeof a.title === 'string' && a.title.trim() &&
    typeof a.category === 'string' && typeof a.excerpt === 'string' &&
    Array.isArray(a.content) && a.content.every(p => typeof p === 'string'));
}
async function route(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/auth/github') {
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    if (!clientId || !process.env.GITHUB_APP_CLIENT_SECRET || !PUBLIC_BASE_URL) {
      return send(res, 503, { error: 'Admin authentication is not configured yet. Add the GitHub App environment variables in Render.' });
    }
    const state = crypto.randomBytes(24).toString('hex');
    pendingStates.set(state, Date.now() + 10 * 60 * 1000);
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', PUBLIC_BASE_URL + '/auth/callback');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('allow_signup', 'false');
    res.writeHead(302, {
      Location: authUrl.toString(),
      'Cache-Control': 'no-store',
      'Set-Cookie': cookie('blink_oauth_state', state, 600),
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/auth/callback') {
    const state = url.searchParams.get('state') || '';
    const stateCookie = cookies(req).blink_oauth_state || '';
    const expiry = pendingStates.get(state);
    pendingStates.delete(state);
    if (!state || state !== stateCookie || !expiry || expiry < Date.now()) {
      return send(res, 400, { error: 'Sign-in verification failed. Please start again.' }, { 'Set-Cookie': clearCookie('blink_oauth_state') });
    }
    if (url.searchParams.has('error')) {
      res.writeHead(302, { Location: '/?login=cancelled', 'Set-Cookie': clearCookie('blink_oauth_state'), 'Cache-Control': 'no-store' });
      return res.end();
    }
    const code = url.searchParams.get('code');
    if (!code) return send(res, 400, { error: 'GitHub did not return an authorization code.' });
    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_APP_CLIENT_ID,
          client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
          code,
          redirect_uri: PUBLIC_BASE_URL + '/auth/callback',
          state
        })
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.error || 'GitHub token exchange failed.');
      }
      const user = await github('/user', tokenData.access_token);
      if ((user.login || '').toLowerCase() !== ALLOWED_USER) {
        return send(res, 403, { error: 'This GitHub account is not authorized for this dashboard.' }, { 'Set-Cookie': clearCookie('blink_oauth_state') });
      }
      // Confirm the GitHub App is installed on this repository and has Contents read access.
      await loadArticles(tokenData.access_token);
      const sessionId = crypto.randomBytes(32).toString('hex');
      sessions.set(sessionId, { token: tokenData.access_token, login: user.login, expiresAt: Date.now() + SESSION_TTL });
      res.writeHead(302, {
        Location: '/',
        'Cache-Control': 'no-store',
        'Set-Cookie': [
          clearCookie('blink_oauth_state'),
          cookie('blink_session', sessionId, SESSION_TTL / 1000)
        ]
      });
      return res.end();
    } catch (error) {
      return send(res, 403, { error: 'GitHub connection failed: ' + error.message }, { 'Set-Cookie': clearCookie('blink_oauth_state') });
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    const session = sessionFor(req);
    return send(res, 200, session ? { authenticated: true, user: session.login } : { authenticated: false });
  }
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const id = cookies(req).blink_session;
    if (id) sessions.delete(id);
    return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie('blink_session') });
  }
  if (url.pathname === '/api/articles' && (req.method === 'GET' || req.method === 'PUT')) {
    const session = sessionFor(req);
    if (!session) return send(res, 401, { error: 'Please sign in again.' });
    if (req.method === 'GET') {
      try {
        const result = await loadArticles(session.token);
        return send(res, 200, { articles: result.articles });
      } catch (error) { return send(res, 502, { error: error.message }); }
    }
    const origin = req.headers.origin;
    if (origin && PUBLIC_BASE_URL && origin !== PUBLIC_BASE_URL) return send(res, 403, { error: 'Request origin not allowed.' });
    try {
      const body = await readBody(req);
      if (!validArticles(body.articles)) return send(res, 400, { error: 'Article data is incomplete or invalid.' });
      const current = await loadArticles(session.token);
      const content = Buffer.from(JSON.stringify(body.articles, null, 2), 'utf8').toString('base64');
      await github('/repos/' + OWNER + '/' + REPO + '/contents/' + FILE_PATH, session.token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Publish blog articles from Blink Admin',
          content,
          sha: current.sha,
          branch: BRANCH
        })
      });
      return send(res, 200, { ok: true });
    } catch (error) { return send(res, 502, { error: error.message }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    return fs.createReadStream(path.join(__dirname, 'admin.html')).pipe(res);
  }
  return send(res, 404, { error: 'Not found.' });
}
http.createServer((req, res) => {
  route(req, res).catch(error => {
    if (!res.headersSent) send(res, 500, { error: 'Unexpected server error.' });
    else res.end();
    console.error(error);
  });
}).listen(PORT, () => console.log('Blink Admin listening on port ' + PORT));
