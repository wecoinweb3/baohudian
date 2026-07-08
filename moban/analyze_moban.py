"""
保护垫模板图片精细分析脚本
分析 moban/1.jpg, 2.jpg, 3.png, 4.png
"""

import os
import sys
import numpy as np
from PIL import Image, ImageStat

# ── 路径 ──────────────────────────────────────────────────────────────────────
BASE_DIR = r"e:\code\company\baohudian\moban"
FILES = ["1.jpg", "2.jpg", "3.png", "4.png"]

# ── OCR 初始化（easyocr 中英文）────────────────────────────────────────────────
try:
    import easyocr
    print("初始化 easyocr（首次可能较慢）...")
    reader = easyocr.Reader(['ch_sim', 'en'], gpu=False, verbose=False)
    OCR_AVAILABLE = True
    print("easyocr 加载成功\n")
except Exception as e:
    OCR_AVAILABLE = False
    print(f"easyocr 不可用: {e}\n")


# ══════════════════════════════════════════════════════════════════════════════
def rgb_name(r, g, b):
    """给 RGB 颜色起个大致名字"""
    if r > 240 and g > 240 and b > 240:
        return "白色"
    if r < 30 and g < 30 and b < 30:
        return "黑色"
    if r > 200 and g < 80 and b < 80:
        return "红色"
    if r < 80 and g > 150 and b < 80:
        return "绿色"
    if r < 80 and g < 80 and b > 150:
        return "蓝色"
    if r > 180 and g > 180 and b < 80:
        return "黄色"
    if r > 200 and g > 100 and b < 80:
        return "橙色"
    if r > 80 and g < 50 and b > 80:
        return "紫色"
    if r > 150 and g > 150 and b > 150:
        return f"浅灰(#{r:02x}{g:02x}{b:02x})"
    if r > 80 and g > 80 and b > 80:
        return f"中灰(#{r:02x}{g:02x}{b:02x})"
    return f"深色(#{r:02x}{g:02x}{b:02x})"


