# Render + Railway Deployment Manual

This package is specifically prepared for:

- Render Web Service = frontend + API
- Render Background Worker = file indexing worker
- Railway PostgreSQL = database
- Railway Redis = queue
- S3-compatible object storage = uploaded files

Do NOT use local filesystem storage for uploaded 350 MB files in production. Render service disks are not the correct persistent object-storage layer for this application.

## 1. Create Railway PostgreSQL

Create a PostgreSQL service in Railway.

Copy the PostgreSQL connection URL supplied by Railway.

Set it as:

    DATABASE_URL=<Railway PostgreSQL connection URL>

The database schema is in:

    database/schema.sql

The pgvector image is used by the local Docker development configuration from the original baseline, but Railway PostgreSQL must have the `vector` extension available. Verify:

    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

If the Railway PostgreSQL offering you select does not expose pgvector, use a PostgreSQL provider that does, or enable the extension through Railway's supported PostgreSQL setup before production.

## 2. Create Railway Redis

Create a Redis service in Railway.

Set:

    REDIS_URL=<Railway Redis connection URL>

The worker uses Redis/BullMQ for asynchronous file processing.

## 3. Configure object storage

Use an S3-compatible object store such as AWS S3, Cloudflare R2, Backblaze B2 S3 API, or another compatible service.

Create a private bucket:

    internal-ai-files

Set:

    S3_ENDPOINT=<S3-compatible API endpoint>
    S3_PUBLIC_ENDPOINT=<endpoint reachable by the browser for signed PUT URLs>
    S3_REGION=us-east-1
    S3_BUCKET=internal-ai-files
    S3_ACCESS_KEY=<access key>
    S3_SECRET_KEY=<secret key>

Important:

- Do not expose the secret key to the browser.
- Configure bucket CORS for your Render application origin.
- Allow PUT/GET/HEAD as required by signed multipart uploads.
- Expose the ETag response header.
- Keep the bucket private.

## 4. Create Render Web Service

Connect the GitHub repository containing this project.

The repository includes:

    render.yaml

You can use the Render Blueprint flow or create the service manually.

Use:

    Runtime: Docker
    Dockerfile: ./Dockerfile

The web service runs:

    node dist/server.js

Health check:

    /api/health

## 5. Create Render Worker

Create a Render Background Worker using the same repository and Dockerfile.

Worker command:

    node dist/workers/file-processing.js

The worker must receive the same:

- DATABASE_URL
- REDIS_URL
- S3_ENDPOINT
- S3_REGION
- S3_BUCKET
- S3_ACCESS_KEY
- S3_SECRET_KEY
- ENCRYPTION_KEY
- EMBEDDING_PROVIDER_ID
- EMBEDDING_MODEL

Do not run the worker on the web service.

## 6. Required Render environment variables

Set these on the Web Service:

    NODE_ENV=production
    PORT=8080
    PUBLIC_ORIGIN=https://YOUR-RENDER-DOMAIN.onrender.com

    DATABASE_URL=<Railway PostgreSQL URL>
    REDIS_URL=<Railway Redis URL>

    S3_ENDPOINT=<S3 endpoint>
    S3_PUBLIC_ENDPOINT=<S3 endpoint>
    S3_REGION=us-east-1
    S3_BUCKET=<bucket>
    S3_ACCESS_KEY=<access key>
    S3_SECRET_KEY=<secret key>

    JWT_SECRET=<random 32+ byte secret>
    ENCRYPTION_KEY=<64 hex characters>

    MAX_FILE_SIZE_MB=350
    UPLOAD_PART_SIZE_MB=16

    COOKIE_SECURE=true
    COOKIE_SAME_SITE=lax

Generate secrets with:

    openssl rand -hex 32

Use one generated value for JWT_SECRET and another generated value for ENCRYPTION_KEY.

Never reuse example secrets.

## 7. Worker environment variables

The worker needs the same server-side credentials, except PUBLIC_ORIGIN and PORT are not required.

At minimum:

    DATABASE_URL
    REDIS_URL
    S3_ENDPOINT
    S3_REGION
    S3_BUCKET
    S3_ACCESS_KEY
    S3_SECRET_KEY
    JWT_SECRET
    ENCRYPTION_KEY
    EMBEDDING_PROVIDER_ID
    EMBEDDING_MODEL

## 8. Provider API keys

Do NOT place AI provider API keys in:

- frontend JavaScript
- HTML
- GitHub
- Render build arguments
- client-side localStorage

Provider keys are entered through the Admin → Providers interface.

They are encrypted in PostgreSQL with AES-256-GCM and decrypted only by the backend.

## 9. First deployment order

Recommended order:

