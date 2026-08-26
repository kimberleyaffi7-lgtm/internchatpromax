# Deployment Manual — Internal AI Chat

This manual is written for a non-technical operator. The recommended first deployment is Docker Compose on a private Linux VM/server.

## 1. Minimum server

Recommended starting point:

- Ubuntu 24.04 LTS
- 4 CPU cores
- 8 GB RAM minimum; 16 GB preferred for indexing
- 100+ GB SSD, plus object-storage capacity for uploaded files
- A domain name
- HTTPS through a reverse proxy such as Caddy or Nginx
- Firewall allowing only SSH and HTTPS from the internet
- Private/VPN access for an internal-only deployment

Do not expose PostgreSQL, Redis or MinIO directly to the public internet.

## 2. Install Docker

On Ubuntu, install Docker Engine and the Compose plugin using Docker's official installation instructions.

Then verify:

    docker --version
    docker compose version

## 3. Upload the project

Copy the ZIP contents to the server, for example:

    /opt/internal-ai-chat

Enter the directory:

    cd /opt/internal-ai-chat

## 4. Create the environment file

Copy:

    cp .env.example .env

Edit `.env`.

Generate a strong JWT secret:

    openssl rand -hex 32

Generate the 32-byte encryption key:

    openssl rand -hex 32

Put the second value into `ENCRYPTION_KEY`.

Also change:

- POSTGRES_PASSWORD in docker-compose.yml
- S3_ACCESS_KEY / S3_SECRET_KEY
- JWT_SECRET
- ENCRYPTION_KEY
- PUBLIC_ORIGIN
- COOKIE_SECURE=true when HTTPS is enabled

The `.env` file must never be committed to Git.

## 5. Start the application

Run:

    docker compose up -d --build

Check status:

    docker compose ps

Check application logs:

    docker compose logs -f app

Check worker logs:

    docker compose logs -f worker

Open:

    http://SERVER-IP:8080

The first registered account automatically becomes administrator.

## 6. Add your AI provider

Sign in with the first account.

Open:

    Admin → Providers

Add one provider.

### OpenAI-compatible

Use the provider's base API URL and API key. The adapter expects:

    POST /chat/completions
    GET  /models

It also supports:

    POST /embeddings

Examples of compatible gateways can be used by supplying their documented API base URL.

### Anthropic

Provider type:

    Anthropic

Base URL may be left blank for the official endpoint.

Add the model ID, for example the model ID currently supplied by your Anthropic account.

### Google Gemini

Provider type:

    Google Gemini

Base URL may be left blank for the default Gemini API endpoint.

Add the model ID supplied by your Google AI account.

## 7. Configure embeddings

Retrieval works best when an embedding provider is configured.

Set:

    EMBEDDING_PROVIDER_ID=<provider UUID>

and:

    EMBEDDING_MODEL=text-embedding-3-small

The current database schema reserves 1536 dimensions for embeddings.

If you use a different embedding model/dimension, update the vector dimension in `database/schema.sql` and the retrieval/worker validation before enabling it.

## 8. HTTPS

Do not run an internal production system over plain HTTP.

Recommended architecture:

    Internet / VPN
          |
       HTTPS
          |
    Caddy/Nginx
          |
     app:8080
       /     \
  postgres   redis
       \
      minio

Set:

    PUBLIC_ORIGIN=https://your-domain.example
    COOKIE_SECURE=true

Also edit `minio-cors.json` and replace `http://localhost:8080` with your HTTPS application origin.

If using Caddy, proxy the domain to `localhost:8080`.

## 9. MinIO

The Compose stack creates the `internal-ai-files` bucket automatically.

MinIO console is available on port 9001 for administration. Do not expose port 9001 publicly.

The browser receives short-lived signed upload URLs. The application server does not buffer 350 MB files in RAM.

## 10. 350 MB uploads

The upload process is:

