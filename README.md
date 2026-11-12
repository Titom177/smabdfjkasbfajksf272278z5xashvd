# AfterDark Search

Adults-only meta-search: enter keywords, query several adult sites at once, get one
merged list ranked by relevance (tag/title match) + rating + popularity, and play in-app.

    npm start        # http://localhost:3000  (PORT env to change)
    npm test

Sources: Pornhub, RedTube, YouPorn (public webmasters JSON APIs), XNXX (HTML parsing,
fragile), RedGifs (public v2 API, direct HD MP4). Add a site in `providers/index.js`.

Playback: iframe sites use each site's official embed player (quality selector is inside
the player); RedGifs plays the HD MP4 directly. A site that blocks your server's IP or
changes its API shows as "unavailable" in the status line and chip; the others still work.

Safety: 18+ gate; queries/results referencing minors or non-consensual content are
blocked server-side (`safety.js`). Must be hosted from a network where these sites are reachable.
