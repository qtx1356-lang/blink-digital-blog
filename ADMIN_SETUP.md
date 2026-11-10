# Blink Admin setup

The public blog remains a Render Static Site. The admin dashboard runs as a separate Render Web Service so GitHub OAuth secrets and access tokens stay on the server.

## 1. Create the admin Web Service in Render

1. In Render, choose **New + → Web Service**.
2. Connect the repository `qtx1356-lang/blink-digital-blog`, branch `main`.
3. Name it `blink-digital-blog-admin` (or another available name).
4. Runtime: **Node**.
5. Build command: `npm install`.
6. Start command: `npm start`.
7. Choose the Free plan if available and create the service.
8. Copy its public URL, for example `https://blink-digital-blog-admin.onrender.com`.

The existing Static Site should remain unchanged. The admin service writes to GitHub; the existing Static Site redeploys from that commit.

## 2. Create a GitHub App

Open https://github.com/settings/apps/new and create an app:

- GitHub App name: `Blink Blog Admin`
- Homepage URL: `https://blinkdigitalone.com/`
- Callback URL: the new Render Web Service URL followed by `/auth/callback`
- Repository permissions → Contents: **Read and write**
- Leave all other repository and account permissions at **No access**
- Create the app, then generate/copy its Client ID and Client Secret.

Install the app on the repository owner's account and select **Only select repositories → blink-digital-blog**. Do not install it on every repository.

## 3. Add Render environment variables

In the new admin Web Service, open **Environment** and add:

| Key | Value |
| --- | --- |
| `GITHUB_APP_CLIENT_ID` | Client ID from the GitHub App |
| `GITHUB_APP_CLIENT_SECRET` | Client Secret from the GitHub App |
| `PUBLIC_BASE_URL` | Exact public URL of the admin Web Service, without a trailing slash |
| `ADMIN_ALLOWED_USER` | `qtx1356-lang` |
| `GITHUB_OWNER` | `qtx1356-lang` |
| `GITHUB_REPO` | `blink-digital-blog` |
| `GITHUB_BRANCH` | `main` |

Save changes and wait for the service to deploy.

## 4. Open the dashboard

Visit the admin Web Service URL (for example, `https://blink-digital-blog-admin.onrender.com`) and choose **Continue with GitHub**. Sign in as `qtx1356-lang`.

The dashboard manages `assets/articles.json`. Publishing commits the changes to GitHub, which triggers a deployment of the existing public Render Static Site.

## Security notes

- Never put the GitHub Client Secret, private key, or access token in `admin.html` or any public repository file.
- The server keeps the OAuth access token in server memory and sends it to GitHub only from the server.
- Sessions expire after eight hours and are cleared when the server restarts.
- The admin service checks the GitHub username against `ADMIN_ALLOWED_USER`.
