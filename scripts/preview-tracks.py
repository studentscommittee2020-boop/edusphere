import os

def detect_track(rel):
    parts = rel.replace('\\', '/').split('/')
    filename = parts[-1].replace('.pdf','').lower()
    for seg in parts:
        if seg == 'EN': return 'english'
        if seg == 'FR': return 'french'
    if filename.endswith('_fr') or filename.endswith(' fr'): return 'french'
    if filename.endswith('_en') or filename.endswith(' en'): return 'english'
    return None

root = r'C:\Users\User\Desktop\FSEG2_Student_Council_Archive'
tracks = {'english': 0, 'french': 0, 'unknown': 0}
samples = {'english': [], 'french': [], 'unknown': []}

for dp, _, files in os.walk(root):
    for f in files:
        if not f.lower().endswith('.pdf'): continue
        rel = os.path.relpath(os.path.join(dp, f), root)
        t = detect_track(rel) or 'unknown'
        tracks[t] += 1
        if len(samples[t]) < 3:
            samples[t].append(rel)

for t in ('english','french','unknown'):
    print(f"{t}: {tracks[t]} files")
    for s in samples[t]:
        print(f"  {s}")
