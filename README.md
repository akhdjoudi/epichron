# EpiChron

**Horloge épigénétique : prédire l'âge biologique à partir de la méthylation de l'ADN.**

Avec l'âge, certains sites de notre ADN (les sites CpG) se méthylent ou se déméthylent de façon très régulière.
EpiChron (*épigénétique* et *chronologie*) apprend ce rythme sur des données publiques et prédit l'**âge biologique**
d'une personne à partir d'une prise de sang, puis le compare à son âge réel.

## Objectifs

- Reproduire une horloge épigénétique de référence (ElasticNet, à la Horvath 2013) puis tenter de faire mieux.
- **Valider sur une cohorte jamais vue** à l'entraînement, pas seulement sur un découpage du même jeu.
- Expliquer le modèle : quels sites et quels gènes portent l'âge (ELOVL2, FHL2, KLF14…).
- Mesurer l'**accélération du vieillissement** (âge prédit moins âge réel) selon le sexe et le jeu de données.
- Tout présenter dans un site web interactif, avec un modèle qui tourne dans le navigateur.

## Données

Uniquement des données publiques et anonymisées de GEO (puce Illumina 450K, sang total).

| Jeu | Étude | Échantillons | Âges | Rôle |
|---|---|---|---|---|
| [GSE40279](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE40279) | Hannum et al. 2013 | 656 | 19–101 | entraînement |
| [GSE87571](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE87571) | Johansson et al. 2013 | 732 | 14–94 | validation externe |

Le site n'accepte jamais l'ADN de visiteurs : ce sont des données de santé (RGPD).

## Installation

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[ml,dev]"
pytest
```

## Récupérer les données

```bash
python -m epichron.geo GSE40279 GSE87571
```

Environ 4 Go à télécharger. Les fichiers bruts vont dans `data/raw/`, les tables prêtes à l'emploi dans `data/interim/` :

- `<GSE>_betas.parquet` : valeurs bêta (float32), **une ligne par site CpG, une colonne par échantillon**
- `<GSE>_meta.parquet` : une ligne par échantillon (index GSM) avec `age`, `sex`, `tissue`, `dataset`

## Structure

```
src/epichron/   code Python (données, modèles, export)
tests/           tests pytest
notebooks/       exploration et analyses
app/             site web (Next.js)
data/            données locales, ignorées par git
```

## Rôles

| | Personne A : données et modèles | Personne B : analyse et produit |
|---|---|---|
| Données | téléchargement, nettoyage, sites communs aux deux jeux | manifeste Illumina 450K (site → gène, chromosome) |
| Modèles | ElasticNet de référence, LightGBM, réseau de neurones | interprétabilité (SHAP), gènes associés |
| Évaluation | validation croisée entre cohortes | accélération du vieillissement, biais selon l'âge |
| Produit | export du modèle | site web, visualisations, déploiement |

## Fichiers échangés entre A et B

| Fichier | Contenu |
|---|---|
| `cpg_weights.json` | `cpg`, `weight`, `gene`, `chromosome`, `position`, plus l'`intercept` du modèle |
| `predictions.csv` | `gsm`, `dataset`, `age`, `predicted_age` |
| `metrics.json` | erreur absolue moyenne et médiane, corrélation, par jeu de données |

B peut construire le site avec de faux fichiers au même format en attendant les vrais.

## Feuille de route

- [x] 0. Mise en place du dépôt
- [ ] 1. Lire Horvath 2013 et Hannum 2013
- [ ] 2. Données : téléchargement des deux jeux, manifeste 450K
- [ ] 3. Nettoyage : sites communs, valeurs manquantes, présélection des sites
- [ ] 4. Modèle de référence ElasticNet (objectif : 4 à 5 ans d'erreur moyenne)
- [ ] 5. Modèles avancés et tableau comparatif
- [ ] 6. Analyse : gènes clés, accélération du vieillissement, correction du biais
- [ ] 7. Export des fichiers pour le site
- [ ] 8. Site web
- [ ] 9. README final, vidéo de démo, déploiement

## Pièges connus

1. **Fuite de données** : toute sélection de sites se fait sur l'entraînement seulement, jamais sur toutes les données.
2. **Régression vers la moyenne** : le modèle surestime l'âge des jeunes et sous-estime celui des plus âgés. Il faut le montrer et le corriger.
3. **Effets de lot** : les deux jeux viennent de laboratoires différents, avec des prétraitements différents.

## Références

- Horvath S. (2013). *DNA methylation age of human tissues and cell types.* Genome Biology 14, R115.
- Hannum G. et al. (2013). *Genome-wide methylation profiles reveal quantitative views of human aging rates.* Molecular Cell 49(2).
- Johansson Å. et al. (2013). *Continuous aging of the human DNA methylome throughout the human lifespan.* PLoS ONE 8(6).

## Auteurs

- [@akhdjoudi](https://github.com/akhdjoudi)
- [@aymenblk04](https://github.com/aymenblk04)
