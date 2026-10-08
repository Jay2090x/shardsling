#!/usr/bin/env python3
"""Prints a markdown table of every deliverable in launch/ with its real size/spec (for README.md)."""
import json, os, subprocess, zipfile
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
rows = []
for d in ['crazygames', 'itch', 'itch/screenshots']:
    p = os.path.join(ROOT, d)
    if not os.path.isdir(p):
        continue
    for f in sorted(os.listdir(p)):
        fp = os.path.join(p, f)
        if os.path.isdir(fp):
            continue
        kb = os.path.getsize(fp) / 1024
        size = f'{kb/1024:.1f} MB' if kb > 1024 else f'{kb:.0f} KB'
        if f.endswith('.png'):
            im = Image.open(fp)
            spec = f'PNG {im.size[0]}×{im.size[1]} ({im.mode})'
        elif f.endswith('.mp4'):
            j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,color_range,sample_rate', '-of', 'json', fp]))
            v = next(s for s in j['streams'] if s['codec_type'] == 'video')
            a = [s for s in j['streams'] if s['codec_type'] == 'audio']
            fr = v['r_frame_rate'].split('/')
            spec = f"MP4 H.264 {v['width']}×{v['height']}, {int(fr[0])//int(fr[1])} fps, {float(j['format']['duration']):.2f} s, " + (f"AAC {a[0]['sample_rate']} Hz" if a else 'no audio track')
        elif f.endswith('.zip'):
            z = zipfile.ZipFile(fp)
            spec = f"ZIP, {len(z.infolist())} files, {sum(i.file_size for i in z.infolist())/1024:.0f} KB unpacked, index.html at root"
        else:
            spec = ''
        rows.append(f'| `{d}/{f}` | {spec} | {size} |')
print('| File | Spec (measured) | Size |\n|---|---|---|')
print('\n'.join(rows))
