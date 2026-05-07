import fitz

doc = fitz.open('/apps/zeruxcom-v1/app/ressources/XLSX/TARIF NEXUS 2026-01 - V2.pdf')

pages = [
    (12, "CR3", 50, 240), 
    (12, "CR3EI60", 310, 480),
    (36, "FB6", 210, 400), 
    (38, "FB7", 210, 400),
    (41, "EI60", 350, 500), 
    (59, "BLAST", 100, 250)
]

for p_num, name, y_min, y_max in pages:
    words = doc[p_num].get_text("words")
    ch_words = [w for w in words if y_min < w[1] < y_max]
    ch_words.sort(key=lambda w: (round(w[1]/10)*10, w[0]))
    print(f"=== {name} ===")
    for y in sorted(list(set(round(w[1]/10)*10 for w in ch_words))):
        line = sorted([w for w in ch_words if round(w[1]/10)*10 == y], key=lambda x: x[0])
        print(f"Y={y:3d}:", " ".join(w[4] for w in line))
