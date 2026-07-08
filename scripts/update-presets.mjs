import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/design-projects.sqlite');
const db = new Database(dbPath);

// 确保表有 thumbnail_url 列
const columns = db.prepare('PRAGMA table_info(preset_prompts)').all().map(c => c.name);
if (!columns.includes('thumbnail_url')) {
  db.exec('ALTER TABLE preset_prompts ADD COLUMN thumbnail_url TEXT NOT NULL DEFAULT ""');
  console.log('✅ 已添加 thumbnail_url 列');
}

const now = new Date().toISOString();

// 清空旧数据，写入与 moban 图片对应的 4 条模板
db.prepare('DELETE FROM preset_prompts').run();

const presets = [
  {
    id: 'promo-red-standard',
    title: '促销红色款',
    description: '白底+红色标题+产品图，电商促销经典搭配',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，顶部放红色主标题"活动专享"，中间放产品图，底部加一条红色横条。',
    thumbnail_url: '/moban/1.jpg',
    sort_order: 1,
  },
  {
    id: 'promo-yellow-triple',
    title: '活力黄色款',
    description: '黄色主体三段式布局，视觉冲击力强',
    prompt: '做一个 120×70 的保护垫，黄色背景，安全区域 84×40，顶部和底部加白色横条，中间放产品主图，整体黄白配色，活泼醒目。',
    thumbnail_url: '/moban/2.jpg',
    sort_order: 2,
  },
  {
    id: 'orange-asymmetric',
    title: '橙色斜切款',
    description: '白底+橙色色块，非对称动感布局',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，右下角放大面积橙色色块作为背景装饰，左侧放产品图，右侧放白色标题文字，橙白对比鲜明。',
    thumbnail_url: '/moban/3.png',
    sort_order: 3,
  },
  {
    id: 'minimal-square-red',
    title: '极简方形款',
    description: '大面积留白，红色点缀，高端简约风',
    prompt: '做一个 80×80 的方形保护垫，白底，安全区域 60×60，画面极简，左侧放产品图，右下角放小块红色色条和简短说明文字，留白充足，高端感强。',
    thumbnail_url: '/moban/4.png',
    sort_order: 4,
  },
];

const insert = db.prepare(`
  INSERT INTO preset_prompts (id, title, description, prompt, thumbnail_url, sort_order, created_at, updated_at)
  VALUES (@id, @title, @description, @prompt, @thumbnail_url, @sort_order, @created_at, @updated_at)
`);

for (const preset of presets) {
  insert.run({ ...preset, created_at: now, updated_at: now });
}

console.log(`✅ 已写入 ${presets.length} 条模板（含缩略图路径）`);

// 验证
const rows = db.prepare('SELECT id, title, thumbnail_url FROM preset_prompts ORDER BY sort_order').all();
rows.forEach(r => console.log(`   ${r.id}: ${r.title} → ${r.thumbnail_url}`));

db.close();
