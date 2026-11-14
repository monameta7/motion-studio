# Responsibility: measure an owner image from its pixels (page background, element boxes, their main colours) and write plan/ui-source/NN.json (D84).
# python -I ui-measure.py <image> <out.json>
import json, subprocess, sys
import numpy as np
from scipy import ndimage

MAX_SIDE = 1600   # larger images are measured on a scaled copy; boxes are reported in source pixels
MAX_BOXES = 60
MIN_AREA = 400


def load(path):
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                            '-of', 'csv=p=0', path], capture_output=True, text=True, check=True)
    w, h = [int(x) for x in probe.stdout.strip().split(',')[:2]]
    k = min(1.0, MAX_SIDE / max(w, h))
    sw, sh = max(1, round(w * k)), max(1, round(h * k))
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-frames:v', '1', '-vf', f'scale={sw}:{sh}:flags=area',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(sh, sw, 3), w, h, w / sw


def hexc(c):
    return '#%02x%02x%02x' % tuple(int(x) for x in c)


def top_colours(pixels, n):
    vals, counts = np.unique(pixels.reshape(-1, 3), axis=0, return_counts=True)
    return [hexc(c) for c in vals[np.argsort(-counts)[:n]]]


def measure(path):
    img, w, h, scale = load(path)
    img = img.astype(np.int16)
    vals, counts = np.unique(img.reshape(-1, 3), axis=0, return_counts=True)
    bg = vals[counts.argmax()]
    mask = ndimage.binary_closing(np.abs(img - bg).sum(axis=2) > 6, iterations=4)
    lab, _ = ndimage.label(mask)
    boxes = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (y1 - y0) * (x1 - x0) < MIN_AREA:
            continue
        boxes.append({'x': round(x0 * scale), 'y': round(y0 * scale), 'w': max(1, round((x1 - x0) * scale)),
                      'h': max(1, round((y1 - y0) * scale)), 'colours': top_colours(img[y0:y1, x0:x1], 3)})
    boxes.sort(key=lambda b: -(b['w'] * b['h']))
    boxes = sorted(boxes[:MAX_BOXES], key=lambda b: (b['y'], b['x']))
    return {'source': path.replace('\\', '/'), 'width': w, 'height': h, 'background': hexc(bg), 'boxes': boxes}


if __name__ == '__main__':
    out = measure(sys.argv[1])
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({'boxes': len(out['boxes']), 'background': out['background']}))
