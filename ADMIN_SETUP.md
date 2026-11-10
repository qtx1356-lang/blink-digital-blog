# Blink Admin — multi-user setup

The public blog remains a Render Static Site. The private multi-user dashboard runs as a separate Render Node Web Service. Contributors sign in with their own GitHub accounts; they do **not** need access to the blog repository.

## 1. Create the admin Web Service

In Render choose **New + → Web Service**, connect `qtx1356-lang/blink-digital-blog`, branch `main`, and set:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Plan: choose a plan suitable for your use

Keep the existing public Static Site unchanged. The admin service commits approved published articles to the repository, which triggers the public site deployment.

## 2. Configure a GitHub App

Create an app at https://github.com/settings/apps/new:

- Name: `Blink Blog Admin`
- Homepage URL: `https://blinkdigitalone.com/`
- Callback URL: `https://YOUR-ADMIN-SERVICE.onrender.com/auth/callback`
- Account permissions: no access
- Repository permissions: **Contents — Read and write**
- Subscribe to no webhooks unless needed later

Create the app, note its **App ID** and **Client ID**, generate a **Client Secret**, and generate/download a **Private key**. Install the app on the repository owner's account and select only `blink-digital-blog`. From the installation page, note the numeric **Installation ID** (the number in the installation URL).

## 3. Configure Render environment variables

In the admin Web Service → **Environment**, add:

| Key | Value |
| --- | --- |
| `GITHUB_APP_ID` | GitHub App numeric App ID |
| `GITHUB_APP_CLIENT_ID` | GitHub App Client ID |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App Client Secret |
| `GITHUB_APP_PRIVATE_KEY` | Entire downloaded PEM private key, including BEGIN/END lines |
| `GITHUB_APP_INSTALLATION_ID` | Installation ID for the blog repository |
| `PUBLIC_BASE_URL` | Exact admin Render URL, no trailing slash |
| `ADMIN_ALLOWED_USER` | `qtx1356-lang` (primary admin bootstrap account) |
| `ALLOW_PUBLIC_REGISTRATION` | `true` |
| `GITHUB_OWNER` | `qtx1356-lang` |
| `GITHUB_REPO` | `blink-digital-blog` |
| `GITHUB_BRANCH` | `main` |

For the private key, Render accepts newline characters. If its value is pasted as one line with literal `\n` separators, the server converts them to newlines. Never put the private key or client secret in `admin.html`, GitHub source files, or a message.

Save and redeploy. Check `https://YOUR-ADMIN-SERVICE.onrender.com/healthz` returns `{"ok":true}`.

## 4. First admin login and account access

Open the admin Render URL and sign in with GitHub as `qtx1356-lang`. The server automatically creates this account as the primary Admin.

**Open registration:** anyone can choose GitHub sign-in. Their first sign-in creates a Pending Author request. An admin approves it in **User access**.

**Invitations:** an admin enters a GitHub username in **User access → Invite author**. That account becomes an active Author when they sign in.

Admins can approve, disable, enable, and change roles. Authors can create, edit, feature, and delete only their own articles. Admins can manage every article. Only active users can access the dashboard.

## 5. Data and security

- User records and invitations are stored in `assets/admin-users.json` in the private-to-the-workflow repository; published articles remain in `assets/articles.json`.
- The GitHub App installation token is created server-side and used for repository writes. Contributors' personal GitHub accounts are used only to verify identity; contributors do not receive repository access.
- Session cookies are HttpOnly, Secure and SameSite=Lax; sessions expire after eight hours and are cleared if the service restarts.
- Keep the GitHub App private key and Client Secret in Render environment variables only.
- Public registration can be switched off by setting `ALLOW_PUBLIC_REGISTRATION=false`; existing invitations still work.
