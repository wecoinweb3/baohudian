#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
深度分析 moban 目录下的4张图片
"""
from PIL import Image
import numpy as np
import os
import collections

def rgb_to_hex(r, g, b):
    return f"#{r:02X}{g:02X}{b:02X}"

def get_dominant_color(pixels):
    """获取像素区域的主色（取均值）"""
    if len(pixels) == 0:
        return (0, 0, 0)
    arr = np.array(pixels)
    mean = arr.mean(axis=0)
    return tuple(int(x) for x in mean[:3])

def detect_white_border(img_array, threshold=240):
    """检测白色留白边框，返回(top, bottom, left, right)像素数"""
    h, w = img_array.shape[:2]
    
    def is_white_row(row):
        return np.all(row[:, :3] >= threshold)
    
    def is_white_col(col):
        return np.all(col[:, :3] >= threshold)
    
    top = 0
    for i in range(h):
        if is_white_row(img_array[i]):
            top += 1
        else:
            break
    
    bottom = 0
    for i in range(h-1, -1, -1):
        if is_white_row(img_array[i]):
            bottom += 1
        else:
            break
    
    left = 0
    for j in range(w):
        if is_white_col(img_array[:, j]):
            left += 1
        else:
            break
    
    right = 0
    for j in range(w-1, -1, -1):
        if is_white_col(img_array[:, j]):
            right += 1
        else:
            break
    
    return top, bottom, left, right

def analyze_region_color(img_array):
    """分析区域颜色，返回(主色RGB, 十六进制, 色调描述)"""
    if img_array.size == 0:
        return (0,0,0), "#000000", "空"
    flat = img_array[:, :, :3].reshape(-1, 3)
    mean = flat.mean(axis=0)
    r, g, b = int(mean[0]), int(mean[1]), int(mean[2])
    hex_color = rgb_to_hex(r, g, b)
    
    # 色调描述
    brightness = (r + g + b) / 3
    if brightness > 230:
        tone = "接近白色"
    elif brightness > 180:
        tone = "浅色"
    elif brightness > 100:
        tone = "中等亮度"
    else:
        tone = "深色/暗色"
    
    # 主要色相
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    if max_c - min_c < 20:
        if brightness > 200:
            hue = "白/灰"
        elif brightness < 50:
            hue = "黑/深灰"
        else:
            hue = "灰色"
    elif r == max_c:
        hue = "红色系"
    elif g == max_c:
        hue = "绿色系"
    else:
        hue = "蓝色系"
    
    return (r, g, b), hex_color, f"{tone}/{hue}"

def analyze_grid(img_array, rows=10, cols=10):
    """10x10网格分析"""
    h, w = img_array.shape[:2]
    cell_h = h // rows
    cell_w = w // cols
    
    grid_results = []
    for i in range(rows):
        row_results = []
        for j in range(cols):
            y1 = i * cell_h
            y2 = (i+1) * cell_h if i < rows-1 else h
            x1 = j * cell_w
            x2 = (j+1) * cell_w if j < cols-1 else w
            
            cell = img_array[y1:y2, x1:x2, :3]
            flat = cell.reshape(-1, 3)
            mean = flat.mean(axis=0)
            r, g, b = int(mean[0]), int(mean[1]), int(mean[2])
            row_results.append({
                'rgb': (r, g, b),
                'hex': rgb_to_hex(r, g, b),
                'pos': (y1, y2, x1, x2)
            })
        grid_results.append(row_results)
    return grid_results

def find_color_blocks(grid_results, tolerance=30):
    """从网格中找出相似色块的聚集区域"""
    rows = len(grid_results)
    cols = len(grid_results[0])
    
    def color_similar(c1, c2):
        return all(abs(c1[k]-c2[k]) < tolerance for k in range(3))
    
    visited = [[False]*cols for _ in range(rows)]
    blocks = []
    
    for i in range(rows):
        for j in range(cols):
            if visited[i][j]:
                continue
            base_color = grid_results[i][j]['rgb']
            # BFS
            queue = [(i, j)]
            region = [(i, j)]
            visited[i][j] = True
            while queue:
                ci, cj = queue.pop(0)
                for di, dj in [(-1,0),(1,0),(0,-1),(0,1)]:
                    ni, nj = ci+di, cj+dj
                    if 0 <= ni < rows and 0 <= nj < cols and not visited[ni][nj]:
                        nc = grid_results[ni][nj]['rgb']
                        if color_similar(base_color, nc):
                            visited[ni][nj] = True
                            queue.append((ni, nj))
                            region.append((ni, nj))
            
            if len(region) >= 4:  # 至少4个格子才算色块
                min_r = min(r for r,c in region)
                max_r = max(r for r,c in region)
                min_c2 = min(c for r,c in region)
                max_c2 = max(c for r,c in region)
                # 计算该区域的平均颜色
                all_rgb = [grid_results[r][c]['rgb'] for r,c in region]
                avg_r = int(sum(x[0] for x in all_rgb)/len(all_rgb))
                avg_g = int(sum(x[1] for x in all_rgb)/len(all_rgb))
                avg_b = int(sum(x[2] for x in all_rgb)/len(all_rgb))
                blocks.append({
                    'color': (avg_r, avg_g, avg_b),
                    'hex': rgb_to_hex(avg_r, avg_g, avg_b),
                    'grid_range': (min_r, max_r, min_c2, max_c2),
                    'ratio': (min_r/10, (max_r+1)/10, min_c2/10, (max_c2+1)/10),
                    'cell_count': len(region)
                })
    
    # 按面积排序
    blocks.sort(key=lambda x: x['cell_count'], reverse=True)
    return blocks

def analyze_image(img_path):
    """完整分析一张图片"""
    print(f"\n{'='*70}")
    print(f"📷 分析图片: {os.path.basename(img_path)}")
    print(f"{'='*70}")
    
    img = Image.open(img_path)
    
    # 转为RGB（处理RGBA等格式）
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img_rgb = bg
        print(f"  原始模式: RGBA（已转为RGB，透明区域填白）")
    elif img.mode != 'RGB':
        img_rgb = img.convert('RGB')
        print(f"  原始模式: {img.mode}（已转为RGB）")
    else:
        img_rgb = img
        print(f"  原始模式: RGB")
    
    w, h = img_rgb.size
    img_array = np.array(img_rgb)
    
    # ── 1. 尺寸和宽高比 ─────────────────────────────────────────────────
    print(f"\n【1. 图片尺寸】")
    print(f"  尺寸: {w} × {h} 像素")
    from math import gcd
    g = gcd(w, h)
    print(f"  宽高比: {w//g}:{h//g}  ({w/h:.4f})")
    
    # ── 2. 白色留白检测 ───────────────────────────────────────────────────
    top, bottom, left, right = detect_white_border(img_array)
    safe_w = w - left - right
    safe_h = h - top - bottom
    safe_ratio = (safe_w * safe_h) / (w * h) * 100
    
    print(f"\n【2. 白色留白边框检测（阈值≥240）】")
    print(f"  上边框: {top}px ({top/h*100:.1f}%)")
    print(f"  下边框: {bottom}px ({bottom/h*100:.1f}%)")
    print(f"  左边框: {left}px ({left/w*100:.1f}%)")
    print(f"  右边框: {right}px ({right/w*100:.1f}%)")
    print(f"  安全区域: {safe_w} × {safe_h} px")
    print(f"  安全区域占比: {safe_ratio:.1f}%")
    
    # ── 3. 区域颜色分布 ───────────────────────────────────────────────────
    print(f"\n【3. 各区域颜色分布】")
    
    # 按高度分区
    top_region = img_array[:int(h*0.2), :, :]
    mid_region = img_array[int(h*0.2):int(h*0.7), :, :]
    bot_region = img_array[int(h*0.7):, :, :]
    
    for name, region in [("顶部(0-20%)", top_region), ("中部(20-70%)", mid_region), ("底部(70-100%)", bot_region)]:
        rgb, hex_c, desc = analyze_region_color(region)
        print(f"  {name}: RGB{rgb} {hex_c}  {desc}")
    
    # 左右分区
    left_region = img_array[:, :w//2, :]
    right_region = img_array[:, w//2:, :]
    l_rgb, l_hex, l_desc = analyze_region_color(left_region)
    r_rgb, r_hex, r_desc = analyze_region_color(right_region)
    print(f"\n  左半部分: RGB{l_rgb} {l_hex}  {l_desc}")
    print(f"  右半部分: RGB{r_rgb} {r_hex}  {r_desc}")
    diff = sum(abs(l_rgb[k]-r_rgb[k]) for k in range(3))
    print(f"  左右颜色差异值: {diff} (>30说明左右有明显差异)")
    
    # ── 4. 10×10 网格分析 ────────────────────────────────────────────────
    print(f"\n【4. 10×10 网格主色分析】")
    grid = analyze_grid(img_array)
    
    print(f"  格子大小: 约 {w//10} × {h//10} px")
    print(f"\n  网格颜色总览（行×列，显示十六进制色）：")
    for i, row in enumerate(grid):
        row_str = f"  行{i:2d}: "
        for cell in row:
            row_str += f"{cell['hex']} "
        print(row_str)
    
    # ── 5. 色块区域识别 ───────────────────────────────────────────────────
    print(f"\n【5. 主要色块区域识别】")
    blocks = find_color_blocks(grid, tolerance=35)
    
    if blocks:
        print(f"  发现 {len(blocks)} 个主要色块区域（按面积排序）：")
        for idx, blk in enumerate(blocks[:8], 1):  # 最多显示8个
            r0, r1, c0, c1 = blk['grid_range']
            yr0, yr1, xr0, xr1 = blk['ratio']
            cells = blk['cell_count']
            print(f"\n  色块{idx}: 颜色 RGB{blk['color']} {blk['hex']}")
            print(f"    网格范围: 行{r0}-{r1}, 列{c0}-{c1}")
            print(f"    位置比例: 高度 {yr0*100:.0f}%-{yr1*100:.0f}%, 宽度 {xr0*100:.0f}%-{xr1*100:.0f}%")
            print(f"    覆盖格子数: {cells}/100")
    else:
        print("  未发现明显的纯色块区域")
    
    # ── 6. 区域功能推断 ───────────────────────────────────────────────────
    print(f"\n【6. 区域功能推断】")
    
    # 基于颜色分布推断
    top_rgb, _, _ = analyze_region_color(top_region)
    mid_rgb, _, _ = analyze_region_color(mid_region)
    bot_rgb, _, _ = analyze_region_color(bot_region)
    
    def brightness(rgb):
        return sum(rgb) / 3
    
    def is_white_ish(rgb, t=230):
        return all(x >= t for x in rgb)
    
    def is_dark(rgb, t=80):
        return brightness(rgb) < t
    
    def is_colorful(rgb, sat_t=40):
        mx = max(rgb); mn = min(rgb)
        return mx - mn > sat_t
    
    inferences = []
    
    # 顶部推断
    if is_white_ish(top_rgb):
        inferences.append("顶部(0-20%): 白色/浅色区域 → 可能是留白、标题文字区或logo区")
    elif is_dark(top_rgb):
        inferences.append("顶部(0-20%): 深色区域 → 可能是深色背景标题栏或品牌色块")
    elif is_colorful(top_rgb):
        inferences.append("顶部(0-20%): 彩色区域 → 可能是品牌色背景标题区或图片区")
    else:
        inferences.append(f"顶部(0-20%): 中等色调 RGB{top_rgb} → 可能是背景色块或图片区域")
    
    # 中部推断
    if is_white_ish(mid_rgb):
        inferences.append("中部(20-70%): 白色/浅色 → 可能是主要文字内容区或产品图片区")
    elif is_colorful(mid_rgb):
        inferences.append("中部(20-70%): 彩色区域 → 可能是主视觉图片区或品牌色背景区")
    else:
        inferences.append(f"中部(20-70%): RGB{mid_rgb} → 主体内容区，颜色适中")
    
    # 底部推断
    if is_white_ish(bot_rgb):
        inferences.append("底部(70-100%): 白色/浅色 → 可能是价格标注区、二维码区或留白")
    elif is_dark(bot_rgb):
        inferences.append("底部(70-100%): 深色区域 → 可能是深色页脚、品牌标识或价格区")
    elif is_colorful(bot_rgb):
        inferences.append("底部(70-100%): 彩色 → 可能是促销色块、价格标签或底部装饰")
    else:
        inferences.append(f"底部(70-100%): RGB{bot_rgb} → 底部区域，中等色调")
    
    # 左右推断
    if diff > 50:
        inferences.append(f"左右差异明显(差值{diff}) → 左右分区布局，可能左侧文字右侧图片，或左侧图片右侧价格")
    elif diff > 20:
        inferences.append(f"左右有轻微差异(差值{diff}) → 可能有左右分栏设计")
    else:
        inferences.append(f"左右色调接近(差值{diff}) → 居中或对称布局")
    
    for inf in inferences:
        print(f"  • {inf}")
    
    # 综合判断
    print(f"\n  综合布局推断:")
    if top > h*0.05 or bottom > h*0.05 or left > w*0.05 or right > w*0.05:
        print(f"  → 有明显留白边框，内容区域为中心区域 ({safe_ratio:.0f}%)")
    
    top_bright = brightness(top_rgb)
    mid_bright = brightness(mid_rgb)
    bot_bright = brightness(bot_rgb)
    
    if top_bright < 100 and mid_bright > 150:
        print(f"  → 深色顶部标题栏 + 浅色主内容区结构")
    elif top_bright > 200 and bot_bright < 150:
        print(f"  → 浅色顶部 + 深色/彩色底部结构，底部可能是价格/促销区")
    elif top_bright > 180 and mid_bright > 180 and bot_bright > 180:
        print(f"  → 整体浅色/白色背景设计，文字和图片为主要视觉元素")
    else:
        print(f"  → 多色块组合布局，上({top_bright:.0f}) 中({mid_bright:.0f}) 下({bot_bright:.0f})")
    
    print()
    return True

def main():
    moban_dir = r"e:\code\company\baohudian\moban"
    images = ["1.jpg", "2.jpg", "3.png", "4.png"]
    
    print("=" * 70)
    print("         保护店模板图片深度颜色分析报告")
    print("=" * 70)
    
    for fname in images:
        fpath = os.path.join(moban_dir, fname)
        if os.path.exists(fpath):
            try:
                analyze_image(fpath)
            except Exception as e:
                print(f"\n❌ 分析 {fname} 时出错: {e}")
        else:
            print(f"\n⚠️  文件不存在: {fpath}")
    
    print("\n" + "="*70)
    print("分析完成")

if __name__ == "__main__":
    main()
