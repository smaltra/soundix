# Builds C:\tmp\ui-assets\sounds\index.html: pick a sound per kit event, compare candidates, try them in a mock UI.
import json
import subprocess
from pathlib import Path

ROOT = Path(r"C:\tmp\ui-assets\sounds")
PACKS = [
    ("ui-audio", "UI Audio"), ("interface-sounds", "Interface Sounds"), ("rpg-audio", "RPG Audio"),
    ("casino-audio", "Casino Audio"), ("digital-audio", "Digital Audio"), ("impact-sounds", "Impact Sounds"),
    ("music-jingles", "Music Jingles"), ("sci-fi-sounds", "Sci-Fi Sounds"), ("voiceover-pack", "Voiceover"),
    ("voiceover-pack-fighter", "Voiceover Fighter"), ("oga-rpg-sound-pack", "RPG Sound Pack"),
    ("oga-512-retro", "512 Retro (8-bit)"), ("oga-levelup-13", "Level Up 13"), ("oga-menu-7", "Menu 7"),
]


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True)
    try:
        return round(float(out.stdout.strip()), 2)
    except ValueError:
        return 0.0


sounds = []
for folder, title in PACKS:
    for p in sorted((ROOT / folder).rglob("*")):
        if p.suffix.lower() not in (".ogg", ".wav", ".mp3") or "preview" in p.stem.lower():
            continue
        if "__MACOSX" in p.parts or p.name.startswith("."):
            continue
        sounds.append({"f": p.relative_to(ROOT).as_posix(), "n": p.stem, "p": title, "d": duration(p)})

HTML = (Path(__file__).parent / "sound_page2.html").read_text(encoding="utf-8")
(ROOT / "index.html").write_text(HTML.replace("__SOUNDS__", json.dumps(sounds, ensure_ascii=False)), encoding="utf-8")
print("sounds:", len(sounds))
