"""Install the per-user sync agent after configuring its production upload key."""
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

state = Path.home() / "Library/Application Support/John Ta Jobs"
label = "com.johnta.recurring-jobs"
plist = Path.home() / "Library/LaunchAgents" / (label + ".plist")
if not (state / "upload-key").is_file():
    sys.exit("Configure the private upload key first.")
state.chmod(0o700)
shutil.copyfile(Path(__file__).with_name("sync.py"), state / "sync.py")
config = {
    "Label": label, "ProgramArguments": [sys.executable, str(state / "sync.py")],
    "EnvironmentVariables": {"CODEX_HOME": str(Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).resolve())},
    "RunAtLoad": True, "StartInterval": 300,
    "StandardErrorPath": str(state / "sync-error.log"),
}
domain = f"gui/{os.getuid()}"
service = domain + "/" + label
if subprocess.run(["launchctl", "print", service], capture_output=True).returncode == 0:
    subprocess.run(["launchctl", "bootout", service], check=True)
plist.parent.mkdir(parents=True, exist_ok=True)
plist.write_bytes(plistlib.dumps(config))
subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True)
