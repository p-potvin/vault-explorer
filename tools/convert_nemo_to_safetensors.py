"""One-time conversion of a .nemo archive into a fast-loading model directory.

A ``.nemo`` file is a tar archive holding ``model_config.yaml``, a 2.4 GB
``model_weights.ckpt`` pickle, and the tokenizer files. Restoring from it costs a
full tar unpack plus a ``torch.load`` of the pickle on every cold start, and the
pickle path materialises the whole state dict in CPU RAM before a single weight
reaches the GPU.

This script unpacks the archive once and rewrites it as:

    tools/models/parakeet-tdt-0.6b-v3/
        model_config.yaml        (tokenizer paths rewritten to absolute)
        model.safetensors        (mmap-able, zero-copy, loadable per-tensor)
        <tokenizer files>

``vault_explorer/parakeet_wrapper.py`` prefers that directory when it exists,
builds the model under ``torch.device('meta')`` so no storage is allocated for
the initial parameters, and then streams the safetensors weights straight onto
the target device.

Usage:
    python tools/convert_nemo_to_safetensors.py [--nemo PATH] [--out DIR] [--force]
"""

import argparse
import glob
import os
import re
import shutil
import sys
import tarfile
import time

DEFAULT_MODEL = "parakeet-tdt-0.6b-v3"

# NeMo refers to files packed inside the archive with a `nemo:<hash>_<name>`
# scheme. Once unpacked they need real paths.
NEMO_REF = re.compile(r'nemo:([0-9a-f]{32}_)?([^\s\'"]+)')


def find_nemo(model_name):
    candidates = []
    model_dir = os.environ.get("VAULT_MODEL_DIR")
    if model_dir:
        candidates.append(os.path.join(model_dir, f"{model_name}.nemo"))
    repo_models = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    candidates.append(os.path.join(repo_models, f"{model_name}.nemo"))
    candidates += glob.glob(os.path.expanduser(
        f"~/.cache/huggingface/hub/models--nvidia--{model_name}/snapshots/*/*.nemo"))

    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return os.path.realpath(candidate)
    return None


def extract(nemo_path, out_dir):
    print(f"[convert] Unpacking {nemo_path}")
    started = time.perf_counter()
    os.makedirs(out_dir, exist_ok=True)
    with tarfile.open(nemo_path, "r:*") as tar:
        for member in tar.getmembers():
            # Flatten and refuse anything that would escape out_dir.
            name = os.path.basename(member.name)
            if not name or member.isdir():
                continue
            target = os.path.join(out_dir, name)
            extracted = tar.extractfile(member)
            if extracted is None:
                continue
            with open(target, "wb") as fh:
                shutil.copyfileobj(extracted, fh)
    print(f"[convert] Unpacked in {time.perf_counter() - started:.1f}s")


def rewrite_config(out_dir):
    """Point `nemo:`-prefixed asset references at the unpacked files.

    References are written as bare filenames, *not* absolute paths, so the
    converted directory stays location-independent: it can be moved, copied, or
    hard-linked into several projects and every copy remains byte-identical.
    The loader resolves these against the directory holding the config.
    """
    config_path = os.path.join(out_dir, "model_config.yaml")
    if not os.path.exists(config_path):
        raise RuntimeError(f"model_config.yaml missing from {out_dir}")

    with open(config_path, "r", encoding="utf-8") as fh:
        text = fh.read()

    present = {f for f in os.listdir(out_dir)}

    def resolve(match):
        prefix, name = match.group(1) or "", match.group(2)
        for candidate in (f"{prefix}{name}", name):
            if candidate in present:
                return candidate
        # Leave anything we cannot resolve untouched rather than guessing.
        return match.group(0)

    rewritten = NEMO_REF.sub(resolve, text)
    with open(config_path, "w", encoding="utf-8") as fh:
        fh.write(rewritten)

    changed = sum(1 for _ in NEMO_REF.finditer(text))
    print(f"[convert] Rewrote {changed} asset reference(s) as relative filenames")
    return config_path


def convert_weights(out_dir):
    import torch
    from safetensors.torch import save_file

    ckpt_path = os.path.join(out_dir, "model_weights.ckpt")
    if not os.path.exists(ckpt_path):
        raise RuntimeError(f"model_weights.ckpt missing from {out_dir}")

    print("[convert] Loading checkpoint...")
    started = time.perf_counter()
    state = torch.load(ckpt_path, map_location="cpu", weights_only=True)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    print(f"[convert] Loaded {len(state)} tensors in {time.perf_counter() - started:.1f}s")

    # safetensors requires contiguous, non-shared storage and plain tensors.
    cleaned = {}
    skipped = []
    for key, value in state.items():
        if not isinstance(value, torch.Tensor):
            skipped.append(key)
            continue
        cleaned[key] = value.detach().cpu().contiguous().clone()

    if skipped:
        print(f"[convert] Skipped {len(skipped)} non-tensor entries: {skipped[:5]}")

    target = os.path.join(out_dir, "model.safetensors")
    print(f"[convert] Writing {target}")
    started = time.perf_counter()
    save_file(cleaned, target, metadata={"format": "pt"})
    print(f"[convert] Wrote {len(cleaned)} tensors "
          f"({os.path.getsize(target) / 1024 / 1024:.0f} MB) in "
          f"{time.perf_counter() - started:.1f}s")

    # The pickle is now redundant and is by far the largest file here.
    os.remove(ckpt_path)
    print("[convert] Removed the now-redundant model_weights.ckpt")
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model name to locate")
    parser.add_argument("--nemo", default=None, help="Explicit path to the .nemo archive")
    parser.add_argument("--out", default=None, help="Output directory")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing conversion")
    args = parser.parse_args()

    nemo_path = args.nemo or find_nemo(args.model)
    if not nemo_path or not os.path.exists(nemo_path):
        print(f"[convert] Could not find a .nemo archive for '{args.model}'.", file=sys.stderr)
        return 1

    out_dir = args.out or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "models", args.model)

    marker = os.path.join(out_dir, "model.safetensors")
    if os.path.exists(marker) and not args.force:
        print(f"[convert] Already converted: {marker}\n[convert] Pass --force to redo.")
        return 0

    if os.path.exists(out_dir) and args.force:
        shutil.rmtree(out_dir, ignore_errors=True)

    total = time.perf_counter()
    extract(nemo_path, out_dir)
    rewrite_config(out_dir)
    convert_weights(out_dir)
    print(f"[convert] Done in {time.perf_counter() - total:.1f}s -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
