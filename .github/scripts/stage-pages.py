"""Stage only the supplied public files; no Node.js build is required."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[2]
output = root / '_site'
manifest = json.loads((root / '.github/pages-files.json').read_text())
for name, digest in manifest.items():
    relative = Path(name)
    if relative.is_absolute() or '..' in relative.parts:
        raise SystemExit('Invalid file path in deployment manifest')
    source = root / relative
    if not source.is_file() or source.is_symlink():
        raise SystemExit(f'Missing website file: {name}. Copy all extracted files into the repository root.')
    if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        raise SystemExit(f'File changed or incomplete: {name}. Copy this file again from the supplied ZIP.')
if output.exists():
    shutil.rmtree(output)
for name in manifest:
    destination = output / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / name, destination)
print(f'Verified and staged {len(manifest)} website files. No source build required.')
