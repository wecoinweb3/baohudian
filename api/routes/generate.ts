import express from 'express';
import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';

const router = express.Router();

const openai: OpenAI | null = process.env.OPENAI_API_KEY
  ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL,
  })
  : null;

const uploadDir = process.env.UPLOAD_DIR || './uploads';

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
    if (!openai) {
      return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const { prompt, messages = [] } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `你是保护垫画布设计助手。根据用户中文需求，生成可渲染的结构化画布 JSON。
只返回 JSON，不要 markdown，不要解释。
JSON 格式：
{
  "reply": "简短回复，说明已生成图片，不要提工作台",
  "draft": {
    "projectName": "名称",
    "canvas": { "width": 120, "height": 70, "backgroundColor": "#ffffff", "safeAreaWidth": 84, "safeAreaHeight": 40, "unit": "cm" },
    "elements": [
      { "type": "text", "text": "文字", "color": "#111111", "x": 0.15, "y": 0.12, "width": 0.7, "height": 0.14 },
      { "type": "rect", "color": "#ef0000", "x": 0.15, "y": 0.72, "width": 0.7, "height": 0.1 },
      { "type": "image", "x": 0.56, "y": 0.24, "width": 0.26, "height": 0.34 }
    ],
    "missingFields": [],
    "readyToGenerate": true
  }
}
坐标 x/y/width/height 是相对非留白安全区域的 0-1 比例。用户未说明尺寸时默认画布 120x70cm，非留白 84x40cm。用户提到白底只设置背景，不能影响红色标题/红色横条。`,
        },
        ...messages.slice(-6).map((item: { role: string; content: string }) => ({
          role: item.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: String(item.content || '').slice(0, 1000),
        })),
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    res.json({ success: true, draft: parsed.draft, reply: parsed.reply });
  } catch (error) {
    console.error('Canvas generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate canvas: ' + (error as Error).message });
  }
});

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