import express from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getAiSettings } from '../lib/aiSettings.js';
import { getUploadDir } from '../lib/dbPath.js';
import { OpenAI } from 'openai';

const router = express.Router();

const uploadDir = getUploadDir();
const execFileAsync = promisify(execFile);

const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const dataUrlToBuffer = (dataUrl: string) => {
  const matched = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matched) {
    throw new Error('Invalid image data');
  }
  return {
    mimeType: matched[1],
    buffer: Buffer.from(matched[2], 'base64'),
  };
};

const bufferToDataUrl = (buffer: Buffer, mimeType: string) => `data:${mimeType};base64,${buffer.toString('base64')}`;

router.post('/logo-normalize', async (req, res) => {
  const tempDir = path.join(uploadDir, 'logo-temp');
  ensureDir(tempDir);

  let inputPath = '';
  let outputPath = '';

  try {
    const { image, fileName = 'logo.png', targetColor = '#ef0000' } = req.body as {
      image?: string;
      fileName?: string;
      targetColor?: string;
    };

    if (!image) {
      return res.status(400).json({ success: false, error: 'Image is required' });
    }

    const { buffer, mimeType } = dataUrlToBuffer(image);
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' : '.png';
    const safeBaseName = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9_-\u4e00-\u9fa5]/g, '_') || 'logo';
    const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    inputPath = path.join(tempDir, `${safeBaseName}_${fileId}${ext}`);
    outputPath = path.join(tempDir, `${safeBaseName}_${fileId}_flat.png`);
    fs.writeFileSync(inputPath, buffer);

    const scriptPath = path.join(process.cwd(), 'scripts', 'logo_flatten.py');
    await execFileAsync('python', [scriptPath, inputPath, outputPath, targetColor]);

    const outputBuffer = fs.readFileSync(outputPath);
    const normalizedDataUrl = bufferToDataUrl(outputBuffer, 'image/png');

    res.json({
      success: true,
      imageUrl: normalizedDataUrl,
      fileName,
      info: {
        targetColor,
        steps: ['去背景', '单色化', '扁平化'],
      },
    });
  } catch (error) {
    console.error('Logo normalize error:', error);
    res.status(500).json({ success: false, error: 'Failed to normalize logo: ' + (error as Error).message });
  } finally {
    [inputPath, outputPath].filter(Boolean).forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }
});

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

const buildVisionImageInputs = (images: Array<{ src?: string }>) => {
  return images
    .filter((item) => typeof item.src === 'string' && item.src.startsWith('data:image/'))
    .map((item) => ({
      type: 'image_url' as const,
      image_url: {
        url: item.src as string,
      },
    }));
};

router.post('/clarify-reference-intent', async (req, res) => {
  try {
    const aiSettings = getAiSettings();
    const resolvedApiKey = aiSettings.canvasApiKey || process.env.OPENAI_API_KEY || '';
    const resolvedBaseUrl = aiSettings.canvasBaseUrl || process.env.OPENAI_API_BASE_URL;

    if (!resolvedApiKey) {
      return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const { prompt = '', messages = [], referenceImages = [] } = req.body as {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
      referenceImages?: Array<{ id: string; name: string; src: string }>;
    };

    if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
      return res.status(400).json({ success: false, error: 'Reference images are required' });
    }

    const openai = new OpenAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl || undefined,
    });

    const systemPrompt = `你是一个保护垫设计助手，负责在“用户上传了参考图，但需求不够明确”时，先结合参考图视觉内容，再生成一句简短自然的中文追问。

只返回 JSON，不要 markdown，不要解释。

输出格式：
{
  "question": "一句自然追问",
  "suggestions": ["建议1", "建议2", "建议3"],
  "exampleInput": "一句示例输入"
}

规则：
- question 只要 1 句话，简洁自然
- suggestions 2 到 4 条
- suggestions 必须围绕“保留版式改字 / 参考风格重做 / 提取文字后修改 / 只参考配色排版”这几类意图
- exampleInput 只输出 1 句
- 必须先查看参考图再回答，不要只根据文件名猜测
- 不要承诺已经识别出图片全部内容，不要编造图片细节`;

    const visionInputs = buildVisionImageInputs(referenceImages);

    const response = await openai.chat.completions.create({
      model: aiSettings.canvasModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: Math.min(aiSettings.canvasTemperature, 0.6),
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: `用户当前输入：${String(prompt || '（空）')}
最近对话：${JSON.stringify(messages.slice(-6))}
参考图数量：${referenceImages.length}
请先查看这些参考图，再判断用户当前更像想保留排版、参考风格、提取文字后重做，还是只参考配色与布局。`,
            },
            ...visionInputs,
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const parsed = extractJsonObject(content);

    res.json({
      success: true,
      question: typeof parsed.question === 'string' ? parsed.question : '我识别到你上传了一张参考图。你是想保留版式改文字，还是参考这个风格重新生成一版？',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4).map((item) => String(item)) : ['保留版式，只改文字', '参考这个风格重新生成', '提取图中文字后让我修改'],
      exampleInput: typeof parsed.exampleInput === 'string' ? parsed.exampleInput : '例如：把公司名称改成“爱家空间设计”，电话改成“15715987903”，其他尽量不变。',
    });
  } catch (error) {
    console.error('Clarify reference intent error:', error);
    res.status(500).json({ success: false, error: 'Failed to clarify reference intent: ' + (error as Error).message });
  }
});

