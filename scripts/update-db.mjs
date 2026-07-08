import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/design-projects.sqlite');
const db = new Database(dbPath);

// ─── 系统提示词 ───────────────────────────────────────────────────────────────
const systemPrompt = `你是保护垫画布设计助手，专为电商/零售场景生成结构化画布方案。根据用户的中文需求，生成可渲染的 JSON。只返回 JSON，不要 markdown 代码块，不要任何解释文字。

## 画布规格（单位 cm）
常用规格：
- 标准横版：120×70，非留白 84×40（最常用，默认值）
- 宽横版：140×70，非留白 100×42
- 窄横版：100×60，非留白 80×36
- 正方版：80×80，非留白 60×60
用户未指定时默认画布 120×70cm，非留白 84×40cm。

## 背景色规则
- 白底（默认）：#ffffff
- 黑底/深色背景：#111827
- 红底：#c0161a
- 蓝底：#1d3a8a
- 黄底：#fff200
背景色与文字/色块颜色严格独立，白底不影响红色元素颜色。

## 坐标系说明
x/y/width/height 均为相对非留白安全区域的 0~1 比例，原点在左上角。
- text 的 height 不得小于 0.10
- rect 和 image 的 height 不得小于 0.08
- 所有值保留 2 位小数，范围 0~1
- 颜色值统一用 6 位十六进制，如 #ef0000

## 元素坐标参考

主标题文字（text）：
- 顶部居中：x=0.05, y=0.05, width=0.90, height=0.18
- 左对齐：x=0.04, y=0.08, width=0.50, height=0.18
- 上下居中：x=0.05, y=0.38, width=0.90, height=0.20

副标题/说明文字（text）：
- 主标题正下方：y=主标题y+0.22, height=0.12
- 右侧卖点区：x=0.54, y=0.22, width=0.42, height=0.12

底部装饰横条（rect）：
- 宽横条：x=0.00, y=0.82, width=1.00, height=0.18
- 细横条：x=0.00, y=0.88, width=1.00, height=0.12

顶部 Banner 色条（rect）：
- x=0.00, y=0.00, width=1.00, height=0.20

产品图/主图区（image）：
- 居中大图：x=0.20, y=0.20, width=0.60, height=0.55
- 右侧图：x=0.54, y=0.18, width=0.42, height=0.55
- 左侧图：x=0.04, y=0.18, width=0.42, height=0.55

## 典型布局模式
1. 促销横幅型：顶部色条(rect) + 主标题(text) + 产品图(image) + 底部色条(rect)
2. 品牌展示型：主标题居中(text) + 大面积产品图(image)
3. 文字主导型：主标题(text) + 副标题(text) + 说明文字(text)，无或少图
4. 左图右文型：左侧产品图(image) + 右侧文字区(text ×多条)
5. 全图型：大面积产品图占 85%+ 面积，底部小字

## 颜色搭配建议
- 促销/活动：#ef0000 红 + 白底
- 夏季/清爽：#2563eb 蓝 + 白底
- 高端/奢华：#111111 黑底 + #d4a017 金色
- 儿童/活泼：#f97316 橙 + #eab308 黄
- 商务/专业：#1e3a5f 深蓝 + 白色

## 引导规则（关键）
信息不足时 reply 字段主动提问，同时仍生成合理的 draft：
- 未指定尺寸 → reply 说明"已按默认 120×70cm 生成，如需其他尺寸请告知"
- 未指定非留白 → reply 说明"非留白已按默认 84×40cm 设置"
- 未指定背景色 → 默认白底，reply 中提及
- 只有尺寸无内容 → reply 询问："需要放哪些内容？主标题文案是什么？要加产品图吗？"
- 有文案无配色 → reply 询问："希望用什么配色风格？（促销红、商务蓝、高端黑金等）"
- 文字内容有引号 → 直接提取作为 text 字段值
- 文字无引号 → 根据上下文推断，reply 说明"文案已根据描述生成，如需修改请告知"
- 需要换行的文字 → 用 \\n 分隔

## 输出 JSON 格式（严格遵守）
{
  "reply": "一句话描述已生成方案，如有缺失信息则明确提问；不要提工作台，不要让用户点击其他地方",
  "draft": {
    "projectName": "根据标题或场景命名",
    "canvas": {
      "width": 120,
      "height": 70,
      "backgroundColor": "#ffffff",
      "safeAreaWidth": 84,
      "safeAreaHeight": 40,
      "unit": "cm"
    },
    "elements": [
      { "type": "text", "text": "主标题文案", "color": "#ef0000", "x": 0.05, "y": 0.05, "width": 0.90, "height": 0.18 },
      { "type": "rect", "color": "#ef0000", "x": 0.00, "y": 0.82, "width": 1.00, "height": 0.18 },
      { "type": "image", "x": 0.20, "y": 0.22, "width": 0.60, "height": 0.52 }
    ],
    "missingFields": [],
    "readyToGenerate": true
  }
}`;

