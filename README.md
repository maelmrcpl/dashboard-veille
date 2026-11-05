# dashboard-veille

Dashboard web local regroupant les veilles quotidiennes (IA, cybersécurité, réseau, cloud / DevOps). Un agent de veille (dépôt `veille-ia`) écrit chaque jour un JSON par catégorie, et un fichier audio `.wav` en option ; le dashboard les lit et les affiche.

## Guide d'installation

### Prérequis
- Python 3 (testé avec 3.13) et `pip`.
- Un navigateur récent (Edge, Chrome, Firefox ou Safari à jour) pour les dégradés et les effets.
- Le dépôt `veille-ia` (l'agent), cloné sur la même machine, pour avoir de vraies données.

### Étapes
1. Récupérer le dépôt :
   ```powershell
   git clone https://github.com/maelmrcpl/dashboard-veille.git
   cd dashboard-veille
   ```
2. Installer les dépendances :
   ```powershell
   pip install -r requirements.txt
   ```
3. Adapter `config.json` à ta machine : remplacer les chemins absolus `C:/Users/HTTN6172/Documents/veille-ia/data/...` par l'emplacement du dépôt `veille-ia`, y compris `global_audio` (dossier des audios globaux). Voir [Configuration](#configuration).
4. (Facultatif) Sans agent, générer de faux JSON pour tester, puis pointer les chemins de `config.json` vers `data/<catégorie>` :
   ```powershell
   python scripts\make_fake_data.py   # faux JSON pour cyber, reseau, cloud (14 jours)
   ```
5. Lancer le serveur :
   ```powershell
   python server.py
   ```
6. Ouvrir http://127.0.0.1:5000

Le serveur n'écoute que sur `127.0.0.1` : le dashboard n'est accessible que depuis ta machine.

### Pages
- `/` : vue d'ensemble (dernier jour de chaque catégorie) et audio global du jour.
- `/c/<catégorie>` : sujets du jour, lecteur audio de la catégorie et rétrospective sur 14 jours. `/c/` renvoie vers l'accueil.

## Configuration

`config.json` décrit les dossiers de données :
```json
{
  "global_audio": "C:/chemin/vers/veille-ia/data",
  "categories": {
    "ia": {"label": "Intelligence artificielle", "path": "C:/chemin/vers/veille-ia/data/ia"}
  }
}
```
- `categories` : une entrée par catégorie. La clé (`ia`) est l'identifiant utilisé dans les URL et dans le nom du dossier. `label` est le nom affiché. `path` est le dossier de ses fichiers du jour.
- `global_audio` (facultatif) : dossier contenant `AAAA-MM-JJ.wav`, l'audio global de toutes les catégories. Le plus récent est lu sur l'accueil.
- Un chemin relatif part de `config.json` ; un chemin absolu peut pointer vers le dépôt d'un agent.
- Le serveur relit `config.json` tout seul quand il change : pas besoin de le redémarrer.

### Fichiers lus dans le dossier d'une catégorie
- `AAAA-MM-JJ.json` : les sujets du jour (obligatoire). Les 14 derniers jours sont proposés.
- `AAAA-MM-JJ.wav` : l'audio de la catégorie pour ce jour (facultatif). Le lecteur apparaît tout seul dès que le fichier existe.

Format d'un JSON :
```json
{"date": "2026-11-04", "category": "ia",
 "topics": [{"rank": 1, "title": "...", "text": "...",
             "sources": [{"name": "...", "title": "...", "url": "..."}]}]}
```

## Ajouter une catégorie

Exemple : une catégorie « Dev » d'identifiant `dev`.

1. **Côté agent (`veille-ia`)** : déclarer la catégorie dans son code pour qu'il écrive `data/dev/AAAA-MM-JJ.json` (et le `.wav` s'il génère l'audio). C'est ce dépôt qui produit les données ; le dashboard ne fait que les lire.
2. **Config (`config.json`)** : ajouter l'entrée.
   ```json
   "dev": {"label": "Dev", "path": "C:/chemin/vers/veille-ia/data/dev"}
   ```
   Le nom apparaît alors dans la barre de navigation, le pied de page, une tuile de l'accueil et la page `/c/dev`, sans redémarrer.
3. **Couleur (`static/style.css`)** : ajouter une ligne avec les deux couleurs du dégradé de la catégorie, à côté des existantes.
   ```css
   [data-cat="dev"] { --cat: #4ade80; --cat2: #22d3ee; }
   ```
   Sans cette ligne, la catégorie fonctionne mais n'a pas de couleur propre (tuile, bulle, titres).
4. **Données de test (facultatif)** : ajouter `"dev"` avec quelques sujets dans `SUBJECTS` de `scripts/make_fake_data.py`, puis relancer le script.

Tant que le dossier de la catégorie n'existe pas ou ne contient aucun JSON, sa tuile affiche « Bientôt » et sa page « Aucune donnée pour le moment ».

## Tests
```powershell
python -m pytest
```
