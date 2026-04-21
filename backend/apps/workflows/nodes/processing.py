import json
import os
import re
import tempfile

import numpy as np
import rasterio
from rasterio.mask import mask as rasterio_mask
from rasterio.warp import reproject, Resampling


_NODATA = -9999.0


# ── Low-level helpers ──────────────────────────────────────────────────────────

def _write_raster(arr: np.ndarray, profile: dict, suffix: str) -> str:
    """Write a 2-D float32 array to a temporary GeoTIFF and return its path."""
    profile = profile.copy()
    profile.update(dtype="float32", count=1, nodata=_NODATA, compress="deflate")
    fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="wf_")
    os.close(fd)
    with rasterio.open(tmp_path, "w", **profile) as dst:
        dst.write(arr.astype(np.float32), 1)
    return tmp_path


def _align_rasters(path_a: str, path_b: str):
    """Read two rasters, reprojecting B onto A's grid if needed.

    Uses _NODATA as the fill/nodata sentinel during reprojection so that
    legitimate zero pixel values are never mistakenly masked out.
    """
    with rasterio.open(path_a) as src_a:
        data_a = src_a.read(1, masked=True).astype(np.float32)
        profile = src_a.profile.copy()
        height, width = src_a.height, src_a.width
        crs_a = src_a.crs
        transform_a = src_a.transform

    with rasterio.open(path_b) as src_b:
        if src_b.crs == crs_a and src_b.width == width and src_b.height == height:
            data_b = src_b.read(1, masked=True).astype(np.float32)
        else:
            data_b_arr = np.full((height, width), _NODATA, dtype=np.float32)
            reproject(
                source=rasterio.band(src_b, 1),
                destination=data_b_arr,
                src_transform=src_b.transform,
                src_crs=src_b.crs,
                dst_transform=transform_a,
                dst_crs=crs_a,
                dst_nodata=_NODATA,
                resampling=Resampling.bilinear,
            )
            data_b = np.ma.masked_equal(data_b_arr, _NODATA)

    return data_a, data_b, profile


def _align_to(ref_data: np.ndarray, ref_profile: dict,
               ref_transform, ref_crs, path: str) -> np.ma.MaskedArray:
    with rasterio.open(path) as src:
        if src.crs == ref_crs and src.shape == ref_data.shape:
            return src.read(1, masked=True).astype(np.float32)
        else:
            out = np.full(ref_data.shape, _NODATA, dtype=np.float32)
            reproject(
                source=rasterio.band(src, 1),
                destination=out,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=ref_transform,
                dst_crs=ref_crs,
                dst_nodata=_NODATA,
                resampling=Resampling.bilinear,
            )
            return np.ma.masked_equal(out, _NODATA)


def _load_raster(path: str):
    with rasterio.open(path) as src:
        data = src.read(1, masked=True).astype(np.float32)
        return data, src.profile, src.transform, src.crs


def _load_raster_all_bands(path: str):
    """Read every band from a raster. Returns (list_of_masked_arrays, profile, transform, crs)."""
    with rasterio.open(path) as src:
        bands = [src.read(i + 1, masked=True).astype(np.float32) for i in range(src.count)]
        return bands, src.profile.copy(), src.transform, src.crs


def _align_to_all_bands(ref_data: np.ndarray, ref_profile: dict,
                         ref_transform, ref_crs, path: str) -> list:
    """Align every band of the raster at *path* onto the reference grid."""
    with rasterio.open(path) as src:
        height, width = ref_data.shape
        result = []
        for band_idx in range(1, src.count + 1):
            if src.crs == ref_crs and src.shape == ref_data.shape:
                result.append(src.read(band_idx, masked=True).astype(np.float32))
            else:
                out = np.full((height, width), _NODATA, dtype=np.float32)
                reproject(
                    source=rasterio.band(src, band_idx),
                    destination=out,
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=ref_transform,
                    dst_crs=ref_crs,
                    dst_nodata=_NODATA,
                    resampling=Resampling.bilinear,
                )
                result.append(np.ma.masked_equal(out, _NODATA))
        return result


def _read_bands(src, bands: list) -> list:
    return [src.read(b, masked=True).astype(np.float32) for b in bands]


def _read_single_band(path: str):
    """Return (masked_array, profile) for band 1 of the raster at path."""
    with rasterio.open(path) as src:
        return src.read(1, masked=True).astype(np.float32), src.profile.copy()


def _check_bands(src, *band_nums: int, node_name: str = "") -> None:
    needed = max(band_nums)
    if src.count < needed:
        raise ValueError(
            f"{node_name}: raster has {src.count} band(s) but needs band {needed}"
        )


def _norm_diff(a: np.ma.MaskedArray, b: np.ma.MaskedArray) -> np.ndarray:
    """Compute (a−b)/(a+b), filling _NODATA where denominator is zero or masked."""
    denom = np.ma.filled(a + b, 0).astype(np.float32)
    num = np.ma.filled(a - b, 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(a) | np.ma.getmaskarray(b)] = _NODATA
    return out


## OPERATORS

# Arithmetic
def add_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    return {"type": "raster", "path": _write_raster(np.ma.filled(a + b, _NODATA), p, "_add.tif"), "metadata": {}}


def subtract_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    return {"type": "raster", "path": _write_raster(np.ma.filled(a - b, _NODATA), p, "_sub.tif"), "metadata": {}}


def multiply_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    return {"type": "raster", "path": _write_raster(np.ma.filled(a * b, _NODATA), p, "_mul.tif"), "metadata": {}}


def divide_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    combined_mask = np.ma.getmaskarray(a) | np.ma.getmaskarray(b)
    b_f = np.ma.filled(b, 0).astype(np.float32)
    a_f = np.ma.filled(a, _NODATA).astype(np.float32)
    out = np.where(b_f == 0, _NODATA, a_f / np.where(b_f == 0, 1.0, b_f))
    out[combined_mask] = _NODATA
    return {"type": "raster", "path": _write_raster(out.astype(np.float32), p, "_div.tif"), "metadata": {}}


