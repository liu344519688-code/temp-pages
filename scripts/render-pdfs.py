"""Render primary PDFs to page images for scanner browsers without native PDF support."""
import hashlib
import json
from pathlib import Path
import re
import sys
import pypdfium2 as pdfium

root=Path(__file__).resolve().parent.parent
records=json.loads((root/'data/files.json').read_text(encoding='utf8'))
manifest={}
for record in records:
    asset=record.get('asset') or (record.get('attachments') or [{}])[0].get('asset')
    if not asset or not asset.lower().endswith('.pdf'):
        continue
    record_id=record['id']
    if not re.fullmatch(r'F\d+',record_id):
        raise ValueError('Invalid record ID')
    prefix=f'f/{record_id.lower()}/'
    if not asset.startswith(prefix) or not re.fullmatch(r'[-\w]+\.pdf',asset[len(prefix):],re.I):
        raise ValueError('Invalid PDF path')
    source=root/asset
    digest=hashlib.sha256(source.read_bytes()).hexdigest()[:20]
    relative=Path('_preview')/digest
    destination=source.parent/relative
    destination.mkdir(parents=True,exist_ok=True)
    document=pdfium.PdfDocument(str(source))
    pages=[]
    try:
        if not len(document):
            raise ValueError('PDF has no pages')
        for index in range(len(document)):
            page=document[index]
            bitmap=None
            try:
                width,height=page.get_size()
                scale=min(2000/width,3000/height)
                bitmap=page.render(scale=scale)
                image=bitmap.to_pil().convert('RGB')
                name=f'page-{index+1:03}.jpg'
                image.save(destination/name,format='JPEG',quality=92,optimize=True)
                pages.append({'src':'./'+(relative/name).as_posix(),'width':image.width,'height':image.height})
                image.close()
            finally:
                if bitmap is not None:
                    bitmap.close()
                page.close()
    finally:
        document.close()
    manifest[record_id]={'pages':pages,'sha256':digest}
print(json.dumps(manifest,ensure_ascii=True))
