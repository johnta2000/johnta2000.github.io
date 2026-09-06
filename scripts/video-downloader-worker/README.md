# Video downloader worker

This Mac worker processes the private queue for `www.john-ta.com/tools/video-downloader/`.

Double-click `setup-worker.command` once. It creates a private local worker secret, configures the Convex development deployment in `.env.local`, and installs a macOS LaunchAgent that starts automatically whenever this Mac is logged in.

Operational limits:

- One download at a time
- Single YouTube videos only
- Maximum one hour in duration
- Maximum 200 MB finished file
- H.264 video with AAC audio in an MP4 container
- Convex copy deleted automatically after one hour

Logs are written to `~/Library/Logs/JohnTaVideoDownloader/`.
