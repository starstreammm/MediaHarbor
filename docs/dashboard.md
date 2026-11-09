# Dashboard customization

Use the existing sort icon (vertical arrows and lines) to customize cards:

- **Dashboard:** the header control manages a separate post card for each supported platform, separate Videos and Images cards, Device Information, Queue Status, and the API Health summary. Supported platforms come from `/api/init/api/catalog` (currently Douyin and TikTok); unregistered platforms are absent from both the dashboard and customization list. Support is independent of a service's enabled or health state. Each post chart shows only its platform; each file chart shows the count and storage for its media type. Queue Status occupies its entire card; Platform Support has been removed.
- **API Health:** the header control manages the four monitoring charts. The control beside the service-type tabs manages service cards across both categories; each tab still shows only its matching services.

Drag a row by its handle or use the up/down buttons to rearrange it. Switch a card off to hide it. Changes apply immediately. Hidden cards stay in the customization list so they can be restored, and **Reset layout** restores the default order and visibility. The controls remain available even when every card is hidden.

Preferences use the existing `useLocalStorage` hook with browser local storage, under `dashboard-cards:v1`, `api-health-charts:v1`, and `api-health-services:v1`. Only card IDs, ordering, and visibility are stored. Settings persist across reloads in the same browser and site origin; they are not synchronized between browsers. Clearing site storage resets them. Unknown or duplicate saved IDs are ignored, and new cards appear by default.

The main Dashboard's API Health card shows service counts, health status counts, the latest check time, and a link to the full API Health page. It reads real backend data and refreshes every 30 seconds while displayed. Hiding cards does not disable services or stop backend health checks. Hidden services still contribute to API Health's overview and aggregate charts.

Dashboard and API Health share the same card component, responsive grid, spacing, rounded corners, and elevation. Cards use one column on smaller screens and two columns on large screens. API Health service cards open their detailed statistics, guest pools and endpoint controls in a dialog. Both pages extend their background through all card rows, including content below the first viewport.

Dashboard cards retain their original half-viewport height, adjusted for the header and grid spacing. Platform and file cards share a compact, wrapping header; the chart fills the remaining space. On very short screens or with enlarged text, content scrolls inside the card instead of increasing its outer height. Platform cards show Posts and Creators; file cards show Files and Storage. The post chart's redundant legend is hidden, tick density follows chart width, and large axis values use compact notation while tooltips retain full counts.

Creator counts come from `/api/statistics/today`, which counts distinct existing creators linked to accounts on each platform. Several accounts on the same platform count as one creator; a creator on two platforms counts once in each. These are current counts, not historical creator trends; no snapshot migration is needed.

Queue Status uses four tiles for Running, Pending, Failed, and Completed, with a link to Tasks. `/api/statistics/device` aggregates the matching `queue.status` values in one database query. Pending includes future scheduled jobs; Completed counts retained successful task records, not downloaded files or lifetime completions after task deletion. Device and queue statistics refresh independently of media statistics every 18 seconds while the page is active. Loading and refresh errors are shown rather than represented as zero counts.
