# Upgrades — All Implemented ✅

## 1. Admin Approval Flow — `/approve` ✅
- `/approve on` — webhook posts require admin approval before publishing
- `/approve off` — webhook posts auto-publish immediately
- `/approve pending` — shows pending posts with Post/Reject buttons
- Webhook returns `{ status: "pending_approval" }` when approval mode is on

## 2. Metricool Scheduled Post Check — `/scheduled` ✅
- `/scheduled` — queries Metricool API for upcoming scheduled posts
- Requires `METRICOOL_TOKEN` and `METRICOOL_BLOG_ID` in `.env`
- Shows helpful message if not configured (Metricool API doesn't expose UI-scheduled posts)

## 3. Post Queue — `/queue` ✅
- `/queue view` — see all queued posts
- `/queue add text:...` — add a post to the queue
- `/queue drip` — start/stop drip-posting (posts one at a time with interval)
- `/queue clear` — clear the entire queue
- Drip interval configurable via `QUEUE_DRIP_INTERVAL_MS` env var (default 5 min)

## 4. Analytics — `/analytics` ✅
- `/analytics` — shows last 10 announcements with reaction counts
- Auto-refreshes reaction data from Discord when viewed
- Tracks channel, message ID, and post time

## 5. Multi-Channel Routing — `/channels` ✅
- `/channels list` — show all keyword → channel routes
- `/channels add keyword:price channel:#trading` — route posts containing "price" to #trading
- `/channels remove keyword:price` — remove a route
- Falls back to default `ANNOUNCE_CHANNEL_IDS` if no keyword matches

## 6. Webhook URL Field — `/url` ✅
- `/url on` — webhook accepts `url` field and appends thread link to posts
- `/url off` — ignores URL field
- Webhook payload: `{ "text": "...", "url": "https://x.com/..." }`
- URL also passed to AI prompt so it can include it in the template

## 7. Style Rotation Memory — `/rotation` ✅
- `/rotation view` — see recently used algo secret titles
- `/rotation reset` — clear rotation history
- AI prompt automatically includes "DO NOT use these topics" for recently used secrets
- Tracks up to 20 recent secrets across all post sources (webhook, /announce, auto-loop, drip)
