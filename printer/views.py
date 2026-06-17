import json
import os
import socket
import subprocess

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import Idea
from . import printing
from . import leds


@require_GET
def kiosk(request):
    """The full-screen kiosk page (tmux-style hacker terminal)."""
    return render(request, "printer/kiosk.html", {
        "modes_json": json.dumps(printing.list_modes()),
    })


@csrf_exempt  # kiosk is intentionally open (bind 0.0.0.0); allow POST from any origin
@require_POST
def submit(request):
    """Receive a typed idea, store it, render + print the receipt.

    Body: JSON {"text": "...", "mode": "comicsans"}
    The active mode is consumed per print (the frontend resets it after a
    successful submit).
    """
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "bad json"}, status=400)

    text = (payload.get("text") or "").strip()[:256]  # hard cap: never print more
    mode = (payload.get("mode") or "").strip().lower()
    if mode and mode not in printing.MODES:
        mode = ""
    if not text:
        return JsonResponse({"ok": False, "error": "empty idea"}, status=400)

    idea = Idea.objects.create(text=text, mode=mode)
    ok, err = printing.print_idea(text, mode, idea.id)
    idea.printed = ok
    idea.error = err or ""
    idea.save(update_fields=["printed", "error"])

    if ok:
        leds.signal("print")  # fire-and-forget; never blocks the response

    return JsonResponse({"ok": ok, "id": idea.id, "error": err})


@csrf_exempt  # kiosk is intentionally open; allow POST from any origin
@require_POST
def print_picture(request):
    """Print a named easter-egg image (cat/hackerman) on a receipt."""
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        payload = {}
    ok, err = printing.print_named_image(payload.get("which") or "")
    if ok:
        leds.signal("image")  # fire-and-forget
    return JsonResponse({"ok": ok, "error": err}, status=200 if ok else 400)


@require_GET
def stats(request):
    """Small live counter for the kiosk footer / fun."""
    return JsonResponse({"count": Idea.objects.count()})


