with open('/apps/zeruxcom-v1/app/ressources/XLSX/gen_tables.py', 'r') as f:
    text = f.read()

text = text.replace('''def load_existing_options():
    try:
        with open(OUT) as f:
            data = json.load(f)
        return data.get("options", {}), data.get("documents", []), data.get("dimensions_standard", {})
    except Exception:
        return {}, [], {}''', '''def load_existing_options():
    try:
        with open(OUT) as f:
            return json.load(f)
    except Exception:
        return {}''')

with open('/apps/zeruxcom-v1/app/ressources/XLSX/gen_tables.py', 'w') as f:
    f.write(text)
