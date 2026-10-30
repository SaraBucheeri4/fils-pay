# KYC storage backup and restore

The API explicitly stores originals and thumbnails under `/app/data/kyc`,
mounted from the Compose `filspay_kyc` named volume. Preserve that volume;
`docker compose down -v` deletes it. Backups contain personal documents and
must be encrypted, access restricted and retained according to your policy.
No hosted cutover or data recovery has been performed by adding this mount.

## Before recreating an existing API

Mounting an empty volume hides files in the old container. Before any approved
cutover, stop uploads and copy the old container's configured KYC directory to
a protected host directory. Confirm its actual `KYC_UPLOAD_DIR`; the old default
was `/app/data/kyc`. In PowerShell, from the repository root:

```powershell
$kycContainer = docker compose -f ops/docker-compose.yml ps -q api
if ($LASTEXITCODE -ne 0 -or !$kycContainer) { throw 'API container not found' }
docker compose -f ops/docker-compose.yml stop api
New-Item -ItemType Directory -Path ./kyc-backup-before-mount
docker cp "${kycContainer}:/app/data/kyc/." ./kyc-backup-before-mount
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; do not recreate the API' }
```

Use a new, empty backup directory each time. Verify file counts and SHA-256
hashes before removing the old container. Copy the files into the new volume
before accepting uploads, preserve originals and thumbnails, and restore
ownership to the image's `node` user. For example, create (without starting)
the replacement API with `docker compose -f ops/docker-compose.yml create api`,
obtain its container ID again, then `docker cp ./kyc-backup-before-mount/.
"${kycContainer}:/app/data/kyc"` and run the ownership step below. Retain the
old container/backup until verification is complete.

## Routine backup

Stop API writes as above, copy the directory with `docker cp`, record a manifest
of relative paths, lengths and `Get-FileHash -Algorithm SHA256` values, and take a
matching database backup. Restart the API only after the copy finishes.
Back up the database and KYC directory at the same write-free checkpoint:
`kyc_documents.storage_key` and `thumbnail_storage_key` refer to those files.
Exclude the backup directory from Git; keep it outside the repository on a
real host. The sample directory above is only for disposable local QA.

## Restore drill on a disposable local stack

1. Use a new Compose project name (`-p filspay-kyc-restore`) and fresh volumes.
   Never restore over valuable data. Resolve host-port conflicts before starting
   this stack. Restore the matching database backup using the database runbook.
2. Create its API container without starting it. Obtain its ID with
   `docker compose -p filspay-kyc-restore -f ops/docker-compose.yml ps -aq api`.
   Copy the backed-up directory into `/app/data/kyc` using `docker cp`.
3. Restore ownership without starting the application:
   `docker compose -p filspay-kyc-restore -f ops/docker-compose.yml run --rm --no-deps --user root --entrypoint chown api -R node:node /app/data/kyc`.
4. Copy the restored directory back out to a second empty host directory;
   compare every relative path, file length and SHA-256 hash with the manifest.
5. Start the isolated stack, log in, download an original and thumbnail, then
   recreate **only its API** with `up -d --no-deps --force-recreate api`.
   Verify those downloads and hashes again. An unconfigured OTP provider or
   unavailable Docker engine blocks this step; do not label it verified.

## Identify missing files

Against the matching disposable database, enumerate `id, storage_key,
thumbnail_storage_key` from `kyc_documents`. For each non-null key, check for a
readable file beneath the configured upload directory and compare originals
against `kyc_documents.sha256`. Report missing or mismatched document IDs;
do not delete database records or invent replacement files. Compare thumbnail
files against the backup manifest. Already lost files require another backup or
resubmission; adding a volume cannot recover them. Never publish document
contents, storage keys or backup archives in application logs or Git.

## Verification status

2026-10-30: mount configured; runtime upload/recreation/restore verification is
pending. Local Docker inspection returned an engine HTTP 500, and no disposable
database URL was configured. B92 remains open until the drill succeeds and any
existing missing files are inventoried.
