import json
with open('/apps/zeruxcom-v1/app/ressources/XLSX/knowledge_tables.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
print("Keys in JSON:", d.keys())
