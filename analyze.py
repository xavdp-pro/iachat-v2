import requests

def check_readme(model_id):
    url = f"https://huggingface.co/{model_id}/raw/main/README.md"
    try:
        res = requests.get(url, timeout=5)
        if res.status_code == 200:
            return res.text[:2000]
    except:
        pass
    return ""

models = ["hkchengrex/MMAudio", "ymzhang319/FoleyCrafter", "Lightricks/LTX-2"]
for m in models:
    print(f"--- {m} ---")
    print(check_readme(m))
