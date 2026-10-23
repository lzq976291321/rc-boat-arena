"""Optimize embedded GLB textures and optional index widths without a runtime decoder.

Requires Pillow. Geometry, nodes, material slots, image dimensions and decoded
alpha are preserved by default. JPEG encoding is lossy: review the JSON report
and render the output before replacing a public asset. Never edits the input.

Example:
    python optimize-glb.py input.glb candidate.glb --compact-indices \
        --opaque-png-jpeg --report candidate.json
"""
import argparse
from array import array
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import sys

from PIL import Image, ImageChops, ImageStat


def read_glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", raw)
    if (magic, version, length) != (0x46546C67, 2, len(raw)):
        raise ValueError("Expected a complete GLB 2.0 file")
    chunks, offset = {}, 12
    while offset < len(raw):
        size, kind = struct.unpack_from("<II", raw, offset)
        if kind in chunks or offset + 8 + size > len(raw):
            raise ValueError("Invalid GLB chunk")
        chunks[kind] = raw[offset + 8:offset + 8 + size]
        offset += 8 + size
    if set(chunks) != {0x4E4F534A, 0x004E4942}:
        raise ValueError("Only embedded JSON + BIN GLBs are supported")
    document = json.loads(chunks[0x4E4F534A])
    if len(document.get("buffers", [])) != 1 or "uri" in document["buffers"][0]:
        raise ValueError("Expected exactly one embedded buffer")
    return raw, document, chunks[0x004E4942]


TEXTURE_SOURCE_EXTENSIONS = ("EXT_texture_avif", "EXT_texture_webp", "KHR_texture_basisu")


def texture_source(texture):
    """Resolve the image index from core ``source`` or a vendor format extension."""
    source = texture.get("source")
    if source is not None:
        return source
    for name in TEXTURE_SOURCE_EXTENSIONS:
        extension = texture.get("extensions", {}).get(name)
        if isinstance(extension, dict) and extension.get("source") is not None:
            return extension["source"]
    return None


def texture_roles(document):
    roles = {index: set() for index in range(len(document.get("images", [])))}

    def visit(value, key=""):
        if isinstance(value, dict):
            if key.endswith("Texture") and "index" in value:
                source = texture_source(document["textures"][value["index"]])
                if source is not None:
                    roles[source].add(key)
            for child_key, child in value.items():
                visit(child, child_key)
        elif isinstance(value, list):
            for child in value:
                visit(child, key)

    visit(document.get("materials", []))
    return roles


def image_difference(original, candidate):
    original, candidate = original.convert("RGB"), candidate.convert("RGB")
    difference = ImageChops.difference(original, candidate)
    statistics = ImageStat.Stat(difference)
    mse = sum(value * value for value in statistics.rms) / 3
    return {
        "mean_absolute_error_255": round(sum(statistics.mean) / 3, 4),
        "psnr_db": round(10 * math.log10(255 ** 2 / mse), 3) if mse else None,
    }


TEXTURE_EXTENSIONS = {"image/avif": "EXT_texture_avif", "image/webp": "EXT_texture_webp"}


def alpha_bytes(image):
    return image.convert("RGBA").getchannel("A").tobytes()


def apply_texture_extensions(document):
    """Declare vendor image formats on their textures.

    A WebP/AVIF texture carries its source index in the extension and has no
    core ``source``; Three's loader resolves the extension before the core
    texture path, so the declared format is never decoded as a fallback.
    """
    used = set()
    for texture in document.get("textures", []):
        source = texture_source(texture)
        if source is None:
            continue
        # The declaration follows the encoded output. This also handles a
        # repeated pass where an extension-only AVIF/WebP texture is re-encoded
        # to another format: the old extension must be replaced, not left stale.
        target = TEXTURE_EXTENSIONS.get(document["images"][source].get("mimeType"))
        extensions = texture.setdefault("extensions", {})
        for name in TEXTURE_SOURCE_EXTENSIONS:
            if name != target:
                extensions.pop(name, None)
        if target:
            extensions[target] = {"source": source}
            texture.pop("source", None)
            used.add(target)
        else:
            texture["source"] = source
        if not extensions:
            texture.pop("extensions", None)
    declared = set()
    for texture in document.get("textures", []):
        declared.update(name for name in TEXTURE_SOURCE_EXTENSIONS
                        if name in texture.get("extensions", {}))
    preserved = [name for name in document.get("extensionsUsed", [])
                 if name not in TEXTURE_SOURCE_EXTENSIONS]
    document["extensionsUsed"] = sorted(set(preserved) | declared)
    return sorted(declared)


