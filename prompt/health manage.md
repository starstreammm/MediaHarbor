# Feature: API Health Management

Add a new frontend route named **API Health** to the existing project.

The purpose is to integrate, manage, and monitor multiple third-party API services through a unified interface, while exposing their functionality to existing users through the project's backend.

The first service to integrate:

https://github.com/Evil0ctal/Douyin_TikTok_Download_API

The implementation should remain lightweight, simple, and extensible for future services.

## 1. Frontend Page

Use the existing **Vite + React + Material UI (MUI)** stack.

Requirements:

- Add a new navigation entry named `API Health`.
- Follow the existing pages' UI design and interaction patterns.
- Reuse existing layouts, components, spacing, and styles.
- **Do not modify the existing Theme, ThemeProvider, or any global theme configuration.**
- Use Material UI components throughout the page.
- Support responsive layouts for desktop and mobile.

The page should include:

- Overview of all connected API services.
- Service and endpoint health status.
- Response latency and last check time.
- Manual refresh and health check actions.
- Add, edit, delete, enable, and disable services.
- Expandable service details showing available endpoints.
- Loading, success, and error feedback.

### Monitoring Charts

Include simple monitoring charts using **MUI X Charts (`@mui/x-charts`)**, preferably reusing the existing dependency.

Charts should display:

- API request volume over time.
- Request success and failure trends.
- Average response latency over time.
- Health status distribution across services.

Requirements:

- Charts must follow the existing MUI Theme automatically.
- Support responsive sizing.
- Allow basic time-range selection, such as 1h, 24h, and 7d.
- Use real backend statistics rather than mock data.
- Keep charts minimal, readable, and consistent with the existing UI.

## 2. API Health Management

Implement basic health monitoring for each external service and its endpoints.

Supported statuses:

- `Healthy` — API is working normally.
- `Expired` — Authentication credentials have expired.
- `Error` — API returned an error.
- `Unavailable` — Service cannot be reached.
- `Unknown` — API has not been checked.
- `Disabled` — Service or endpoint is disabled.

Features:

- Periodic automatic health checks.
- Manual health checks.
- Last successful request and last check timestamps.
- Basic error information.
- Response latency monitoring.
- Correctly distinguish HTTP errors from API-level business errors.
- Do not assume HTTP 200 always means success.
- Do not classify all authentication failures as expired credentials.

## 3. Unified API Integration

- Integrate third-party APIs through the existing backend.
- Expose integrated API functionality to users through the project's own API.
- Do not make direct third-party API requests from the frontend.
- Provide consistent request, response, and error handling.
- Allow each service to be configured and managed independently.
- Prevent failures in one service from affecting others.
- Keep the architecture simple and extensible for additional services.
- Reuse the existing authentication and permission system.

## 4. Request Statistics

Collect and display basic statistics for each service and endpoint:

- Total requests.
- Successful requests.
- Failed requests.
- Success rate.
- Average response latency.
- Last request time.
- Most recent error.

Provide aggregated historical data for the monitoring charts.

Avoid unnecessary complexity such as advanced circuit breakers, identity pools, or distributed monitoring infrastructure.

## 5. Documentation

Create or update the relevant documentation under the **`docs/`** directory.

Documentation should cover:

- Feature overview.
- Supported external services.
- How to configure and add new API services.
- API Health status definitions.
- Available backend endpoints.
- Monitoring and statistics behavior.
- Basic troubleshooting.

Keep documentation concise, accurate, and consistent with the actual implementation.

Do not create documentation outside `docs/` unless explicitly required by the existing project structure.

## 6. Implementation Guidelines

1. Inspect the existing project architecture, routes, components, backend API structure, and coding conventions before making changes.
2. Reuse existing functionality and dependencies wherever possible.
3. Use **Vite + React + Material UI**, including **MUI X Charts** for monitoring visualizations.
4. **Do not modify the existing Theme or global styling configuration.**
5. Match the existing admin pages' visual appearance and UX.
6. Keep the implementation minimal, maintainable, and practical.
7. Avoid introducing unnecessary dependencies, abstractions, or infrastructure.
8. Ensure all displayed monitoring data comes from actual backend data.
9. Preserve existing functionality and avoid unrelated refactoring.
10. Write all relevant documentation under `docs/`.
11. Do not generate test files or automatically run tests.
12. Only provide the necessary CLI commands for manual testing.

## Goal

Build a **lightweight API Health and Integration Dashboard** that allows administrators to manage third-party services, monitor their availability and performance through MUI charts, and expose unified API functionality to existing users.

Prioritize **simplicity, consistency with the existing UI, and ease of future extension** over complex monitoring or management features.
