import io
import json
import re
import shutil
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
output = root / "outputs" / "honor-board"
poster_dir = root / "31省海报"
honor_posters = {}
for poster in sorted(poster_dir.iterdir()):
    if poster.is_file() and poster.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
        if poster.stem in honor_posters:
            raise ValueError(f"Duplicate honor poster: {poster.stem}")
        honor_posters[poster.stem] = poster

items = []
with zipfile.ZipFile(root / "各省优秀学员.xlsx") as book:
    def xml(part):
        return ET.fromstring(book.read("xl/" + part))

    strings = ["".join(t.text or "" for t in s.findall(".//{*}t"))
               for s in xml("sharedStrings.xml")]
    cells = {}
    for cell in xml("worksheets/sheet3.xml").findall(".//{*}c"):
        value = cell.findtext("{*}v")
        if value is not None:
            cells[cell.attrib["r"]] = strings[int(value)] if cell.get("t") == "s" else value
    relations = {r.get("Id"): r.get("Target") for r in xml("_rels/cellimages.xml.rels")}
    images = {}
    for picture in xml("cellimages.xml").findall(".//{*}pic"):
        name = picture.find(".//{*}cNvPr").get("name")
        embed = next(v for k, v in picture.find(".//{*}blip").attrib.items()
                     if k.endswith("}embed"))
        images[name] = relations[embed]
    for header in (2, 16, 30):
        for address in cells:
            col, row = re.fullmatch(r"([A-Z]+)(\d+)", address).groups()
            if int(row) != header:
                continue
            province = cells[address]
            next_col = col[:-1] + chr(ord(col[-1]) + 1)
            for column, label in ((col, "优秀学员"), (next_col, "荣耀榜")):
                link = re.search(r"https://[A-Za-z0-9./_-]+", cells[f"{column}{header+1}"]).group()
                image_id = re.search(r'"([^"]+)"', cells[f"{column}{header+4}"]).group(1)
                title = province + label
                stamp = f"honor-{len(items)+1:02d}"
                urls = {}
                if label == "荣耀榜":
                    source = honor_posters[province]
                    stamp += "-province-poster"
                else:
                    source = io.BytesIO(book.read("xl/" + images[image_id]))
                with Image.open(source) as image:
                    image = ImageOps.exif_transpose(image).convert("RGB")
                    for field, size, suffix in (("thumbUrl", 520, "-thumb"), ("imageUrl", 2000, "")):
                        asset = image.copy()
                        filename = stamp + suffix + ".webp"
                        if label == "荣耀榜" and field == "thumbUrl":
                            # Match the reference cover's 735 × 942 top crop.
                            cover_height = min(image.height, round(image.width * 942 / 735))
                            asset = image.crop((0, 0, image.width, cover_height))
                            asset.thumbnail((720, 924), Image.Resampling.LANCZOS)
                            filename = stamp + "-cover.webp"
                        else:
                            asset.thumbnail((size, size), Image.Resampling.LANCZOS)
                        output.mkdir(parents=True, exist_ok=True)
                        asset.save(output / filename, quality=90)
                        urls[field] = "./outputs/honor-board/" + filename
                items.append(dict(id=stamp, province=province, title=title, honorKind=label,
                                  category="优秀学员 & 荣耀榜", fileName=title+".webp",
                                  tags=[province, label], resourceUrl=link,
                                  previewUrl=urls["imageUrl"], **urls))
                if label == "荣耀榜":
                    original_name = stamp + "-original" + source.suffix.lower()
                    shutil.copyfile(source, output / original_name)
                    items[-1]["copyUrl"] = "./outputs/honor-board/" + original_name
assert len(items) == 62 and len({item["province"] for item in items}) == 31
(output / "data.js").write_text("window.HONOR_MATERIALS = " + json.dumps(items, ensure_ascii=False) + ";\n", encoding="utf-8")
print(f"Imported {len(items)} linked images")
