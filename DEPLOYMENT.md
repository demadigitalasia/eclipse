# ECLIPSE deployment notes

## Recommended layout

- Deploy the Vite frontend on Vercel.
- Run the Python API in a persistent container with FFmpeg/libass available.
- Route the frontend's `/api/*` requests to the API host. Set the API origin and the Vercel rewrite after the backend host gives you its public HTTPS URL.

The repository includes `vercel.json.example`. After the backend host provides its public HTTPS URL, replace `YOUR-BACKEND-DOMAIN` and save the file as `vercel.json` at the repository root. The rewrite proxies `/api/:path*` to the matching path on that external API origin; the second rewrite supports SPA routes.

### Coolify frontend option

For a same-origin Coolify deployment, build the frontend with `Dockerfile.frontend` and expose port `80`. `nginx.frontend.conf` serves the built Vite SPA and proxies `/api/*` to the backend container at `eclipse-backend:8000`. Both containers must share Coolify's `coolify` Docker network, and the backend container needs the internal network name `eclipse-backend`.

## Backend image

Build the API image from the repository root:

```sh
docker build -f Dockerfile.backend -t eclipse-backend .
```

Run it with persistent mounts for generated media and fonts:

```sh
docker run --rm -p 127.0.0.1:8000:8000 \
  -v eclipse-data:/var/lib/eclipse \
  -e ALLOWED_ORIGINS=https://YOUR-VERCEL-DOMAIN \
  eclipse-backend
```

The image uses `ECLIPSE_DATA_DIR=/var/lib/eclipse`; the named volume keeps uploads, temporary files, exports, custom fonts, and cookies across container restarts. Keep this as a single backend instance: render-job state is still in process memory and is not shared between replicas.

Set secrets through the host's environment settings, not in the image or Git. Relevant settings include `GEMINI_API_KEY`, `SUPADATA_API_KEYS`, `ALLOWED_ORIGINS`, and an administrative key.

For the web Settings panel, configure a strong `ADMIN_API_KEY` in the backend's environment before opening the panel. The key is required for `/api/settings`; it also protects cookie save/delete and the existing administrative actions when configured. The key itself remains in the host environment. Supadata keys and proxy settings entered through the panel are stored in `settings.json` under `ECLIPSE_DATA_DIR` (so the persistent volume must remain attached) and take precedence over their corresponding environment variables. The panel sends the administrator key from browser `localStorage` in request headers; never reuse it as a public or shared-user credential.

## YouTube egress and PO tokens

YouTube binds authentication cookies to the public IP they were issued for. On a datacenter host the backend must reach YouTube through a single trusted egress, and the cookies must be exported from that same egress:

- Configure the residential/mobile proxy in the web Settings panel or via `PROXY_URL` / `WEBSHARE_USERNAME` + `WEBSHARE_PASSWORD`. When a proxy is set, all YouTube traffic (metadata, captions, downloads) uses it; direct fallbacks are skipped so the egress never changes mid-session. Set `ECLIPSE_ALLOW_DIRECT_YOUTUBE_FALLBACK=1` to restore the old mixed behaviour.
- The Cookies Manager shows the backend's current egress IP and the IP recorded when the cookies were last saved, and warns on a mismatch. Export cookies from a browser whose egress matches the backend proxy.
- To reduce bot verification further, run a [bgutil PO token provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) and set its base URL in the Settings panel (or `YTDLP_POT_PROVIDER_URL`, e.g. `http://127.0.0.1:4416`). This also requires `pip install bgutil-ytdlp-pot-provider` in the backend environment. Script mode (`YTDLP_POT_PROVIDER_SCRIPT`) and a manual `YTDLP_PO_TOKEN` are also supported.

## Production gate

This image is a portable staging foundation; it does not make the current backend safe or horizontally scalable for a public multi-user service. Before exposing it publicly:

- Isolate or disable the shared YouTube cookie file and its public save/delete routes.
- Add authentication, rate limits, and usage quotas for upload, analyze, download, and render endpoints.
- Move job state out of process memory before running more than one API instance.
- Use object storage for large uploads and render outputs.
- Replace the desktop Git update/restart feature with deployment-based updates, and make protected UI actions compatible with production authentication.
- Send Gemini keys in a request body or authorization header instead of the URL query string.

For a private, single-instance staging deployment, retain a persistent volume and verify upload, analyze, render, progress polling, and download against the chosen host before pointing the Vercel frontend at it.
