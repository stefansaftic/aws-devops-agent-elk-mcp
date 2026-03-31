import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt.js';

/**
 * OAuth 2.0 Bearer Token validation middleware.
 * Validates the JWT token from the Authorization header.
 * 
 * Expects: Authorization: Bearer <token>
 */
export function oauthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing Authorization header',
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Invalid Authorization header format. Expected: Bearer <token>',
    });
    return;
  }

  const token = parts[1];

  try {
    const payload = verifyToken(token);
    // Attach the token payload to the request for downstream use
    (req as any).tokenPayload = payload;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'invalid_token',
        error_description: 'Token has expired',
      });
      return;
    }

    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Invalid or malformed token',
    });
  }
}
