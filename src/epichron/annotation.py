"""Annotation des sites CpG avec le manifeste Illumina 450K (plateforme GEO GPL13534).

Sortie : data/interim/manifest_450k.parquet, une ligne par site (index cpg) avec
chromosome, position (hg19), gene, region (TSS1500, Body…) et island (Island, Shore…).

Usage : python -m epichron.annotation
"""

import argparse
import gzip
from io import StringIO
from pathlib import Path

import pandas as pd

from epichron.geo import download

MANIFEST_URL = (
    "https://ftp.ncbi.nlm.nih.gov/geo/platforms/GPL13nnn/GPL13534/suppl/"
    "GPL13534_HumanMethylation450_15017482_v.1.1.csv.gz"
)
COLUMNS = {
    "IlmnID": "cpg",
    "CHR": "chromosome",
    "MAPINFO": "position",
    "UCSC_RefGene_Name": "gene",
    "UCSC_RefGene_Group": "region",
    "Relation_to_UCSC_CpG_Island": "island",
}


def first_unique(value) -> str | None:
    """'ELOVL2;ELOVL2;ELOVL2' -> 'ELOVL2'. Un site peut tomber dans plusieurs gènes : on garde le premier."""
    if not isinstance(value, str) or not value:
        return None
    return value.split(";")[0]


def read_manifest(path: Path) -> pd.DataFrame:
    """Lit la section [Assay] du manifeste (les sondes de contrôle qui suivent sont ignorées)."""
    with gzip.open(path, "rt") as f:
        skip = next(i for i, line in enumerate(f) if line.startswith("[Assay]")) + 1
    with gzip.open(path, "rt") as f:
        lines = []
        for i, line in enumerate(f):
            if i < skip:
                continue
            if line.startswith("[Controls]"):
                break
            lines.append(line)

    manifest = pd.read_csv(StringIO("".join(lines)), usecols=list(COLUMNS), dtype=str).rename(columns=COLUMNS)
    manifest["position"] = pd.to_numeric(manifest["position"], errors="coerce").astype("Int64")
    manifest["gene"] = manifest["gene"].map(first_unique)
    manifest["region"] = manifest["region"].map(first_unique)
    return manifest.set_index("cpg")


def main() -> None:
    parser = argparse.ArgumentParser(description="Télécharge et met en forme le manifeste Illumina 450K.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    args = parser.parse_args()

    path = download(MANIFEST_URL, args.data_dir / "raw" / "GPL13534" / MANIFEST_URL.rsplit("/", 1)[1])
    manifest = read_manifest(path)
    out = args.data_dir / "interim" / "manifest_450k.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    manifest.to_parquet(out)
    print(f"{len(manifest)} sites annotés, {manifest.gene.notna().mean():.0%} dans un gène")


if __name__ == "__main__":
    main()