def power_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    combined_mask = np.ma.getmaskarray(a) | np.ma.getmaskarray(b)
    a_f = np.ma.filled(a, _NODATA).astype(np.float32)
    b_f = np.ma.filled(b, _NODATA).astype(np.float32)
    # Negative base with fractional exponent → nan; guard those pixels
    invalid = (a_f < 0) & (b_f != np.floor(b_f))
    out = np.where(invalid, _NODATA, np.where(invalid, 1.0, a_f) ** np.where(invalid, 1.0, b_f))
    out[combined_mask] = _NODATA
    return {"type": "raster", "path": _write_raster(out.astype(np.float32), p, "_pow.tif"), "metadata": {}}


def min_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    return {"type": "raster", "path": _write_raster(np.ma.filled(np.minimum(a, b), _NODATA), p, "_min.tif"), "metadata": {}}


def max_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    return {"type": "raster", "path": _write_raster(np.ma.filled(np.maximum(a, b), _NODATA), p, "_max.tif"), "metadata": {}}


# Unary math
def abs_node(inputs: dict, config: dict) -> dict:
    a, p = _read_single_band(inputs["raster"]["path"])
    return {"type": "raster", "path": _write_raster(np.ma.filled(np.abs(a), _NODATA), p, "_abs.tif"), "metadata": {}}


def sqrt_node(inputs: dict, config: dict) -> dict:
    a, p = _read_single_band(inputs["raster"]["path"])
    a_f = np.ma.filled(a, _NODATA).astype(np.float32)
    safe = np.where(a_f >= 0, a_f, 0.0)
    out = np.where(a_f >= 0, np.sqrt(safe), _NODATA)
    out[np.ma.getmaskarray(a)] = _NODATA
    return {"type": "raster", "path": _write_raster(out.astype(np.float32), p, "_sqrt.tif"), "metadata": {}}


def log10_node(inputs: dict, config: dict) -> dict:
    a, p = _read_single_band(inputs["raster"]["path"])
    a_f = np.ma.filled(a, _NODATA).astype(np.float32)
    safe = np.where(a_f > 0, a_f, 1.0)
    out = np.where(a_f > 0, np.log10(safe), _NODATA)
    out[np.ma.getmaskarray(a)] = _NODATA
    return {"type": "raster", "path": _write_raster(out.astype(np.float32), p, "_log10.tif"), "metadata": {}}


def ln_node(inputs: dict, config: dict) -> dict:
    a, p = _read_single_band(inputs["raster"]["path"])
    a_f = np.ma.filled(a, _NODATA).astype(np.float32)
    safe = np.where(a_f > 0, a_f, 1.0)
    out = np.where(a_f > 0, np.log(safe), _NODATA)
    out[np.ma.getmaskarray(a)] = _NODATA
    return {"type": "raster", "path": _write_raster(out.astype(np.float32), p, "_ln.tif"), "metadata": {}}


# Trigonometric
_TRIG_FUNCS = {
    "sin": np.sin, "cos": np.cos, "tan": np.tan,
    "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan,
}


def _unary_trig(inputs: dict, fn: str) -> dict:
    a, p = _read_single_band(inputs["raster"]["path"])
    f = _TRIG_FUNCS[fn]
    return {"type": "raster", "path": _write_raster(np.ma.filled(f(a), _NODATA), p, f"_{fn}.tif"), "metadata": {}}


def sin_node(inputs: dict, config: dict) -> dict: return _unary_trig(inputs, "sin")
def cos_node(inputs: dict, config: dict) -> dict: return _unary_trig(inputs, "cos")
def tan_node(inputs: dict, config: dict) -> dict: return _unary_trig(inputs, "tan")
def asin_node(inputs: dict, config: dict) -> dict: return _unary_trig(inputs, "arcsin")
def acos_node(inputs: dict, config: dict) -> dict: return _unary_trig(inputs, "arccos")
def atan_node(inputs: dict, config: dict) -> dict: return _unary_trig(inputs, "arctan")


# Logical / relational
_LOGIC_OPS = {
    "<": np.less, ">": np.greater,
    "<=": np.less_equal, ">=": np.greater_equal,
    "==": np.equal, "!=": np.not_equal,
}


def _binary_logic(inputs: dict, op: str, suffix: str) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    combined_mask = np.ma.getmaskarray(a) | np.ma.getmaskarray(b)
    res = _LOGIC_OPS[op](np.ma.filled(a, 0), np.ma.filled(b, 0)).astype(np.float32)
    res[combined_mask] = _NODATA
    return {"type": "raster", "path": _write_raster(res, p, suffix), "metadata": {}}


def lt_node(inputs: dict, config: dict) -> dict: return _binary_logic(inputs, "<", "_lt.tif")
def gt_node(inputs: dict, config: dict) -> dict: return _binary_logic(inputs, ">", "_gt.tif")
def le_node(inputs: dict, config: dict) -> dict: return _binary_logic(inputs, "<=", "_le.tif")
def ge_node(inputs: dict, config: dict) -> dict: return _binary_logic(inputs, ">=", "_ge.tif")
def eq_node(inputs: dict, config: dict) -> dict: return _binary_logic(inputs, "==", "_eq.tif")
def ne_node(inputs: dict, config: dict) -> dict: return _binary_logic(inputs, "!=", "_ne.tif")


def and_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    combined_mask = np.ma.getmaskarray(a) | np.ma.getmaskarray(b)
    res = np.logical_and(np.ma.filled(a, 0), np.ma.filled(b, 0)).astype(np.float32)
    res[combined_mask] = _NODATA
    return {"type": "raster", "path": _write_raster(res, p, "_and.tif"), "metadata": {}}


def or_node(inputs: dict, config: dict) -> dict:
    a, b, p = _align_rasters(inputs["raster_a"]["path"], inputs["raster_b"]["path"])
    combined_mask = np.ma.getmaskarray(a) | np.ma.getmaskarray(b)
    res = np.logical_or(np.ma.filled(a, 0), np.ma.filled(b, 0)).astype(np.float32)
    res[combined_mask] = _NODATA
    return {"type": "raster", "path": _write_raster(res, p, "_or.tif"), "metadata": {}}


