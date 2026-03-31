import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { signToken } from './jwt.js';

const router = Router();

/**
 * OAuth 2.0 Token Endpoint
 * Supports client_credentials grant type
 * 
 * POST /oauth/token
 * Content-Type: application/x-www-form-urlencoded
 * 
 * grant_type=client_credentials&client_id=...&client_secret=...&scope=mcp:read
 */
router.post('/oauth/token', (req: Request, res: Response) => {
  const grantType = req.body.grant_type;
  const clientId = req.body.client_id;
  const clientSecret = req.body.client_secret;
  const scope = req.body.scope || 'mcp:read';

  // Validate grant type
  if (grantType !== 'client_credentials') {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only client_credentials grant type is supported',
    });
    return;
  }

  // Validate client credentials
  if (!clientId || !clientSecret) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'client_id and client_secret are required',
    });
    return;
  }

  if (clientId !== config.oauth.clientId || clientSecret !== config.oauth.clientSecret) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client credentials',
    });
    return;
  }

  // Issue token
  const accessToken = signToken(clientId, scope);

  console.log(`[OAuth] Token issued for client: ${clientId}, scope: ${scope}`);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: config.oauth.tokenExpirySeconds,
    scope,
  });
});

export { router as tokenEndpointRouter };
