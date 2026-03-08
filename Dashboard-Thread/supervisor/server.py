#!/usr/bin/env python3
"""
Supervisor: Unix socket + watch device.
- Socket /var/run/izerocs/supervisor.sock: backend gọi restart-otbr / health.
- Thread phụ: poll DEVICE_PATH, device mất thì docker restart container.
Chạy một service systemd là đủ (thay otbr-watch-device).
"""
import os
import socket
import subprocess
import sys
import threading
import time

# Unbuffered stdout để log ra journal/systemd ngay (khi không chạy trên TTY)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

SOCK_DIR = os.environ.get("SUPERVISOR_SOCK_DIR", "/var/run/izerocs")
SOCK_PATH = os.path.join(SOCK_DIR, "supervisor.sock")
CONTAINER = os.environ.get("OTBR_CONTAINER_NAME", "dashboard-thread-otbr")
DEVICE_PATH = os.environ.get("DEVICE_PATH", "").strip()
INTERVAL = int(os.environ.get("INTERVAL", "5") or "5")
DOCKER = os.environ.get("DOCKER", "docker")


def ensure_dir():
    os.makedirs(SOCK_DIR, mode=0o755, exist_ok=True)


def do_restart():
    subprocess.run(
        [DOCKER, "restart", CONTAINER],
        check=True,
        capture_output=True,
        timeout=30,
    )


def watch_device():
    if not DEVICE_PATH:
        return
    last_seen = False
    while True:
        try:
            if os.path.exists(DEVICE_PATH):
                last_seen = True
            else:
                if last_seen:
                    print(f"Device {DEVICE_PATH} gone, restarting {CONTAINER}")
                    try:
                        do_restart()
                    except Exception as e:
                        print(f"restart failed: {e}")
                    last_seen = False
        except Exception as e:
            print(f"watch error: {e}")
        time.sleep(INTERVAL)
        # Log mỗi chu kỳ để journalctl -f thấy hoạt động
        status = "ok" if os.path.exists(DEVICE_PATH) else "gone"
        print(f"watch: {DEVICE_PATH} {status}")


def handle(conn):
    try:
        data = conn.recv(256).decode().strip()
        cmd = (data.split("\n")[0] or "").strip().lower()
        if cmd == "restart-otbr":
            do_restart()
            conn.sendall(b"ok\n")
        elif cmd == "health" or cmd == "":
            conn.sendall(b"ok\n")
        else:
            conn.sendall(b"unknown\n")
    except subprocess.CalledProcessError as e:
        conn.sendall(f"error: {e.stderr.decode().strip()}\n".encode())
    except subprocess.TimeoutExpired:
        conn.sendall(b"error: timeout\n")
    except FileNotFoundError:
        conn.sendall(b"error: docker not found\n")
    except Exception as e:
        conn.sendall(f"error: {e}\n".encode())
    finally:
        conn.close()


def main():
    ensure_dir()
    if os.path.exists(SOCK_PATH):
        os.unlink(SOCK_PATH)
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.bind(SOCK_PATH)
    sock.listen(8)
    info = f"Supervisor socket: {SOCK_PATH} (container={CONTAINER})"
    if DEVICE_PATH:
        info += f", watch device={DEVICE_PATH} every {INTERVAL}s"
    print(info)
    if DEVICE_PATH:
        t = threading.Thread(target=watch_device, daemon=True)
        t.start()
    while True:
        conn, _ = sock.accept()
        handle(conn)


if __name__ == "__main__":
    main()
