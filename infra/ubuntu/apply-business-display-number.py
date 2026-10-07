#!/usr/bin/env python3
"""Apply the approved public WhatsApp number without rewriting other env entries."""

import os
from pathlib import Path
import re
import sys
import tempfile


KEY = b"WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER="
VARIABLE = "WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER"


def main() -> int:
    if len(sys.argv) != 2:
        print("Expected one staged production environment file.", file=sys.stderr)
        return 1
    value = os.environ.get(VARIABLE, "")
    if not value:
        return 0  # An unset GitHub variable must not replace the existing secret entry.
    if re.fullmatch(r"[1-9][0-9]{7,14}", value) is None:
        print("Business display number must be 8 to 15 digits with a nonzero first digit.", file=sys.stderr)
        return 1

    path = Path(sys.argv[1])
    original = path.read_bytes()
    lines = original.splitlines(keepends=True)
    matches = [index for index, line in enumerate(lines) if line.startswith(KEY)]
    if len(matches) > 1:
        print("Production environment contains duplicate business display number entries.", file=sys.stderr)
        return 1

    entry = KEY + value.encode("ascii")
    if matches:
        index = matches[0]
        ending = b"\r\n" if lines[index].endswith(b"\r\n") else b"\n" if lines[index].endswith(b"\n") else b""
        lines[index] = entry + ending
        updated = b"".join(lines)
    else:
        ending = b"\r\n" if b"\r\n" in original else b"\n"
        updated = original + (b"" if not original or original.endswith((b"\r", b"\n")) else ending) + entry + ending

    descriptor, temporary_name = tempfile.mkstemp(prefix=".production-env-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(updated)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
