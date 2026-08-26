# Security Notes

1. Provider API keys are encrypted with AES-256-GCM in PostgreSQL.
2. Provider API keys are never returned to frontend JavaScript.
3. Sessions use HTTP-only cookies.
4. Passwords are bcrypt-hashed.
5. User-owned conversations/files are checked server-side.
6. Upload size is limited to 350 MB.
7. Uploads use multipart object storage instead of application-memory buffering.
8. ZIP/TAR extraction attempts to reject traversal/symlink paths and imposes file/count/expanded-size limits.
9. Production deployments should use HTTPS, VPN/IP restrictions, backups, malware scanning, audit logging and SSO/MFA.
10. Review every external AI provider's data-retention policy before uploading confidential material.
