"""Import the pinned source without starting DTK's application or scheduler."""

import importlib.util
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parent / "source"
if not (SOURCE / "src/dtk/__init__.py").is_file():
    raise ImportError("Initialize the DTK submodule at src/services/dtk/source")

# Upstream is read-only, including when Python would otherwise write bytecode.
sys.dont_write_bytecode = True
for directory in (SOURCE / "src", SOURCE / "docker"):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))


def load_policy(name: str):
    """Load a pure upstream module without scheduler/__init__'s Redis imports.

    These files have no relative imports or infrastructure dependencies. They
    execute unchanged under our namespace; no upstream modules are patched.
    """
    module_name = f"{__package__}._upstream_{name}"
    if module_name not in sys.modules:
        spec = importlib.util.spec_from_file_location(
            module_name, SOURCE / "src/dtk/scheduler" / f"{name}.py"
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except BaseException:
            sys.modules.pop(module_name, None)
            raise
    return sys.modules[module_name]


health = load_policy("health")
policies = load_policy("policies")
