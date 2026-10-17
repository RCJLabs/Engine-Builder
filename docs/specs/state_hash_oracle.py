"""An independent implementation of docs/specs/state-hash.md, used as an oracle.

Reads {"strings": [...], "values": [...]} as JSON on stdin and prints, for each string, its
FNV-1a 64 and, for each value, its canonical JSON, state hash and UTF-8 size.
packages/core/src/stateHash.oracle.test.ts sends it fixed cases plus generated ones and compares
every answer with @eb/core.

Written from the spec in Python, so a JavaScript-only slip cannot hide in both. Scope: the
values the test sends are null, booleans, safe integers, well-formed strings, arrays and
objects, plus floats whose Python repr matches ECMAScript's (no exponents).

Run it yourself:  echo '{"strings":["a"],"values":[{"b":1,"a":2}]}' | python3 -I docs/specs/state_hash_oracle.py
"""

import json
import sys

MASK64 = (1 << 64) - 1


def fnv1a64(text):
    h = 0xCBF29CE484222325
    for byte in text.encode("utf-8"):
        h = ((h ^ byte) * 0x100000001B3) & MASK64
    return f"{h:016x}"


def utf16_order(key):
    return key.encode("utf-16-be")


def canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        text = repr(value)
        if "e" in text or "n" in text:
            raise ValueError(f"the oracle does not format {text}; keep oracle cases free of exponents")
        return text[:-2] if text.endswith(".0") else text
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=utf16_order)
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical(value[k]) for k in keys) + "}"
    raise TypeError(f"not JSON: {value!r}")


def main():
    request = json.load(sys.stdin)
    answers = []
    for value in request["values"]:
        text = canonical(value)
        answers.append({"canonical": text, "hash": fnv1a64(text), "bytes": len(text.encode("utf-8"))})
    print(json.dumps({"fnv1a64": [fnv1a64(s) for s in request["strings"]], "values": answers}, ensure_ascii=False))


if __name__ == "__main__":
    main()
