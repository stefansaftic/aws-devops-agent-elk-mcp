import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  sub: string;
  scope: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export function signToken(clientId: string, scope: string): string {
  const payload = {
    sub: clientId,
    scope,
    iss: config.oauth.issuer,
    aud: config.oauth.audience,
  };

  return jwt.sign(payload, config.oauth.jwtSecret, {
    expiresIn: config.oauth.tokenExpirySeconds,
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.oauth.jwtSecret, {
    issuer: config.oauth.issuer,
    audience: config.oauth.audience,
  }) as TokenPayload;
}
