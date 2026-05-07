import fitz

doc = fitz.open('/apps/zeruxcom-v1/app/ressources/XLSX/TARIF NEXUS 2026-01 - V2.pdf')

def extract_table(page, title):
    words = page.get_text("words")
    # sort by Y then X
    words.sort(key=lambda w: (round(w[1]), w[0]))
    for w in words:
        if w[4] > '':
            pass # print(w)
    
print("Table for Châssis CR3:")
page = doc[12]
words = page.get_text("words")
chassis_words = [w for w in words if w[1] > 600] # bottom of page
chassis_words.sort(key=lambda w: (round(w[1]/5)*5, w[0])) # cluster Y
for y in sorted(list(set(round(w[1]/5)*5 for w in chassis_words))):
    line = [w[4] for w in chassis_words if round(w[1]/5)*5 == y]
    print(f"Y={y:3d}:", " ".join(line))
