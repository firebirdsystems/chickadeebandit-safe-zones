# Safe Zones

A [Chickadee Bandit](https://chickadeebandit.com/app-library/safe-zones) app.

Geofenced safe-zone alerts for Chickadee Bandit — "Emma arrived at school."

- **Zones** are drawn on a map in this app (adults only), 150 m–5 km radius.
  Three per household plan, fifteen with the Premium `geofence` capability;
  fifteen is also the hard platform ceiling (phone OS region limits) and nothing
  is sold above it. The cap applies when a zone is CREATED — a household that
  drops below its zone count keeps every existing zone alerting. A trusted Hub
  endpoint validates geometry, members, audience, and the count ceiling; direct
  SQL writes are blocked.
  Geometry is stored in the app DB and encrypted by default.
- **Crossings** are asserted by the authenticated **Chickadee Locate** companion app on the
  tracked person's phone, judged hub-side (`/api/geofence/event`: dedupe,
  cooldown, quiet hours), recorded into the endpoint-only `zone_events` table
  (30-day retention), and pushed to the configured audience.
- **Trackers** show up via the `family.geofence_trackers` context key so this
  app can say "Dana's phone last reported 12 min ago / permission revoked".
- **Who's home** comes from the hub's derived `family.presence` key (home/away
  per member, no coordinates) and is shown on the home zone's tile only. The hub
  owns the derivation: it degrades to "unknown" when a phone goes quiet and
  returns nothing when location collection is off. This app never re-derives
  presence from `zone_events` — that table is owner_only with 30-day retention.
- **Premium**: requires the `geofence` capability (premium bundle).

Dev: `make install && make build && make test`. `make dev` serves the app
against a deployed hub.
