import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../data');

interface PromptItem {
  id: string;
  name: string;
  content: string;
  category: string;
  createdAt: string;
}

const getPrompts = (): PromptItem[] => {
  const filePath = path.join(dataDir, 'prompts.json');
  if (!fs.existsSync(filePath)) {
    return [
      {
        id: '1',
        name: '现代简约风格',
        content: 'Modern minimalist interior design, clean lines, neutral colors, professional photography style',
        category: '风格',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        name: '北欧风格',
        content: 'Scandinavian interior design, bright and airy, wooden elements, cozy atmosphere, professional photography',
        category: '风格',
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        name: '真实质感',
        content: 'Realistic texture rendering, high detail, 8K resolution, photorealistic, professional lighting',
        category: '效果',
        createdAt: new Date().toISOString(),
      },
      {
        id: '4',
        name: '保护垫特写',
        content: 'Close-up view of floor protection mat, showing texture and pattern clearly, realistic material rendering',
        category: '视角',
        createdAt: new Date().toISOString(),
      },
      {
        id: '5',
        name: '整体空间',
        content: 'Full room view, showing floor protection mat in context of the entire space, architectural photography',
        category: '视角',
        createdAt: new Date().toISOString(),
      },
    ];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const savePrompts = (data: PromptItem[]) => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dataDir, 'prompts.json'), JSON.stringify(data, null, 2));
};

router.get('/', (req, res) => {
  try {
    const prompts = getPrompts();
    res.json({ prompts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prompts' });
  }
});

router.post('/', (req, res) => {
  try {
    const { id, name, content, category } = req.body;
    const prompts = getPrompts();

    if (id) {
      const index = prompts.findIndex(p => p.id === id);
      if (index !== -1) {
        prompts[index] = { ...prompts[index], name, content, category };
      }
    } else {
      const newPrompt: PromptItem = {
        id: Date.now().toString(),
        name,
        content,
        category,
        createdAt: new Date().toISOString(),
      };
      prompts.push(newPrompt);
    }

    savePrompts(prompts);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const prompts = getPrompts().filter(p => p.id !== id);
    savePrompts(prompts);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

export default router;