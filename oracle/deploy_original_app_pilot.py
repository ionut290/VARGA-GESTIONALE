#!/usr/bin/env python3
"""Safely roll out the Oracle Gestionale pilot API and its isolated UI preview.

The script requires root on the Oracle host. It replaces only the API source
inside the existing Compose project, rebuilds/restarts only the API service,
checks health, and then invokes the guarded static preview publisher. It never
runs database migrations or writes application records.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

SRC = Path(__file__).resolve().parent
SOURCE_MAIN = SRC / "backend" / "main.py"
API_CONTAINER = "vg-gestionale-oracle-api-1"
DB_CONTAINER = "vg-gestionale-oracle-db-1"
EXPECTED_PROJECT = "vg-gestionale-oracle"
HEALTH_URL = "https://gestionale.radio-romanii-italia.duckdns.org/api/gestionale/v1/health"
BACKUP_ROOT = Path("/var/backups/vg-gestionale-oracle")


def command(args: list[str], timeout: int = 120) -> str:
    result = subprocess.run(args, check=False, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError("Comando Docker non riuscito; dettagli non esposti.")
    return result.stdout.strip()


def inspect_container(name: str) -> dict:
    return json.loads(command(["docker", "inspect", name]))[0]


def api_health() -> bool:
    try:
        request = urllib.request.Request(HEALTH_URL, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=8) as response:
            body = json.loads(response.read(2048))
            return response.status == 200 and body.get("ready") is True
    except Exception:
        return False


def wait_health(seconds: int = 45) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if api_health():
            return True
        time.sleep(2)
    return False


def atomic_copy(source: Path, destination: Path) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".vg-api-", dir=str(destination.parent))
    try:
        with os.fdopen(fd, "wb") as output, source.open("rb") as input_file:
            shutil.copyfileobj(input_file, output)
        os.chmod(temporary, destination.stat().st_mode & 0o777)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def compose(project_dir: Path, compose_file: Path, *args: str, timeout: int = 180) -> None:
    command(["docker", "compose", "--project-directory", str(project_dir),
             "--project-name", EXPECTED_PROJECT, "-f", str(compose_file), *args], timeout)


def main() -> int:
    if os.geteuid() != 0:
        print("Eseguire con sudo.")
        return 2
    if not SOURCE_MAIN.is_file() or SOURCE_MAIN.is_symlink():
        print("Sorgente API mancante o non valida.")
        return 2
    try:
        api = inspect_container(API_CONTAINER)
        database = inspect_container(DB_CONTAINER)
        labels = api.get("Config", {}).get("Labels") or {}
        project = labels.get("com.docker.compose.project")
        workdir_text = labels.get("com.docker.compose.project.working_dir")
        config_text = labels.get("com.docker.compose.project.config_files", "")
        if project != EXPECTED_PROJECT or not workdir_text or not config_text:
            raise RuntimeError("Il container API non appartiene al progetto Oracle atteso.")
        if api.get("State", {}).get("Running") is not True:
            raise RuntimeError("Il servizio API attuale non è in esecuzione.")
        if database.get("State", {}).get("Status") != "running" or database.get("State", {}).get("Health", {}).get("Status") != "healthy":
            raise RuntimeError("Il database Oracle non risulta sano; rilascio interrotto.")
        workdir = Path(workdir_text).resolve()
        compose_file = Path(config_text.split(",")[0]).resolve()
        destination = (workdir / "backend" / "main.py").resolve()
        if workdir not in destination.parents or not compose_file.is_file() or not destination.is_file() or destination.is_symlink():
            raise RuntimeError("Percorsi del progetto Compose non validi.")
        compose(workdir, compose_file, "config", "--quiet", timeout=30)
        BACKUP_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
        backup_dir = BACKUP_ROOT / datetime.now(timezone.utc).strftime("api-%Y%m%dT%H%M%SZ")
        backup_dir.mkdir(mode=0o700)
        backup = backup_dir / "main.py"
        shutil.copy2(destination, backup)
        old_hash = hashlib.sha256(backup.read_bytes()).hexdigest()
        new_hash = hashlib.sha256(SOURCE_MAIN.read_bytes()).hexdigest()
        if old_hash == new_hash:
            print("API già aggiornata; verifico e pubblico l'anteprima.")
        else:
            atomic_copy(SOURCE_MAIN, destination)
            try:
                compose(workdir, compose_file, "build", "api")
                compose(workdir, compose_file, "up", "-d", "--no-deps", "api")
                if not wait_health():
                    raise RuntimeError("Controllo salute API non superato.")
            except Exception:
                atomic_copy(backup, destination)
                compose(workdir, compose_file, "build", "api")
                compose(workdir, compose_file, "up", "-d", "--no-deps", "api")
                wait_health()
                raise
            print("API aggiornata; database e dati applicativi non modificati.")
        publisher = SRC / "publish_original_app_preview.py"
        result = subprocess.run([sys.executable, str(publisher)], check=False, timeout=180)
        if result.returncode:
            print("API aggiornata; pubblicazione anteprima non completata.")
            return result.returncode
        if not wait_health():
            raise RuntimeError("Verifica finale API non superata.")
        print("Rilascio pilota completato. Anteprima: https://gestionale.radio-romanii-italia.duckdns.org/oracle/original-app.html")
        return 0
    except Exception as error:
        print("Rilascio interrotto:", str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