def optimize_image(payload, mime, roles, options):
    original = Image.open(io.BytesIO(payload))
    original.load()
    has_alpha = "A" in original.getbands() or "transparency" in original.info
    is_data = bool(roles - {"baseColorTexture", "emissiveTexture", "specularColorTexture"})
    report = {
        "dimensions": list(original.size), "original_format": original.format,
        "original_mode": original.mode, "roles": sorted(roles),
        "original_bytes": len(payload), "has_alpha": has_alpha,
    }
    candidates = [(payload, mime, original, None)]
    minimum_psnr = options.data_psnr if is_data else options.color_psnr

    def add_lossy(encoder, output_mime, start_quality):
        # AVIF keeps 4:4:4, which matters for packed normal/ORM channels.
        # Lossy AVIF alpha is not exact, so alpha textures use lossless-webp alpha.
        if encoder == "AVIF" and has_alpha:
            return
        for candidate_quality in sorted(set(range(start_quality, 101, 2)) | {100}):
            stream = io.BytesIO()
            try:
                if encoder == "AVIF":
                    original.convert("RGB").save(stream, "AVIF", quality=candidate_quality,
                                                 speed=8, subsampling="4:4:4")
                else:
                    original.save(stream, "WEBP", quality=candidate_quality, method=6,
                                  alpha_quality=100)
            except (OSError, ValueError):
                return
            encoded = stream.getvalue()
            decoded = Image.open(io.BytesIO(encoded))
            decoded.load()
            if has_alpha and alpha_bytes(original) != alpha_bytes(decoded):
                continue
            difference = image_difference(original, decoded)
            if difference["psnr_db"] is None or difference["psnr_db"] >= minimum_psnr:
                candidates.append((encoded, output_mime, decoded, candidate_quality))
                return

    if getattr(options, "avif", False):
        add_lossy("AVIF", "image/avif", options.avif_data_quality if is_data else options.avif_color_quality)
    if getattr(options, "webp", False):
        add_lossy("WEBP", "image/webp", options.webp_data_quality if is_data else options.webp_color_quality)
    # PNG is always eligible for lossless re-encoding; palette transparency is
    # preserved, including when Pillow represents it as PNG tRNS metadata.
    if original.format == "PNG":
        stream = io.BytesIO()
        original.save(stream, "PNG", optimize=True, compress_level=9)
        encoded = stream.getvalue()
        decoded = Image.open(io.BytesIO(encoded))
        if decoded.convert("RGBA").tobytes() != original.convert("RGBA").tobytes():
            raise ValueError("Lossless PNG encoding changed pixels")
        candidates.append((encoded, "image/png", decoded, None))
    if not has_alpha and (original.format == "JPEG" or options.opaque_png_jpeg):
        quality = options.data_quality if is_data else options.color_quality
        # Raise quality for high-frequency textures instead of violating the
        # error bound or dropping the useful encoding improvement entirely.
        for candidate_quality in sorted(set(range(quality, 101, 2)) | {100}):
            stream = io.BytesIO()
            # No chroma subsampling: packed PBR channels remain independent.
            original.convert("RGB").save(stream, "JPEG", quality=candidate_quality,
                                         subsampling=0, optimize=True, progressive=True)
            encoded = stream.getvalue()
            decoded = Image.open(io.BytesIO(encoded))
            difference = image_difference(original, decoded)
            if difference["psnr_db"] is None or difference["psnr_db"] >= minimum_psnr:
                candidates.append((encoded, "image/jpeg", decoded, candidate_quality))
                break
    encoded, output_mime, decoded, quality = min(candidates, key=lambda candidate: len(candidate[0]))
    if has_alpha and original.convert("RGBA").getchannel("A").tobytes() != decoded.convert("RGBA").getchannel("A").tobytes():
        raise ValueError("Encoded image changed alpha")
    report.update({"output_bytes": len(encoded), "output_format": output_mime,
                   "quality": quality, "minimum_psnr_db": minimum_psnr,
                   "is_data_texture": is_data,
                   "retained_input": encoded == payload and output_mime == mime,
                   **image_difference(original, decoded)})
    return encoded, output_mime, report


