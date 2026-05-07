import re

with open('/apps/zeruxcom-v1/app/ressources/XLSX/gen_tables.py', 'r') as f:
    text = f.read()

text = text.replace('''def load_existing_options():
    try:
        with open(OUT) as f:
            data = json.load(f)
        return data.get("options", {}), data.get("documents", []), data.get("dimensions_standard", {})
    except Exception:
        return {}, [], None''', '''def load_existing_options():
    try:
        with open(OUT) as f:
            data = json.load(f)
        return data
    except Exception:
        return {}''')

text = text.replace('''existing_options, existing_docs, existing_dims = load_existing_options()''', '''existing_data = load_existing_options()
existing_options = existing_data.get("options", {})
existing_docs = existing_data.get("documents", [])
existing_dims = existing_data.get("dimensions_standard", {})''')

text = text.replace('''"options_ht": existing.get("options_ht", {}),
    "serrures": existing.get("serrures", []),
    "ferme_portes": existing.get("ferme_portes", []),''', '''"options_ht": existing_data.get("options_ht", {}),
    "serrures": existing_data.get("serrures", []),
    "ferme_portes": existing_data.get("ferme_portes", []),''')

with open('/apps/zeruxcom-v1/app/ressources/XLSX/gen_tables.py', 'w') as f:
    f.write(text)

