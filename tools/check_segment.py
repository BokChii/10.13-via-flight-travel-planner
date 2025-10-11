from pathlib import Path
text = Path('scripts/main.js').read_text(encoding="utf8")
occurrences = [i for i in range(len(text)) if text.startswith('renderWaypoints', i)]
for idx in occurrences:
    segment = text[idx:idx+80]
    print('---', idx, '---')
    print(segment)
    print(segment.encode('unicode_escape'))