def _primary_ip():
    """Best-effort primary non-loopback IPv4, or None if the Pi is offline.
    Uses a UDP socket's chosen source address (no packets are actually sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("192.0.2.1", 53))  # TEST-NET-1, unrouted; just picks a src IP
            ip = s.getsockname()[0]
        finally:
            s.close()
        if ip and not ip.startswith("127.") and ip != "0.0.0.0":
            return ip
    except OSError:
        pass
    return None


def _all_ips():
    """All non-loopback IPv4 addresses across interfaces (e.g. wlan0 + ap0)."""
    try:
        proc = subprocess.run(
            ["ip", "-o", "-4", "addr", "show", "scope", "global"],
            capture_output=True, text=True, timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    out = []
    for line in proc.stdout.splitlines():
        # format: "<idx>: <iface> inet <addr>/<prefix> ..."
        parts = line.split()
        if len(parts) >= 4 and parts[2] == "inet":
            ip = parts[3].split("/")[0]
            if ip and not ip.startswith("127.") and ip not in out:
                out.append(ip)
    return out


@require_GET
def netinfo(request):
    """Current LAN IP(s) for the htop panel. `ip` is the primary (null when
    offline); `ips` is a comma-separated list of every global IPv4."""
    return JsonResponse({"ip": _primary_ip(), "ips": ", ".join(_all_ips())})


@csrf_exempt  # kiosk is intentionally open; decorative only
@require_POST
def led(request):
    """Let the frontend trigger an LED effect (e.g. an easter-egg fired).

    Body: JSON {"effect": "flash"}. Purely decorative and fail-soft — always
    returns ok, the daemon ignores unknown names (generic flash)."""
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        payload = {}
    effect = (payload.get("effect") or "flash").strip().lower()[:32]
    leds.signal(effect)
    return JsonResponse({"ok": True})


@require_GET
def ledstate(request):
    """Current scanner speed + brightness, read from the LED daemon's persisted
    state file. The kiosk polls this and flashes a status-bar OSD when either
    changes (e.g. from the volume keys). Touches no hardware; values are null
    until the daemon has written state at least once."""
    speed = brightness = None
    try:
        with open(settings.LED_STATE_FILE) as f:
            data = json.load(f)
        speed = float(data["speed"])
        brightness = float(data["brightness"])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return JsonResponse({"speed": speed, "brightness": brightness})


def _power(request, action, verb):
    """Shared handler for the password-gated /shutdown and /reboot commands.

    `action` is the systemctl verb (poweroff/reboot). Requires a sudoers rule
    letting 'divd' run `systemctl <action>` (see deploy/divd-shutdown.sudoers).
    """
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        payload = {}
    if payload.get("password", "") != settings.KIOSK_SHUTDOWN_PASSWORD:
        return JsonResponse({"ok": False, "error": "ACCESS DENIED"}, status=403)
    try:
        proc = subprocess.run(["sudo", "-n", "systemctl", action],
                              capture_output=True, text=True, timeout=10)
    except subprocess.TimeoutExpired:
        return JsonResponse({"ok": True})  # box is likely already going down
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or (verb + " failed")).strip()
        return JsonResponse({"ok": False, "error": msg[:300]}, status=500)
    return JsonResponse({"ok": True})


@csrf_exempt  # password-gated; needs to work from the kiosk without a CSRF token
@require_POST
def shutdown(request):
    """Hidden /shutdown command: power the Pi off if the password matches."""
    return _power(request, "poweroff", "poweroff")


@csrf_exempt  # password-gated; needs to work from the kiosk without a CSRF token
@require_POST
def reboot(request):
    """Hidden /reboot command: reboot the Pi if the password matches."""
    return _power(request, "reboot", "reboot")


# ---- /admin: wifi config + login-terminal entry --------------------------- #
# Each endpoint validates `password` against KIOSK_ADMIN_PASSWORD on every call
# — no session/cookie, matching the /shutdown style. The "shell" option no
# longer serves a web terminal (ttyd is gone); it reboots the Pi once into a
# plain getty login on the main screen via the boot-to-shell flag (admin_shell).

def _admin_auth(payload):
    """Return None if the password matches, otherwise a JsonResponse(403)."""
    if payload.get("password", "") != settings.KIOSK_ADMIN_PASSWORD:
        return JsonResponse({"ok": False, "error": "ACCESS DENIED"}, status=403)
    return None


def _json_body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return {}


@csrf_exempt
@require_POST
def admin_auth(request):
    """Validate the admin password — the frontend calls this before showing
    the wifi/shell sub-menu so a wrong password is rejected up front."""
    payload = _json_body(request)
    err = _admin_auth(payload)
    if err:
        return err
    return JsonResponse({"ok": True})


@csrf_exempt
@require_POST
def admin_wifi_scan(request):
    """Trigger a fresh wifi scan and return visible SSIDs (signal, security)."""
    payload = _json_body(request)
    err = _admin_auth(payload)
    if err:
        return err
    # `nmcli device wifi rescan` forces a scan; ignore errors (it's noisy when
    # a scan was already in flight) and read the list either way.
    subprocess.run(["sudo", "-n", "nmcli", "device", "wifi", "rescan"],
                   capture_output=True, text=True, timeout=10)
    proc = subprocess.run(
        ["sudo", "-n", "nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY",
         "device", "wifi", "list"],
        capture_output=True, text=True, timeout=15,
    )
    if proc.returncode != 0:
        return JsonResponse(
            {"ok": False, "error": (proc.stderr or proc.stdout).strip()[:300]},
            status=500,
        )
    # nmcli -t uses ':' separators and '\:' for embedded colons in field values.
    nets, seen = [], set()
    for line in proc.stdout.splitlines():
        # split on unescaped ':' — nmcli escapes colons inside values as '\:'
        parts, cur, esc = [], "", False
        for ch in line:
            if esc:
                cur += ch
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == ":":
                parts.append(cur)
                cur = ""
            else:
                cur += ch
        parts.append(cur)
        if len(parts) < 4:
            continue
        in_use, ssid, signal, sec = parts[0], parts[1], parts[2], parts[3]
        if not ssid or ssid in seen:
            continue  # drop hidden SSIDs and duplicate BSSIDs
        seen.add(ssid)
        try:
            sig = int(signal)
        except ValueError:
            sig = 0
        nets.append({
            "ssid": ssid,
            "signal": sig,
            "security": sec or "open",
            "in_use": in_use == "*",
        })
    nets.sort(key=lambda n: (-n["in_use"], -n["signal"]))
    return JsonResponse({"ok": True, "networks": nets[:30]})


@csrf_exempt
@require_POST
def admin_wifi_connect(request):
    """Connect to a wifi network. Open networks omit `psk`."""
    payload = _json_body(request)
    err = _admin_auth(payload)
    if err:
        return err
    ssid = (payload.get("ssid") or "").strip()
    psk = (payload.get("psk") or "")
    if not ssid:
        return JsonResponse({"ok": False, "error": "missing ssid"}, status=400)
    cmd = ["sudo", "-n", "nmcli", "device", "wifi", "connect", ssid]
    if psk:
        cmd += ["password", psk]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    if proc.returncode != 0:
        return JsonResponse(
            {"ok": False, "error": (proc.stderr or proc.stdout).strip()[:300]},
            status=400,
        )
    return JsonResponse({"ok": True, "msg": proc.stdout.strip()[:200]})


@csrf_exempt
@require_POST
def admin_shell(request):
    """/admin "login terminal": reboot once into a plain getty login.

    Writes the one-shot boot-to-shell flag (settings.BOOT_TO_SHELL_FLAG) so the
    next boot skips the kiosk and getty@tty1 autologins divd on the main screen,
    then reboots. divd's ~/.profile deletes the flag on login, so the reboot
    after that returns to the kiosk automatically. This is the in-app equivalent
    of deploy/divd-shell, replacing the old ttyd / Ctrl+Alt+F3 handoff. Reboot
    uses the existing divd-shutdown.sudoers rule.
    """
    payload = _json_body(request)
    err = _admin_auth(payload)
    if err:
        return err
    try:
        open(settings.BOOT_TO_SHELL_FLAG, "w").close()
    except OSError as e:
        return JsonResponse(
            {"ok": False, "error": ("could not set flag: " + str(e))[:300]},
            status=500,
        )
    try:
        proc = subprocess.run(["sudo", "-n", "systemctl", "reboot"],
                              capture_output=True, text=True, timeout=10)
    except subprocess.TimeoutExpired:
        return JsonResponse({"ok": True})  # box is likely already going down
    if proc.returncode != 0:
        # Reboot failed — clear the flag so we don't strand the kiosk in shell
        # mode on a manual/later reboot.
        try:
            os.remove(settings.BOOT_TO_SHELL_FLAG)
        except OSError:
            pass
        msg = (proc.stderr or proc.stdout or "reboot failed").strip()
        return JsonResponse({"ok": False, "error": msg[:300]}, status=500)
    return JsonResponse({"ok": True})
