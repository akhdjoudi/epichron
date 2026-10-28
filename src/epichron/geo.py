"""Téléchargement et mise en forme des jeux de méthylation GEO.

Sortie, pour chaque jeu, dans data/interim/ :
- <GSE>_betas.parquet : valeurs bêta en float32, une ligne par site CpG, une colonne par échantillon (GSM)
- <GSE>_meta.parquet  : une ligne par échantillon (index GSM) avec age, sex, tissue, dataset

Usage : python -m epichron.geo GSE40279 GSE87571
"""

import argparse
import gzip
import re
import shutil
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

GEO_FTP = "https://ftp.ncbi.nlm.nih.gov/geo/series"

# GSE40279 (Hannum 2013) : les bêtas sont dans le series matrix.
# GSE87571 (Johansson 2013) : le series matrix ne contient que les métadonnées,
# les bêtas sont dans deux fichiers supplémentaires (colonnes "X12" = bêta, "X12.1" = p-valeur de détection).
DATASETS = {
    "GSE40279": {"suppl": []},
    "GSE87571": {"suppl": ["GSE87571_matrix1of2.txt.gz", "GSE87571_matrix2of2.txt.gz"]},
}


def series_dir(gse: str) -> str:
    return f"{GEO_FTP}/{gse[:-3]}nnn/{gse}"


def download(url: str, dest: Path) -> Path:
    """Télécharge url vers dest, sauf si le fichier existe déjà. Reprend un .part interrompu."""
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    done = tmp.stat().st_size if tmp.exists() else 0
    request = urllib.request.Request(url, headers={"Range": f"bytes={done}-"} if done else {})
    print(f"téléchargement {url}" + (f" (reprise à {done} octets)" if done else ""))
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            # 206 : le serveur reprend ; 200 : il renvoie tout le fichier, on repart de zéro
            with open(tmp, "ab" if resp.status == 206 else "wb") as out:
                shutil.copyfileobj(resp, out, length=1 << 20)
    except urllib.error.HTTPError as e:
        if e.code != 416:  # 416 : le .part est déjà complet
            raise
    tmp.rename(dest)
    return dest


def _split_line(line: str) -> list[str]:
    return [v.strip('"') for v in line.rstrip("\n").split("\t")]


def read_series_metadata(path: Path) -> pd.DataFrame:
    """Lit l'en-tête d'un series matrix : une ligne par échantillon, index GSM.

    Les lignes "!Sample_characteristics_ch1" ("age (y): 67", "gender: F"...) deviennent des colonnes.
    """
    fields: dict[str, list[str]] = {}
    with gzip.open(path, "rt") as f:
        for line in f:
            if line.startswith("!series_matrix_table_begin"):
                break
            if not line.startswith("!Sample_"):
                continue
            key, *values = _split_line(line)
            key = key.removeprefix("!Sample_")
            if key == "characteristics_ch1":
                for v in values:
                    if ": " in v:
                        name = v.split(": ", 1)[0]
                        break
                else:
                    continue
                fields[name] = [v.split(": ", 1)[1] if ": " in v else None for v in values]
            elif key in ("geo_accession", "title", "source_name_ch1"):
                fields[key] = values
    meta = pd.DataFrame(fields).set_index("geo_accession")
    meta.index.name = "gsm"
    return meta


def normalize_metadata(meta: pd.DataFrame, gse: str) -> pd.DataFrame:
    """Ramène les métadonnées de chaque jeu aux mêmes colonnes : age, sex, tissue, dataset."""
    age_col = next(c for c in meta.columns if re.match(r"age\b", c))
    sex_col = next(c for c in meta.columns if c in ("gender", "sex", "Sex"))
    out = pd.DataFrame(index=meta.index)
    out["age"] = pd.to_numeric(meta[age_col], errors="coerce")
    sex = meta[sex_col].str[0].str.upper()
    out["sex"] = sex.where(sex.isin(["F", "M"]))
    out["tissue"] = meta.get("tissue")
    out["dataset"] = gse
    out["title"] = meta["title"]
    return out


def read_series_betas(path: Path) -> pd.DataFrame:
    """Lit la table de données d'un series matrix (CpG en lignes, GSM en colonnes)."""
    with gzip.open(path, "rt") as f:
        for skip, line in enumerate(f):
            if line.startswith("!series_matrix_table_begin"):
                break
    betas = pd.read_csv(
        path, sep="\t", skiprows=skip + 1, index_col=0, comment="!", na_values=["null", "NA", ""]
    )
    betas.index.name = "cpg"
    return betas.astype(np.float32)


def read_suppl_betas(paths: list[Path], title_to_gsm: dict[str, str]) -> pd.DataFrame:
    """Lit les matrices supplémentaires de GSE87571 : garde les colonnes bêta, renomme en GSM."""
    parts = []
    for path in paths:
        header = pd.read_csv(path, sep="\t", nrows=0).columns
        keep = [c for c in header[1:] if not c.endswith(".1")]
        part = pd.read_csv(
            path,
            sep="\t",
            index_col=0,
            usecols=[header[0], *keep],
            na_values=["NA"],
            dtype={c: np.float32 for c in keep},
        )
        parts.append(part)
    betas = pd.concat(parts, axis=1).rename(columns=title_to_gsm)
    betas = betas[[c for c in title_to_gsm.values() if c in betas.columns]]
    betas.index.name = "cpg"
    return betas


def fetch(gse: str, data_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Télécharge un jeu GEO et écrit betas + métadonnées en Parquet dans data/interim/."""
    raw = data_dir / "raw" / gse
    interim = data_dir / "interim"
    interim.mkdir(parents=True, exist_ok=True)

    matrix = download(f"{series_dir(gse)}/matrix/{gse}_series_matrix.txt.gz", raw / f"{gse}_series_matrix.txt.gz")
    meta = normalize_metadata(read_series_metadata(matrix), gse)

    suppl = DATASETS[gse]["suppl"]
    if suppl:
        paths = [download(f"{series_dir(gse)}/suppl/{name}", raw / name) for name in suppl]
        # Le titre GEO commence par l'identifiant de colonne des matrices ("X12 genomic DNA from whole blood").
        title_to_gsm = {t.split()[0]: gsm for gsm, t in meta["title"].items()}
        betas = read_suppl_betas(paths, title_to_gsm)
    else:
        betas = read_series_betas(matrix)

    meta = meta.loc[betas.columns]
    betas.to_parquet(interim / f"{gse}_betas.parquet")
    meta.to_parquet(interim / f"{gse}_meta.parquet")
    print(f"{gse} : {betas.shape[0]} sites CpG x {betas.shape[1]} échantillons, âges {meta.age.min():.0f}-{meta.age.max():.0f}")
    return betas, meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Télécharge des jeux de méthylation GEO.")
    parser.add_argument("gse", nargs="+", choices=sorted(DATASETS))
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    args = parser.parse_args()
    for gse in args.gse:
        fetch(gse, args.data_dir)


if __name__ == "__main__":
    main()
