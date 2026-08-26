# Testing Checklist

## Authentication

- Register first user.
- Confirm first user is admin.
- Log out and log in again.
- Try wrong password.
- Try a duplicate email.

## Chat

- Add a provider and model.
- Send a message.
- Confirm streaming output.
- Refresh page and confirm history persists.
- Create a second chat.

## Uploads

- Upload a small TXT file.
- Upload a source-code file.
- Upload a PDF/DOCX/XLSX.
- Upload a ZIP containing source files.
- Confirm status reaches `ready`.
- Confirm file context is used when embeddings are configured.
- Try a file larger than 350 MB and confirm rejection.

## Security

- Confirm provider keys do not appear in API responses.
- Confirm another user's conversation cannot be loaded by changing the URL ID.
- Confirm another user's file status cannot be loaded.
- Verify HTTPS and secure cookies in production.
