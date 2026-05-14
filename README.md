# Device Value Finder

A static web app for comparing estimated resale offers for used devices across Swiss resale providers.

The current version uses deterministic local estimates for:

- verkaufen.ch
- mobileup.ch
- revendo.ch

Production integrations should use official partner APIs where available, or compliant server-side automation only when provider terms allow it.

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.
