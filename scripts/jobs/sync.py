"""Publish only recurring-job metadata to the owner's jobs database."""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import tomllib
from datetime import datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ENDPOINT = "https://brilliant-ibex-653.convex.site/inventory"
STATE = Path.home() / "Library/Application Support/John Ta Jobs"
DAYS = dict(zip("MO TU WE TH FR SA SU".split(), "Mon Tue Wed Thu Fri Sat Sun".split()))


def schedule(rule):
    try:
        fields = dict(part.split("=", 1) for part in rule.removeprefix("RRULE:").split(";"))
        freq = fields.pop("FREQ")
        unit = {"MINUTELY": "minute", "HOURLY": "hour", "DAILY": "day", "WEEKLY": "week", "MONTHLY": "month"}[freq]
        interval = int(fields.pop("INTERVAL", "1"))
        label = "Every " + (unit if interval == 1 else f"{interval} {unit}s")
        if days := fields.pop("BYDAY", ""):
            selected = [DAYS[day] for day in days.split(",")]
            if len(set(selected)) == 7 and interval == 1 and freq in {"DAILY", "WEEKLY"}:
                label = "Every day"
            elif days == "MO,TU,WE,TH,FR" and interval == 1 and freq in {"DAILY", "WEEKLY"}:
                label = "Weekdays"
            else:
                label += " · " + ", ".join(selected)
        if dates := fields.pop("BYMONTHDAY", ""):
            label += " · day " + dates.replace(",", ", ")
        if hours := fields.pop("BYHOUR", ""):
            minutes = fields.pop("BYMINUTE", "0")
            times = [datetime(2000, 1, 1, int(hour), int(minute)).strftime("%I:%M %p").lstrip("0")
                     for hour in hours.split(",") for minute in minutes.split(",")]
            label += " · " + ", ".join(times) + " PT"
        if until := fields.pop("UNTIL", ""):
            end = datetime.strptime(until, "%Y%m%dT%H%M%SZ").replace(tzinfo=ZoneInfo("UTC"))
            label += " · through " + end.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%b %d, %Y")
        if fields.pop("BYSECOND", "0") != "0" or fields:
            raise ValueError("Custom schedule")
        return label
    except (KeyError, ValueError):
        return "Custom schedule · see Codex"


def collect(root):
    if not root.is_dir():
        raise RuntimeError("Automation directory unavailable")
    paths = sorted(root.glob("*/automation.toml"))
    jobs = []
    for path in paths:
        with path.open("rb") as stream:
            data = tomllib.load(stream)
        job = {key: data[key] for key in ("id", "name", "status")}
        job["schedule"] = schedule(data["rrule"])
        if thread := data.get("target_thread_id"):
            job["thread"] = thread
        jobs.append(job)
    if paths != sorted(root.glob("*/automation.toml")):
        raise RuntimeError("Directory changed during sync")
    return jobs


def main():
    now = int(time.time() * 1000)
    jobs = collect(Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "automations")
    digest = hashlib.sha256(json.dumps(jobs, sort_keys=True).encode()).hexdigest()
    cache = STATE / "last-sync.json"
    previous = json.loads(cache.read_text()) if cache.exists() else {}
    if previous.get("digest") == digest and now - previous["checkedAt"] < 3600000:
        return
    payload = json.dumps({"jobs": jobs, "checkedAt": now}).encode()
    request = Request(ENDPOINT, payload, headers={"Content-Type": "application/json",
                      "Authorization": "Bearer " + (STATE / "upload-key").read_text().strip()})
    with urlopen(request, timeout=20) as response:
        if response.status != 204:
            raise RuntimeError("Upload failed")
    temp = cache.with_suffix(".tmp")
    temp.write_text(json.dumps({"digest": digest, "checkedAt": now, "count": len(jobs)}))
    temp.replace(cache)
    print(f"Synced {len(jobs)} jobs")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Jobs sync failed ({type(error).__name__}). Will retry.", file=sys.stderr)
        sys.exit(1)
