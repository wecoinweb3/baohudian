from PIL import Image
import math
import sys


def parse_hex_color(color: str):
    value = color.strip().lstrip('#')
    if len(value) != 6:
        raise ValueError('target color must be 6-digit hex')
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4))


def sample_background(image: Image.Image):
    width, height = image.size
    sample_size = max(3, min(width, height) // 20)
    points = []
    corners = [
        (0, 0),
        (max(0, width - sample_size), 0),
        (0, max(0, height - sample_size)),
        (max(0, width - sample_size), max(0, height - sample_size)),
    ]
    pixels = image.load()
    for start_x, start_y in corners:
        for x in range(start_x, min(width, start_x + sample_size)):
            for y in range(start_y, min(height, start_y + sample_size)):
                r, g, b, a = pixels[x, y]
                if a > 0:
                    points.append((r, g, b))
    if not points:
        return (255, 255, 255)
    return tuple(sum(channel[i] for channel in points) // len(points) for i in range(3))


def color_distance(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def main():
    if len(sys.argv) < 4:
      raise ValueError('Usage: python logo_flatten.py <input> <output> <targetColor>')

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    target_color = parse_hex_color(sys.argv[3])

    image = Image.open(input_path).convert('RGBA')
    bg = sample_background(image)
    pixels = image.load()
    width, height = image.size

    output = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    out_pixels = output.load()

    for x in range(width):
        for y in range(height):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            dist = color_distance((r, g, b), bg)
            max_delta = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))

            if dist < 18 and max_delta < 12:
                continue

            alpha_ratio = min(1.0, max(0.0, (dist - 12) / 58))
            final_alpha = int(max(0, min(255, a * alpha_ratio)))

            if final_alpha < 20:
                continue

            out_pixels[x, y] = (*target_color, final_alpha)

    bbox = output.getbbox()
    if bbox:
        output = output.crop(bbox)

    output.save(output_path, 'PNG')


if __name__ == '__main__':
    main()