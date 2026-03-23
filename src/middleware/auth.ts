import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../utils/config';

interface Credentials {
  username: string;
  password: string;
}

let credentials: Credentials | null = null;

function loadCredentials(): Credentials {
  if (credentials) return credentials;

  // Try local file first, then env vars
  const credPath = path.resolve(process.cwd(), '.dashboard-credentials.json');
  if (fs.existsSync(credPath)) {
    const raw = fs.readFileSync(credPath, 'utf-8');
    credentials = JSON.parse(raw);
    return credentials!;
  }

  credentials = {
    username: config.dashboardUser,
    password: config.dashboardPass,
  };
  return credentials;
}

export function checkAuth(req: http.IncomingMessage): boolean {
  const creds = loadCredentials();
  if (!creds.password) return true; // no password = open access

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return false;

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const [user, pass] = decoded.split(':');
  return user === creds.username && pass === creds.password;
}

export function sendUnauthorized(res: http.ServerResponse): void {
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Basic realm="Bot News Dashboard"',
  });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}