1. Create Railway PostgreSQL.
2. Confirm pgvector is available.
3. Create Railway Redis.
4. Create S3-compatible private bucket.
5. Configure S3 bucket CORS.
6. Push this repository to GitHub.
7. Create Render Web Service.
8. Add all Render Web environment variables.
9. Deploy.
10. Check `/api/health`.
11. Create Render Background Worker.
12. Add worker environment variables.
13. Deploy worker.
14. Open the Render web URL.
15. Register the first account.
16. The first account becomes administrator.
17. Add an AI provider and model.
18. Test chat.
19. Test a small file.
20. Test a large file only after the small-file flow succeeds.

## 10. S3 CORS

Set the bucket's CORS policy to your actual Render origin.

Conceptually it should allow:

    Origin: https://YOUR-RENDER-DOMAIN.onrender.com
    Methods: GET, PUT, POST, HEAD
    Headers: *
    ExposeHeaders: ETag

For a custom domain, use the custom HTTPS origin instead.

Do not use `*` for production if your storage provider supports a specific origin.

## 11. Custom domain

After the Render service works:

1. Add your custom domain in Render.
2. Configure DNS as Render instructs.
3. Change:

    PUBLIC_ORIGIN=https://your-domain.example

4. Update S3 bucket CORS to the same origin.
5. Redeploy the Web Service.

## 12. 350 MB upload behavior

The browser does NOT send a 350 MB file through the Express request body.

Instead:

1. API creates an upload session.
2. API creates the object-storage multipart upload.
3. Browser asks API for a signed URL for each part.
4. Browser uploads each part directly to object storage.
5. API completes the multipart upload.
6. Redis queues the processing job.
7. Render Worker downloads/processes the file.
8. Extracted text is chunked.
9. Embeddings are created if configured.
10. Chunks are stored in PostgreSQL.
11. Chat retrieval uses relevant chunks.

This is the intended architecture for large files.

## 13. Important Render timeout consideration

File indexing is asynchronous, so the upload-completion API does not perform the complete indexing job synchronously.

The worker handles extraction and embeddings.

If processing takes a long time, the browser sees the file status change from:

    uploaded → processing → ready

or:

    uploaded → processing → failed

## 14. Health check

Open:

    https://YOUR-RENDER-DOMAIN.onrender.com/api/health

Expected response:

    {"ok":true}

If this fails, inspect:

    Render → Service → Logs

## 15. Common deployment errors

### Database connection error

Check:

    DATABASE_URL

Confirm Railway allows the Render service to connect.

### Redis connection error

Check:

    REDIS_URL

Confirm the Railway Redis service is running.

### Upload returns signed URL but browser PUT fails

Check:

- S3 endpoint
- bucket CORS
- ETag exposure
- HTTPS origin
- bucket credentials
- signed URL expiry

### Worker is not processing

Check:

    Render Worker → Logs

Then verify:

    REDIS_URL
    DATABASE_URL
    S3_*
    ENCRYPTION_KEY

### Provider key test fails

Check the provider's current API endpoint and model ID.

## 16. Backups

Back up Railway PostgreSQL regularly.

Also enable object-storage versioning/backups if available.

A PostgreSQL backup alone does NOT contain the original uploaded files.

## 17. Production security checklist

- [ ] HTTPS enabled.
- [ ] COOKIE_SECURE=true.
- [ ] Strong unique JWT_SECRET.
- [ ] Strong unique ENCRYPTION_KEY.
- [ ] Railway database not publicly exposed unnecessarily.
- [ ] Redis not publicly exposed unnecessarily.
- [ ] S3 bucket private.
- [ ] S3 CORS restricted to application origin.
- [ ] Provider API keys stored only server-side.
- [ ] Provider keys encrypted at rest.
- [ ] First admin account protected with a strong password.
- [ ] SSO/MFA added if required by company policy.
- [ ] Malware scanning enabled before accepting untrusted files.
- [ ] Audit logging added for enterprise use.
- [ ] Rate/token limits configured before broad team access.
- [ ] External AI data-retention policies reviewed.
- [ ] Database backups verified.
- [ ] Object-storage backups verified.

## 18. Architecture

    User Browser
         |
         | HTTPS
         v
    Render Web Service
      |       |
      |       +----> S3-compatible storage
      |
      +----> Railway PostgreSQL + pgvector
      |
      +----> Railway Redis
                    |
                    v
             Render Background Worker
                    |
                    +----> S3
                    +----> PostgreSQL

The web service handles authentication, chat and upload orchestration.

The worker handles file processing and indexing.

Railway provides stateful database/queue services.

Object storage provides durable large-file storage.

## 19. Deployment files included

This package contains:

- `render.yaml`
- `Dockerfile`
- `backend/`
- `frontend/`
- `database/schema.sql`
- `.env.example`
- `README.md`
- `API.md`
- `SECURITY.md`
- `TESTING.md`
- `DEPLOYMENT-RENDER-RAILWAY.md`

The old Docker Compose development infrastructure has deliberately been removed from this Render/Railway deployment package to avoid confusing local containers with the production architecture.
