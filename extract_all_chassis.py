import fitz
import re

doc = fitz.open('/apps/zeruxcom-v1/app/ressources/XLSX/TARIF NEXUS 2026-01 - V2.pdf')
pages = [
    (12, "CR3", 80), (12, "CR3EI60", 310),
    (36, "FB6", 230), (38, "FB7", 230),
    (41, "EI60", 380), (59, "BLAST", 130)
]

for p_num, name, start_y in pages:
    words = doc[p_num].get_text("words")
    ch_words = [w for w in words if w[1] > start_y and w[1] < start_y + 150]
    prices = []
    
    for y in sorted(list(set(round(w[1]/10)*10 for w in ch_words))):
        line = sorted([w for w in ch_words if round(w[1]/10)*10 == y], key=lambda x: x[0])
        txt = "".join(w[4] for w in line)
        found = [int(p) for p in re.findall(r'(\d{4,5})€', txt)]
        if len(found) >= 2:
            prices.append(found[-3:])
            
    print(f"=== {name} ===")
    for r in prices:
        print(r)
        
