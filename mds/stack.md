# Consignes techniques — Stack & Environnement de développement

> Ce fichier sert de base de référence pour ce projet et peut être réutilisé sur d'autres projets.

---

## 🎯 Philosophie — Dev en tandem Humain + Agent IA

Ce projet est développé en **tandem entre un humain et un agent de coding IA** (Antigravity, Cursor, Windsurf…). Cette contrainte impose une exigence forte :

> **L'humain doit voir le résultat de chaque modification instantanément dans le navigateur, sans aucune action manuelle.**

C'est la condition pour qu'un humain puisse valider, corriger et guider l'agent en temps réel efficacement.

### Règles absolues
- ✅ **Jamais de build manuel** pour voir un changement — le navigateur se met à jour seul
- ✅ **Jamais de `dist/`** en développement — le code source est servi directement par Vite
- ✅ **Jamais de redémarrage manuel** du backend — détection automatique des changements
- ✅ **Une seule commande** lance tout l'environnement (`npm run dev`)

> ⛔ Tout workflow qui demande à l'humain de lancer un build, de recharger manuellement, ou de redémarrer un serveur est **incompatible** avec ce projet.

### Pourquoi c'est critique
L'agent IA modifie le code en continu. Si l'humain doit lancer une commande pour voir le résultat, il perd le rythme, perd le contexte, et la collaboration devient inefficace. Le feedback doit être **immédiat et automatique**.

---

## 🖥️ Stack Frontend

| Techno | Rôle |
|---|---|
| **React 19** (via Vite) | UI réactive, composants, state management |
| **Tailwind CSS** | Design complet, glassmorphism, Dark/Light mode |
| **Framer Motion** | Animations fluides et transitions entre étapes |
| **Lucide React** | Icônes vectorielles légères et modernes |
| **React Router DOM** | Navigation et lecture des paramètres URL (`?plan=1`) |

### ⚡ HMR (Hot Module Replacement)
Vite gère le **rechargement à chaud natif via WebSocket**. Aucun build nécessaire en développement : les changements de code apparaissent instantanément dans le navigateur.

---

## ⚙️ Stack Backend

| Techno | Rôle |
|---|---|
| **Node.js / Express** | Serveur API, logique métier, validation |
| **MariaDB/MySQL** (`mysql2`) | Base de données, requêtes asynchrones |

### 🔄 Auto-reload backend
Utiliser **`node --watch`** (natif Node.js 18+, sans dépendance) :
```bash
node --watch src/server.js
```
Alternative : `nodemon` si plus de contrôle est nécessaire.

---

## 🔌 Ports des services

| Service | Port | Description |
|---|---|---|
| **Vite** (frontend SPA) | **7597** | Point d'entrée unique pour le navigateur |
| **Express** (API backend) | **7598** | API REST, jamais accédée directement |
| **Prerender** (SEO bots) | **7599** | Rendu HTML pour robots |

### Règle — Vite est le seul proxy
> **Le navigateur ne parle qu'à Vite (port 7597).** Vite redirige ensuite vers Express et Prerender selon le chemin de la requête. Jamais d'accès direct au port 7598 ou 7599 depuis le frontend.

### Configuration dans `vite.config.js`
```js
export default {
  server: {
    port: 7597,
    proxy: {
      '/api': 'http://localhost:7598',        // → Express
      '/prerender': 'http://localhost:7599'  // → Prerender (optionnel)
    }
  }
}
```

✅ Pas de CORS, pas de dist, pas de build. Un seul port à ouvrir en développement.

---

## 🚀 Lancement en une commande

### Installation
```bash
npm i -D concurrently
```

### `package.json`
```json
"scripts": {
  "dev": "concurrently \"vite --port 7597\" \"node --watch src/server.js\" \"npx prerender --port 7599\""
}
```

### Démarrage
```bash
npm run dev
```

→ Vite (:7597) + Express (:7598) + Prerender (:7599) démarrent ensemble.

### Configuration Express (bind sur 7598)
```js
// server.js
app.listen(7598, () => console.log('API running on :7598'))
```

### Mode maintenance admin

