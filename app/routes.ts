import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
    index("pages/init/index.tsx"),
    layout("routes/frame.tsx", [
        route("/dashboard", "pages/dashboard/index.tsx"),
        route("/posts", "pages/posts/index.tsx"),
        route("/creators", "pages/creators/index.tsx"),
        route("/collections", "pages/collections/index.tsx"),
        route("/tasks", "pages/tasks/index.tsx"),
        route("/logs", "pages/logs.tsx"),
        route("/settings", "pages/settings.tsx"),
    ]),
] satisfies RouteConfig;