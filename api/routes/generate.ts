import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAiSettings } from '../lib/aiSettings.js';
import { OpenAI } from 'openai';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

const extractJsonObject = (content: string) => {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || content;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model did not return JSON');
  }
  return JSON.parse(raw.slice(start, end + 1));
};

router.post('/canvas', async (req, res) => {
  try {
    const aiSettings = getAiSettings();
    const resolvedApiKey = aiSettings.canvasApiKey || process.env.OPENAI_API_KEY || '';
    const resolvedBaseUrl = aiSettings.canvasBaseUrl || process.env.OPENAI_API_BASE_URL;

    if (!resolvedApiKey) {
      return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const openai = new OpenAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl || undefined,
    });

    const { prompt, messages = [], images = [] } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    let enhancedPrompt = prompt;
    if (images.length > 0) {
      const imageNames = images.map((img: { id: string; name: string }) => img.name).join('、');
      enhancedPrompt = `用户已上传图片素材：${imageNames}。${prompt}。如果用户需要在画布上添加图片logo或其他图片元素，请在设计方案中添加type为"image"的元素。`;
    }

    const response = await openai.chat.completions.create({
      model: aiSettings.canvasModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: aiSettings.canvasTemperature,
      messages: [
        {
          role: 'system',
          content: aiSettings.canvasSystemPrompt,
        },
        ...messages.slice(-aiSettings.canvasMaxHistory).map((item: { role: string; content: string }) => ({
          role: item.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: String(item.content || '').slice(0, 1000),
        })),
        { role: 'user', content: enhancedPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    
    if (images.length > 0 && parsed.draft && parsed.draft.elements) {
      let imageIndex = 0;
      parsed.draft.elements.forEach((element: { type: string; src?: string }) => {
        if (element.type === 'image' && !element.src && imageIndex < images.length) {
          element.src = images[imageIndex].src;
          imageIndex++;
        }
      });
    }
    
    res.json({ success: true, draft: parsed.draft, reply: parsed.reply });
  } catch (error) {
    console.error('Canvas generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate canvas: ' + (error as Error).message });
  }
});

router.post('/', async (req, res) => {
  try {
    const aiSettings = getAiSettings();
    const resolvedApiKey = aiSettings.canvasApiKey || process.env.OPENAI_API_KEY || '';
    const resolvedBaseUrl = aiSettings.canvasBaseUrl || process.env.OPENAI_API_BASE_URL;

    const openai = resolvedApiKey
      ? new OpenAI({
        apiKey: resolvedApiKey,
        baseURL: resolvedBaseUrl || undefined,
      })
      : null;

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
    const aiSettings = getAiSettings();
    const resolvedApiKey = aiSettings.canvasApiKey || process.env.OPENAI_API_KEY || '';
    const resolvedBaseUrl = aiSettings.canvasBaseUrl || process.env.OPENAI_API_BASE_URL;

    const openai = resolvedApiKey
      ? new OpenAI({
        apiKey: resolvedApiKey,
        baseURL: resolvedBaseUrl || undefined,
      })
      : null;

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