router.post('/prepare-from-reference', async (req, res) => {
  try {
    const aiSettings = getAiSettings();
    const resolvedApiKey = aiSettings.canvasApiKey || process.env.OPENAI_API_KEY || '';
    const resolvedBaseUrl = aiSettings.canvasBaseUrl || process.env.OPENAI_API_BASE_URL;

    if (!resolvedApiKey) {
      return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const { prompt = '', messages = [], referenceImages = [] } = req.body as {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
      referenceImages?: Array<{ id: string; name: string; src: string }>;
    };

    if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
      return res.status(400).json({ success: false, error: 'Reference images are required' });
    }

    const openai = new OpenAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl || undefined,
    });

    const systemPrompt = `你是一个保护垫设计前置整理助手。你的职责不是直接出图，而是先查看参考图，提取其中可见的主要文案、信息层级、配色和版式特征，然后整理成一段“可让用户继续编辑后再发送”的中文设计提示词。

只返回 JSON，不要 markdown，不要解释。

输出格式：
{
  "summary": "一句提示用户可继续编辑后再发送的中文说明",
  "preparedPrompt": "一段完整、可编辑、适合继续生成保护垫设计图的中文提示词",
  "extractedTexts": ["提取到的关键文字1", "提取到的关键文字2"]
}

规则：
- summary 要明确告诉用户：我已帮你整理成可编辑提示词，请修改确认后再点击发送
- preparedPrompt 必须是面向“生成保护垫设计图”的完整中文提示词，而不是分析报告
- preparedPrompt 应尽量结构化，适合用户直接在输入框继续修改
- 如果图片中有标题、副标题、电话、安全提示、色标说明等，应尽量整理出来
- 如果某些文字看不清，可以用“待确认”或“请补充”表达，不要编造
- extractedTexts 仅返回识别到的关键文案片段，数量控制在 3 到 12 条`;

    const visionInputs = buildVisionImageInputs(referenceImages);

    const response = await openai.chat.completions.create({
      model: aiSettings.canvasModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: Math.min(aiSettings.canvasTemperature, 0.5),
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: `用户当前目标：${String(prompt || '提取图中文字后重新制作新设计')}
最近对话：${JSON.stringify(messages.slice(-6))}
请先查看参考图，再整理成一份可直接回填到输入框的保护垫设计提示词。`,
            },
            ...visionInputs,
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const parsed = extractJsonObject(content);

    res.json({
      success: true,
      summary: typeof parsed.summary === 'string'
        ? parsed.summary
        : '我已根据参考图提取并整理出一版设计说明，你可以先修改文字，再点击发送生成。',
      preparedPrompt: typeof parsed.preparedPrompt === 'string'
        ? parsed.preparedPrompt
        : '请根据参考图中的主要文案和版式信息，重新设计一款保护垫效果图。请补充尺寸、底色、标题文案、电话与安全提示等信息后再生成。',
      extractedTexts: Array.isArray(parsed.extractedTexts)
        ? parsed.extractedTexts.slice(0, 12).map((item) => String(item))
        : [],
    });
  } catch (error) {
    console.error('Prepare from reference error:', error);
    res.status(500).json({ success: false, error: 'Failed to prepare prompt from reference: ' + (error as Error).message });
  }
});

