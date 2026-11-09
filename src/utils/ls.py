import os

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from models import *
from base.database import DatabaseBase as db


class ListUtil:

    _IGNORE = {
        Layer.creator: ["platform", "post_time"],
        Layer.account: ["post_time"],
        Layer.post: ["alias"],
        Layer.collection: ["overview", "rate", "platform", "post_time"],
        Layer.queue: ["overview", "rate", "platform", "post_time"],
    }

    _SEARCH_FIELDS = {
        Layer.creator: ["uid", "alias", "overview"],
        Layer.account: [
            "uid", "alias", "overview", "platform", "pid", "url", "ip", "address", "school",
        ],
        Layer.post: ["uid", "overview", "platform", "pid", "account_pid", "url"],
        Layer.collection: ["uid", "alias", "notes"],
        Layer.queue: ["uid", "alias", "status", "job", "detail"],
    }

    @classmethod
    async def creator(cls, cursor: CursorBase) -> ApiList[TableCreator]:
        c, rows = await cls._handle_cursor(Layer.creator, cursor)

        return ApiList(
            **c.model_dump(),
            data=[TableCreator.model_validate(r) for r in rows],
        )

    @staticmethod
    async def account(creator_uid: int) -> list[TableAccount]:
        rows = await db.fetch(
            """
                SELECT *
                FROM accounts
                WHERE creator_uid = $1
            """,
            creator_uid,
        )
        if not rows:
            return []
        return [TableAccount.model_validate(r) for r in rows]

    @classmethod
    async def post(
        cls,
        cursor: CursorBase,
        extra: str | None = None,
    ) -> ApiList[TablePost]:
        c, rows = await cls._handle_cursor(Layer.post, cursor, extra)

        return ApiList(
            **c.model_dump(),
            data=[TablePost.model_validate(row) for row in rows],
        )

    @classmethod
    async def collection(cls, cursor: CursorBase) -> ApiList[TableCollection]:
        c, rows = await cls._handle_cursor(Layer.collection, cursor)

        return ApiList(
            **c.model_dump(),
            data=[TableCollection.model_validate(row) for row in rows],
        )

    @classmethod
    async def queue(cls, cursor: CursorBase) -> ApiList[TableQueue]:
        c, rows = await cls._handle_cursor(Layer.queue, cursor)

        return ApiList(
            **c.model_dump(),
            data=[TableQueue.model_validate(row) for row in rows],
        )

    @classmethod
    async def total_lines(
        cls, table: Layer, filter: Optional[CursorFilter], extra: str | None = None
    ) -> int:
        conditions, params = await cls._handle_filter(filter, table)
        if extra:
            conditions.append(extra)

        total = await db.fetchval(f"""
                SELECT COUNT(*)
                FROM {table.value}
                {"WHERE " + " AND ".join(conditions) if conditions else ""};
            """, *params)

        return total or 0

    @classmethod
    async def _handle_filter(
        cls, filter: Optional[CursorFilter], table: Layer
    ) -> tuple[list[str], list]:
        conditions = []
        params = []
        if not filter:
            return conditions, params

        exclude = cls._IGNORE[table]
        local_tz_name = os.getenv("TZ", "UTC")
        local_tz = ZoneInfo(local_tz_name)

        def pattern(term: str) -> str:
            # Treat LIKE metacharacters as literal search input.
            escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            params.append(f"%{escaped}%")
            return f"${len(params)}"

        for term in dict.fromkeys(
            part for value in filter.search or [] for part in value.split()
        ):
            placeholder = pattern(term)
            matches = [
                f"{table.value}.{field}::text ILIKE {placeholder}"
                for field in cls._SEARCH_FIELDS[table]
            ]
            if table == Layer.post:
                matches.append(
                    "EXISTS (SELECT 1 FROM accounts a "
                    "LEFT JOIN creators c ON c.uid = a.creator_uid "
                    "WHERE a.uid = posts.account_uid AND ("
                    f"a.alias ILIKE {placeholder} OR a.overview ILIKE {placeholder} "
                    f"OR c.alias ILIKE {placeholder} OR c.overview ILIKE {placeholder}))"
                )
            conditions.append("(" + " OR ".join(matches) + ")")

        if filter.alias and "alias" not in exclude:
            conditions.append(f"alias ILIKE {pattern(filter.alias)}")

        if filter.rate and "rate" not in exclude:
            min_r, max_r = map(int, filter.rate.split("-"))
            conditions.append(f"rate BETWEEN {min_r} AND {max_r}")

        if filter.platform and "platform" not in exclude:
            for p in filter.platform:
                params.append(p.value)
                conditions.append(f"platform != ${len(params)}")

        if "overview" not in exclude:
            for term in dict.fromkeys(
                part for value in filter.include or [] for part in value.split()
            ):
                conditions.append(f"overview ILIKE {pattern(term)}")
            for term in dict.fromkeys(
                part for value in filter.exclude or [] for part in value.split()
            ):
                conditions.append(f"overview NOT ILIKE {pattern(term)}")

        if filter.time and "time" not in exclude:
            start, end = filter.time.split("_")

            # Convert the time to datetime
            start_dt = datetime.strptime(
                start + "_00:00:00", r"%Y-%m-%d_%H:%M:%S"
            ).replace(tzinfo=None)
            end_dt = datetime.strptime(end + "_23:59:59", r"%Y-%m-%d_%H:%M:%S").replace(
                tzinfo=None
            )

            # Convert the time to local timezone
            start_dt = start_dt.replace(tzinfo=local_tz)
            end_dt = end_dt.replace(tzinfo=local_tz)

            # Convert the time to UTC
            start_utc = start_dt.astimezone(timezone.utc)
            end_utc = end_dt.astimezone(timezone.utc)

            conditions.append(
                f"create_time BETWEEN '{start_utc.isoformat()}' AND '{end_utc.isoformat()}'"
            )

        return conditions, params

    @classmethod
    async def _handle_cursor(
        cls,
        table: Layer,
        cursor: CursorBase,
        extra: str | None = None,
    ) -> tuple[CursorBase, list]:
        """
        Can be used to ignore:
            1. overview
            2. time
            3. rate
            4. alias
            5. platform
        Make sure the ignore field is not used in sort.
        Return the updated cursor and the rows. The page is not updated.
        """
        # Ignore fields
        exclude = cls._IGNORE[table]

        # Handel filter
        conditions, params = await cls._handle_filter(cursor.filter, table)

        # Execute extra conditions if provided
        if extra:
            conditions.append(extra)

        # Handel last_cursor
        if "DESC" in cursor.sort:
            field_name = cursor.sort.replace(" DESC", "")
            main_op = "<"
        else:
            field_name = cursor.sort
            main_op = ">"

        if field_name in exclude:
            raise Exception(f"Database: Sort by {field_name} is not allowed.")

        if cursor.last_cursor is not None:
            last_cursor = cursor.last_cursor
            if field_name in ("create_time", "post_time") and isinstance(last_cursor, str):
                last_cursor = datetime.fromisoformat(last_cursor)
            params.extend([last_cursor, cursor.last_uid])
            value_param, uid_param = len(params) - 1, len(params)
            conditions.append(
                f"(({field_name} {main_op} ${value_param}) "
                f"OR ({field_name} = ${value_param} AND uid < ${uid_param}))"
            )

        # Execute the query
        rows = await db.fetch(f"""
                SELECT * FROM {table.value}
                {"WHERE " + " AND ".join(conditions) if conditions else ""}
                ORDER BY {cursor.sort}, uid DESC
                LIMIT {cursor.per_page}{"" if cursor.last_cursor is not None else " OFFSET " + str((cursor.page - 1) * cursor.per_page)};
            """, *params)

        if not rows:
            if cursor.page == 1:
                return cursor, []
            else:
                raise Exception("ListUtil: Invalid cursor. No data found.")

        if len(rows) == cursor.per_page:
            cursor.last_uid = rows[-1]["uid"] if rows else None
            cursor.last_cursor = (
                rows[-1][cursor.sort.replace(" DESC", "")] if rows else None
            )
            cursor.page += 1

        else:
            cursor.last_uid = None
            cursor.last_cursor = None

        return cursor, rows