def compact_indices(document, payloads):
    """Rewrite an index-only bufferView as uint16 when every value fits exactly."""
    accessors = document.get("accessors", [])
    index_ids = {primitive["indices"] for mesh in document.get("meshes", [])
                 for primitive in mesh.get("primitives", []) if "indices" in primitive}
    image_views = {image.get("bufferView") for image in document.get("images", [])}
    updates = []
    for view_index, view in enumerate(document.get("bufferViews", [])):
        references = [(index, accessor) for index, accessor in enumerate(accessors)
                      if accessor.get("bufferView") == view_index]
        if (not references or view_index in image_views or view.get("byteStride")
                or view.get("extensions") or any(index not in index_ids
                    or accessor.get("type") != "SCALAR" or accessor.get("componentType") != 5125
                    or "sparse" in accessor for index, accessor in references)):
            continue
        values_by_accessor = []
        for index, accessor in references:
            offset, count = accessor.get("byteOffset", 0), accessor["count"]
            payload = payloads[view_index][offset:offset + count * 4]
            values = array("I")
            values.frombytes(payload)
            if sys.byteorder != "little":
                values.byteswap()
            # glTF reserves the largest component value for primitive restart.
            if len(values) != count or max(values, default=0) > 65534:
                break
            values_by_accessor.append((index, accessor, values))
        else:
            compact = bytearray()
            for index, accessor, values in values_by_accessor:
                compact.extend(b"\0" * (-len(compact) % 4))
                accessor["byteOffset"] = len(compact)
                accessor["componentType"] = 5123
                encoded = array("H", values)
                if sys.byteorder != "little":
                    encoded.byteswap()
                compact.extend(encoded.tobytes())
                updates.append(index)
            payloads[view_index] = bytes(compact)
    return updates


