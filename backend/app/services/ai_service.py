from pathlib import Path
import sys

_REPO_ROOT = Path(__file__).resolve().parents[3]
_repo_root = str(_REPO_ROOT)
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

from ai.ml.ai_service import *  # noqa: F401,F403
