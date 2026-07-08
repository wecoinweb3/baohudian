import express from 'express';
import { getAiSettings, saveAiSettings } from '../lib/aiSettings.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    res.json({ success: true, settings: getAiSettings() });
  } catch (error) {
    console.error('Failed to load AI settings:', error);
    res.status(500).json({ success: false, error: 'Failed to load AI settings' });
  }
});

router.put('/', (req, res) => {
  try {
    const canvasTemperature = Number(req.body.canvasTemperature);

    if (Number.isNaN(canvasTemperature) || canvasTemperature < 0 || canvasTemperature > 2) {
      return res.status(400).json({ success: false, error: 'canvasTemperature must be between 0 and 2' });
    }

    if (!String(req.body.canvasModel || '').trim() || !String(req.body.canvasSystemPrompt || '').trim()) {
      return res.status(400).json({ success: false, error: 'Model and system prompt are required' });
    }

    const settings = saveAiSettings({
      canvasApiKey: String(req.body.canvasApiKey || ''),
      canvasBaseUrl: String(req.body.canvasBaseUrl || ''),
      canvasModel: String(req.body.canvasModel || ''),
      canvasTemperature,
      canvasSystemPrompt: String(req.body.canvasSystemPrompt || ''),
    });

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Failed to save AI settings:', error);
    res.status(500).json({ success: false, error: 'Failed to save AI settings' });
  }
});

export default router;