def optimize(source, output, options):
    if source.resolve() == output.resolve():
        raise ValueError("Output must differ from the source")
    raw, original_document, binary = read_glb(source)
    document = copy.deepcopy(original_document)
    views = document.get("bufferViews", [])
    if any(view.get("buffer", 0) != 0 or "extensions" in view for view in views):
        raise ValueError("Compressed or external buffer views are not supported")
    payloads = [binary[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
                for view in views]
    roles, image_reports = texture_roles(document), []
    image_views = [image.get("bufferView") for image in document.get("images", [])]
    if len(set(image_views)) != len(image_views) or None in image_views:
        raise ValueError("Expected unique embedded image views")
    if any(accessor.get("bufferView") in image_views for accessor in document.get("accessors", [])):
        raise ValueError("Image buffer view is shared with an accessor")
    for index, image in enumerate(document.get("images", [])):
        view = image["bufferView"]
        payloads[view], image["mimeType"], report = optimize_image(
            payloads[view], image["mimeType"], roles[index], options)
        image_reports.append({"index": index, "name": image.get("name"), **report})
    texture_extensions = apply_texture_extensions(document)
    narrowed = compact_indices(document, payloads) if options.compact_indices else []
    packed = bytearray()
    for view, payload in zip(views, payloads):
        packed.extend(b"\0" * (-len(packed) % 4))
        view.update({"byteOffset": len(packed), "byteLength": len(payload)})
        packed.extend(payload)
    document["buffers"][0]["byteLength"] = len(packed)
    packed.extend(b"\0" * (-len(packed) % 4))
    encoded_json = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode()
    encoded_json += b" " * (-len(encoded_json) % 4)
    optimized = (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded_json) + len(packed))
                 + struct.pack("<II", len(encoded_json), 0x4E4F534A) + encoded_json
                 + struct.pack("<II", len(packed), 0x004E4942) + packed)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(optimized)
    # Every non-image/non-index bufferView must stay byte-identical; scene,
    # nodes, meshes, material factors/slots and samplers must stay identical.
    narrowed_views = {document["accessors"][index]["bufferView"] for index in narrowed}
    for index, view in enumerate(original_document.get("bufferViews", [])):
        if index not in set(image_views) | narrowed_views:
            start = view.get("byteOffset", 0)
            assert payloads[index] == binary[start:start + view["byteLength"]]
    for key in ("scene", "scenes", "nodes", "meshes", "materials", "samplers",
                "skins", "animations", "extensionsRequired"):
        assert document.get(key) == original_document.get(key), key
    # Textures keep their sampler and gain exactly one declared image-format
    # extension; no other texture metadata may change.
    original_textures, updated_textures = original_document.get("textures", []), document.get("textures", [])
    assert len(original_textures) == len(updated_textures), "Texture count changed"
    for original, updated in zip(original_textures, updated_textures):
        # Verify invariants rather than reconstructing one expected dictionary:
        # the output format may differ from the input and the declaration must
        # follow the new MIME, including on a repeated compression pass.
        assert {key: value for key, value in original.items() if key not in ("source", "extensions")} == \
               {key: value for key, value in updated.items() if key not in ("source", "extensions")}, \
            "Texture metadata changed unexpectedly"
        original_extensions, updated_extensions = original.get("extensions", {}), updated.get("extensions", {})
        for name, extension in original_extensions.items():
            if name not in TEXTURE_SOURCE_EXTENSIONS:
                assert updated_extensions.get(name) == extension, "Non-format texture extension changed"
        source = texture_source(original)
        if source is None:
            assert updated == original, "Texture without an image source changed"
            continue
        target = TEXTURE_EXTENSIONS.get(document["images"][source]["mimeType"])
        if target:
            assert updated_extensions.get(target) == {"source": source}, "Output format not declared"
            for name in TEXTURE_SOURCE_EXTENSIONS:
                if name != target:
                    assert name not in updated_extensions, "Stale texture format declaration"
            assert "source" not in updated, "Vendor texture keeps a core source"
        else:
            assert updated.get("source") == source, "Core image source changed"
            for name in TEXTURE_SOURCE_EXTENSIONS:
                assert name not in updated_extensions, "Stale vendor texture declaration"
    declared = set(document.get("extensionsUsed", []))
    assert set(texture_extensions) <= declared, "Texture extension declarations missing"

    for index, accessor in enumerate(original_document.get("accessors", [])):
        if index not in narrowed:
            assert document["accessors"][index] == accessor
            continue
        old_view = original_document["bufferViews"][accessor["bufferView"]]
        old_start = old_view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        old_values = struct.unpack_from("<" + "I" * accessor["count"], binary, old_start)
        new_accessor = document["accessors"][index]
        new_values = struct.unpack_from("<" + "H" * accessor["count"],
                                        payloads[new_accessor["bufferView"]],
                                        new_accessor.get("byteOffset", 0))
        assert old_values == new_values, "Index narrowing changed geometry"
    return {
        "source": str(source), "output": str(output),
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "output_sha256": hashlib.sha256(optimized).hexdigest(),
        "original_bytes": len(raw), "output_bytes": len(optimized),
        "saved_percent": round((1 - len(optimized) / len(raw)) * 100, 2),
        "original_image_bytes": sum(item["original_bytes"] for item in image_reports),
        "output_image_bytes": sum(item["output_bytes"] for item in image_reports),
        "indices_narrowed_to_uint16": narrowed, "images": image_reports,
        "texture_extensions": texture_extensions,
        "validation": {"scene_and_materials_unchanged": True,
                       "texture_extensions_declared": True,
                       "non_index_geometry_bytes_unchanged": True,
                       "index_values_unchanged": True,
                       "image_dimensions_and_alpha_unchanged": True},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--color-quality", type=int, default=90)
    parser.add_argument("--data-quality", type=int, default=95)
    parser.add_argument("--color-psnr", type=float, default=36)
    parser.add_argument("--data-psnr", type=float, default=38)
    parser.add_argument("--opaque-png-jpeg", action="store_true")
    parser.add_argument("--compact-indices", action="store_true")
    parser.add_argument("--avif", action="store_true")
    parser.add_argument("--webp", action="store_true")
    parser.add_argument("--avif-color-quality", type=int, default=76)
    parser.add_argument("--avif-data-quality", type=int, default=80)
    parser.add_argument("--webp-color-quality", type=int, default=80)
    parser.add_argument("--webp-data-quality", type=int, default=84)
    arguments = parser.parse_args()
    qualities = (arguments.color_quality, arguments.data_quality, arguments.avif_color_quality,
                 arguments.avif_data_quality, arguments.webp_color_quality, arguments.webp_data_quality)
    if any(not 1 <= quality <= 100 for quality in qualities):
        parser.error("Texture quality must be between 1 and 100")
    result = optimize(arguments.source, arguments.output, arguments)
    serialized = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if arguments.report:
        arguments.report.parent.mkdir(parents=True, exist_ok=True)
        arguments.report.write_text(serialized)
    print(serialized)
