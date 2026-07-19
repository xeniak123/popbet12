# PopBet — Product Requirements Document (v3 — Release-Ready)

## Product
**PopBet** is a mobile pop-culture prediction market where users bet a **fictional
currency (coins)** on outcomes of entertainment, sports, and gossip events. The
currency has zero real-money value and cannot be purchased or cashed out.

Vibe: Kahoot/BeReal — playful, cream/peach palette, bouncy micro-animations.

## Core Rule
Users **never** create bets. The system centrally seeds a shared pool of bets;
every user sees the exact same list at the same moment.

## Screens
1. **Onboarding** — 3-slide carousel + email/password signup + **"Kontynuuj z Google"** (Emergent Google Auth) + optional phone field. New users get **1000 coins** with a confetti reward animation.
2. **Markets (Rynki)** — Sticky header (greeting + coin pill), horizontal category chip row, **Daily Streak Card** at the top of the list (retention hook), bet cards with countdown / vote-percentage bar / stake slider / confirm-with-confetti.
3. **My Bets (Moje)** — Aktywne / Rozstrzygnięte with green/pink chips.
4. **Leaderboard (Ranking)** — Globalny / Znajomi with sticky "your position", **mutual friend requests** (invite → recipient must accept), **contact-based friend finder** (phone-number match), pending-request badges + accept/reject inline.
5. **Profile** — Avatar, big coin balance, live stats, **Story template picker** (📊 stats / 🔥 streak / 🏆 biggest win), Instagram Stories share via view-shot, "Przelej coiny znajomemu" shortcut, Settings icon.
6. **Settings** — Account info (username/email/phone/balance), push toggle, quick actions (transfer/friends), About, logout with confirm.
7. **Transfer** — Recipient picker (friends chips + username input), amount input with 50/100/250/500 quick chips, "Wyślij coiny" CTA.

## Backend
- Auth: `POST /api/auth/signup` (email + password + username + optional phone), `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/google-session` (Emergent Google Auth relay).
- Bets: `GET /api/bets`, `POST /api/bets/{id}/place`, `POST /api/bets/{id}/resolve`, `GET /api/my-bets`.
- Profile: `GET /api/profile/me` — returns `stats.biggest_win`, `checkin_streak`, etc.
- Leaderboard: `GET /api/leaderboard/global`, `.../friends`.
- Friends (mutual): `POST /api/friends/request` (creates pending or auto-accepts reverse), `/accept`, `/reject`, `GET /api/friends/pending`, `/list`.
- Contact matching: `POST /api/friends/find-by-phones` — matches by last 9 digits of `phone_normalized` (stored digits-only, backfilled on server boot).
- Coin transfer: `POST /api/coins/transfer`, `GET /api/coins/transfers`.
- Daily streak: `GET /api/streak/status`, `POST /api/streak/checkin` (bonus = min(50 × streak_day, 500), resets after missed UTC day).
- Push: `POST /api/register-push`, backend calls `send_push` on bet resolution / friend requests / accepted invites / coin transfers.

## Business logic
- Coin economy is fully fictional.
- Pari-mutuel payout on resolve: winners get stake back + proportional share of losers' pool.
- Friend requests are **mutual** — recipient must accept before both users see each other in friends/leaderboard.
- Daily streak Check-in grants **+50 × streak_day** coins (capped at 500) once per UTC day; streak breaks after a missed day.
- Coin transfers between users deduct from sender, credit recipient, and both parties see them in `/api/coins/transfers`.

## Integrations
- **JWT** email/password auth with bcrypt.
- **Emergent Google Auth** (`/auth/v1/env/oauth/session-data`), web + native flow.
- **Emergent Push Notifications** relay for bet resolutions, friend requests / accepts, coin transfers.
- **expo-contacts** for phone-based friend discovery (permission-gated).
- **react-native-view-shot + expo-sharing** for Instagram Stories share with template chooser.

## Deployment / Build notes
- Push notifications, native contacts, and Google Auth OAuth redirect require a **real device build** (Emergent → Publish → Deploy → Build). Not available in Expo Go / web preview.
- `EMERGENT_PUSH_KEY` is a placeholder in preview; replaced at build time.

## Retention loop
Daily Streak Check-in (Kahoot-style) — user opens the app, sees the streak card with day dots 1–7, one-tap "Odbierz bonus". Missing a day resets the streak (nudging daily return).

## Future
- AI-generated daily bets (Claude Sonnet 4.5) with automatic resolution.
- Streak-linked achievements (7-day, 14-day, 30-day badges).
- Prediction share cards (individual bet screenshots).

## v3 (release-ready) additions
- **Password reset flow**: `/api/auth/forgot-password` + `/api/auth/reset-password` (in-app token, ready to swap for SendGrid/Resend later).
- **Change password**: `/api/auth/change-password` (authenticated).
- **Edit profile**: `PATCH /api/profile` — username, phone, avatar (base64 from gallery via expo-image-picker).
- **Delete account (GDPR)**: `DELETE /api/account` — cascades to placements/friendships/requests/transfers.
- **Legal screen**: Regulamin + Polityka prywatności (required for App Store / Play Store publication).
- **Global Toast provider** (success/error/info banners) replacing inline error text.
- **Skeleton loaders** on Markets while bets load.
- **EmptyState illustrations** across Markets / MyBets / Leaderboard.
- **"Zapomniałem hasła"** link on the login screen.