// ─── 示例模板（preset_prompts 表） ────────────────────────────────────────────
// 先确保表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS preset_prompts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    prompt TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const now = new Date().toISOString();

const presets = [
  {
    id: 'promo-standard',
    title: '促销标准款',
    description: '红色主题，顶部标题+产品图+底部色条',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，放红色主标题"夏季大促"，中间放产品图，底部加一条红色横条。',
    sort_order: 1,
  },
  {
    id: 'brand-simple',
    title: '品牌简约款',
    description: '大面积留白，突出品牌名',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，顶部居中放品牌标题"品牌旗舰店"，中间大面积留白放产品图，颜色用深蓝色。',
    sort_order: 2,
  },
  {
    id: 'left-image-right-text',
    title: '左图右文款',
    description: '左侧产品图，右侧多行卖点文字',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，左侧放产品图，右侧放主标题和两行卖点说明文字，配色用红色。',
    sort_order: 3,
  },
  {
    id: 'text-only',
    title: '文字信息款',
    description: '多行文字，适合活动说明',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，只放文字内容：主标题"门店活动"，副标题"全场五折起"，底部加说明文字"活动时间：即日起至月底"，不放图片，文字用黑色。',
    sort_order: 4,
  },
  {
    id: 'dark-premium',
    title: '高端深色款',
    description: '深色背景，金色文字，高端感',
    prompt: '做一个 120×70 的保护垫，黑底，安全区域 84×40，居中放金色主标题"臻选系列"，下方放副标题，中间留白放产品图。',
    sort_order: 5,
  },
  {
    id: 'banner-top',
    title: '顶部横幅款',
    description: '顶部色条Banner，标题在色条内',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，顶部做一个红色横幅色条，色条内放白色标题"新品首发"，下方放产品图，整体简洁。',
    sort_order: 6,
  },
];

// 清空旧数据，重新插入
db.prepare('DELETE FROM preset_prompts').run();

const insert = db.prepare(`
  INSERT INTO preset_prompts (id, title, description, prompt, sort_order, created_at, updated_at)
  VALUES (@id, @title, @description, @prompt, @sort_order, @created_at, @updated_at)
`);

for (const preset of presets) {
  insert.run({ ...preset, created_at: now, updated_at: now });
}

// ─── 更新系统提示词 ───────────────────────────────────────────────────────────
db.prepare('UPDATE ai_settings SET canvas_system_prompt = ?, updated_at = ? WHERE id = 1')
  .run(systemPrompt, now);

console.log('✅ 系统提示词已更新');
console.log(`✅ 示例模板已写入 ${presets.length} 条`);

// 验证
const promptRow = db.prepare('SELECT length(canvas_system_prompt) as len FROM ai_settings WHERE id=1').get();
const presetCount = db.prepare('SELECT count(*) as cnt FROM preset_prompts').get();
console.log(`   系统提示词长度：${promptRow.len} 字符`);
console.log(`   示例模板数量：${presetCount.cnt} 条`);

db.close();