def if_node(inputs: dict, config: dict) -> dict:
    cond, true_r, p = _align_rasters(inputs["condition"]["path"], inputs["true"]["path"])
    _, false_r, _ = _align_rasters(inputs["condition"]["path"], inputs["false"]["path"])
    combined_mask = np.ma.getmaskarray(cond) | np.ma.getmaskarray(true_r) | np.ma.getmaskarray(false_r)
    res = np.where(np.ma.filled(cond, 0) > 0, np.ma.filled(true_r, _NODATA), np.ma.filled(false_r, _NODATA))
    res[combined_mask] = _NODATA
    return {"type": "raster", "path": _write_raster(res.astype(np.float32), p, "_if.tif"), "metadata": {}}


## RASTER CALCULATOR

def _calc_safe_div(a: np.ma.MaskedArray, b: np.ma.MaskedArray) -> np.ma.MaskedArray:
    b_data = np.ma.getdata(b).astype(np.float32)
    a_data = np.ma.getdata(a).astype(np.float32)
    zero = b_data == 0
    result = np.where(zero, 0.0, a_data) / np.where(zero, 1.0, b_data)
    mask = np.ma.getmaskarray(a) | np.ma.getmaskarray(b) | zero
    return np.ma.array(result, mask=mask)


class _Node:
    def eval(self, ctx): raise NotImplementedError()


class _RasterNode(_Node):
    def __init__(self, key: str): self.key = key

    def eval(self, ctx): return ctx["rasters"][self.key]


class _ConstantNode(_Node):
    def __init__(self, value: float): self.value = np.float32(value)

    def eval(self, ctx):
        ref = ctx["ref"]
        mask = np.ma.getmaskarray(ref)  # works for both masked and nomask cases
        return np.ma.array(np.full(ref.shape, self.value, dtype=np.float32), mask=mask)


class _UnaryNode(_Node):
    def __init__(self, func, child): self.func = func; self.child = child

    def eval(self, ctx):
        a = self.child.eval(ctx)
        return np.ma.array(self.func(np.ma.getdata(a)), mask=np.ma.getmaskarray(a))


class _BinaryNode(_Node):
    def __init__(self, func, left, right): self.func = func; self.left = left; self.right = right

    def eval(self, ctx):
        a = self.left.eval(ctx)
        b = self.right.eval(ctx)
        result = self.func(a, b)
        # Combine input masks with any extra mask added by the function (e.g. safe div)
        combined = np.ma.getmaskarray(a) | np.ma.getmaskarray(b) | np.ma.getmaskarray(result)
        return np.ma.array(np.ma.getdata(result), mask=combined)


class _IfNode(_Node):
    def __init__(self, cond, true_expr, false_expr):
        self.cond = cond; self.true_expr = true_expr; self.false_expr = false_expr

    def eval(self, ctx):
        cond = self.cond.eval(ctx)
        t = self.true_expr.eval(ctx)
        f = self.false_expr.eval(ctx)
        mask = np.ma.getmaskarray(cond) | np.ma.getmaskarray(t) | np.ma.getmaskarray(f)
        res = np.where(np.ma.getdata(cond) > 0, np.ma.getdata(t), np.ma.getdata(f))
        return np.ma.array(res, mask=mask)


_CALC_OPS = {
    "+": lambda a, b: a + b,
    "-": lambda a, b: a - b,
    "*": lambda a, b: a * b,
    "/": _calc_safe_div,
    "^": lambda a, b: a ** b,
    "<": lambda a, b: np.less(np.ma.getdata(a), np.ma.getdata(b)),
    ">": lambda a, b: np.greater(np.ma.getdata(a), np.ma.getdata(b)),
    "<=": lambda a, b: np.less_equal(np.ma.getdata(a), np.ma.getdata(b)),
    ">=": lambda a, b: np.greater_equal(np.ma.getdata(a), np.ma.getdata(b)),
    "==": lambda a, b: np.equal(np.ma.getdata(a), np.ma.getdata(b)),
    "!=": lambda a, b: np.not_equal(np.ma.getdata(a), np.ma.getdata(b)),
    "AND": lambda a, b: np.logical_and(np.ma.getdata(a), np.ma.getdata(b)),
    "OR":  lambda a, b: np.logical_or(np.ma.getdata(a), np.ma.getdata(b)),
}

_CALC_FUNCS = {
    "sin": np.sin, "cos": np.cos, "tan": np.tan,
    "asin": np.arcsin, "acos": np.arccos, "atan": np.arctan,
    "sqrt": np.sqrt, "log10": np.log10, "ln": np.log, "abs": np.abs,
}

# Keywords that are not variable names
_CALC_KEYWORDS = set(_CALC_FUNCS.keys()) | {"IF", "AND", "OR"}


def _tokenize(expr: str) -> list:
    """Tokenize a raster calculator expression.

    Handles multi-character operators (<=, >=, ==, !=), parentheses, commas,
    numbers (including negative literals like -3.5), and identifiers.
    """
    token_re = re.compile(
        r"<=|>=|==|!=|[+\-*/^<>(),]"   # operators and punctuation
        r"|\d+\.?\d*(?:[eE][+\-]?\d+)?" # numbers (incl. scientific notation)
        r"|[A-Za-z_]\w*"                 # identifiers
    )
    return token_re.findall(expr)


