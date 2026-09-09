"""Render synthetic output with MuPDF and Poppler; no customer files used."""
from pathlib import Path
import json, subprocess
import fitz
from PIL import Image, ImageChops, ImageStat
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build'/'quote-output'
results=[]

def check(name,fn):
    fn();results.append({'name':name,'ok':True});print('PASS',name)

def content():
    for name in ('normal','editable'):
        d=fitz.open(OUT/(name+'.pdf'));t=d[0].get_text()
        for value in ('CLIENTE DI PROVA','T001','32,076/h','24 h','769,82','TOTALE OFFERTA','3.169,82','oneri della sicurezza inclusi'):
            assert value in t,(name,value)
        assert 'U.M.' not in t
        spans=[s for b in d[0].get_text('dict')['blocks'] if b['type']==0 for l in b['lines'] for s in l['spans']]
        for s in spans:
            assert s['bbox'][0]>=146 and s['bbox'][2]<576 and s['bbox'][1]>=0 and s['bbox'][3]<842,s
        pix=d[0].get_pixmap(matrix=fitz.Matrix(2,2));pix.save(str(OUT/(name+'-mupdf.png')))
check('Rendered static and editable PDFs contain all values inside page',content)

def mupdf_parity():
    a=Image.open(OUT/'normal-mupdf.png').convert('RGB');b=Image.open(OUT/'editable-mupdf.png').convert('RGB')
    diff=ImageChops.difference(a,b);assert max(ImageStat.Stat(diff).mean)<.1
check('Static and editable appearance parity in MuPDF',mupdf_parity)

def poppler():
    for n in ('normal','editable'):
        subprocess.run(['pdftoppm','-r','144','-singlefile','-png',str(OUT/(n+'.pdf')),str(OUT/(n+'-poppler'))],check=True,capture_output=True)
    a=Image.open(OUT/'normal-poppler.png').convert('RGB');b=Image.open(OUT/'editable-poppler.png').convert('RGB')
    assert max(ImageStat.Stat(ImageChops.difference(a,b)).mean)<.1
check('Static and editable appearance parity in Poppler',poppler)

def multipage():
    d=fitz.open(OUT/'multipage.pdf');assert len(d)>2
    text='\n'.join(p.get_text() for p in d)
    assert all(('R'+str(i)+'\n') in text for i in range(45))
    for i,p in enumerate(d):
        for b in p.get_text('dict')['blocks']:
            if b['type']!=0:continue
            for l in b['lines']:
                for s in l['spans']:assert s['bbox'][0]>=146 and s['bbox'][2]<576 and s['bbox'][1]>0 and s['bbox'][3]<842,(i,s)
check('Multipage output preserves all 45 rows and stays within A4',multipage)
(OUT/'render-results.json').write_text(json.dumps(results,indent=2))
print(str(len(results))+'/'+str(len(results))+' rendering tests passed')
