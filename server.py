import json
import os
import re
import unicodedata

from flask import Flask, abort, jsonify, redirect, request, send_file, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_DAYS = 14
MIN_QUERY = 2
MAX_RESULTS = 50
SNIPPET_WIDTH = 180


def load_categories(config_path=CONFIG_PATH):
    with open(config_path, encoding="utf-8") as file:
        categories = json.load(file)["categories"]
    base = os.path.dirname(os.path.abspath(config_path))
    return {
        key: {"label": value["label"], "path": os.path.join(base, value["path"])}
        for key, value in categories.items()
    }


def load_global_audio_dir(config_path=CONFIG_PATH):
    with open(config_path, encoding="utf-8") as file:
        path = json.load(file).get("global_audio")
    if not path:
        return None
    return os.path.join(os.path.dirname(os.path.abspath(config_path)), path)


def list_days(path):
    if not os.path.isdir(path):
        return []
    days = [n[:-5] for n in os.listdir(path) if DATE_PATTERN.match(n[:-5]) and n.endswith(".json")]
    return sorted(days, reverse=True)[:MAX_DAYS]


def latest_audio_day(path):
    if not path or not os.path.isdir(path):
        return None
    days = [n[:-4] for n in os.listdir(path) if DATE_PATTERN.match(n[:-4]) and n.endswith(".wav")]
    return max(days, default=None)


def fold(text):
    """Lower-case and strip accents, one character in for one out, so offsets stay valid in the original.

    static/app.js has the same function to highlight matches: keep the two in step.
    """
    folded = []
    for char in text:
        base = unicodedata.normalize("NFD", char)[0].lower()
        folded.append(base if len(base) == 1 else char)
    return "".join(folded)


def make_snippet(text, folded, terms):
    """Cut `text` to about SNIPPET_WIDTH characters around the first search term found in it."""
    found = [position for position in (folded.find(term) for term in terms) if position >= 0]
    first = min(found, default=0)
    start = max(0, first - SNIPPET_WIDTH // 3)
    if start:
        space = text.find(" ", start, first)
        start = space + 1 if space >= 0 else start
    end = min(len(text), start + SNIPPET_WIDTH)
    if end < len(text):
        space = text.rfind(" ", first, end)
        end = space if space > first else end
    return ("… " if start else "") + text[start:end].strip() + (" …" if end < len(text) else "")


def search_topics(categories, query):
    """Topics of the listed days whose title, text or source names contain every word of `query`, newest first."""
    terms = fold(query).split()
    results = []
    for cat_id, category in categories.items():
        for day in list_days(category["path"]):
            try:
                with open(os.path.join(category["path"], f"{day}.json"), encoding="utf-8") as file:
                    topics = json.load(file)["topics"]
            except (OSError, ValueError, KeyError, TypeError):
                continue  # one unreadable day must not break the whole search
            for topic in topics:
                title, text = topic.get("title", ""), topic.get("text", "")
                names = " ".join(source.get("name", "") for source in topic.get("sources", []))
                folded_text = fold(text)
                haystack = "\n".join((fold(title), folded_text, fold(names)))
                if all(term in haystack for term in terms):
                    results.append({
                        "category": cat_id, "date": day, "rank": topic.get("rank"),
                        "title": title, "snippet": make_snippet(text, folded_text, terms),
                    })
    results.sort(key=lambda result: result["date"], reverse=True)  # stable: config order, then rank, within a day
    return results


def create_app(config_path=CONFIG_PATH):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    cache = {"mtime": None, "categories": {}, "global_dir": None}

    def get_categories():
        mtime = os.path.getmtime(config_path)
        if mtime != cache["mtime"]:
            cache["categories"] = load_categories(config_path)
            cache["global_dir"] = load_global_audio_dir(config_path)
            cache["mtime"] = mtime
        return cache["categories"]

    def get_category(cat):
        categories = get_categories()
        if cat not in categories:
            abort(404)
        return categories[cat]

    @app.get("/")
    def overview():
        return send_from_directory("static", "index.html")

    @app.get("/c")
    @app.get("/c/")
    def category_index():
        return redirect("/")

    @app.get("/c/<cat>")
    def category_page(cat):
        # Single-page app: same shell as the overview, the client router renders the category.
        get_category(cat)
        return send_from_directory("static", "index.html")

    @app.get("/api/search")
    def api_search():
        query = request.args.get("q", "").strip()
        results = search_topics(get_categories(), query) if len(query) >= MIN_QUERY else []
        return jsonify({"query": query, "total": len(results), "results": results[:MAX_RESULTS]})

    @app.get("/api/categories")
    def api_categories():
        return jsonify([{"id": key, "label": value["label"]} for key, value in get_categories().items()])

    @app.get("/api/global-audio/latest")
    def api_global_audio_latest():
        get_categories()
        day = latest_audio_day(cache["global_dir"])
        if day is None:
            return jsonify(None)
        return jsonify({"date": day, "url": f"/api/global-audio/{day}"})

    @app.get("/api/global-audio/<date>")
    def api_global_audio(date):
        get_categories()
        if not DATE_PATTERN.match(date):
            abort(400)
        file_path = os.path.join(cache["global_dir"] or "", f"{date}.wav")
        if not cache["global_dir"] or not os.path.isfile(file_path):
            abort(404)
        return send_file(file_path, mimetype="audio/wav", conditional=True)

    @app.get("/api/<cat>/days")
    def api_days(cat):
        return jsonify(list_days(get_category(cat)["path"]))

    @app.get("/api/<cat>/<date>")
    def api_day(cat, date):
        path = get_category(cat)["path"]
        if not DATE_PATTERN.match(date):
            abort(400)
        file_path = os.path.join(path, f"{date}.json")
        if not os.path.isfile(file_path):
            abort(404)
        with open(file_path, encoding="utf-8") as file:
            report = json.load(file)
        report["has_audio"] = os.path.isfile(os.path.join(path, f"{date}.wav"))
        return jsonify(report)

    @app.get("/api/<cat>/<date>/audio")
    def api_audio(cat, date):
        path = get_category(cat)["path"]
        if not DATE_PATTERN.match(date):
            abort(400)
        file_path = os.path.join(path, f"{date}.wav")
        if not os.path.isfile(file_path):
            abort(404)
        return send_file(file_path, mimetype="audio/wav", conditional=True)

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=True)
