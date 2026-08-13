# Antara Akad | Wedding Content Creator

A mobile-only Antara Akad web app served by the existing Express service.

The customer journey is:

Instagram / Threads / TikTok / WhatsApp → mobile web app → check availability → choose matching package → add-ons → estimated total → WhatsApp handoff.

## Run Locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

The app is intentionally capped at mobile width on large screens.

## Availability

The browser calls:

```text
GET /api/availability?date=YYYY-MM-DD
```

The frontend never receives Google Calendar credentials.

Local/manual blocked dates can be configured in either:

```text
config/business.json
ANTARA_AKAD_BLOCKED_DATES=2026-12-12,2026-12-20
```

For Calendly checks, create a Calendly personal access token and set these server-side only:

```text
CALENDLY_ACCESS_TOKEN=
CALENDLY_USER_URI=
```

`CALENDLY_USER_URI` is optional. If omitted, the server calls Calendly's `users/me` endpoint to resolve it from the token.

Calendly Free supports regular API access, but not webhooks or paid Scheduling API endpoints. This app only reads busy times and still sends the request through WhatsApp.

For alternate production Google Calendar checks, set these server-side only:

```text
GOOGLE_CALENDAR_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=
```

Business rule: any blocking calendar event on a date makes the entire date unavailable. Availability is not a reservation.

## Web App Assets

Static files live in:

```text
public/
public/assets/images
public/assets/icons
public/assets/reference
```

Place the four official Antara Akad references in `public/assets/reference`. They are design references, not customer-facing posters.

## Verify

```powershell
npm run build
npm test
```

Useful manual dates:

- `2026-12-13`: available in local/manual mode
- `2026-12-12`: unavailable in local/manual mode

## WhatsApp

Final requests redirect to:

```text
https://wa.me/60145959752
```

The multiline message is generated in JavaScript and encoded with `encodeURIComponent`.

## GitHub, Vercel, and Calendly Setup

Create a new GitHub repository, for example `antara-akad-wcc`, then push this local `main` branch:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/antara-akad-wcc.git
git push -u origin main
```

In Vercel:

1. Import the GitHub repository.
2. Keep the default static/public deployment behavior.
3. Add these Environment Variables in Production:

```text
CALENDLY_ACCESS_TOKEN=your_calendly_personal_access_token
CALENDLY_USER_URI=optional_calendly_user_uri
ANTARA_AKAD_BLOCKED_DATES=optional_manual_blocked_dates
```

`CALENDLY_ACCESS_TOKEN` must stay server-side in Vercel. Do not put it in `public/`, frontend JavaScript, GitHub, or browser-visible code.

For Calendly Free, this app checks availability by reading busy times for the selected date. It does not rely on paid Calendly webhooks or paid Scheduling API endpoints.
