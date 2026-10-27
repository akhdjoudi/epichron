import gzip

import pandas as pd

from epichron import annotation

MANIFEST = """Illumina, Inc.,,,,,
[Heading],,,,,
Loci Count ,2,,,,
[Assay],,,,,
IlmnID,Name,CHR,MAPINFO,UCSC_RefGene_Name,UCSC_RefGene_Group,Relation_to_UCSC_CpG_Island
cg16867657,cg16867657,6,11044877,ELOVL2;ELOVL2,TSS1500;Body,Island
cg00000029,cg00000029,16,53468112,,,N_Shore
[Controls],,,,,
28684356,STAINING,Red,DNP (High),,,
"""


def test_read_manifest_keeps_assay_section(tmp_path):
    path = tmp_path / "manifest.csv.gz"
    with gzip.open(path, "wt") as f:
        f.write(MANIFEST)
    manifest = annotation.read_manifest(path)
    assert list(manifest.index) == ["cg16867657", "cg00000029"]
    row = manifest.loc["cg16867657"]
    assert (row.chromosome, row.position, row.gene, row.region) == ("6", 11044877, "ELOVL2", "TSS1500")
    assert pd.isna(manifest.loc["cg00000029", "gene"])
