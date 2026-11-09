from datetime import datetime


def parse_cron(expression: str) -> list[set[int]]:
    """Numeric five-field Linux cron: lists, ranges, steps, and Sunday 0/7."""
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError("Use five cron fields: minute hour day month weekday")
    result = []
    for field, (low, high) in zip(fields, [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]):
        values = set()
        for part in field.split(","):
            base, *step_parts = part.split("/")
            if len(step_parts) > 1:
                raise ValueError("Invalid cron step")
            step = int(step_parts[0]) if step_parts else 1
            if step < 1:
                raise ValueError("Cron steps must be positive")
            if base == "*":
                start, end = low, high
            elif "-" in base:
                start, end = map(int, base.split("-"))
            else:
                start = int(base)
                end = high if step_parts else start
            if not low <= start <= end <= high:
                raise ValueError(f"Cron field must be between {low} and {high}")
            values.update(range(start, end + 1, step))
        result.append(values)
    if 7 in result[4]:
        result[4].add(0)
    return result


def cron_matches(expression: str, now: datetime) -> bool:
    minute, hour, day, month, weekday = parse_cron(expression)
    fields = expression.split()
    day_matches = now.day in day
    weekday_matches = (now.weekday() + 1) % 7 in weekday
    calendar_matches = (
        day_matches and weekday_matches
        if fields[2].startswith("*") or fields[4].startswith("*")
        else day_matches or weekday_matches
    )
    return now.minute in minute and now.hour in hour and now.month in month and calendar_matches
