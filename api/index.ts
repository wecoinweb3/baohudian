import type { VercelRequest, VercelResponse } from '@vercel/node';
import './env.js';
import app from './app.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return app(req, res);
  } catch (error) {
    console.error('API handler error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
}