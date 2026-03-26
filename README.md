# Math congress website starter

This starter is designed for:

- **GitHub Pages** for hosting the static website
- **Cloudflare Workers** for hiding the Make webhook
- **Make** for processing registration form submissions

## Files

- `index.html` — page structure and content
- `styles.css` — layout, colors, typography, responsive design
- `script.js` — menu, theme toggle, form submission
- `worker-example.js` — Cloudflare Worker proxy example

## Basic deployment flow

### 1. GitHub Pages

Create a repository and upload:

- `index.html`
- `styles.css`
- `script.js`

If you will use images later, create an `images/` folder and update the image paths in `index.html` and `styles.css`.

### 2. Make

Create a scenario with a **Custom Webhook** as the trigger.
That webhook can then:

- append rows to Google Sheets,
- send confirmation emails,
- notify organizers,
- store data elsewhere.

Copy the Make webhook URL, but **do not put it directly in the website**.

### 3. Cloudflare Worker

Create a Worker and paste `worker-example.js`.
Then add a secret named:

- `MAKE_WEBHOOK_URL`

with your real Make webhook URL as its value.

Also change:

- `https://YOUR_GITHUB_USERNAME.github.io`

inside the Worker to your real GitHub Pages origin.

Deploy the Worker and copy its public URL.

### 4. Connect the form

In `index.html`, change:

```js
registrationEndpoint: "https://YOUR-CLOUDFLARE-WORKER.your-subdomain.workers.dev/register"
```

to your real Worker URL.

## Recommended improvements

- Add a success email from Make
- Save registrations in Google Sheets
- Add spam protection with Cloudflare Turnstile
- Add speaker photos later
- Add downloadable PDF schedule
- Add FAQ and travel section

## Important note

For GitHub Pages, keep everything static on the front end.
All secret handling must stay in Cloudflare Workers or another server-side layer.
