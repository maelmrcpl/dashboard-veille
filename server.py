import json
import os
import re

from flask import Flask, abort, jsonify, redirect, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_DAYS = 14


def load_categories(config_path=CONFIG_PATH):
    with open(config_path, encoding="utf-8") as file:
        categories = json.load(file)["categories"]
    base = os.path.dirname(os.path.abspath(config_path))
    return {
        key: {"label": value["label"], "path": os.path.join(base, value["path"])}
        for key, value in categories.items()
    }


def list_days(path):
    if not os.path.isdir(path):
        return []
    days = [n[:-5] for n in os.listdir(path) if DATE_PATTERN.match(n[:-5]) and n.endswith(".json")]
    return sorted(days, reverse=True)[:MAX_DAYS]


def create_app(config_path=CONFIG_PATH):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    categories = load_categories(config_path)

    def get_category(cat):
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
        get_category(cat)
        return send_from_directory("static", "category.html")

    @app.get("/api/categories")
    def api_categories():
        return jsonify([{"id": key, "label": value["label"]} for key, value in categories.items()])

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
            return jsonify(json.load(file))

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=True)
