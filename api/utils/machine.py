import platform
import subprocess
import os
import psutil

from pathlib import Path


def get_os_string() -> str:
    system = platform.system()

    # --- macOS ---
    if system == "Darwin":
        version = platform.mac_ver()[0]
        return f"macOS {version}"

    # --- Windows ---
    elif system == "Windows":
        version = platform.version()
        return f"Windows {version}"

    # --- Linux ---
    elif system == "Linux":
        is_docker = False

        if Path("/.dockerenv").exists():
            is_docker = True
        else:
            try:
                with open("/proc/1/cgroup", "r") as f:
                    content = f.read()
                    if "docker" in content or "containerd" in content:
                        is_docker = True
            except:
                pass

        try:
            os_release = {}
            with open("/etc/os-release") as f:
                for line in f:
                    k, _, v = line.partition("=")
                    os_release[k.strip()] = v.strip().strip('"')

            name = os_release.get("PRETTY_NAME", "Linux")
        except:
            name = "Linux"

        return name + " (Docker)" if is_docker else ""

    # --- fallback ---
    return system


def get_cpu_string() -> str:
    system = platform.system()
    arch = platform.machine()
    cpu_model = "Unknown CPU"

    # --- macOS ---
    if system == "Darwin":
        try:
            cpu_model = subprocess.check_output(
                ["sysctl", "-n", "machdep.cpu.brand_string"], text=True
            ).strip()
        except Exception:
            cpu_model = "Unknown CPU"

    # --- Windows ---
    elif system == "Windows":
        cpu_model = os.environ.get("PROCESSOR_IDENTIFIER", "Unknown CPU")

    # --- Linux ---
    elif system == "Linux":
        try:
            # 检查 /proc/cpuinfo
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if "model name" in line or "Hardware" in line:
                        cpu_model = line.split(":")[1].strip()
                        break
        except Exception:
            cpu_model = "Unknown CPU"

    # 拼接最终字符串
    cpu_string = f"{cpu_model} ({arch})"

    return cpu_string


def get_memory_string() -> str:
    mem_bytes = psutil.virtual_memory().total
    mem_gb = mem_bytes / (1024**3)
    return f"{mem_gb:.2f} GB"
