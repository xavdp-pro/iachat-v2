# Documentation API TTS (XTTS-v2)

**Modèle** : Coqui `tts_models/multilingual/multi-dataset/xtts_v2`
**Serveur** : `http://127.0.0.1:8010` · `http://90.63.204.132:8010`
**GPU** : RTX 5090 via `lipsync-env` (PyTorch 2.7 cu128)

---

## Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/health` | Statut du serveur |
| `GET` | `/voices` | Liste des 57 voix disponibles |
| `POST` | `/tts` | Synthèse vocale → WAV 24kHz |

### Paramètres POST /tts

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `text` | string | — | Texte à synthétiser (max 50 000 chars) |
| `voice` | string | `Ana Florence` | Nom du speaker (voir liste ci-dessous) |
| `lang` | string | `fr` | Code langue |
| `speed` | float | `1.0` | Vitesse (0.5 → 2.0) |

**Langues supportées** : `fr` `en` `es` `de` `it` `pt` `pl` `tr` `ru` `nl` `cs` `ar` `zh-cn` `hu` `ko` `ja` `hi`

---

## Liste complète des voix (57 speakers)

> Toutes les voix parlent **toutes les langues** — passer `"lang": "fr"` suffit pour avoir du français quelle que soit la voix choisie.

| # | Voix | # | Voix | # | Voix |
|---|------|---|------|---|------|
| 1 | Aaron Dreschner | 21 | Eugenio Mataracı | 41 | Nova Hogarth |
| 2 | Abrahan Mack | 22 | Ferran Simen | 42 | Rosemary Okafor |
| 3 | Adde Michal | 23 | Filip Traverse | 43 | Royston Min |
| 4 | Alexandra Hisakawa | 24 | Gilberto Mathias | 44 | Sofia Hellen |
| 5 | **Alison Dietlinde** | 25 | Gitta Nikolina | 45 | Suad Qasim |
| 6 | Alma María | 26 | Gracie Wise | 46 | Szofi Granger |
| 7 | **Ana Florence** ⭐ | 27 | **Henriette Usha** ⭐ | 47 | Tammie Ema |
| 8 | Andrew Chipper | 28 | Ige Behringer | 48 | Tammy Grit |
| 9 | Annmarie Nele | 29 | Ilkin Urbano | 49 | Tanja Adelina |
| 10 | Asya Anara | 30 | Kazuhiko Atallah | 50 | Torcull Diarmuid |
| 11 | Badr Odhiambo | 31 | Kumar Dahl | 51 | Uta Obando |
| 12 | Baldur Sanjin | 32 | Lidiya Szekeres | 52 | Viktor Eka |
| 13 | Barbora MacLean | 33 | Lilya Stainthorpe | 53 | Viktor Menelaos |
| 14 | Brenda Stern | 34 | Ludvig Milivoj | 54 | Vjollca Johnnie |
| 15 | Camilla Holmström | 35 | Luis Moray | 55 | Wulf Carlevaro |
| 16 | Chandra MacFarland | 36 | Maja Ruoho | 56 | Xavier Hayasaka |
| 17 | Claribel Dervla | 37 | Marcos Rudaski | 57 | Zacharie Aimilios |
| 18 | **Craig Gutsy** ⭐ | 38 | Narelle Moon | — | Zofija Kendrick |
| 19 | Daisy Studious | 39 | **Nova Hogarth** | | |
| 20 | **Damien Black** ⭐ | 40 | — | | |

⭐ = Voix recommandées pour le français

---

## Exemples curl

### Lire en direct (pipe sans fichier)

**Avec `aplay` (natif Linux) :**
```bash
curl -s -X POST "http://127.0.0.1:8010/tts" \
  -H "Content-Type: application/json" \
  -d '{"text": "Bonjour, je parle français.", "voice": "Ana Florence", "lang": "fr"}' \
  | aplay
```

**Avec `ffplay` (FFmpeg) :**
```bash
curl -s -X POST "http://127.0.0.1:8010/tts" \
  -H "Content-Type: application/json" \
  -d '{"text": "Bonjour, je parle français.", "voice": "Damien Black", "lang": "fr"}' \
  | ffplay -nodisp -autoexit -i -
```

### Sauvegarder dans un fichier WAV
```bash
curl -s -X POST "http://127.0.0.1:8010/tts" \
  -H "Content-Type: application/json" \
  -d '{"text": "Texte à synthétiser.", "voice": "Henriette Usha", "lang": "fr", "speed": 1.0}' \
  -o sortie.wav
```

### Récupérer la liste des voix (JSON)
```bash
curl -s http://127.0.0.1:8010/voices
```