def analyze_image(path):
    img = Image.open(path).convert("RGB")
    arr = np.array(img)
    W, H = img.size
    print(f"\n{'='*70}")
    print(f"图片: {os.path.basename(path)}  |  尺寸: {W}×{H} px")
    print(f"{'='*70}")

    # ── 1. OCR ────────────────────────────────────────────────────────────────
    print("\n【任务1 · OCR 文字识别】")
    if OCR_AVAILABLE:
        try:
            results = reader.readtext(path, detail=1)
            if results:
                print(f"  识别到 {len(results)} 个文字区域:")
                for bbox, text, conf in results:
                    xs = [p[0] for p in bbox]
                    ys = [p[1] for p in bbox]
                    cx, cy = int(np.mean(xs)), int(np.mean(ys))
                    print(f"    「{text}」  置信度:{conf:.2f}  中心:({cx},{cy})"
                          f"  位置比例:({cx/W:.2%},{cy/H:.2%})")
            else:
                print("  未识别到文字")
        except Exception as e:
            print(f"  OCR 出错: {e}")
    else:
        print("  OCR 不可用，跳过")

    # ── 2. 20×20 网格分析 ──────────────────────────────────────────────────────
    print("\n【任务2 · 20×20 网格分析】")
    GRID = 20
    cw = W / GRID
    ch = H / GRID
    grid_info = []  # (row, col, mean_r, mean_g, mean_b, variance)

    pure_blocks = []   # 方差 < 500
    active_blocks = [] # 方差 > 5000
    white_blocks = []  # 均值 > 240

    for row in range(GRID):
        for col in range(GRID):
            x0, y0 = int(col * cw), int(row * ch)
            x1, y1 = int((col+1)*cw), int((row+1)*ch)
            patch = arr[y0:y1, x0:x1]
            m = patch.mean(axis=(0,1))
            v = float(patch.astype(float).var())
            mr, mg, mb = float(m[0]), float(m[1]), float(m[2])
            grid_info.append((row, col, mr, mg, mb, v))

            if v < 500:
                pure_blocks.append((row, col, mr, mg, mb, v))
            if v > 5000:
                active_blocks.append((row, col, mr, mg, mb, v))
            if (mr+mg+mb)/3 > 240:
                white_blocks.append((row, col, mr, mg, mb, v))

    print(f"  纯色单元 (方差<500): {len(pure_blocks)} 个")
    if pure_blocks:
        # 按颜色聚合
        color_groups = {}
        for r, c, mr, mg, mb, v in pure_blocks:
            key = rgb_name(int(mr), int(mg), int(mb))
            color_groups.setdefault(key, []).append((r, c))
        for col_name, cells in color_groups.items():
            rows = sorted(set(r for r,_ in cells))
            cols = sorted(set(c for _,c in cells))
            print(f"    {col_name}: {len(cells)}个单元, 行{rows[0]+1}-{rows[-1]+1}, 列{cols[0]+1}-{cols[-1]+1}")

    print(f"  高频变化单元 (方差>5000): {len(active_blocks)} 个")
    if active_blocks:
        top = sorted(active_blocks, key=lambda x: -x[5])[:5]
        for r, c, mr, mg, mb, v in top:
            print(f"    行{r+1} 列{c+1}: 方差={v:.0f}, 均值RGB=({mr:.0f},{mg:.0f},{mb:.0f})")

    print(f"  近白色留白单元 (均值>240): {len(white_blocks)} 个")

    # ── 3. 边界检测 ───────────────────────────────────────────────────────────
    print("\n【任务3 · 边界检测】")

    # 灰度图
    gray = np.array(img.convert("L"))

    # 白色边框检测（行/列均值>245）
    row_means = gray.mean(axis=1)
    col_means = gray.mean(axis=0)

    top_margin = 0
    for i, v in enumerate(row_means):
        if v > 245:
            top_margin = i + 1
        else:
            break
    bottom_margin = 0
    for i, v in enumerate(row_means[::-1]):
        if v > 245:
            bottom_margin = i + 1
        else:
            break
    left_margin = 0
    for i, v in enumerate(col_means):
        if v > 245:
            left_margin = i + 1
        else:
            break
    right_margin = 0
    for i, v in enumerate(col_means[::-1]):
        if v > 245:
            right_margin = i + 1
        else:
            break

    print(f"  白色边框: 上={top_margin}px({top_margin/H:.1%}) 下={bottom_margin}px({bottom_margin/H:.1%})"
          f" 左={left_margin}px({left_margin/W:.1%}) 右={right_margin}px({right_margin/W:.1%})")

    # 主要非白色区域 bounding box
    # 找非白色像素 (灰度<230)
    mask = gray < 230
    rows_nw = np.where(mask.any(axis=1))[0]
    cols_nw = np.where(mask.any(axis=0))[0]
    if len(rows_nw) > 0 and len(cols_nw) > 0:
        bb_top, bb_bot = int(rows_nw[0]), int(rows_nw[-1])
        bb_left, bb_right = int(cols_nw[0]), int(cols_nw[-1])
        bb_w = bb_right - bb_left
        bb_h = bb_bot - bb_top
        print(f"  主内容 BoundingBox: ({bb_left},{bb_top})-({bb_right},{bb_bot})")
        print(f"    宽度:{bb_w}px({bb_w/W:.1%}) 高度:{bb_h}px({bb_h/H:.1%})")
        print(f"    中心:({(bb_left+bb_right)//2},{(bb_top+bb_bot)//2})")

    # 条状/对角线检测
    # 按行/列扫描纯色连续带
    print("  色带检测:")
    # 横条：整行平均方差<100
    hbands = []
    for i in range(H):
        row_patch = arr[i, :, :]
        if row_patch.astype(float).var() < 100:
            hbands.append(i)
    if hbands:
        # 找连续段
        segments = []
        start = hbands[0]
        prev = hbands[0]
        for idx in hbands[1:]:
            if idx - prev > 5:
                segments.append((start, prev))
                start = idx
            prev = idx
        segments.append((start, prev))
        for s, e in segments:
            thickness = e - s + 1
            mid_row = (s + e) // 2
            col_rgb = arr[mid_row, W//2].tolist()
            print(f"    横条: y={s}-{e} (厚度{thickness}px, {thickness/H:.1%}) "
                  f"颜色RGB{col_rgb} {rgb_name(*col_rgb)}")

    # 竖条：整列平均方差<100
    vbands = []
    for i in range(W):
        col_patch = arr[:, i, :]
        if col_patch.astype(float).var() < 100:
            vbands.append(i)
    if vbands:
        segments = []
        start = vbands[0]
        prev = vbands[0]
        for idx in vbands[1:]:
            if idx - prev > 5:
                segments.append((start, prev))
                start = idx
            prev = idx
        segments.append((start, prev))
        for s, e in segments:
            thickness = e - s + 1
            mid_col = (s + e) // 2
            row_rgb = arr[H//2, mid_col].tolist()
            print(f"    竖条: x={s}-{e} (厚度{thickness}px, {thickness/W:.1%}) "
                  f"颜色RGB{row_rgb} {rgb_name(*row_rgb)}")

    # ── 4. 颜色区域汇总 ───────────────────────────────────────────────────────
    print("\n【任务4 · 颜色区域汇总（视觉布局）】")

    # 将图片分成上中下、左中右 3×3 九宫格，分析每区颜色
    thirds_w = [0, W//3, 2*W//3, W]
    thirds_h = [0, H//3, 2*H//3, H]
    pos_names = [
        ["左上角", "上方中央", "右上角"],
        ["左侧中部", "正中央", "右侧中部"],
        ["左下角", "下方中央", "右下角"],
    ]
    print("  九宫格颜色分布:")
    for ri in range(3):
        for ci in range(3):
            x0_, x1_ = thirds_w[ci], thirds_w[ci+1]
            y0_, y1_ = thirds_h[ri], thirds_h[ri+1]
            patch = arr[y0_:y1_, x0_:x1_]
            mean_rgb = patch.mean(axis=(0,1))
            mr_, mg_, mb_ = int(mean_rgb[0]), int(mean_rgb[1]), int(mean_rgb[2])
            var_ = float(patch.astype(float).var())
            name_ = rgb_name(mr_, mg_, mb_)
            complexity = "纯色/留白" if var_ < 500 else ("高复杂" if var_ > 5000 else "中等复杂")
            print(f"    {pos_names[ri][ci]:8s}: {name_:20s} 方差={var_:7.0f} ({complexity})")

    # 整体背景色（取图片四角均值）
    corners = [
        arr[0, 0].tolist(), arr[0, -1].tolist(),
        arr[-1, 0].tolist(), arr[-1, -1].tolist()
    ]
    corner_avg = [int(np.mean([c[i] for c in corners])) for i in range(3)]
    print(f"  四角均值颜色: RGB{corner_avg} → {rgb_name(*corner_avg)}")

    # 最常见颜色（量化到32步）
    flat = arr.reshape(-1, 3) // 32 * 32
    unique, counts = np.unique(flat, axis=0, return_counts=True)
    top_colors = sorted(zip(counts, unique.tolist()), reverse=True)[:5]
    print("  最常见颜色 Top5:")
    for cnt, rgb_val in top_colors:
        pct = cnt / (W * H) * 100
        print(f"    RGB≈{rgb_val}  {rgb_name(*rgb_val)}  占比:{pct:.1f}%")


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    for fname in FILES:
        fpath = os.path.join(BASE_DIR, fname)
        if not os.path.exists(fpath):
            print(f"\n文件不存在: {fpath}")
            continue
        try:
            analyze_image(fpath)
        except Exception as e:
            print(f"\n分析 {fname} 时出错: {e}")
            import traceback
            traceback.print_exc()

    print("\n\n分析完成！")
