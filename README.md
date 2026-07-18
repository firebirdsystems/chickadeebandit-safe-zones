# Safe Zones

Geofenced safe-zone alerts for Chickadee Bandit — "Emma arrived at school."

- **Zones** are drawn on a map in this app (adults only), 150 m–5 km radius,
  max 15 (phone OS region limits). A trusted Hub endpoint validates geometry,
  members, audience, and the count ceiling; direct SQL writes are blocked.
  Geometry is stored in the app DB and encrypted by default.
- **Crossings** are asserted by the authenticated **Chickadee Locate** companion app on the
  tracked person's phone, judged hub-side (`/api/geofence/event`: dedupe,
  cooldown, quiet hours), recorded into the endpoint-only `zone_events` table
  (30-day retention), and pushed to the configured audience.
- **Trackers** show up via the `family.geofence_trackers` context key so this
  app can say "Dana's phone last reported 12 min ago / permission revoked".
- **Premium**: requires the `geofence` capability (premium bundle).

Dev: `make install && make build && make test`. `make dev` serves the app
against a deployed hub.
