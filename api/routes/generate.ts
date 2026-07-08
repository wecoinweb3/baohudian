import express from 'express';
import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';

const router = express.Router();

let openai: OpenAI | null = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL,
  });
}

const uploadDir = process.env.UPLOAD_DIR || './uploads';

router.post('/', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    const { prompt, patternImage, spaceImage, aspectRatio = '1:1' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const imageSize = aspectRatio === '16:9' ? '1024x1024' : 
                     aspectRatio === '9:16' ? '1024x1024' : '1024x1024';

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: imageSize as '1024x1024' | '1792x1024' | '1024x1792',
      response_format: 'url',
    });

    if (response.data && response.data[0] && response.data[0].url) {
      res.json({
        success: true,
        imageUrl: response.data[0].url,
      });
    } else {
      res.status(500).json({ error: 'Failed to generate image' });
    }
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to generate image: ' + (error as Error).message });
  }
});

router.post('/variation', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    const { imageUrl, prompt } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    const blob = await fetch(imageUrl).then(r => r.blob());
    const file = new File([blob], 'variation.png', { type: blob.type });

    const response = await openai.images.createVariation({
      image: file,
      n: 1,
      size: '1024x1024',
    });

    if (response.data && response.data[0] && response.data[0].url) {
      res.json({
        success: true,
        imageUrl: response.data[0].url,
      });
    } else {
      res.status(500).json({ error: 'Failed to generate variation' });
    }
  } catch (error) {
    console.error('Variation error:', error);
    res.status(500).json({ error: 'Failed to generate variation: ' + (error as Error).message });
  }
});

export default router;