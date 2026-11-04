# dashboard-veille

Dashboard web local regroupant les veilles quotidiennes (IA, cybersécurité, réseau, cloud / DevOps). Chaque agent de veille écrit un JSON par jour ; le dashboard les lit.

## Installation
```powershell
pip install -r requirements.txt
python scripts\make_fake_data.py   # faux JSON pour cyber, reseau, cloud (14 jours)
```

## Lancement
```powershell
python server.py
```
Puis ouvrir http://127.0.0.1:5000

- `/` : vue d'ensemble (dernier jour de chaque catégorie)
- `/c/<catégorie>` : sujets du jour et rétrospective sur 14 jours

## Configuration des données
`config.json` associe chaque catégorie au dossier de ses JSON (`AAAA-MM-JJ.json`). Un chemin relatif part de `config.json`, un chemin absolu peut pointer vers le dépôt d'un agent. Pour ajouter une catégorie, ajouter une entrée.

Format d'un fichier :
```json
{"date": "2026-11-04", "category": "ia",
 "topics": [{"rank": 1, "title": "...", "text": "...",
             "sources": [{"name": "...", "title": "...", "url": "..."}]}]}
```

## Tests
```powershell
python -m pytest
```