router.post('/tweak-layout', async (req, res) => {
  try {
    const aiSettings = getAiSettings();
    const resolvedApiKey = aiSettings.canvasApiKey || process.env.OPENAI_API_KEY || '';
    const resolvedBaseUrl = aiSettings.canvasBaseUrl || process.env.OPENAI_API_BASE_URL;

    if (!resolvedApiKey) {
      return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const { prompt, draft } = req.body as { prompt?: string; draft?: unknown };
    if (!prompt || !draft) {
      return res.status(400).json({ success: false, error: 'Prompt and draft are required' });
    }

    const openai = new OpenAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl || undefined,
    });

    const tweakSystemPrompt = `你是保护垫设计微调助手。你的任务不是重新生成整张设计，而是根据用户的中文微调指令，返回一个 JSON patch 列表。

只返回 JSON，不要 markdown，不要解释。

## targetRole 可选值
- logo
- title
- subtitle
- hotline
- safety
- accentBar
- bodyText
- image

## action 可选值
- move
- resize
- recolor
- restyle

## 规则
- dx/dy/dw/dh 为相对安全区域 0~1 的增量
- “一点”通常使用 0.02~0.04
- “更大一点”通常 dw=0.04~0.08, dh=0.02~0.04
- 如果用户要求更像示例图，可以组合多个 patch
- restyle 可使用 fontSize / fontWeight / textAlign / letterSpacing / backgroundColor / color
- 不要返回多余字段

## 输出格式
{
  "reply": "一句简短中文说明",
  "patches": [
    { "targetRole": "logo", "action": "move", "dx": 0.03, "dy": 0 }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: aiSettings.canvasModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: Math.min(aiSettings.canvasTemperature, 0.4),
      messages: [
        { role: 'system', content: tweakSystemPrompt },
        {
          role: 'user',
          content: `当前草稿：${JSON.stringify(draft)}\n\n用户微调要求：${prompt}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const parsed = extractJsonObject(content);

    res.json({
      success: true,
      patches: Array.isArray(parsed.patches) ? parsed.patches : [],
      reply: typeof parsed.reply === 'string' ? parsed.reply : '已按要求生成微调建议。',
    });
  } catch (error) {
    console.error('Tweak layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to tweak layout: ' + (error as Error).message });
  }
});

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

    const { prompt, messages = [], images = [], referenceImages = [] } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    let enhancedPrompt = prompt;
    if (images.length > 0) {
      const imageNames = images.map((img: { id: string; name: string }) => img.name).join('、');
      enhancedPrompt = `用户已上传图片素材：${imageNames}。${prompt}。如果用户需要在画布上添加图片logo或其他图片元素，请在设计方案中添加type为"image"的元素。`;
    }

    if (referenceImages.length > 0) {
      enhancedPrompt = `用户还上传了 ${referenceImages.length} 张参考图，请你务必先理解参考图中的版式、配色、层级、文案结构与视觉风格，再结合用户要求生成新的画布草稿。若用户要求“提取图中的文字，重新设计排版”，请基于参考图视觉内容提炼核心文案和信息层级后再重构版式；不要忽略参考图，也不要只按通用模板臆造内容。\n\n${enhancedPrompt}`;
    }

    enhancedPrompt = `${enhancedPrompt}\n\n重要规则：凡是“底部印刷校对提示 / 温馨提示 / 校对提示 / 色标说明 / 材料颜色 / 印刷颜色”相关内容，都不能放入 draft.elements，也不能放在画布内框中；必须放到 draft.bottomMeta 中。其中 proofingNote 放左侧底部外框区域，colorLegend 放右侧底部外框区域。若返回中仍把这些内容写进 elements，视为不符合要求。`;

    const referenceVisionInputs = buildVisionImageInputs(referenceImages);

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
        {
          role: 'user',
          content: referenceVisionInputs.length > 0
            ? [
                {
                  type: 'text' as const,
                  text: enhancedPrompt,
                },
                ...referenceVisionInputs,
              ]
            : enhancedPrompt,
        },
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