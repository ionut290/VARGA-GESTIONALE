#!/usr/bin/env python3
"""Read-only fail-closed Oracle production cutover audit; never deploys."""
from __future__ import annotations
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = ("clients", "jobs", "quotes", "consuntivi", "invoices", "expenses",
            "deadlines", "documents", "priceLists", "entries", "requests", "company")
DEMO = "gestionale_sandbox_20261027"

def audit(root: Path = ROOT) -> dict:
    oracle = root / "oracle"
    bridge = (oracle / "section-bridge.js").read_text(encoding="utf-8")
    sandbox = (oracle / "original-sandbox.js").read_text(encoding="utf-8")
    progress = (oracle / "MIGRATION_PROGRESS.md").read_text(encoding="utf-8")
    checks = {
        "demo_write_isolated": 'if(writable && this.workspace!==SANDBOX)' in bridge
            and f'const ROOT="{DEMO}"' in sandbox,
        "production_write_enabled": False,
        "all_modules_writable_and_tested": False,
        "multi_session_conflicts_verified": False,
        "persistent_offline_sync_verified": False,
        "user_roles_password_recovery_verified": False,
        "fresh_data_reconciled": False,
        "backup_and_restore_drill_verified": False,
        "pdf_drive_documents_verified": False,
        "rollback_and_radio_isolation_verified": False,
    }
    blockers = [name for name, ok in checks.items() if not ok]
    return {"cutover_ready":not blockers,"checks":checks,"blockers":blockers,
            "required_modules":list(REQUIRED),
            "evidence":"Repository static audit; no live operational verification",
            "progress_document_present":bool(progress)}

def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--json",action="store_true")
    args=parser.parse_args()
    result=audit()
    if args.json:
        print(json.dumps(result,ensure_ascii=False,indent=2))
    else:
        print("ORACLE CUTOVER: "+("READY" if result["cutover_ready"] else "BLOCKED"))
        for key,ok in result["checks"].items():
            print(("OK" if ok else "BLOCK")+" "+key)
        print("Firebase removal: NOT AUTHORIZED" if not result["cutover_ready"]
              else "Review external sign-off before deployment")
    return 0 if result["cutover_ready"] else 2

if __name__=="__main__":
    sys.exit(main())
