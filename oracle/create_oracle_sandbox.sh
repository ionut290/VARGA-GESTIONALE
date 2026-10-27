#!/usr/bin/env bash
# Create one synthetic Oracle sandbox; never copy or modify real business records.
# Only existing approved Oracle admin gets write access to this new workspace.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
if [[ "$#" -ne 1 || ! "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "Uso: sudo bash oracle/create_oracle_sandbox.sh email_account_oracle" >&2
  exit 2
fi
email="$1"
workspace="gestionale_sandbox_20261027"
staging="gestionale_backup_20261027"
echo "=== AMBIENTE DI TEST ORACLE: SOLO DATI FITTIZI ==="
health="$(curl -sS --max-time 8 http://127.0.0.1:18098/api/gestionale/v1/health || true)"
if [[ "$health" != *'"ready":true'* ]]; then
  echo "STOP: API locale non pronta" >&2
  exit 2
fi
if [[ ! -f compose.yaml || ! -f schema.sql ]]; then
  echo "STOP: Compose backend non riconosciuto" >&2
  exit 2
fi
admin_count="$(docker compose -p vg-gestionale-oracle exec -T db \
  psql -X -q -t -A -v ON_ERROR_STOP=1 -v target_email="$email" \
  -U varga_gestionale -d varga_gestionale <<'SQL'
SELECT count(*) FROM vg.users u JOIN vg.workspace_members m
  ON m.user_id=u.id
 WHERE u.email=:'target_email' AND u.role='admin' AND u.active=true
   AND m.workspace_id='gestionale_backup_20261027'
   AND m.can_write=false;
SQL
)"
if [[ "$admin_count" != "1" ]]; then
  echo "STOP: account amministratore di collaudo già autorizzato non trovato." >&2
  exit 2
fi
already="$(docker compose -p vg-gestionale-oracle exec -T db \
  psql -X -q -t -A -v ON_ERROR_STOP=1 \
  -U varga_gestionale -d varga_gestionale <<'SQL'
SELECT count(*) FROM vg.workspaces WHERE id='gestionale_sandbox_20261027';
SQL
)"
if [[ "$already" != "0" ]]; then
  echo "SANDBOX ESISTENTE: non modifico dati, account né autorizzazioni."
  echo "Verificare manualmente prima di proseguire."
  exit 0
fi
echo "=== CREAZIONE TRANSAZIONALE WORKSPACE DI PROVA ==="
docker compose -p vg-gestionale-oracle exec -T db \
 psql -X -q -v ON_ERROR_STOP=1 -v target_email="$email" \
 -U varga_gestionale -d varga_gestionale <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('vg-gestionale-oracle-sandbox-20261027'));
DO $block$
BEGIN
  IF EXISTS(SELECT 1 FROM vg.workspaces WHERE id='gestionale_sandbox_20261027') THEN
    RAISE EXCEPTION 'Sandbox presente. Nessuna sovrascrittura.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM vg.workspaces WHERE id='gestionale_backup_20261027') THEN
    RAISE EXCEPTION 'Archivio del 27 ottobre non presente';
  END IF;
END
$block$;
INSERT INTO vg.workspaces(id,revision,snapshot)
 VALUES ('gestionale_sandbox_20261027',0,'{}'::jsonb);
INSERT INTO vg.workspace_sections(workspace_id,section,revision,data)
 VALUES
 ('gestionale_sandbox_20261027','clients',1,
  '[{"id":"demo-cl-01","name":"CLIENTE ESEMPIO - DATI FITTIZI","note":"Solo ambiente di test Oracle"}]'::jsonb),
 ('gestionale_sandbox_20261027','jobs',1,
  '[{"id":"demo-job-01","name":"COMMESSA DI PROVA","clientId":"demo-cl-01","stato":"da fare"}]'::jsonb),
 ('gestionale_sandbox_20261027','quotes',1,
  '[{"id":"demo-q-01","name":"PREVENTIVO DI PROVA","clientId":"demo-cl-01","totale":150}]'::jsonb),
 ('gestionale_sandbox_20261027','consuntivi',1,
  '[{"id":"demo-c-01","name":"CONSUNTIVO DIMOSTRATIVO","ore":2,"stato":"prova"}]'::jsonb);
INSERT INTO vg.workspace_members(workspace_id,user_id,can_write)
 SELECT 'gestionale_sandbox_20261027',u.id,true
 FROM vg.users u JOIN vg.workspace_members m ON m.user_id=u.id
 WHERE u.email=:'target_email' AND u.role='admin' AND u.active=true
   AND m.workspace_id='gestionale_backup_20261027' AND m.can_write=false;
DO $block$
BEGIN
 IF (SELECT count(*) FROM vg.workspace_members
     WHERE workspace_id='gestionale_sandbox_20261027' AND can_write=true)!=1 THEN
   RAISE EXCEPTION 'Unico membro scrivente non stabilito: rollback';
 END IF;
 IF (SELECT count(*) FROM vg.workspace_sections
     WHERE workspace_id='gestionale_sandbox_20261027')!=4 THEN
   RAISE EXCEPTION 'Dati dimostrativi non creati: rollback';
 END IF;
END
$block$;
COMMIT;
SELECT section,jsonb_array_length(data) AS record_demo
 FROM vg.workspace_sections WHERE workspace_id='gestionale_sandbox_20261027'
 ORDER BY section;
SQL
echo "SUCCESSO: sandbox indipendente con 4 sezioni fittizie."
echo "Staging reale 20261027 non modificato; permessi reali ancora sola lettura."
