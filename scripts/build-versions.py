"""Build independently loadable web snapshots for the public version selector."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
latest = json.loads((ROOT / 'package.json').read_text())['version']
tags = subprocess.check_output(['git', 'tag'], cwd=ROOT, text=True).splitlines()
tags = sorted(t for t in tags if re.fullmatch(r'v\d+\.\d+\.\d+', t))
if 'v' + latest not in tags:
    tags.append('v' + latest)

def web_file(path):
    return (path in ['index.html', 'online.html', 'landing.html'] or
            re.fullmatch(r'[a-z0-9-]+\.css', path) or
            re.fullmatch(r'js/[a-z0-9-]+\.js', path) or
            re.fullmatch(r'assets/[a-z0-9-]+\.(svg|png)', path))

manifest = {'latest': latest, 'versions': {}}
for tag in tags:
    version = tag[1:]
    if version == latest:
        files = {str(p.relative_to(ROOT)): p.read_bytes() for p in ROOT.rglob('*')
                 if p.is_file() and web_file(str(p.relative_to(ROOT)))}
        files['index.html'] = (ROOT / 'app.html').read_bytes()
    else:
        paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', tag], cwd=ROOT, text=True).splitlines()
        files = {p: subprocess.check_output(['git', 'show', tag+':'+p], cwd=ROOT) for p in paths if web_file(p)}
        # Newer tags keep the full application separate from the version launcher.
        if 'app.html' in paths:
            files['index.html'] = subprocess.check_output(['git', 'show', tag+':app.html'], cwd=ROOT)
    for path in list(files):
        if path.endswith('.html'):
            text = files[path].decode()
            def resource(match):
                resource_path = match[2].split('?')[0]
                if resource_path not in files:
                    return match[0]
                digest = hashlib.sha256(files[resource_path]).hexdigest()[:16]
                return match[1]+'="'+resource_path+'?build='+digest+'"'
            files[path] = re.sub(r'(src|href)="([^"\n]+\.(?:css|js)(?:\?[^"\n]*)?)"', resource, text).encode()
    build = hashlib.sha256(b''.join(p.encode()+files[p] for p in sorted(files))).hexdigest()[:16]
    destination = ROOT / 'versions' / tag
    for path, data in files.items():
        output = destination / path
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
    manifest['versions'][version] = {'build': build}
(ROOT / 'versions.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print('Built web versions:', ', '.join(manifest['versions']), '· default', latest)