- L'onglet Admin > Maintenance pilote `app_settings` (`maintenance_enabled`, `maintenance_message`, `maintenance_bypass_ips`).
- Quand le mode est actif, le middleware Express bloque les routes API avec `503 MAINTENANCE_MODE`, sauf `/api/health`, `/api/maintenance-status` et les IP de bypass.
- Avant activation, le backend vérifie que l'IP courante est dans `maintenance_bypass_ips` pour éviter de se bloquer hors de l'admin.
- Les IP acceptent une entrée par ligne et les CIDR IPv4 simples (ex. `82.65.12.34` ou `192.168.1.0/24`).
- La vraie IP client doit traverser toute la chaîne Nginx -> Vite -> Express via `X-Forwarded-For`. Le backend lit la première IP de cette chaîne avant `X-Real-IP`, et le proxy Vite recopie explicitement ces headers vers l'API.

---

---

## 🗂️ Persistance d'état UI — SessionStorage

Toute valeur UI qu'il est **pratique de retrouver après un rechargement de page** doit être stockée dans le `sessionStorage` :

- Onglet actif (`tab`)
- Valeur d'un `<select>`
- Page courante d'une pagination
- Filtre actif, état d'un accordéon, scroll position…

### Règle
> **Au clic → sauvegarder dans `sessionStorage`. Au montage du composant → lire et restaurer.**

### Frontend (React) — exemple
```js
// Sauvegarde au clic
const handleTabChange = (tab) => {
  setActiveTab(tab)
  sessionStorage.setItem('activeTab', tab)
}

// Restauration au montage
useEffect(() => {
  const saved = sessionStorage.getItem('activeTab')
  if (saved) setActiveTab(saved)
}, [])
```

### Backend (Express) — état de session
Pour les états côté serveur récupérables après rechargement (ex : filtres API, pagination) :
- Retourner l'état dans la réponse API
- Le frontend le stocke en `sessionStorage` et le renvoie dans les requêtes suivantes via un paramètre ou header

### Différence `sessionStorage` vs `localStorage`
| | `sessionStorage` | `localStorage` |
|---|---|---|
| Durée | Jusqu'à fermeture de l'onglet | Permanent |
| Usage | États UI temporaires | Préférences persistantes (thème, langue…) |

---

## 🔗 Navigation bookmarkable — URL & Hash

Toute **navbar, sidebar ou menu de navigation** doit générer des **URLs réelles** ou des **ancres `#`** pour permettre :
- Le **bookmarking** d'une page ou d'une vue
- Le **partage d'un lien direct**
- Le **retour arrière** du navigateur qui fonctionne correctement

### Règle
> **Jamais d'état de navigation purement en mémoire JS. Toujours reflété dans l'URL.**

### Frontend (React Router) — liens vrais
```jsx
// ✅ Bon — URL réelle bookmarkable
<NavLink to="/dashboard">Dashboard</NavLink>
<NavLink to="/settings/profile">Profil</NavLink>

// ✅ Bon — Hash pour sections dans une page
<a href="#section-facturation">Facturation</a>

// ❌ Mauvais — état caché dans le composant
<button onClick={() => setPage('dashboard')}>Dashboard</button>
```

### Router Express — routes en miroir
Les routes Express doivent **correspondre aux routes React** pour éviter les 404 en cas de rechargement direct :
```js
// ⛔ PRODUCTION UNIQUEMENT — jamais en développement
// En dev, Vite gère tout via son propre serveur (port 7597)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})
```
> ⚠️ Ce bloc n'existe **pas** en dev. En production uniquement, quand Vite ne tourne plus.

---

## 📌 Réutilisation sur d'autres projets

Pour adapter ce fichier à un autre projet :
1. Remplacer `{mon-app}` par le nom du projet
2. Choisir 3 ports consécutifs libres (convention : `X`, `X+1`, `X+2`) — ce projet utilise `7597/7598/7599`
3. Vérifier la version de Node.js (`node --watch` disponible depuis Node 18)
4. Adapter les technos du tableau si la stack change

---

## 🤖 SEO — Dynamic Rendering (SPA + rendu pour bots)

### Stratégie choisie
> Garder le **SPA React** pour les utilisateurs humains, et servir du **HTML pré-rendu** uniquement quand un **robot SEO** est détecté.

Cela évite de changer de framework tout en ayant un SEO parfait.

### Comment ça fonctionne

