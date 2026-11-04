import json
import os

import pytest

from server import create_app


def write_day(folder, date, category="demo"):
    report = {"date": date, "category": category, "topics": [{"rank": 1, "title": "T", "text": "x", "sources": []}]}
    (folder / f"{date}.json").write_text(json.dumps(report), encoding="utf-8")


@pytest.fixture
def client(tmp_path):
    data = tmp_path / "demo"
    data.mkdir()
    write_day(data, "2026-11-01")
    write_day(data, "2026-11-03")
    (data / "notes.json").write_text("{}", encoding="utf-8")
    (tmp_path / "empty").mkdir()
    config = {"categories": {
        "demo": {"label": "Demo", "path": "demo"},
        "empty": {"label": "Vide", "path": "empty"},
        "missing": {"label": "Absent", "path": "nowhere"},
    }}
    (tmp_path / "config.json").write_text(json.dumps(config), encoding="utf-8")
    return create_app(str(tmp_path / "config.json")).test_client()


def test_categories(client):
    ids = [c["id"] for c in client.get("/api/categories").get_json()]
    assert ids == ["demo", "empty", "missing"]


def test_days_sorted_and_filtered(client):
    assert client.get("/api/demo/days").get_json() == ["2026-11-03", "2026-11-01"]


def test_days_empty_or_missing_folder(client):
    assert client.get("/api/empty/days").get_json() == []
    assert client.get("/api/missing/days").get_json() == []


def test_days_limited_to_14(client, tmp_path):
    for i in range(1, 20):
        write_day(tmp_path / "demo", f"2026-10-{i:02d}")
    assert len(client.get("/api/demo/days").get_json()) == 14


def test_day_content(client):
    assert client.get("/api/demo/2026-11-03").get_json()["topics"][0]["title"] == "T"


def test_unknown_category(client):
    assert client.get("/api/nope/days").status_code == 404
    assert client.get("/c/nope").status_code == 404


def test_missing_day(client):
    assert client.get("/api/demo/2026-01-01").status_code == 404


def test_invalid_date(client):
    assert client.get("/api/demo/..%5Cconfig").status_code in (400, 404)
    assert client.get("/api/demo/abc").status_code == 400


def test_category_root_redirects_home(client):
    for url in ("/c", "/c/"):
        response = client.get(url)
        assert response.status_code == 302
        assert response.headers["Location"] == "/"


def test_audio_served_when_present(client, tmp_path):
    (tmp_path / "demo" / "2026-11-03.wav").write_bytes(b"RIFFfakewav")
    assert client.get("/api/demo/2026-11-03").get_json()["has_audio"] is True
    response = client.get("/api/demo/2026-11-03/audio")
    assert response.status_code == 200
    assert response.mimetype == "audio/wav"
    assert response.data == b"RIFFfakewav"


def test_audio_range_request(client, tmp_path):
    (tmp_path / "demo" / "2026-11-03.wav").write_bytes(b"0123456789")
    response = client.get("/api/demo/2026-11-03/audio", headers={"Range": "bytes=2-5"})
    assert response.status_code == 206
    assert response.data == b"2345"


def test_audio_absent(client):
    assert client.get("/api/demo/2026-11-01").get_json()["has_audio"] is False
    assert client.get("/api/demo/2026-11-01/audio").status_code == 404


def test_audio_invalid_date_or_category(client):
    assert client.get("/api/demo/abc/audio").status_code == 400
    assert client.get("/api/nope/2026-11-01/audio").status_code == 404


def test_global_audio_latest_and_file(tmp_path):
    audio_dir = tmp_path / "global"
    audio_dir.mkdir()
    (audio_dir / "2026-11-02.wav").write_bytes(b"old")
    (audio_dir / "2026-11-04.wav").write_bytes(b"newest")
    (audio_dir / "notes.wav").write_bytes(b"x")
    config = {"global_audio": "global", "categories": {"demo": {"label": "Demo", "path": "demo"}}}
    (tmp_path / "config.json").write_text(json.dumps(config), encoding="utf-8")
    client = create_app(str(tmp_path / "config.json")).test_client()
    assert client.get("/api/global-audio/latest").get_json() == {"date": "2026-11-04", "url": "/api/global-audio/2026-11-04"}
    assert client.get("/api/global-audio/2026-11-04").data == b"newest"
    assert client.get("/api/global-audio/2026-11-03").status_code == 404
    assert client.get("/api/global-audio/abc").status_code == 400


def test_global_audio_not_configured(client):
    assert client.get("/api/global-audio/latest").get_json() is None
    assert client.get("/api/global-audio/2026-11-03").status_code == 404


def test_config_reloaded_when_file_changes(client, tmp_path):
    assert len(client.get("/api/categories").get_json()) == 3
    config = {"categories": {"only": {"label": "Seule", "path": "demo"}}}
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps(config), encoding="utf-8")
    os.utime(config_file, (1, 1_900_000_000))
    assert [c["id"] for c in client.get("/api/categories").get_json()] == ["only"]


def test_pages(client):
    assert client.get("/").status_code == 200
    assert client.get("/c/demo").status_code == 200
