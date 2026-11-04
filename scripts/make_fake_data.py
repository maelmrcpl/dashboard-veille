"""Generate fake daily JSON files (cyber, reseau, cloud) in the veille-ia format."""
import json
import os
import random
from datetime import date, timedelta

DAYS = 14
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

SUBJECTS = {
    "cyber": [
        ("Une faille critique dans un pare-feu exploitée", "Des attaquants exploitent une vulnérabilité non corrigée"),
        ("Un rançongiciel frappe un hôpital", "Un établissement de santé a vu ses systèmes chiffrés"),
        ("Campagne de phishing ciblant les administrateurs", "Des faux mails imitent un portail de connexion"),
        ("Fuite de données chez un opérateur", "Des millions de comptes clients seraient concernés"),
        ("Mise à jour de sécurité mensuelle", "L'éditeur corrige plusieurs failles dont deux déjà exploitées"),
        ("Nouvelle recommandation de l'ANSSI", "L'agence publie un guide sur la sécurisation des accès distants"),
    ],
    "reseau": [
        ("Déploiement du Wi-Fi 7 en entreprise", "Les premiers retours montrent un gain de débit réel"),
        ("Panne majeure chez un opérateur", "Une erreur de configuration BGP a coupé des services"),
        ("Nouveau firmware pour une gamme de switchs", "La version corrige des problèmes de stabilité"),
        ("La 5G privée gagne les sites industriels", "Plusieurs usines adoptent un réseau dédié"),
        ("Évolution du protocole QUIC", "Le standard progresse et les CDN l'adoptent plus largement"),
        ("SD-WAN : consolidation du marché", "Un rachat redistribue les cartes entre éditeurs"),
    ],
    "cloud": [
        ("Kubernetes publie une nouvelle version", "La version apporte de nouvelles fonctions de planification"),
        ("Incident chez un fournisseur cloud", "Une région a connu plusieurs heures de dégradation"),
        ("Terraform et les alternatives open source", "La communauté compare les forks et leurs feuilles de route"),
        ("Baisse des prix du stockage objet", "Un acteur majeur annonce de nouveaux tarifs"),
        ("Optimiser les coûts avec FinOps", "Les équipes réduisent leur facture grâce au suivi par service"),
        ("Linux : un noyau plus économe", "Les mainteneurs annoncent des gains sur la consommation mémoire"),
    ],
}
SOURCES = ["Hacker News", "Reddit r/netsec", "BleepingComputer", "The Register", "Blog officiel"]


def make_topic(rank, subject, rng):
    title, intro = subject
    text = (f"{intro}. " + "Les premiers éléments disponibles indiquent un impact notable pour les équipes concernées. "
            "Plusieurs experts recommandent de vérifier rapidement ses systèmes et de suivre les publications officielles. ") * 3
    sources = [
        {"name": rng.choice(SOURCES), "title": f"{title} ({i + 1})", "url": f"https://example.com/{rank}/{i + 1}"}
        for i in range(rng.randint(1, 4))
    ]
    return {"rank": rank, "title": title, "text": text.strip(), "sources": sources}


def main():
    rng = random.Random(42)
    today = date.today()
    for category, subjects in SUBJECTS.items():
        folder = os.path.join(DATA_DIR, category)
        os.makedirs(folder, exist_ok=True)
        for offset in range(DAYS):
            day = (today - timedelta(days=offset)).isoformat()
            chosen = rng.sample(subjects, rng.randint(4, 6))
            topics = [make_topic(i + 1, s, rng) for i, s in enumerate(chosen)]
            report = {"date": day, "category": category, "topics": topics}
            with open(os.path.join(folder, f"{day}.json"), "w", encoding="utf-8") as file:
                json.dump(report, file, ensure_ascii=False, indent=2)
    print(f"{DAYS} jours générés pour {', '.join(SUBJECTS)}")


if __name__ == "__main__":
    main()