```
Requête entrante
    │
    ├── User-Agent = Bot (Googlebot, Bingbot…)
    │       └── → Rendu HTML complet via Prerender → réponse HTML statique
    │
    └── User-Agent = Humain
            └── → SPA React normal (Vite, HMR, CSR)
```

### Solution retenue — Self-hosted avec `prerender-node`

Gratuit, open source, aucune dépendance externe. Utilise **Puppeteer** en local pour générer le HTML.

#### 1. Installation
```bash
npm install prerender-node
npm install -g prerender   # serveur Prerender global
```

#### 2. Middleware Express (`server.js`)
```js
const prerender = require('prerender-node')

// Pointer vers le serveur Prerender self-hosted (port 7599)
app.use(prerender.set('prerenderServiceUrl', 'http://localhost:7599'))
```
> ⚠️ Placer ce middleware **avant** les routes Express.

#### 3. Démarrer le serveur Prerender
```bash
PORT=7599 npx prerender
# Écoute sur http://localhost:7599
```

### Bots détectés automatiquement
`prerender-node` reconnaît nativement : `Googlebot`, `Bingbot`, `facebookexternalhit`, `Twitterbot`, `LinkedInBot`, `Slackbot`, et [beaucoup d'autres](https://github.com/prerender/prerender-node#whitelisting-extensions-to-ignore).

---

## 🌿 Variables d'environnement — `.env`

Deux contextes distincts, deux conventions :

| Contexte | Convention | Exemple |
|---|---|---|
| **Backend** (Express) | `NOM_VARIABLE` | `DB_PASSWORD`, `PORT` |
| **Frontend** (Vite) | `VITE_NOM_VARIABLE` | `VITE_API_URL` |

> ⚠️ Vite n'expose **que** les variables préfixées `VITE_` au navigateur. Les autres restent côté serveur.

### Fichiers à créer
```
.env              ← variables communes (non commitées)
.env.example      ← template sans valeurs (commité dans git)
```

### Exemple `.env`
```ini
# Backend
PORT=7598
DB_HOST=localhost
DB_USER=gbsinfo-v1
DB_NAME=gbsinfo-v1

# Frontend (accessible dans React via import.meta.env.VITE_API_URL)
VITE_API_URL=/api
```

### Usage
```js
// Backend Express
const port = process.env.PORT || 7598

// Frontend React
const apiUrl = import.meta.env.VITE_API_URL
```

---

## 🔌 Couche d'abstraction API — `src/api/`

Jamais de `fetch` direct dans les composants. Centraliser tous les appels API dans un dossier dédié.

### Structure
```
src/
  api/
    index.js       ← instance Axios configurée
    users.js       ← appels liés aux utilisateurs
    products.js    ← appels liés aux produits
```

### `src/api/index.js`
```js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
})

// Intercepteur global d'erreurs
api.interceptors.response.use(
  res => res.data,
  err => Promise.reject(err.response?.data || err.message)
)

export default api
```

### `src/api/users.js`
```js
import api from './index'

export const getUsers = () => api.get('/users')
export const createUser = (data) => api.post('/users', data)
```

---

## 🐻 Gestion d'état global — Zustand

Pour les états partagés entre plusieurs composants (panier, auth, filtres globaux…). Léger (2kb), sans boilerplate.

### Installation
```bash
npm install zustand
```

### Exemple — store utilisateur
```js
// src/store/useUserStore.js
import { create } from 'zustand'

export const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}))
```

### Usage dans un composant
```jsx
import { useUserStore } from '../store/useUserStore'

function Header() {
  const { user, logout } = useUserStore()
  return <button onClick={logout}>{user?.name}</button>
}
```

### Quand utiliser quoi ?
| Besoin | Solution |
|---|---|
| État local d'un composant | `useState` |
| État UI à restaurer après reload | `sessionStorage` |
| État partagé entre composants | **Zustand** |
| Préférences persistantes | `localStorage` |

---

## 🧪 Tests — Vitest + Testing Library

Vitest est natif Vite : ultra-rapide, même config, même syntaxe que Jest.

### Installation
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

### Configuration `vite.config.js`
```js
export default {
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  }
}
```

### `src/test/setup.js`
```js
import '@testing-library/jest-dom'
```

### Lancer les tests
```bash
npx vitest        # mode watch
npx vitest run    # une seule fois (CI)
```

### Ajouter au `package.json`
```json
"scripts": {
  "test": "vitest",
  "test:run": "vitest run"
}
```

---

## 🐙 Dépôt Git — Repo GitHub privé & MCP

### Politique du dépôt
- Le dépôt Git du projet est un **repo GitHub privé**
- Aucun secret, mot de passe, ou token ne doit être commité
- Le fichier `.env` est dans `.gitignore` — seul `.env.example` est commité

### Utilisation du MCP GitHub
L'agent IA (Antigravity, Cursor, Windsurf…) dispose d'un **serveur MCP GitHub configuré dans l'IDE**. Il permet à l'agent de :
- Créer des branches, commits, pull requests directement
- Lire le contenu de fichiers dans le repo sans les télécharger
- Gérer les issues et reviews via l'API GitHub

> L'agent utilise le MCP GitHub **en priorité** pour toutes les opérations Git plutôt que la CLI `git`.

### Convention de branches
```
main          ← production stable
develop       ← intégration continue
feature/xxx   ← nouvelles fonctionnalités
fix/xxx       ← corrections de bugs
```

### `.gitignore` minimal
```
.env
node_modules/
dist/
*.log
```

---

## 🎨 Système de Skins

### Principe (style Winamp)
The UI is fully driven by a skin loaded at runtime. Changing the skin = changing a folder. The engine never hardcodes colors, fonts or assets.

### Structure
```
skins/
  default/
    manifest.json     ← skin metadata
    theme.css         ← CSS custom properties (all design tokens)
    assets/
      logo.svg
      favicon.ico
      fonts/
  corporate-acme/
    manifest.json
    theme.css
    assets/
```

### `manifest.json` format
```json
{
  "name": "Default",
  "slug": "default",
  "author": "iachat",
  "version": "1.0.0",
  "preview": "assets/preview.png",
  "darkMode": true
}
```

### Chargement
- Au démarrage, l'app **liste tous les dossiers** de `skins/` via l'API backend → construit le menu de sélection
- Charger un skin = injecter dynamiquement son `theme.css` dans le `<head>`
- Le skin actif est persisté dans `localStorage` (`skin`)
- Le dark/light mode est géré **dans** chaque skin via `[data-theme="dark"]` sur le `<html>`

### Règle
> **Aucune couleur, police ou image ne doit être hardcodée dans les composants.** Tout passe par des variables CSS définies dans `theme.css`.

---

## 🐋 Qdrant — Base vectorielle (Docker)

### Pourquoi Qdrant
- Écrit en Rust → très performant
- Namespaces (collections) → un namespace par projet → étanchéité garantie
- API REST + gRPC
- Docker officiel, données persistantes sur le disque local

### Docker Compose — `/apps/iachat-v1/etc/docker/docker-compose.yml`
```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: iachat-qdrant
    ports:
      - "6333:6333"   # REST API
      - "6334:6334"   # gRPC
    volumes:
      - /apps/iachat-v1/sav/qdrant:/qdrant/storage
    restart: unless-stopped
```

### Lancer Qdrant
```bash
docker compose -f /apps/iachat-v1/etc/docker/docker-compose.yml up -d
```

### Données persistantes
Les données sont stockées dans `/apps/iachat-v1/sav/qdrant/` (hors git, dossier `sav/`).

### Sauvegarde
```bash
# Backup
tar -czf /apps/iachat-v1/sav/backups/qdrant-$(date +%Y%m%d_%H%M).tar.gz \
  /apps/iachat-v1/sav/qdrant/

# Restore
tar -xzf /apps/iachat-v1/sav/backups/qdrant-YYYYMMDD_HHMM.tar.gz -C /
```

### Convention — namespace = project_id
```
Collection Qdrant : iachat_{project_id}
Exemple          : iachat_42
```

### Usage dans le code (backend Express)
```js
import { QdrantClient } from '@qdrant/js-client-rest'

const qdrant = new QdrantClient({ url: 'http://localhost:6333' })

// Search in a project's namespace
const results = await qdrant.search(`iachat_${projectId}`, {
  vector: embedding,
  limit: 10,
})
```