1. Browser starts a multipart upload.
2. Server authenticates the user.
3. Server creates an object-storage upload record.
4. Browser uploads 16 MB pieces directly to S3/MinIO.
5. Server completes the multipart upload.
6. Redis/BullMQ queues file processing.
7. Worker extracts supported text.
8. Text is chunked.
9. Embeddings are generated when configured.
10. Chunks are stored in PostgreSQL.
11. Chat retrieves relevant chunks.

The complete 350 MB archive is never inserted into the model context.

## 11. Supported file processing

Text/source examples:

- JS/TS/Python/Java/Go/Rust/PHP
- HTML/CSS
- JSON/XML/YAML/SQL
- Markdown/TXT/CSV

Documents:

- PDF
- DOCX
- XLSX/XLS

Archives:

- ZIP
- TAR/GZIP where the installed parser supports the archive

Images/audio/video are currently stored as files but are not automatically OCR'd/transcribed by this baseline release. Add dedicated workers/providers before relying on those formats.

Unknown binary formats are stored but may have no searchable text.

## 12. Security checklist

Before production:

- [ ] Replace every default password.
- [ ] Generate unique JWT and encryption secrets.
- [ ] Enable HTTPS.
- [ ] Set COOKIE_SECURE=true.
- [ ] Restrict the server with VPN/IP allowlisting where possible.
- [ ] Do not expose PostgreSQL or Redis.
- [ ] Do not expose MinIO console publicly.
- [ ] Enable ClamAV profile for malware scanning and add the scan step to the worker before indexing untrusted files.
- [ ] Configure backup for PostgreSQL.
- [ ] Configure object-storage backups.
- [ ] Configure log rotation.
- [ ] Set retention/deletion policies.
- [ ] Review external-provider data policies before sending uploaded company data.
- [ ] Keep provider API keys out of frontend code and logs.

## 13. ClamAV profile

The Compose file includes an optional ClamAV service under the `security` profile.

Start it with:

    docker compose --profile security up -d --build

The current baseline exposes the ClamAV service infrastructure but the worker must be wired to scan every completed object before indexing if malware scanning is a hard production requirement. Do not treat the optional service alone as proof that files are scanned.

## 14. Backups

PostgreSQL:

    docker compose exec postgres pg_dump -U aiadmin internal_ai > backup.sql

Restore:

    cat backup.sql | docker compose exec -T postgres psql -U aiadmin internal_ai

Also back up the MinIO data volume/object store. Database backup alone does not preserve uploaded files.

## 15. Updates

From the project directory:

    docker compose pull
    docker compose up -d --build

Review release changes before upgrading production.

## 16. Troubleshooting

### App cannot connect to database

Run:

    docker compose logs postgres

Then:

    docker compose ps

The postgres health check must be healthy.

### Worker is not processing files

Run:

    docker compose logs worker

Then:

    docker compose logs redis

### Provider test fails

Check:

- base URL
- API key
- model ID
- provider account limits
- outbound internet access
- provider's current API format

### Upload fails

Check:

- file is <= 350 MB
- MinIO is running
- bucket exists
- browser can reach the S3 public endpoint
- reverse proxy allows PUT requests
- CORS policy is correct for the S3 endpoint

For a production deployment, configure S3/MinIO CORS for the application domain rather than leaving it broadly open.

## 17. Architecture limitations of this release

This is a production-oriented baseline, not a claim that every enterprise control is already implemented.

Before a high-security enterprise rollout, add:

- company SSO/OIDC
- MFA
- formal team/organization tables
- granular RBAC
- CSRF protection for cookie-authenticated state-changing endpoints
- per-user/team rate limits and token budgets
- full audit logging
- malware scanning enforcement
- MIME/content inspection
- secret redaction before AI submission
- configurable external-data policy
- stronger archive sandboxing using a dedicated isolated worker/container
- signed download URLs
- automated backups
- monitoring/metrics/alerts
- provider failover and retry policy

## 18. What is included

The ZIP contains the complete source tree, Docker configuration, database schema, frontend, backend, provider adapters, upload service, queue worker, and this deployment manual.
