"""
FSEG2 PDF Processor v4
- Skips PDFs that already have ANY password (already processed)
- For unprotected PDFs:
    1. Re-renders every page to a clean 150 DPI image (strips old watermarks)
    2. Overlays watermark: full-page, 25% opacity (pre-baked via Pillow)
    3. Encrypts: NO open password | LFhay2aa@123 = owner (blocks edit/print/copy)
"""

import os, sys, subprocess, tempfile, shutil
import fitz
from PIL import Image

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ── Config ────────────────────────────────────────────────────────────────────
ARCHIVE_ROOT  = r"C:\Users\User\Desktop\FSEG2_Student_Council_Archive"
WATERMARK_PNG = r"C:\Users\User\Downloads\Images\1000468963-removebg-preview.png"
OWNER_PASS    = "LFhay2aa@123"
RENDER_DPI    = 150
QPDF_CMD      = "qpdf"

# ── Pre-bake 25% opacity into watermark PNG ───────────────────────────────────
def make_watermark_25pct(src_png: str, dst_png: str) -> str:
    img = Image.open(src_png).convert("RGBA")
    r, g, b, a = img.split()
    a = a.point(lambda x: int(x * 0.25))
    Image.merge("RGBA", (r, g, b, a)).save(dst_png, "PNG")
    return dst_png

# ── Re-render pages + overlay watermark ──────────────────────────────────────
def process_pdf(src: str, wm_png: str, tmp_out: str) -> tuple[bool, str]:
    try:
        doc = fitz.open(src)
    except Exception as e:
        return False, f"open error: {e}"

    # Skip anything that needs a password — already processed
    if doc.needs_pass:
        doc.close()
        return False, "SKIP"

    new_doc = fitz.open()
    try:
        for page in doc:
            pix   = page.get_pixmap(dpi=RENDER_DPI, alpha=False)
            pw, ph = page.rect.width, page.rect.height

            new_page = new_doc.new_page(width=pw, height=ph)
            new_page.insert_image(new_page.rect, pixmap=pix)

            # Scale watermark to fill page (contain), centred
            wm_doc = fitz.open(wm_png)
            wm_w, wm_h = wm_doc[0].rect.width, wm_doc[0].rect.height
            wm_doc.close()

            scale = min(pw / wm_w, ph / wm_h)
            sw, sh = wm_w * scale, wm_h * scale
            x0 = (pw - sw) / 2
            y0 = (ph - sh) / 2
            new_page.insert_image(
                fitz.Rect(x0, y0, x0 + sw, y0 + sh),
                filename=wm_png,
                overlay=True,
            )

        new_doc.save(tmp_out, garbage=4, deflate=True)
        return True, None
    except Exception as e:
        return False, str(e)
    finally:
        doc.close()
        new_doc.close()

# ── Encrypt: no open password, owner-only restrictions ───────────────────────
def encrypt_pdf(src: str, dst: str) -> tuple[bool, str]:
    r = subprocess.run([
        QPDF_CMD,
        "--encrypt", "", OWNER_PASS, "256",
        "--print=none", "--modify=none",
        "--annotate=n", "--assemble=n",
        "--extract=n", "--form=n", "--modify-other=n",
        "--", src, dst,
    ], capture_output=True, text=True)
    if r.returncode != 0:
        return False, r.stderr.strip()[:200]
    return True, None

# ── Walk archive ──────────────────────────────────────────────────────────────
def collect_pdfs(root: str):
    pdfs = []
    for dp, _, files in os.walk(root):
        for f in files:
            if f.lower().endswith(".pdf"):
                pdfs.append(os.path.join(dp, f))
    return sorted(pdfs)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("[*] FSEG2 PDF Processor v4")
    print(f"    Archive   : {ARCHIVE_ROOT}")
    print(f"    Watermark : {WATERMARK_PNG}")
    print(f"    DPI       : {RENDER_DPI}")
    print(f"    Open pass : (none)  |  Owner: {OWNER_PASS}")
    print()

    if not os.path.exists(WATERMARK_PNG):
        print(f"[!] Watermark file not found: {WATERMARK_PNG}")
        sys.exit(1)

    # Pre-bake 25% opacity once
    wm_25 = WATERMARK_PNG.replace(".png", "_25pct.png")
    make_watermark_25pct(WATERMARK_PNG, wm_25)
    print(f"[ok] 25% watermark ready: {wm_25}\n")

    pdfs  = collect_pdfs(ARCHIVE_ROOT)
    total = len(pdfs)
    stats = {"done": 0, "skipped": 0, "failed": 0}
    print(f"[*] Found {total} PDFs\n")

    for i, pdf_path in enumerate(pdfs, 1):
        rel = os.path.relpath(pdf_path, ARCHIVE_ROOT)
        print(f"[{i}/{total}] {rel}", flush=True)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_rendered = os.path.join(tmp, "rendered.pdf")
            tmp_final    = os.path.join(tmp, "final.pdf")

            ok, err = process_pdf(pdf_path, wm_25, tmp_rendered)
            if not ok:
                if err == "SKIP":
                    print(f"      [skip] Already password-protected", flush=True)
                    stats["skipped"] += 1
                else:
                    print(f"      [fail] {err}", flush=True)
                    stats["failed"] += 1
                continue

            ok, err = encrypt_pdf(tmp_rendered, tmp_final)
            if not ok:
                print(f"      [fail] encrypt: {err}", flush=True)
                stats["failed"] += 1
                continue

            shutil.copy2(tmp_final, pdf_path)

        stats["done"] += 1
        print(f"      [ok] Watermarked + owner-locked", flush=True)

    print("\n" + "-" * 55)
    print(f"[ok]   Processed : {stats['done']}/{total}")
    print(f"[skip] Skipped   : {stats['skipped']} (already protected)")
    print(f"[fail] Failed    : {stats['failed']}")
    print("-" * 55)
    print("Done.")

if __name__ == "__main__":
    main()