class _Parser:
    def __init__(self, tokens: list):
        self.tokens = tokens
        self.pos = 0

    def peek(self) -> str | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def consume(self) -> str:
        tok = self.peek()
        self.pos += 1
        return tok

    def parse(self) -> _Node:
        node = self.parse_expr()
        if self.peek() is not None:
            raise ValueError(f"Unexpected token: {self.peek()!r}")
        return node

    def parse_expr(self) -> _Node:
        node = self.parse_term()
        while self.peek() in ("+", "-", "OR"):
            op = self.consume()
            node = _BinaryNode(_CALC_OPS[op], node, self.parse_term())
        return node

    def parse_term(self) -> _Node:
        node = self.parse_factor()
        while self.peek() in ("*", "/", "AND"):
            op = self.consume()
            node = _BinaryNode(_CALC_OPS[op], node, self.parse_factor())
        return node

    def parse_factor(self) -> _Node:
        node = self.parse_power()
        while self.peek() in ("<", ">", "<=", ">=", "==", "!="):
            op = self.consume()
            node = _BinaryNode(_CALC_OPS[op], node, self.parse_power())
        return node

    def parse_power(self) -> _Node:
        node = self.parse_atom()
        if self.peek() == "^":
            self.consume()
            node = _BinaryNode(_CALC_OPS["^"], node, self.parse_atom())
        return node

    def parse_atom(self) -> _Node:
        tok = self.peek()
        if tok is None:
            raise ValueError("Unexpected end of expression")

        # Unary minus
        if tok == "-":
            self.consume()
            child = self.parse_atom()
            return _UnaryNode(lambda x: -x, child)

        # Parentheses
        if tok == "(":
            self.consume()
            node = self.parse_expr()
            if self.consume() != ")":
                raise ValueError("Missing ')'")
            return node

        # IF
        if tok == "IF":
            return self._parse_if()

        # Named function
        if tok in _CALC_FUNCS:
            func = self.consume()
            if self.consume() != "(":
                raise ValueError(f"{func} missing '('")
            arg = self.parse_expr()
            if self.consume() != ")":
                raise ValueError(f"{func} missing ')'")
            return _UnaryNode(_CALC_FUNCS[func], arg)

        # Number literal
        if re.match(r"^\d+\.?\d*(?:[eE][+\-]?\d+)?$", tok):
            self.consume()
            return _ConstantNode(float(tok))

        # Variable / raster name
        if re.match(r"^[A-Za-z_]\w*$", tok):
            self.consume()
            return _RasterNode(tok)

        raise ValueError(f"Invalid token: {tok!r}")

    def _parse_if(self) -> _IfNode:
        self.consume()  # "IF"
        if self.consume() != "(": raise ValueError("IF missing '('")
        cond = self.parse_expr()
        if self.consume() != ",": raise ValueError("IF missing first ','")
        t = self.parse_expr()
        if self.consume() != ",": raise ValueError("IF missing second ','")
        f = self.parse_expr()
        if self.consume() != ")": raise ValueError("IF missing ')'")
        return _IfNode(cond, t, f)


