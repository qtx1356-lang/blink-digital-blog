# Blink Digital Solution — Growth Notes Blog

A responsive, static blog website built with HTML, CSS and vanilla JavaScript. No build step or database required.

## Run locally
Open `index.html` in a browser, or run a local static server:
```bash
python -m http.server 8000
```
Then visit http://localhost:8000.

## Deploy to GitHub + Render
1. Create a new GitHub repository, for example `blink-digital-blog`.
2. Upload the contents of this folder to the repository root (not the enclosing ZIP folder).
3. In Render, choose **New + → Static Site** and connect the repository.
4. Use these settings:
   - Build command: leave blank
   - Publish directory: `.`
5. Click **Create Static Site**. Render will provide an `onrender.com` URL.
6. Replace `YOUR-RENDER-SUBDOMAIN` in `robots.txt` and `sitemap.xml` with your actual Render subdomain, then commit the changes.

## Included features
- Responsive navigation and mobile menu
- Search across article titles, summaries and article text
- Category filters and category shortcuts
- Individual article views with share action
- Scroll reveal effects and reduced-motion support
- WhatsApp, email and main-site links
- Basic SEO metadata, robots.txt and sitemap.xml

## Before publishing
- The source website displays `info@yourdomain.com`, which looks like a placeholder. Replace it with the verified public inbox before launch.
- The newsletter form opens the visitor's email application. It does not store subscribers. Connect a mailing-list provider or backend to collect subscriptions.
- The blog uses the logo image hosted on blinkdigitalone.com. If that URL changes, update the logo `src` in `index.html`.
- Sample articles are starter editorial content. Review, fact-check and update dates before publishing.
