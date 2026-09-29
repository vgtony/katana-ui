"""Authenticated chart uploads and catalogue reads for the configured repository."""
import json
import logging
import math
import os
import re
import time
import uuid
from contextlib import closing
from datetime import date
from urllib.parse import urljoin, urlsplit

from flask import Blueprint, current_app, g, jsonify, request
import requests
from requests_toolbelt.multipart.encoder import MultipartEncoder
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename
import yaml


helm = Blueprint("helm", __name__, url_prefix="/api/helm")
logger = logging.getLogger("katana.helm")
MAX_BYTES = 104857600
SEMVER = re.compile(
    r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
    r"(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)


def configure_helm(app):
    defaults = {
        "HELM_UPLOAD_ENABLED": "false",
        "HELM_REPOSITORY_URL": "http://10.160.101.73",
        "HELM_UPLOAD_URL": "http://10.160.101.73/api/charts",
        "HELM_UPLOAD_TOKEN": "",
        "HELM_UPLOAD_ADMIN_USER": "",
        "HELM_UPLOAD_ADMIN_PASSWORD_HASH": "",
        "HELM_UPLOAD_CONNECT_TIMEOUT_SECONDS": "10",
        "HELM_UPLOAD_TIMEOUT_SECONDS": "300",
        "HELM_UPLOAD_MAX_BYTES": str(MAX_BYTES),
    }
    for key, default in defaults.items():
        app.config.setdefault(key, os.environ.get(key, default))
    config = app.config
    config["HELM_UPLOAD_ENABLED"] = str(config["HELM_UPLOAD_ENABLED"]).lower() in ("true", "1")
    if not config["HELM_UPLOAD_ENABLED"]:
        return
    for key in ("HELM_UPLOAD_TOKEN", "HELM_UPLOAD_ADMIN_USER", "HELM_UPLOAD_ADMIN_PASSWORD_HASH"):
        if not config[key] or any(char in config[key] for char in "\r\n"):
            raise ValueError(f"{key} must be configured when Helm uploads are enabled")
    if not re.fullmatch(r"[A-Za-z0-9_.@-]{1,128}", config["HELM_UPLOAD_ADMIN_USER"]):
        raise ValueError("HELM_UPLOAD_ADMIN_USER must be a valid administrator username")
    try:
        password_hash = config["HELM_UPLOAD_ADMIN_PASSWORD_HASH"]
        method, salt, digest = password_hash.split("$")
        if not method.startswith(("scrypt:", "pbkdf2:")) or not salt or not re.fullmatch(r"[0-9a-f]{64,}", digest):
            raise ValueError()
        check_password_hash(password_hash, "configuration-check")
    except (ValueError, TypeError):
        raise ValueError("HELM_UPLOAD_ADMIN_PASSWORD_HASH must be a Werkzeug password hash") from None
    for key in ("HELM_REPOSITORY_URL", "HELM_UPLOAD_URL"):
        if not safe_url(config[key]) or urlsplit(config[key]).query:
            raise ValueError(f"{key} must be an HTTP(S) URL without credentials, query or fragment")
    for key in ("HELM_UPLOAD_CONNECT_TIMEOUT_SECONDS", "HELM_UPLOAD_TIMEOUT_SECONDS"):
        try:
            value = float(config[key])
            if not math.isfinite(value) or value <= 0:
                raise ValueError()
            config[key] = value
        except (ValueError, TypeError):
            raise ValueError(f"{key} must be a positive number") from None
    try:
        config["HELM_UPLOAD_MAX_BYTES"] = int(config["HELM_UPLOAD_MAX_BYTES"])
        if not 0 < config["HELM_UPLOAD_MAX_BYTES"] <= MAX_BYTES:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("HELM_UPLOAD_MAX_BYTES must be between 1 and 104857600") from None


def safe_url(value):
    if not isinstance(value, str) or any(ord(char) < 32 for char in value):
        return False
    try:
        url = urlsplit(value)
        return url.scheme in ("http", "https") and bool(url.hostname) and not (
            url.username or url.password or url.fragment
        )
    except ValueError:
        return False


def error(message, status):
    return jsonify(error=message, request_id=g.helm_request_id), status


@helm.before_request
def authorize():
    g.helm_request_id = uuid.uuid4().hex
    g.helm_started = time.monotonic()
    if request.method == "OPTIONS":
        return None
    config = current_app.config
    if not config["HELM_UPLOAD_ENABLED"]:
        return error("Helm chart management is not configured on this Katana server.", 503)
    auth = request.authorization
    # ponytail: one chart administrator; reuse shared user authentication when Katana adds it.
    if not (auth and auth.type == "basic" and auth.username == config["HELM_UPLOAD_ADMIN_USER"]
            and auth.password and len(auth.password) <= 1024
            and check_password_hash(config["HELM_UPLOAD_ADMIN_PASSWORD_HASH"], auth.password)):
        # No browser HTTP-auth challenge: credentials are sent explicitly by the UI.
        return error("Sign in with the chart administrator username and password.", 401)
    g.helm_user = auth.username
    # Leave room for multipart headers while enforcing the exact archive limit below.
    request.max_content_length = config["HELM_UPLOAD_MAX_BYTES"] + 65536
    request.max_form_memory_size = 524288
    request.max_form_parts = 2


@helm.after_request
def audit(response):
    response.headers["X-Request-ID"] = g.helm_request_id
    response.headers["Cache-Control"] = "no-store"
    logger.info(
        "helm request_id=%s user=%s method=%s filename=%s bytes=%s status=%s upstream=%s chart=%s version=%s duration_ms=%d",
        g.helm_request_id, getattr(g, "helm_user", "anonymous"), request.method,
        getattr(g, "helm_filename", "-"), getattr(g, "helm_size", 0), response.status_code,
        getattr(g, "helm_upstream", "-"), getattr(g, "helm_chart", "-"),
        getattr(g, "helm_version", "-"), (time.monotonic() - g.helm_started) * 1000,
    )
    return response


@helm.errorhandler(RequestEntityTooLarge)
def too_large(_exc):
    return error("Upload exceeds the configured chart size or multipart limits.", 413)


@helm.errorhandler(BadRequest)
def bad_request(_exc):
    return error("Invalid multipart upload. Choose one packaged Helm chart (.tgz).", 400)


def read_response(response, limit):
    data = bytearray()
    for chunk in response.iter_content(65536):
        data.extend(chunk)
        if len(data) > limit:
            raise ValueError("Repository response is too large")
    return bytes(data)


def timeout():
    config = current_app.config
    return (config["HELM_UPLOAD_CONNECT_TIMEOUT_SECONDS"], config["HELM_UPLOAD_TIMEOUT_SECONDS"])


@helm.post("/charts")
def upload_chart():
    if request.mimetype != "multipart/form-data":
        return error("Send one multipart field named chart containing a .tgz file.", 415)
    files = list(request.files.items(multi=True))
    if len(files) != 1 or files[0][0] != "chart" or request.form:
        return error("Provide exactly one file in the chart field and no other fields.", 400)
    chart = files[0][1]
    with closing(chart):
        filename = secure_filename(chart.filename or "")
        if not filename.endswith(".tgz") or len(filename) > 255:
            return error("Choose a packaged Helm chart with a .tgz filename.", 415)
        g.helm_filename = filename
        chart.stream.seek(0, os.SEEK_END)
        g.helm_size = chart.stream.tell()
        chart.stream.seek(0)
        if not g.helm_size:
            return error("The chart file is empty.", 400)
        if g.helm_size > current_app.config["HELM_UPLOAD_MAX_BYTES"]:
            return error("The chart exceeds the configured upload size limit.", 413)
        encoder = MultipartEncoder({"chart": (filename, chart.stream, "application/gzip")})
        token = current_app.config["HELM_UPLOAD_TOKEN"]
        try:
            with requests.post(
                current_app.config["HELM_UPLOAD_URL"], data=encoder,
                headers={"Authorization": f"Bearer {token}", "Content-Type": encoder.content_type},
                timeout=timeout(), allow_redirects=False, stream=True,
            ) as response:
                g.helm_upstream = response.status_code
                if response.status_code not in (200, 201):
                    messages = {
                        401: (502, "Repository authentication failed. Contact the Katana administrator."),
                        403: (502, "The repository rejected this Katana host. Check the Nginx source-IP allowlist."),
                        409: (409, "This chart name and version already exist. Create a package with a new chart version."),
                        413: (413, "The repository rejected the upload size. Its maximum is 100 MiB."),
                        415: (415, "The repository requires a packaged Helm chart (.tgz)."),
                        422: (422, "The repository rejected the archive or its Chart.yaml metadata."),
                    }
                    status, message = messages.get(response.status_code, (
                        502, "The Helm repository is unavailable or returned an unexpected response."
                    ))
                    if response.status_code == 422:
                        try:
                            detail = json.loads(read_response(response, 65536)).get("error")
                            if isinstance(detail, str):
                                message = "".join(char for char in detail.replace(token, "[redacted]")
                                                  if char.isprintable())[:500] or message
                        except (ValueError, AttributeError):
                            pass
                    return error(message, status)
                result = json.loads(read_response(response, 65536))
                if not isinstance(result, dict) or not all(
                    isinstance(result.get(key), str) and 0 < len(result[key]) <= 2048
                    and token not in result[key]
                    for key in ("name", "version", "filename", "sha256", "url")
                ) or not safe_url(result["url"]) or not re.fullmatch(r"[0-9a-fA-F]{64}", result["sha256"]):
                    raise ValueError("Invalid upload response")
                result = {key: result[key] for key in ("name", "version", "filename", "sha256", "url")}
                version_key(result["version"])
                g.helm_chart = json.dumps(result["name"])
                g.helm_version = json.dumps(result["version"])
                result.update(size=g.helm_size, request_id=g.helm_request_id)
                return jsonify(result), 201
        except requests.RequestException:
            return error("Repository connection failed or timed out. Refresh the catalogue before retrying; the upload may have completed.", 503)
        except (ValueError, TypeError):
            return error("The repository returned invalid upload metadata. Refresh the catalogue before retrying.", 502)


def version_key(version):
    match = SEMVER.fullmatch(version)
    if not match:
        raise ValueError("Invalid chart version")
    major, minor, patch, prerelease = match.groups()
    identifiers = tuple((0, int(part)) if part.isdigit() else (1, part)
                        for part in (prerelease or "").split("."))
    return int(major), int(minor), int(patch), prerelease is None, identifiers


@helm.get("/charts")
def list_charts():
    base = current_app.config["HELM_REPOSITORY_URL"].rstrip("/") + "/"
    try:
        # Catalogue requests never carry the upload token or browser authorization.
        with requests.get(urljoin(base, "index.yaml"), timeout=timeout(),
                          allow_redirects=False, stream=True) as response:
            g.helm_upstream = response.status_code
            if response.status_code != 200:
                return error("Unable to read the Helm repository catalogue.", 502)
            index = yaml.safe_load(read_response(response, 2 * 1024 * 1024))
        if not isinstance(index, dict):
            raise ValueError("Invalid index")
        entries = index.get("entries", {})
        if entries is None:
            entries = {}
        if not isinstance(entries, dict) or not all(isinstance(name, str) for name in entries):
            raise ValueError("Invalid entries")
        charts = []
        for name in sorted(entries):
            versions = []
            if not isinstance(entries[name], list):
                raise ValueError("Invalid versions")
            for entry in entries[name]:
                if not isinstance(entry, dict) or not isinstance(entry.get("version"), str):
                    raise ValueError("Invalid entry")
                version_key(entry["version"])
                urls = entry.get("urls") or []
                if not isinstance(urls, list):
                    raise ValueError("Invalid chart URLs")
                url = urljoin(base, urls[0]) if urls and isinstance(urls[0], str) else ""
                if url and not safe_url(url):
                    raise ValueError("Invalid chart URL")
                item = {}
                for key in ("version", "appVersion", "description", "digest", "created"):
                    value = entry.get(key)
                    if value is not None and not isinstance(value, (str, int, float, date)):
                        raise ValueError("Invalid chart metadata")
                    item[key] = "" if value is None else str(value)
                item["url"] = url
                versions.append(item)
            charts.append({"name": name, "versions": sorted(
                versions, key=lambda item: version_key(item["version"]), reverse=True
            )})
        return jsonify(charts=charts, max_bytes=current_app.config["HELM_UPLOAD_MAX_BYTES"])
    except requests.RequestException:
        return error("The Helm repository catalogue is temporarily unavailable.", 503)
    except (ValueError, TypeError, yaml.YAMLError):
        return error("The Helm repository returned an invalid catalogue.", 502)
