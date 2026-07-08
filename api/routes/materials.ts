import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = express.Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
const dataDir = './data';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type === 'pattern' ? 'patterns' : 'spaces';
    const dir = path.join(uploadDir, type);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

interface MaterialItem {
  id: string;
  name: string;
  url: string;
  type: 'pattern' | 'space';
  createdAt: string;
}

const getMaterials = (): { patterns: MaterialItem[]; spaces: MaterialItem[] } => {
  const filePath = path.join(dataDir, 'materials.json');
  if (!fs.existsSync(filePath)) {
    return { patterns: [], spaces: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const saveMaterials = (data: { patterns: MaterialItem[]; spaces: MaterialItem[] }) => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dataDir, 'materials.json'), JSON.stringify(data, null, 2));
};

router.get('/', (req, res) => {
  try {
    const materials = getMaterials();
    res.json(materials);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get materials' });
  }
});

router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const type = (req.body.type as 'pattern' | 'space') || 'pattern';
    const name = req.body.name || req.file.originalname;
    const url = `/uploads/${type}/${req.file.filename}`;

    const materials = getMaterials();
    const newItem: MaterialItem = {
      id: Date.now().toString(),
      name,
      url,
      type,
      createdAt: new Date().toISOString(),
    };

    if (type === 'pattern') {
      materials.patterns.push(newItem);
    } else {
      materials.spaces.push(newItem);
    }

    saveMaterials(materials);
    res.json(newItem);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload material' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const materials = getMaterials();
    
    materials.patterns = materials.patterns.filter(item => item.id !== id);
    materials.spaces = materials.spaces.filter(item => item.id !== id);
    
    saveMaterials(materials);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

export default router;