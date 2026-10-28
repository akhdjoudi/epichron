import gzip
import io
import urllib.error

import numpy as np
import pytest

from epichron import geo

SERIES_MATRIX = """!Series_title\t"Genome-wide methylation profiles"
!Sample_title\t"age 67y 1001"\t"age 89y 1002"\t"age 48y 1003"
!Sample_geo_accession\t"GSM1"\t"GSM2"\t"GSM3"
!Sample_source_name_ch1\t"X1001"\t"X1002"\t"X1003"
!Sample_characteristics_ch1\t"age (y): 67"\t"age (y): 89"\t"age (y): 48"
!Sample_characteristics_ch1\t"gender: F"\t"gender: M"\t"gender: F"
!Sample_characteristics_ch1\t"tissue: whole blood"\t"tissue: whole blood"\t"tissue: whole blood"
!series_matrix_table_begin
"ID_REF"\t"GSM1"\t"GSM2"\t"GSM3"
"cg0001"\t0.5\t0.25\tnull
"cg0002"\t0.9\t0.8\t0.7
!series_matrix_table_end
"""


def write_gz(path, text):
    with gzip.open(path, "wt") as f:
        f.write(text)
    return path


@pytest.fixture
def series(tmp_path):
    return write_gz(tmp_path / "GSE1_series_matrix.txt.gz", SERIES_MATRIX)


def test_metadata_parses_characteristics(series):
    meta = geo.read_series_metadata(series)
    assert list(meta.index) == ["GSM1", "GSM2", "GSM3"]
    assert list(meta["age (y)"]) == ["67", "89", "48"]
    assert meta.loc["GSM2", "gender"] == "M"


def test_normalize_metadata_common_columns(series):
    meta = geo.normalize_metadata(geo.read_series_metadata(series), "GSE1")
    assert meta["age"].tolist() == [67, 89, 48]
    assert meta["sex"].tolist() == ["F", "M", "F"]
    assert (meta["dataset"] == "GSE1").all()


def test_normalize_metadata_long_sex_labels(series):
    meta = geo.read_series_metadata(series)
    meta["gender"] = ["Female", "male", "NA"]
    sex = geo.normalize_metadata(meta, "GSE1")["sex"]
    assert sex.iloc[:2].tolist() == ["F", "M"]
    assert sex.isna().iloc[2]


def test_series_betas_skip_header_and_footer(series):
    betas = geo.read_series_betas(series)
    assert betas.shape == (2, 3)
    assert betas.dtypes.unique().tolist() == [np.float32]
    assert np.isnan(betas.loc["cg0001", "GSM3"])
    assert betas.loc["cg0002", "GSM1"] == pytest.approx(0.9)


def test_suppl_betas_drop_pvalues_and_rename(tmp_path):
    a = write_gz(tmp_path / "m1.txt.gz", "ID_REF\tX1\tX1.1\tX10\tX10.1\ncg0001\t0.8\t0\tNA\t0.2\ncg0002\t0.1\t0\t0.3\t0\n")
    b = write_gz(tmp_path / "m2.txt.gz", "ID_REF\tX2\tX2.1\ncg0001\t0.6\t0\ncg0002\t0.4\t0\n")
    betas = geo.read_suppl_betas([a, b], {"X1": "GSM1", "X2": "GSM2", "X10": "GSM10"})
    assert list(betas.columns) == ["GSM1", "GSM2", "GSM10"]
    assert betas.loc["cg0002", "GSM10"] == pytest.approx(0.3)
    assert np.isnan(betas.loc["cg0001", "GSM10"])


def test_series_dir():
    assert geo.series_dir("GSE40279") == "https://ftp.ncbi.nlm.nih.gov/geo/series/GSE40nnn/GSE40279"


class FakeResponse(io.BytesIO):
    def __init__(self, data, status):
        super().__init__(data)
        self.status = status


def fake_server(monkeypatch, content, honor_range=True):
    seen = []

    def urlopen(request, timeout=None):
        rng = request.get_header("Range")
        seen.append(rng)
        if not rng or not honor_range:
            return FakeResponse(content, 200)
        start = int(rng.removeprefix("bytes=").rstrip("-"))
        if start >= len(content):
            raise urllib.error.HTTPError(request.full_url, 416, "Range Not Satisfiable", {}, None)
        return FakeResponse(content[start:], 206)

    monkeypatch.setattr(geo.urllib.request, "urlopen", urlopen)
    return seen


def test_download_resumes_partial_file(tmp_path, monkeypatch):
    dest = tmp_path / "f.bin"
    (tmp_path / "f.bin.part").write_bytes(b"0123")
    seen = fake_server(monkeypatch, b"0123456789")
    geo.download("http://x/f.bin", dest)
    assert dest.read_bytes() == b"0123456789"
    assert seen == ["bytes=4-"]


def test_download_restarts_when_server_ignores_range(tmp_path, monkeypatch):
    dest = tmp_path / "f.bin"
    (tmp_path / "f.bin.part").write_bytes(b"XXXX")
    fake_server(monkeypatch, b"0123456789", honor_range=False)
    geo.download("http://x/f.bin", dest)
    assert dest.read_bytes() == b"0123456789"


def test_download_accepts_complete_part(tmp_path, monkeypatch):
    dest = tmp_path / "f.bin"
    (tmp_path / "f.bin.part").write_bytes(b"0123456789")
    fake_server(monkeypatch, b"0123456789")
    geo.download("http://x/f.bin", dest)
    assert dest.read_bytes() == b"0123456789"