def raster_calculator_node(inputs: dict, config: dict) -> dict:
    expression = config.get("expression")
    if not expression:
        raise ValueError("raster_calculator requires 'expression' in config")
    if not inputs:
        raise ValueError("raster_calculator requires at least one connected raster (A, B, or C)")

    # Load first input as spatial reference
    first_key = next(iter(inputs))
    first_bands, profile, transform, crs = _load_raster_all_bands(inputs[first_key]["path"])

    # Build variable namespace: handle A with N bands → A_b1 … A_b{N}
    # Single-band handles also get a bare alias (e.g. A == A_b1)
    rasters: dict = {}

    def _register(key: str, bands: list) -> None:
        for i, arr in enumerate(bands):
            rasters[f"{key}_b{i + 1}"] = arr
        if len(bands) == 1:
            rasters[key] = bands[0]

    _register(first_key, first_bands)

    for k, v in inputs.items():
        if k == first_key:
            continue
        bands = _align_to_all_bands(first_bands[0], profile, transform, crs, v["path"])
        _register(k, bands)

    tokens = _tokenize(expression)
    used_vars = {t for t in tokens if re.match(r"^[A-Za-z_]\w*$", t)} - _CALC_KEYWORDS
    missing = used_vars - set(rasters.keys())
    if missing:
        available = sorted(rasters.keys())
        raise ValueError(
            f"Unknown variable(s) in expression: {sorted(missing)}. "
            f"Available: {available}"
        )

    tree = _Parser(tokens).parse()
    result = tree.eval({"rasters": rasters, "ref": first_bands[0]})

    path = _write_raster(np.ma.filled(result, _NODATA), profile, "_calc.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## CORE PROCESSING

def difference_node(inputs: dict, config: dict) -> dict:
    raster_a = inputs.get("raster_a")
    raster_b = inputs.get("raster_b")
    if not raster_a or not raster_b:
        raise ValueError("difference requires 'raster_a' and 'raster_b' inputs")
    a, b, p = _align_rasters(raster_a["path"], raster_b["path"])
    return {"type": "raster", "path": _write_raster(np.ma.filled(a - b, _NODATA), p, "_diff.tif"), "metadata": {}}


## SPECTRAL INDICES - Vegetation

def ndvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndvi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="ndvi")
        nir = src.read(nir_band, masked=True).astype(np.float32)
        red = src.read(red_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(nir, red), profile, "_ndvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def evi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("evi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    blue_band = int(config.get("blue_band", 2))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, blue_band, node_name="evi")
        nir = src.read(nir_band, masked=True).astype(np.float32)
        red = src.read(red_band, masked=True).astype(np.float32)
        blue = src.read(blue_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    denom = np.ma.filled(nir + 6 * red - 7.5 * blue + 1, 0).astype(np.float32)
    num = np.ma.filled(2.5 * (nir - red), 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red) | np.ma.getmaskarray(blue)] = _NODATA
    path = _write_raster(out, profile, "_evi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def savi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("savi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    L = float(config.get("L", 0.5))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="savi")
        nir = src.read(nir_band, masked=True).astype(np.float32)
        red = src.read(red_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    denom = np.ma.filled(nir + red + L, 0).astype(np.float32)
    num = np.ma.filled((nir - red) * (1 + L), 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_savi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def gndvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("gndvi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    green_band = int(config.get("green_band", 3))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, green_band, node_name="gndvi")
        nir, green = _read_bands(src, [nir_band, green_band])
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(nir, green), profile, "_gndvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def rdvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("rdvi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="rdvi")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    sum_nr = np.ma.filled(nir + red, 0).astype(np.float32)
    safe_sum = np.maximum(sum_nr, 0.0)
    denom = np.sqrt(safe_sum)
    num = np.ma.filled(nir - red, 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_rdvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def tvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("tvi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="tvi")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    combined_mask = np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)
    denom = np.ma.filled(nir + red, 0).astype(np.float32)
    num = np.ma.filled(nir - red, 0).astype(np.float32)
    ndvi = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom))
    tvi_arg = ndvi + 0.5
    safe_arg = np.where(tvi_arg >= 0, tvi_arg, 0.0)
    out = np.where((tvi_arg < 0) | (ndvi == _NODATA), _NODATA, np.sqrt(safe_arg)).astype(np.float32)
    out[combined_mask] = _NODATA
    path = _write_raster(out, profile, "_tvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def dvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("dvi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="dvi")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    out = np.ma.filled(nir - red, _NODATA).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_dvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def rvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("rvi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="rvi")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    red_f = np.ma.filled(red, 0).astype(np.float32)
    nir_f = np.ma.filled(nir, _NODATA).astype(np.float32)
    out = np.where(red_f == 0, _NODATA, nir_f / np.where(red_f == 0, 1.0, red_f)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_rvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def vari_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("vari requires 'raster_in' input")
    green_band = int(config.get("green_band", 3))
    red_band = int(config.get("red_band", 4))
    blue_band = int(config.get("blue_band", 2))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, green_band, red_band, blue_band, node_name="vari")
        green, red, blue = _read_bands(src, [green_band, red_band, blue_band])
        profile = src.profile.copy()
    denom = np.ma.filled(green + red - blue, 0).astype(np.float32)
    num = np.ma.filled(green - red, 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(green) | np.ma.getmaskarray(red) | np.ma.getmaskarray(blue)] = _NODATA
    path = _write_raster(out, profile, "_vari.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def avi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("avi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="avi")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    out = np.cbrt(np.ma.filled(nir * (1 - red) * (nir - red), _NODATA)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_avi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def arvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("arvi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    blue_band = int(config.get("blue_band", 2))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, blue_band, node_name="arvi")
        nir, red, blue = _read_bands(src, [nir_band, red_band, blue_band])
        profile = src.profile.copy()
    rb = np.ma.filled(2 * red - blue, 0).astype(np.float32)
    nir_f = np.ma.filled(nir, 0).astype(np.float32)
    denom = nir_f + rb
    out = np.where(denom == 0, _NODATA, (nir_f - rb) / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red) | np.ma.getmaskarray(blue)] = _NODATA
    path = _write_raster(out, profile, "_arvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Chlorophyll

def cigreen_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("cigreen requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    green_band = int(config.get("green_band", 3))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, green_band, node_name="cigreen")
        nir, green = _read_bands(src, [nir_band, green_band])
        profile = src.profile.copy()
    green_f = np.ma.filled(green, 0).astype(np.float32)
    nir_f = np.ma.filled(nir, _NODATA).astype(np.float32)
    out = np.where(green_f == 0, _NODATA, nir_f / np.where(green_f == 0, 1.0, green_f) - 1).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(green)] = _NODATA
    path = _write_raster(out, profile, "_cigreen.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def cired_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("cired requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="cired")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    red_f = np.ma.filled(red, 0).astype(np.float32)
    nir_f = np.ma.filled(nir, _NODATA).astype(np.float32)
    out = np.where(red_f == 0, _NODATA, nir_f / np.where(red_f == 0, 1.0, red_f) - 1).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_cired.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndre_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndre requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_edge_band = int(config.get("red_edge_band", 6))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_edge_band, node_name="ndre")
        nir, red_edge = _read_bands(src, [nir_band, red_edge_band])
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(nir, red_edge), profile, "_ndre.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Soil adjusted

def osavi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("osavi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="osavi")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    denom = np.ma.filled(nir + red + 0.16, 0).astype(np.float32)
    num = np.ma.filled(nir - red, 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_osavi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def tsavi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("tsavi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    a = float(config.get("a", 1))
    b = float(config.get("b", 0))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, red_band, node_name="tsavi")
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()
    nir_f = np.ma.filled(nir, 0).astype(np.float32)
    red_f = np.ma.filled(red, 0).astype(np.float32)
    denom = red_f + a * nir_f - a * b
    out = np.where(denom == 0, _NODATA, a * (nir_f - a * red_f - b) / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_tsavi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Moisture / Water

def ndmi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndmi requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    swir_band = int(config.get("swir_band", 6))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, swir_band, node_name="ndmi")
        nir = src.read(nir_band, masked=True).astype(np.float32)
        swir = src.read(swir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(nir, swir), profile, "_ndmi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndwi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndwi requires 'raster_in' input")
    green_band = int(config.get("green_band", 3))
    nir_band = int(config.get("nir_band", 5))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, green_band, nir_band, node_name="ndwi")
        green = src.read(green_band, masked=True).astype(np.float32)
        nir = src.read(nir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(green, nir), profile, "_ndwi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def mndwi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("mndwi requires 'raster_in' input")
    green_band = int(config.get("green_band", 3))
    swir_band = int(config.get("swir_band", 6))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, green_band, swir_band, node_name="mndwi")
        green = src.read(green_band, masked=True).astype(np.float32)
        swir = src.read(swir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(green, swir), profile, "_mndwi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def wri_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("wri requires 'raster_in' input")
    green_band = int(config.get("green_band", 3))
    blue_band = int(config.get("blue_band", 2))
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, green_band, blue_band, nir_band, red_band, node_name="wri")
        g, b, nir, red = _read_bands(src, [green_band, blue_band, nir_band, red_band])
        profile = src.profile.copy()
    denom = np.ma.filled(nir + red, 0).astype(np.float32)
    num = np.ma.filled(g + b, 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(g) | np.ma.getmaskarray(b) | np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_wri.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def s3_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("s3 requires 'raster_in' input")
    green_band = int(config.get("green_band", 3))
    nir_band = int(config.get("nir_band", 5))
    swir_band = int(config.get("swir_band", 6))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, green_band, nir_band, swir_band, node_name="s3")
        g, nir, swir = _read_bands(src, [green_band, nir_band, swir_band])
        profile = src.profile.copy()
    g_f = np.ma.filled(g, 0).astype(np.float32)
    nir_f = np.ma.filled(nir, 0).astype(np.float32)
    swir_f = np.ma.filled(swir, 0).astype(np.float32)
    denom = (g_f + nir_f) * (nir_f + swir_f)
    out = np.where(denom == 0, _NODATA, (g_f * (nir_f - swir_f)) / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    out[np.ma.getmaskarray(g) | np.ma.getmaskarray(nir) | np.ma.getmaskarray(swir)] = _NODATA
    path = _write_raster(out, profile, "_s3.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Urban Heat Island / Built-up

def ndbi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndbi requires 'raster_in' input")
    swir_band = int(config.get("swir_band", 6))
    nir_band = int(config.get("nir_band", 5))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, swir_band, nir_band, node_name="ndbi")
        swir = src.read(swir_band, masked=True).astype(np.float32)
        nir = src.read(nir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(swir, nir), profile, "_ndbi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def utfvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("utfvi requires 'raster_in' input (LST raster)")
    with rasterio.open(raster_in["path"]) as src:
        Ts = src.read(1, masked=True).astype(np.float32)
        profile = src.profile.copy()
    valid = Ts.compressed() if np.ma.is_masked(Ts) else Ts.ravel()
    Tmean = float(np.nanmean(valid))
    if np.isnan(Tmean) or Tmean == 0:
        raise ValueError("Invalid mean temperature (Tmean) computed from raster.")
    utfvi = np.ma.filled((Ts - Tmean) / Tmean, _NODATA).astype(np.float32)
    utfvi[np.ma.getmaskarray(Ts)] = _NODATA
    path = _write_raster(utfvi, profile, "_utfvi.tif")
    return {"type": "raster", "path": path, "metadata": {"Tmean": Tmean}}


def uhi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("uhi requires 'raster_in' input (LST raster)")
    with rasterio.open(raster_in["path"]) as src:
        Ts = src.read(1, masked=True).astype(np.float32)
        profile = src.profile.copy()
    valid = Ts.compressed() if np.ma.is_masked(Ts) else Ts.ravel()
    Tmean = float(np.nanmean(valid))
    sigma_T = float(np.nanstd(valid))
    if np.isnan(Tmean) or np.isnan(sigma_T) or sigma_T == 0:
        raise ValueError("Invalid statistics computed from raster (mean/std).")
    uhi = np.ma.filled((Ts - Tmean) / sigma_T, _NODATA).astype(np.float32)
    uhi[np.ma.getmaskarray(Ts)] = _NODATA
    path = _write_raster(uhi, profile, "_uhi.tif")
    return {"type": "raster", "path": path, "metadata": {"Tmean": Tmean, "sigma_T": sigma_T}}


def ui_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ui requires 'raster_in' input")
    swir2_band = int(config.get("swir2_band", 7))
    nir_band = int(config.get("nir_band", 5))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, swir2_band, nir_band, node_name="ui")
        swir2, nir = _read_bands(src, [swir2_band, nir_band])
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(swir2, nir), profile, "_ui.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Burn / Fire

def nbr_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("nbr requires 'raster_in' input")
    nir_band = int(config.get("nir_band", 5))
    swir2_band = int(config.get("swir2_band", 7))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, nir_band, swir2_band, node_name="nbr")
        nir = src.read(nir_band, masked=True).astype(np.float32)
        swir2 = src.read(swir2_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(nir, swir2), profile, "_nbr.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def nbr2_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("nbr2 requires 'raster_in' input")
    swir1_band = int(config.get("swir1_band", 6))
    swir2_band = int(config.get("swir2_band", 7))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, swir1_band, swir2_band, node_name="nbr2")
        swir1, swir2 = _read_bands(src, [swir1_band, swir2_band])
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(swir1, swir2), profile, "_nbr2.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def bai_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("bai requires 'raster_in' input")
    red_band = int(config.get("red_band", 4))
    nir_band = int(config.get("nir_band", 5))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, red_band, nir_band, node_name="bai")
        red, nir = _read_bands(src, [red_band, nir_band])
        profile = src.profile.copy()
    red_f = np.ma.filled(red, 0).astype(np.float32)
    nir_f = np.ma.filled(nir, 0).astype(np.float32)
    bai_denom = (0.1 - red_f) ** 2 + (0.06 - nir_f) ** 2
    out = np.where(bai_denom == 0, _NODATA, 1.0 / np.where(bai_denom == 0, 1.0, bai_denom)).astype(np.float32)
    out[np.ma.getmaskarray(red) | np.ma.getmaskarray(nir)] = _NODATA
    path = _write_raster(out, profile, "_bai.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def csi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("csi requires 'raster_in' input")
    swir1_band = int(config.get("swir1_band", 6))
    swir2_band = int(config.get("swir2_band", 7))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, swir1_band, swir2_band, node_name="csi")
        swir1, swir2 = _read_bands(src, [swir1_band, swir2_band])
        profile = src.profile.copy()
    swir2_f = np.ma.filled(swir2, 0).astype(np.float32)
    swir1_f = np.ma.filled(swir1, _NODATA).astype(np.float32)
    out = np.where(swir2_f == 0, _NODATA, swir1_f / np.where(swir2_f == 0, 1.0, swir2_f)).astype(np.float32)
    out[np.ma.getmaskarray(swir1) | np.ma.getmaskarray(swir2)] = _NODATA
    path = _write_raster(out, profile, "_csi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Soil / Bare

def bsi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("bsi requires 'raster_in' input")
    swir_band = int(config.get("swir_band", 6))
    red_band = int(config.get("red_band", 4))
    nir_band = int(config.get("nir_band", 5))
    blue_band = int(config.get("blue_band", 2))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, swir_band, red_band, nir_band, blue_band, node_name="bsi")
        swir_b = src.read(swir_band, masked=True).astype(np.float32)
        red_b = src.read(red_band, masked=True).astype(np.float32)
        nir_b = src.read(nir_band, masked=True).astype(np.float32)
        blue_b = src.read(blue_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    num = np.ma.filled((swir_b + red_b) - (nir_b + blue_b), 0).astype(np.float32)
    denom = np.ma.filled((swir_b + red_b) + (nir_b + blue_b), 0).astype(np.float32)
    out = np.where(denom == 0, _NODATA, num / np.where(denom == 0, 1.0, denom)).astype(np.float32)
    combined_mask = (
        np.ma.getmaskarray(swir_b) | np.ma.getmaskarray(red_b)
        | np.ma.getmaskarray(nir_b) | np.ma.getmaskarray(blue_b)
    )
    out[combined_mask] = _NODATA
    path = _write_raster(out, profile, "_bsi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Snow

def ndsi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndsi requires 'raster_in' input")
    green_band = int(config.get("green_band", 3))
    swir_band = int(config.get("swir_band", 6))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, green_band, swir_band, node_name="ndsi")
        green = src.read(green_band, masked=True).astype(np.float32)
        swir = src.read(swir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(green, swir), profile, "_ndsi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Turbidity / Sediment

def ndti_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndti requires 'raster_in' input")
    red_band = int(config.get("red_band", 4))
    green_band = int(config.get("green_band", 3))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, red_band, green_band, node_name="ndti")
        red, green = _read_bands(src, [red_band, green_band])
        profile = src.profile.copy()
    path = _write_raster(_norm_diff(red, green), profile, "_ndti.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## SPECTRAL INDICES - Atmospheric

def hot_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("hot requires 'raster_in' input")
    blue_band = int(config.get("blue_band", 2))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, blue_band, red_band, node_name="hot")
        blue, red = _read_bands(src, [blue_band, red_band])
        profile = src.profile.copy()
    out = np.ma.filled(blue - 0.5 * red - 0.08, _NODATA).astype(np.float32)
    out[np.ma.getmaskarray(blue) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out, profile, "_hot.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def shadow_index_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("shadow_index requires 'raster_in' input")
    blue_band = int(config.get("blue_band", 2))
    green_band = int(config.get("green_band", 3))
    red_band = int(config.get("red_band", 4))
    with rasterio.open(raster_in["path"]) as src:
        _check_bands(src, blue_band, green_band, red_band, node_name="shadow_index")
        b, g, r = _read_bands(src, [blue_band, green_band, red_band])
        profile = src.profile.copy()
    out = np.ma.filled((1 - b) * (1 - g) * (1 - r), _NODATA).astype(np.float32)
    out[np.ma.getmaskarray(b) | np.ma.getmaskarray(g) | np.ma.getmaskarray(r)] = _NODATA
    path = _write_raster(out, profile, "_shadow.tif")
    return {"type": "raster", "path": path, "metadata": {}}


## TERRAIN ANALYSIS

def d8_flow_accumulation_node(inputs: dict, config: dict) -> dict:
    from scipy.ndimage import generic_filter

    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("d8_flow_accumulation requires 'raster_in' input (DEM)")

    method = config.get("method", "d8").lower()

    with rasterio.open(raster_in["path"]) as src:
        dem = src.read(1, masked=True).astype(np.float32)
        profile = src.profile.copy()

    nodata_mask = np.ma.getmaskarray(dem)
    dem_arr = dem.filled(np.nan)

    def fill_sinks(d):
        filled = d.copy()
        for _ in range(5):
            neighborhood_min = generic_filter(filled, np.nanmin, size=3, mode="nearest")
            filled = np.where(filled < neighborhood_min, neighborhood_min, filled)
        return filled

    if method in ("taudem", "arcgis"):
        dem_arr = fill_sinks(dem_arr)

    offsets = [
        (-1,  0), (-1,  1), ( 0,  1), ( 1,  1),
        ( 1,  0), ( 1, -1), ( 0, -1), (-1, -1),
    ]

    rows, cols = dem_arr.shape
    directions = np.full((rows, cols), -1, dtype=np.int8)

    for i in range(1, rows - 1):
        for j in range(1, cols - 1):
            if np.isnan(dem_arr[i, j]):
                continue
            max_slope = -np.inf
            best_dir = -1
            for d, (di, dj) in enumerate(offsets):
                ni, nj = i + di, j + dj
                if np.isnan(dem_arr[ni, nj]):
                    continue
                slope = dem_arr[i, j] - dem_arr[ni, nj]
                if slope > max_slope:
                    max_slope = slope
                    best_dir = d
            directions[i, j] = best_dir

    acc = np.ones((rows, cols), dtype=np.float32)
    flat_dem = dem_arr.flatten()
    indices = np.argsort(-flat_dem)

    for idx in indices:
        i = idx // cols
        j = idx % cols
        d = directions[i, j]
        if d == -1:
            continue
        di, dj = offsets[d]
        ni, nj = i + di, j + dj
        if 0 <= ni < rows and 0 <= nj < cols:
            acc[ni, nj] += acc[i, j]

    acc[nodata_mask] = _NODATA

    path = _write_raster(acc, profile, "_flowacc.tif")
    return {
        "type": "raster",
        "path": path,
        "metadata": {"method": method, "description": "D8 Flow Accumulation"},
    }


## UTILITIES

def reclassify_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("reclassify requires 'raster_in' input")

    rules = config.get("rules", [])
    if not rules:
        raise ValueError("reclassify requires at least one rule in config['rules']")

    with rasterio.open(raster_in["path"]) as src:
        data = src.read(1, masked=True).astype(np.float32)
        profile = src.profile.copy()
        nodata_src = src.nodata

    result = np.ma.filled(data, _NODATA).astype(np.float32)
    mask = result == _NODATA
    if nodata_src is not None:
        mask |= result == float(nodata_src)

    reclassed = np.full_like(result, _NODATA)
    for i, rule in enumerate(rules):
        try:
            lo = float(rule["min"])
            hi = float(rule["max"])
            new_val = float(rule["new_value"])
        except KeyError as e:
            raise ValueError(f"reclassify rule[{i}] missing key {e}") from e
        except (TypeError, ValueError) as e:
            raise ValueError(f"reclassify rule[{i}] has invalid value: {e}") from e
        in_range = (result >= lo) & (result <= hi) & ~mask
        reclassed[in_range] = new_val

    path = _write_raster(reclassed, profile, "_reclass.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def clip_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    vector_in = inputs.get("vector_in")
    if not raster_in or not vector_in:
        raise ValueError("clip requires 'raster_in' and 'vector_in' inputs")

    geojson = vector_in["metadata"].get("geojson")
    if not geojson:
        with open(vector_in["path"]) as f:
            geojson = json.load(f)

    shapes = [feat["geometry"] for feat in geojson.get("features", [])]
    if not shapes:
        raise ValueError("vector_in has no features to clip with")

    with rasterio.open(raster_in["path"]) as src:
        try:
            out_image, out_transform = rasterio_mask(src, shapes, crop=True)
        except Exception as exc:
            raise ValueError(f"Clip failed: {exc}") from exc
        out_meta = src.meta.copy()

    out_meta.update(
        driver="GTiff",
        height=out_image.shape[1],
        width=out_image.shape[2],
        transform=out_transform,
        compress="deflate",
        nodata=_NODATA,
    )
    fd, tmp_path = tempfile.mkstemp(suffix="_clip.tif", prefix="wf_")
    os.close(fd)
    with rasterio.open(tmp_path, "w", **out_meta) as dst:
        dst.write(out_image.astype(np.float32))

    return {"type": "raster", "path": tmp_path, "metadata": {}}


def zonal_stats_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    vector_in = inputs.get("vector_in")
    if not raster_in or not vector_in:
        raise ValueError("zonal_stats requires 'raster_in' and 'vector_in' inputs")

    try:
        from rasterstats import zonal_stats
    except ImportError:
        raise ImportError("rasterstats is required for zonal_stats node. Install it with: pip install rasterstats")

    stats_keys = config.get("stats", ["mean", "min", "max", "count"])
    if isinstance(stats_keys, str):
        stats_keys = [stats_keys]

    geojson = vector_in["metadata"].get("geojson")
    if not geojson:
        with open(vector_in["path"]) as f:
            geojson = json.load(f)

    features = geojson.get("features", [])
    if not features:
        raise ValueError("vector_in has no features for zonal statistics")

    stats_results = zonal_stats(
        features,
        raster_in["path"],
        stats=stats_keys,
        geojson_out=True,
        nodata=_NODATA,
    )

    result_geojson = {"type": "FeatureCollection", "features": stats_results}

    tmp = tempfile.NamedTemporaryFile(suffix="_zstats.geojson", delete=False, mode="w", prefix="wf_")
    json.dump(result_geojson, tmp)
    tmp.close()


# ── AHP Weighted Overlay ────────────────────────────────────────────────────────

_AHP_RI = {1: 0.00, 2: 0.00, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41}


def ahp_node(inputs: dict, config: dict) -> dict:
    """AHP weighted overlay.

    Reads band 1 of each connected raster (handles A-H), aligns all to the first
    input's grid, builds a pairwise comparison matrix from config['matrix'], derives
    weights via the geometric mean method, computes a weighted sum, and normalises the
    result to [0, 1].
    """
    if not inputs:
        raise ValueError("ahp requires at least one connected raster")

    handles = list(inputs.keys())
    n = len(handles)

    # ── Load and align ──────────────────────────────────────────────────────
    first_key = handles[0]
    with rasterio.open(inputs[first_key]["path"]) as src:
        ref_arr = src.read(1, masked=True).astype(np.float32)
        profile = src.profile.copy()
        transform = src.transform
        crs = src.crs
        height, width = src.height, src.width

    bands: dict[str, np.ma.MaskedArray] = {first_key: ref_arr}

    for key in handles[1:]:
        with rasterio.open(inputs[key]["path"]) as src:
            if src.crs == crs and src.width == width and src.height == height:
                arr = src.read(1, masked=True).astype(np.float32)
            else:
                dest = np.full((height, width), _NODATA, dtype=np.float32)
                reproject(
                    source=rasterio.band(src, 1),
                    destination=dest,
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=crs,
                    resampling=Resampling.bilinear,
                    src_nodata=_NODATA,
                    dst_nodata=_NODATA,
                )
                arr = np.ma.masked_equal(dest, _NODATA)
        bands[key] = arr

    # ── Build pairwise matrix ───────────────────────────────────────────────
    matrix_cfg = config.get("matrix", {})
    mat = np.ones((n, n), dtype=np.float64)
    for i in range(n):
        for j in range(i + 1, n):
            pair_key = f"{handles[i]}-{handles[j]}"
            val = float(matrix_cfg.get(pair_key, 1.0))
            val = max(1 / 9, min(9.0, val))
            mat[i, j] = val
            mat[j, i] = 1.0 / val

    # ── Geometric mean weights ──────────────────────────────────────────────
    row_gm = np.prod(mat, axis=1) ** (1.0 / n)
    weights = row_gm / row_gm.sum()

    # ── Consistency ratio ───────────────────────────────────────────────────
    metadata: dict = {
        "weights": {handles[i]: round(float(weights[i]), 4) for i in range(n)}
    }
    if n >= 3:
        wv = mat @ weights
        lambda_max = float(np.mean(wv / weights))
        ci = (lambda_max - n) / (n - 1)
        ri = _AHP_RI.get(n, 1.41)
        cr = ci / ri if ri > 0 else 0.0
        metadata["consistency_ratio"] = round(cr, 4)
        if cr > 0.1:
            metadata["warning"] = (
                f"Consistency Ratio ({cr:.4f}) exceeds 0.1 - "
                "consider revising pairwise comparisons"
            )

    # ── Weighted sum ────────────────────────────────────────────────────────
    result = np.ma.zeros(ref_arr.shape, dtype=np.float32)
    combined_mask = np.zeros(ref_arr.shape, dtype=bool)
    for i, key in enumerate(handles):
        arr = bands[key]
        result = result + weights[i] * arr
        if np.ma.is_masked(arr):
            combined_mask |= np.asarray(arr.mask, dtype=bool)

    result = np.ma.array(result, mask=combined_mask)

    # ── Normalise to [0, 1] ─────────────────────────────────────────────────
    valid = result.compressed() if np.ma.is_masked(result) else result.ravel()
    if valid.size > 0:
        mn, mx = float(valid.min()), float(valid.max())
        if mx > mn:
            result = (result - mn) / (mx - mn)
        else:
            result = np.ma.zeros_like(result)

    path = _write_raster(np.ma.filled(result, _NODATA), profile, "_ahp.tif")
    return {"type": "raster", "path": path, "metadata": metadata}
