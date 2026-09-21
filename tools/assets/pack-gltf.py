"""Pack a local glTF and its images into GLB without changing geometry or textures."""
import argparse
import json
import mimetypes
from pathlib import Path
import struct
from urllib.parse import unquote


def pack(source: Path, output: Path):
    document = json.loads(source.read_text())
    root = source.parent.resolve()
    binary = bytearray()

    def read(uri):
        path = (root / unquote(uri)).resolve()
        if not path.is_relative_to(root):
            raise ValueError("Resource must be inside the source directory")
        return path.read_bytes()

    def append(data):
        binary.extend(b"\0" * (-len(binary) % 4))
        offset = len(binary)
        binary.extend(data)
        return offset

    offsets = []
    for buffer in document.get("buffers", []):
        data = read(buffer["uri"])
        if len(data) != buffer["byteLength"]:
            raise ValueError("Buffer length does not match glTF")
        offsets.append(append(data))
    for view in document.get("bufferViews", []):
        view["byteOffset"] = offsets[view["buffer"]] + view.get("byteOffset", 0)
        view["buffer"] = 0
    for image in document.get("images", []):
        if "uri" not in image:
            continue
        uri = image.pop("uri")
        data = read(uri)
        mime = mimetypes.guess_type(uri)[0]
        if mime not in {"image/jpeg", "image/png", "image/webp", "image/ktx2"}:
            raise ValueError("Unsupported image type: " + uri)
        image["mimeType"] = mime
        image["bufferView"] = len(document.setdefault("bufferViews", []))
        document["bufferViews"].append({"buffer": 0, "byteOffset": append(data), "byteLength": len(data)})
    document["buffers"] = [{"byteLength": len(binary)}]
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 28 + len(payload) + len(binary))
        + struct.pack("<II", len(payload), 0x4E4F534A) + payload
        + struct.pack("<II", len(binary), 0x004E4942) + binary
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    pack(arguments.source, arguments.output)
