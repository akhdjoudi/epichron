# EpiChron

**Horloge épigénétique : prédire l'âge biologique à partir de la méthylation de l'ADN.**

**Site : [epichron.vercel.app](https://epichron.vercel.app)**

Avec l'âge, certains sites de notre ADN (les sites CpG) se méthylent ou se déméthylent de façon très régulière.
EpiChron (*épigénétique* et *chronologie*) apprend ce rythme sur des données publiques et prédit l'**âge biologique**
d'une personne à partir d'une prise de sang, puis le compare à son âge réel.

## Objectifs

- Reproduire une horloge épigénétique de référence (ElasticNet, à la Horvath 2013) puis tenter de faire mieux.
- **Valider sur une cohorte jamais vue** à l'entraînement, pas seulement sur un découpage du même jeu.
- Expliquer le modèle : quels sites et quels gènes portent l'âge (ELOVL2, FHL2, KLF14…).
- Mesurer l'**accélération du vieillissement** (âge prédit moins âge réel) selon le sexe et le jeu de données.
- Tout présenter dans un site web interactif, avec un modèle qui tourne dans le navigateur.

## Résultats

Horloge ElasticNet de **249 sites CpG**, entraînée sur GSE40279 :

| Modèle | Test interne (GSE40279, n = 130) | Cohorte externe (GSE87571, n = 729) |
|---|---|---|
| ElasticNet | 3,8 ans d'erreur moyenne, r = 0,935 | **3,0 ans**, r = 0,986 |
| LightGBM | 4,2 ans, r = 0,924 | 4,0 ans, r = 0,980 |
| Réseau de neurones | 4,3 ans, r = 0,916 | 3,6 ans, r = 0,979 |

ELOVL2, FHL2 et KLF14, les marqueurs connus du vieillissement, ressortent d'eux-mêmes parmi les sites retenus.
LightGBM sur-apprend (erreur quasi nulle sur l'entraînement). Le réseau de neurones (une couche de 64 neurones sur 200 sites, réglé par validation croisée sur le train) sur-apprend peu, mais ne bat pas l'ElasticNet : avec 526 personnes d'entraînement, le modèle linéaire reste le modèle de référence.

## Analyse du biais et de l'accélération

`python -m epichron.analysis` écrit `app/public/data/analysis.json`, `python -m epichron.figures` les graphiques dans `reports/`.

- **Régression vers la moyenne** : pente âge prédit ~ âge réel de 0,94 à l'entraînement et **0,85 sur le test interne** (le modèle surestime les jeunes, sous-estime les vieux). Sur la cohorte externe la pente est de **1,00** : il n'y a pas de biais lié à l'âge, mais un décalage constant de +1,2 an (effet de lot entre laboratoires).
- **Accélération du vieillissement** : calculée comme résidu de la régression de chaque cohorte (indépendante de l'âge). Aucune différence hommes/femmes significative (écart de 0,19 an, p = 0,46).

## Gènes clés (SHAP)

`python -m epichron.shap_analysis` écrit `app/public/data/shap.json` : les sites et les gènes qui pèsent le plus sur l'âge prédit, calculés sur la cohorte externe, en années d'âge prédit.

| Modèle | Gènes en tête (|SHAP| moyen, ans) |
|---|---|
| ElasticNet | ELOVL2 (2,9), KLF14 (1,9), CD46 (0,8), FHL2 (0,8), HSPB1 (0,8) |
| LightGBM | ELOVL2 (5,9), FHL2 (2,4), KLF14 (1,5), RNF180 (0,5), TRIM59 (0,4) |

Les deux modèles, entraînés différemment, retrouvent ELOVL2, FHL2 et KLF14 en tête. Au-delà, ils divergent.

## Limites

Ce que ces résultats permettent d'affirmer, et ce qu'ils ne permettent pas.

- **Deux cohortes seulement.** Un seul jeu d'entraînement (GSE40279) et une seule cohorte externe (GSE87571), toutes deux en sang total sur puce 450K. On ne sait rien de la généralisation à d'autres tissus, d'autres puces ou d'autres populations. L'ascendance des participants n'a pas été analysée.
- **Peu de jeunes à l'entraînement.** 28 personnes de moins de 40 ans sur 526, et seulement 7 dans le test interne (130 personnes). La pente du biais d'âge mesurée sur le test interne (0,85) est donc peu fiable aux jeunes âges, et elle ne se retrouve pas sur la cohorte externe (1,00).
- **Effet de lot.** Les deux cohortes viennent de laboratoires différents. Sur la cohorte externe, l'âge prédit est en moyenne 1,3 an trop élevé, un décalage constant qu'on ne peut corriger qu'avec des âges réels de cette cohorte.
- **Plage d'âges.** Les modèles n'ont vu que des personnes de 14 à 101 ans : rien ne permet de les utiliser sur des enfants plus jeunes.
- **Pas de validation clinique.** Aucune donnée de santé ou de mortalité n'a été utilisée. L'accélération du vieillissement est un écart statistique entre âge prédit et âge réel, pas une mesure de santé. Aucune différence hommes/femmes significative n'a été trouvée, ce qui ne prouve pas qu'il n'y en a pas.
- **SHAP explique le modèle, pas la biologie.** Un gène en tête indique ce sur quoi le modèle s'appuie, pas qu'il cause le vieillissement. Les deux modèles ne s'accordent que sur les trois premiers gènes (ELOVL2, FHL2, KLF14).
- **Réglages sur peu de données.** Avec 526 personnes d'entraînement, l'écart entre ElasticNet (3,0 ans), réseau de neurones (3,6) et LightGBM (4,0) sur une seule cohorte externe ne dit pas lequel est meilleur ailleurs.

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

## Reproduire le modèle

```bash
python -m epichron.annotation   # manifeste Illumina 450K
python -m epichron.preprocess   # sites communs, imputation, présélection (train seulement)
python -m epichron.train        # ElasticNet + LightGBM, métriques
python -m epichron.export       # fichiers du site dans app/public/data/
```

## Site

Une interface en panneaux, inspirée des stations d'imagerie médicale :

- **Génome 3D** : les 23 chromosomes à l'échelle et les 249 sites de l'horloge, éclairés selon la personne choisie.
- **Cernes** : la méthylation moyenne de chaque site par décennie, en coupe de tronc d'arbre, avec l'âge civil et l'âge biologique de la personne en anneaux.
- **Âge réel × âge prédit** : les 859 personnes jamais vues à l'entraînement, et un viseur sur la personne choisie.
- **Pourquoi cet âge ?** : les sites qui ont le plus vieilli ou rajeuni la personne par rapport à quelqu'un de son âge, en années.
- **Visite guidée** en cinq étapes. L'âge est recalculé dans le navigateur, sans serveur.

```bash
cd app
npm install
npm run dev
```

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

Les fichiers vivent dans `app/public/data/`. Tout changement de format se décide à deux et incrémente `version`.

| Fichier | Contenu |
|---|---|
| `cpg_weights.json` | `version`, `model`, `trained_on`, `intercept`, `age_transform`, et la liste `cpgs` (`cpg`, `weight`, `gene`, `chromosome`, `position`, `r`, `trend`) |
| `predictions.csv` | `gsm`, `dataset`, `split` (`train`, `test`, `external`), `sex`, `age`, `predicted_age`, `acceleration` |
| `metrics.json` | par modèle et par jeu : `mae`, `median_ae`, `pearson_r`, `n`, plus `n_cpgs` |
| `samples.json` | 60 personnes externes : `gsm`, `age`, `sex`, `betas` (dans l'ordre de `cpgs`), `lightgbm` |
| `markers.json` | les 6 sites les plus corrélés à l'âge : `cpg`, `gene`, `r`, `points` (âge, bêta) |
| `rings.json` | par décennie d'âge (10 à 90 et plus) : `decade`, `n`, `betas` moyens dans l'ordre de `cpgs` |

B peut construire le site avec de faux fichiers au même format en attendant les vrais.

## Feuille de route

- [x] 0. Mise en place du dépôt
- [ ] 1. Lire Horvath 2013 et Hannum 2013
- [x] 2. Données : téléchargement des deux jeux, manifeste 450K
- [x] 3. Nettoyage : sites communs, valeurs manquantes, présélection des sites
- [x] 4. Modèle de référence ElasticNet (objectif : 4 à 5 ans d'erreur moyenne)
- [x] 5. Modèles avancés et tableau comparatif
- [x] 6. Analyse : gènes clés (SHAP), biais et accélération du vieillissement, voir ci-dessous
- [x] 7. Export des fichiers pour le site
- [x] 8. Site web
- [x] 9. README final, déploiement (https://epichron.vercel.app)

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
