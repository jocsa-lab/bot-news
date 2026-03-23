from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_WORKSPACE_ROOT = ROOT.parent
VENV_DIR = ROOT / ".venv"
REQUIREMENTS_FILE = ROOT / "requirements.txt"
BOOTSTRAP_MARKER = VENV_DIR / ".bootstrap.json"
BOOTSTRAP_ENV_VAR = "PROMPT_RUNNER_BOOTSTRAPPED"
WORKSPACE_ROOT_ENV_VAR = "PROMPT_RUNNER_WORKSPACE_ROOT"
MIN_PYTHON = (3, 11)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _log_bootstrap(message: str) -> None:
    print(f"[prompt-runner bootstrap] {message}", file=sys.stderr)


def _format_version(version_info: tuple[int, ...]) -> str:
    return ".".join(str(part) for part in version_info)


def _venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def _workspace_root() -> Path:
    raw_value = os.environ.get(WORKSPACE_ROOT_ENV_VAR)
    if raw_value:
        return Path(raw_value).expanduser().resolve()
    return DEFAULT_WORKSPACE_ROOT


def _inside_target_venv(target_python: Path) -> bool:
    try:
        return Path(sys.executable).resolve() == target_python.resolve()
    except FileNotFoundError:
        return False


def _host_python_is_supported() -> bool:
    return sys.version_info >= MIN_PYTHON


def _probe_python(python_executable: Path) -> bool:
    if not python_executable.exists():
        return False

    try:
        result = subprocess.run(
            [str(python_executable), "-c", "import sys"],
            check=False,
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return False

    return result.returncode == 0


def _probe_module(python_executable: Path, module_name: str) -> bool:
    if not _probe_python(python_executable):
        return False

    try:
        result = subprocess.run(
            [str(python_executable), "-c", f"import {module_name}"],
            check=False,
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return False

    return result.returncode == 0


def _python_version(python_executable: Path) -> tuple[int, int, int] | None:
    if not _probe_python(python_executable):
        return None

    try:
        result = subprocess.run(
            [
                str(python_executable),
                "-c",
                "import sys; print('.'.join(str(part) for part in sys.version_info[:3]))",
            ],
            check=False,
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None

    if result.returncode != 0:
        return None

    raw_version = result.stdout.strip()
    try:
        major, minor, patch = (int(part) for part in raw_version.split(".", 2))
    except ValueError:
        return None

    return (major, minor, patch)


def _remove_venv() -> None:
    if not VENV_DIR.exists():
        return

    _log_bootstrap(f"removing invalid virtualenv at {VENV_DIR}")
    shutil.rmtree(VENV_DIR)


def _create_venv() -> None:
    if not _host_python_is_supported():
        current = _format_version(tuple(sys.version_info[:3]))
        minimum = _format_version(MIN_PYTHON)
        raise RuntimeError(
            f"Prompt Runner requires Python {minimum}+ to bootstrap, but current interpreter is {current} "
            f"({sys.executable})."
        )

    try:
        import ensurepip  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "Current Python installation does not provide ensurepip/venv bootstrap support. "
            "Install the system packages for venv and pip first. "
            "On Debian/Ubuntu this is usually: apt-get install -y python3-venv python3-pip"
        ) from exc

    _log_bootstrap(f"creating virtualenv with {sys.executable}")
    builder = venv.EnvBuilder(with_pip=True, clear=False, upgrade=False)
    builder.create(VENV_DIR)

    python_executable = _venv_python()
    if not _probe_python(python_executable):
        raise RuntimeError(
            f"Virtualenv was created at {VENV_DIR}, but its interpreter is not runnable: {python_executable}"
        )


def _ensure_venv_python() -> Path:
    python_executable = _venv_python()
    version_info = _python_version(python_executable)
    minimum = _format_version(MIN_PYTHON)

    if version_info is None:
        if VENV_DIR.exists():
            _log_bootstrap("existing .venv is broken or incomplete; recreating it")
            _remove_venv()
        _create_venv()
        python_executable = _venv_python()
        version_info = _python_version(python_executable)

    if version_info is None:
        raise RuntimeError(f"Virtualenv interpreter is unavailable after recreation: {python_executable}")

    if version_info < MIN_PYTHON:
        _log_bootstrap(
            f"existing .venv uses Python {_format_version(version_info)}, but Prompt Runner requires {minimum}+; recreating it"
        )
        _remove_venv()
        _create_venv()
        python_executable = _venv_python()
        version_info = _python_version(python_executable)
        if version_info is None:
            raise RuntimeError(f"Virtualenv interpreter is unavailable after upgrade: {python_executable}")

    return python_executable


def _ensure_pip(python_executable: Path) -> None:
    if _probe_module(python_executable, "pip"):
        return

    _log_bootstrap("pip is missing inside .venv; bootstrapping it with ensurepip")

    try:
        subprocess.run(
            [str(python_executable), "-m", "ensurepip", "--upgrade"],
            check=True,
            cwd=ROOT,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            "Failed to bootstrap pip inside the prompt-runner virtualenv. "
            "Install the host packages for venv/pip and rerun. "
            "On Debian/Ubuntu this is usually: apt-get install -y python3-venv python3-pip"
        ) from exc

    if not _probe_module(python_executable, "pip"):
        raise RuntimeError(f"pip is still unavailable inside virtualenv after ensurepip: {python_executable}")


def _needs_install(requirements_hash: str) -> bool:
    if not BOOTSTRAP_MARKER.exists():
        return True

    try:
        data = json.loads(BOOTSTRAP_MARKER.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return True

    return data.get("requirements_sha256") != requirements_hash


def _write_marker(requirements_hash: str) -> None:
    payload = {
        "requirements_sha256": requirements_hash,
        "python_executable": str(_venv_python()),
        "python_version": _format_version(tuple(sys.version_info[:3])),
    }
    BOOTSTRAP_MARKER.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _install_requirements(python_executable: Path) -> None:
    requirements_hash = _sha256(REQUIREMENTS_FILE)
    if not _needs_install(requirements_hash):
        return

    subprocess.run(
        [str(python_executable), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)],
        check=True,
        cwd=ROOT,
    )
    _write_marker(requirements_hash)


def _bootstrap() -> Path:
    if not REQUIREMENTS_FILE.exists():
        raise FileNotFoundError(f"Missing requirements file: {REQUIREMENTS_FILE}")

    python_executable = _ensure_venv_python()

    try:
        _ensure_pip(python_executable)
    except RuntimeError:
        _log_bootstrap("pip repair failed in existing .venv; recreating it from scratch")
        _remove_venv()
        _create_venv()
        python_executable = _venv_python()
        _ensure_pip(python_executable)

    _install_requirements(python_executable)
    return python_executable


def main() -> None:
    python_executable = _bootstrap()
    workspace_root = _workspace_root()

    if _inside_target_venv(python_executable) and os.environ.get(BOOTSTRAP_ENV_VAR) == "1":
        from main import main as app_main

        raise SystemExit(app_main())

    env = os.environ.copy()
    env[BOOTSTRAP_ENV_VAR] = "1"
    env[WORKSPACE_ROOT_ENV_VAR] = str(workspace_root)
    os.chdir(workspace_root)
    os.execve(
        str(python_executable),
        [str(python_executable), str(ROOT / "main.py"), *sys.argv[1:]],
        env,
    )


if __name__ == "__main__":
    main()
