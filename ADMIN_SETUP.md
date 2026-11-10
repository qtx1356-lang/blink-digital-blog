# Blink Admin — multi-user setup

The public blog remains a Render Static Site. The private multi-user dashboard runs as a separate Render Node Web Service. Contributors sign in with Google accounts; they do **not** need access to the blog repository.

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
- Callback URL: `https://YOUR-ADMIN-SERVICE.onrender.com/auth/google/callback`
- Account permissions: no access
- Repository permissions: **Contents — Read and write**
- Subscribe to no webhooks unless needed later

Create the GitHub App, note its **App ID**, generate its **Client ID**, **Client Secret**, and download a **Private key**. Install it on the repository owner's account and select only `blink-digital-blog`. From the installation page, note the numeric **Installation ID**. This GitHub App is used only for writing blog content to the repository; user sign-in is handled separately by Google OAuth.

## 3. Configure Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/), create or select a project. Configure the OAuth consent screen (External, if people outside your Google Workspace will sign in). Create an OAuth Client ID of type **Web application**. Add this Authorized redirect URI exactly:

`https://YOUR-ADMIN-SERVICE.onrender.com/auth/google/callback`

Copy the Google **Client ID** and **Client Secret**. Add them to Render as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

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
| `ADMIN_ALLOWED_EMAIL` | `qtx1356@gmail.com` (primary Google admin account) |
| `ALLOW_PUBLIC_REGISTRATION` | `true` |
| `GITHUB_OWNER` | `qtx1356-lang` |
| `GITHUB_REPO` | `blink-digital-blog` |
| `GITHUB_BRANCH` | `main` |

For the private key, Render accepts newline characters. If its value is pasted as one line with literal `\n` separators, the server converts them to newlines. Never put the private key or client secret in `admin.html`, GitHub source files, or a message.

Save and redeploy. Check `https://YOUR-ADMIN-SERVICE.onrender.com/healthz` returns `{"ok":true}`.

## 5. First admin login and account access

Open the admin Render URL and choose **Continue with Google** using `qtx1356@gmail.com`. The server automatically creates this email as the primary Admin.

**Open registration:** anyone can choose Google sign-in. Their first sign-in creates a Pending Author request. An admin approves it in **User access**.

**Invitations:** an admin enters a Google email address in **User access → Invite author**. That account becomes an active Author when they sign in with Google.

Admins can approve, disable, enable, and change roles. Authors can create, edit, feature, and delete only their own articles. Admins can manage every article. Only active users can access the dashboard.

## 6. Data and security

- User records and invitations are stored in `assets/admin-users.json` in the private-to-the-workflow repository; published articles remain in `assets/articles.json`.
- The GitHub App installation token is created server-side and used for repository writes. Google verifies contributors' email identities; contributors do not receive repository access.
- Session cookies are HttpOnly, Secure and SameSite=Lax; sessions expire after eight hours and are cleared if the service restarts.
- Keep the GitHub App private key and Client Secret in Render environment variables only.
- Public registration can be switched off by setting `ALLOW_PUBLIC_REGISTRATION=false`; existing invitations still work.
