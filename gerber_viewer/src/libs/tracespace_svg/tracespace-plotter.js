import { COMMENT as Ct, GRAPHIC as F, LEADING as B, TRAILING as j, COORDINATE_FORMAT as Pt, UNITS as Rt, IN as Tt, TOOL_MACRO as Lt, TOOL_DEFINITION as J, MACRO_SHAPE as St, TOOL_CHANGE as It, POLYGON as Nt, OBROUND as K, RECTANGLE as Gt, CIRCLE as vt, MACRO_VARIABLE as bt, MACRO_PRIMITIVE as Dt, MACRO_THERMAL as wt, MACRO_MOIRE_DEPRECATED as Ft, MACRO_POLYGON as Ht, MACRO_OUTLINE as zt, MACRO_LOWER_LEFT_LINE_DEPRECATED as Bt, MACRO_CENTER_LINE as jt, MACRO_VECTOR_LINE_DEPRECATED as Wt, MACRO_VECTOR_LINE as Vt, MACRO_CIRCLE as Yt, DRILL as qt, SHAPE as I, SEGMENT as G, SLOT as $t, INTERPOLATE_MODE as st, QUADRANT_MODE as kt, SINGLE as Ut, REGION_MODE as Z, LOAD_POLARITY as Xt, CLEAR as Qt, DONE as Jt, MOVE as W, CW_ARC as ct, CCW_ARC as it, LINE as Kt } from "./tracespace-parser.js";
const Zt = "image", v = "imageShape", ot = "imagePath", te = "imageRegion", O = "line", g = "arc", L = "circle", H = "rectangle", M = "polygon", z = "outline", k = "layeredShape", { PI: R } = Math, P = R / 2, at = 3 * P, A = 2 * R;
function V(t) {
  return t >= 0 && t <= A ? t : t < 0 ? t + A : t > A ? t - A : V(t);
}
function tt(t) {
  return t >= P ? t - P : t + at;
}
function ut(t) {
  return t * R / 180;
}
function C(t, e, n = 0) {
  const r = ut(n), [c, s] = [Math.sin(r), Math.cos(r)], [i, a] = t, o = i * s - a * c + e[0], p = i * c + a * s + e[1];
  return [o, p];
}
function pt(t, e) {
  return t[0] === e[0] && t[1] === e[1];
}
function Y(t) {
  return t.length === 0;
}
function ft() {
  return [];
}
function yt(t, e) {
  return Y(t) ? e : Y(e) ? t : [
    Math.min(t[0], e[0]),
    Math.min(t[1], e[1]),
    Math.max(t[2], e[2]),
    Math.max(t[3], e[3])
  ];
}
function N(t) {
  return t.reduce(yt, ft());
}
function ht(t) {
  return N(t.map(dt));
}
function dt(t) {
  return t.type === v ? U(t.shape) : X(
    t.segments,
    t.type === ot ? t.width : void 0
  );
}
function U(t) {
  switch (t.type) {
    case L: {
      const { cx: e, cy: n, r } = t;
      return q([e, n], r);
    }
    case H: {
      const { x: e, y: n, xSize: r, ySize: c } = t;
      return [e, n, e + r, n + c];
    }
    case M:
      return N(t.points.map((e) => q(e)));
    case z:
      return X(t.segments);
    case k:
      return N(
        t.shapes.filter(({ erase: e }) => e !== !0).map(U)
      );
  }
}
function X(t, e = 0) {
  const n = e / 2, r = [];
  for (const c of t)
    if (r.push(c.start, c.end), c.type === g) {
      const { start: s, end: i, center: a, radius: o } = c, p = Math.abs(i[2] - s[2]);
      let [f, u] = i[2] > s[2] ? [s[2], i[2]] : [i[2], s[2]];
      f = V(f), u = V(u);
      const d = [
        [a[0] + o, a[1]],
        [a[0], a[1] + o],
        [a[0] - o, a[1]],
        [a[0], a[1] - o]
      ];
      for (const y of d)
        (f > u || p === A) && r.push(y), f = tt(f), u = tt(u);
    }
  return N(r.map((c) => q(c, n)));
}
function q(t, e = 0) {
  return [
    t[0] - e,
    t[1] - e,
    t[0] + e,
    t[1] + e
  ];
}
const Re = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  add: yt,
  empty: ft,
  fromGraphic: dt,
  fromGraphics: ht,
  fromPath: X,
  fromShape: U,
  isEmpty: Y,
  sum: N
}, Symbol.toStringTag, { value: "Module" })), ee = /FORMAT={?(\d):(\d)/;
function ne(t) {
  const { children: e } = t;
  let n, r, c, s = 0;
  for (; s < e.length && (n === void 0 || r === void 0 || c === void 0); ) {
    const i = e[s];
    switch (i.type) {
      case Rt: {
        n = i.units;
        break;
      }
      case Pt: {
        r = i.format ?? void 0, c = i.zeroSuppression ?? void 0;
        break;
      }
      case F: {
        const { coordinates: a } = i;
        for (const o of Object.values(a)) {
          if (c !== void 0)
            break;
          (o == null ? void 0 : o.endsWith("0")) === !0 || (o == null ? void 0 : o.includes(".")) === !0 ? c = B : (o == null ? void 0 : o.startsWith("0")) === !0 && (c = j);
        }
        break;
      }
      case Ct: {
        const { comment: a } = i, o = ee.exec(a);
        /suppress trailing/i.test(a) ? c = j : /(suppress leading|keep zeros)/i.test(a) && (c = B), o !== null && (r = [Number(o[1]), Number(o[2])]);
        break;
      }
    }
    s += 1;
  }
  return {
    units: n ?? Tt,
    coordinateFormat: r ?? [2, 4],
    zeroSuppression: c ?? B
  };
}
const b = "simpleTool", lt = "macroTool";
function re() {
  return Object.create(se);
}
const se = {
  _currentToolCode: void 0,
  _toolsByCode: {},
  _macrosByName: {},
  use(t) {
    if (t.type === Lt && (this._macrosByName[t.name] = t.children), t.type === J) {
      const { code: e, shape: n, hole: r } = t, c = n.type === St ? {
        type: lt,
        macro: this._macrosByName[n.name] ?? [],
        variableValues: n.variableValues
      } : { type: b, shape: n, hole: r ?? void 0 };
      this._toolsByCode[e] = c;
    }
    return (t.type === J || t.type === It) && (this._currentToolCode = t.code), typeof this._currentToolCode == "string" ? this._toolsByCode[this._currentToolCode] : void 0;
  }
};
function ce() {
  return Object.create(ie);
}
const ie = {
  _DEFAULT_ARC_OFFSETS: { i: 0, j: 0, a: 0 },
  _previousPoint: { x: 0, y: 0 },
  use(t, e) {
    let n = this._DEFAULT_ARC_OFFSETS, r = this._previousPoint, c = r;
    if (t.type === F) {
      const { coordinates: s } = t, i = T(s.x0, r.x, e), a = T(s.y0, r.y, e), o = T(s.x, i, e), p = T(s.y, a, e), f = T(s.i, 0, e), u = T(s.j, 0, e), d = T(s.a, 0, e);
      (r.x !== i || r.y !== a) && (r = { x: i, y: a }), (c.x !== o || c.y !== p) && (c = { x: o, y: p }), (f !== 0 || u !== 0 || d !== 0) && (n = { i: f, j: u, a: d });
    }
    return this._previousPoint = c, { startPoint: r, endPoint: c, arcOffsets: n };
  }
};
function T(t, e, n) {
  if (typeof t != "string")
    return e;
  if (t.includes(".") || t === "0")
    return Number(t);
  const { coordinateFormat: r, zeroSuppression: c } = n, [s, i] = r, [a, o] = t.startsWith("+") || t.startsWith("-") ? [t[0], t.slice(1)] : ["+", t], p = s + i, f = c === j ? o.padEnd(p, "0") : o.padStart(p, "0"), u = f.slice(0, s), d = f.slice(s);
  return +`${a}${u}.${d}`;
}
function et(t, e) {
  const { x: n, y: r } = e;
  switch (t.type) {
    case vt: {
      const { diameter: c } = t;
      return { type: L, cx: n, cy: r, r: c / 2 };
    }
    case Gt:
    case K: {
      const { xSize: c, ySize: s } = t, i = c / 2, a = s / 2, o = {
        type: H,
        x: n - i,
        y: r - a,
        xSize: c,
        ySize: s
      };
      return t.type === K && (o.r = Math.min(i, a)), o;
    }
    case Nt: {
      const { diameter: c, rotation: s, vertices: i } = t, a = c / 2, o = ut(s ?? 0), p = A / i, f = Array.from({ length: i }).map(
        (u, d) => {
          const y = p * d + o, h = n + a * Math.cos(y), _ = r + a * Math.sin(y);
          return [h, _];
        }
      );
      return { type: M, points: f };
    }
  }
}
function $(t) {
  if (t.type === L) {
    const { cx: e, cy: n, r } = t;
    return [
      {
        type: g,
        start: [e + r, n, 0],
        end: [e + r, n, A],
        center: [e, n],
        radius: r
      }
    ];
  }
  if (t.type === H) {
    const { x: e, y: n, xSize: r, ySize: c, r: s } = t;
    return s === r / 2 ? [
      {
        type: O,
        start: [e + r, n + s],
        end: [e + r, n + c - s]
      },
      {
        type: g,
        start: [e + r, n + c - s, 0],
        end: [e, n + c - s, R],
        center: [e + s, n + c - s],
        radius: s
      },
      { type: O, start: [e, n + c - s], end: [e, n + s] },
      {
        type: g,
        start: [e, n + s, R],
        end: [e + r, n + s, A],
        center: [e + s, n + s],
        radius: s
      }
    ] : s === c / 2 ? [
      { type: O, start: [e + s, n], end: [e + r - s, n] },
      {
        type: g,
        start: [e + r - s, n, -P],
        end: [e + r - s, n + c, P],
        center: [e + r - s, n + s],
        radius: s
      },
      {
        type: O,
        start: [e + r - s, n + c],
        end: [e + s, n + c]
      },
      {
        type: g,
        start: [e + s, n + c, P],
        end: [e + s, n, at],
        center: [e + s, n + s],
        radius: s
      }
    ] : [
      { type: O, start: [e, n], end: [e + r, n] },
      { type: O, start: [e + r, n], end: [e + r, n + c] },
      { type: O, start: [e + r, n + c], end: [e, n + c] },
      { type: O, start: [e, n + c], end: [e, n] }
    ];
  }
  return t.type === M ? t.points.map((e, n) => {
    const r = n < t.points.length - 1 ? n + 1 : 0;
    return { type: O, start: e, end: t.points[r] };
  }) : t.segments;
}
function oe(t, e) {
  const { shape: n, hole: r } = t, c = et(n, e.endPoint);
  if (r !== void 0) {
    const s = et(r, e.endPoint);
    return {
      type: z,
      segments: [...$(c), ...$(s)]
    };
  }
  return c;
}
function ae(t, e) {
  const n = t.filter((r) => r.type === O).map((r) => ue(r, e));
  return { type: v, shape: { type: k, shapes: n } };
}
function ue(t, e) {
  const { start: n, end: r } = t, [c, s] = n, [i, a] = r, [o, p] = [e.xSize / 2, e.ySize / 2], f = Math.atan2(a - s, i - a), [u, d] = [c - o, c + o], [y, h] = [s - p, s + p], [_, E] = [i - o, i + o], [m, x] = [a - p, a + p];
  let l = [];
  return pt(n, r) ? l = [
    [u, y],
    [d, y],
    [E, m],
    [E, x],
    [_, x],
    [u, h]
  ] : f >= 0 && f < P ? l = [
    [u, y],
    [d, y],
    [E, m],
    [E, x],
    [_, x],
    [u, h]
  ] : f >= P && f <= R ? l = [
    [d, y],
    [d, h],
    [E, x],
    [_, x],
    [_, m],
    [u, y]
  ] : f >= -R && f < -P ? l = [
    [d, h],
    [u, h],
    [_, x],
    [_, m],
    [E, m],
    [d, y]
  ] : l = [
    [u, h],
    [u, y],
    [_, m],
    [E, m],
    [E, x],
    [d, h]
  ], { type: M, points: l };
}
const _t = "cw", Q = "ccw";
function nt(t, e, n) {
  return e === void 0 ? xt(t) : pe(t, e, n);
}
function rt(t, e, n = !1) {
  if (t.length > 0) {
    if (n)
      return { type: te, segments: t };
    if ((e == null ? void 0 : e.type) === b && e.shape.type === L)
      return { type: ot, width: e.shape.diameter, segments: t };
    if ((e == null ? void 0 : e.type) === b && e.shape.type === H)
      return ae(t, e.shape);
  }
}
function xt(t) {
  return {
    type: O,
    start: [t.startPoint.x, t.startPoint.y],
    end: [t.endPoint.x, t.endPoint.y]
  };
}
function pe(t, e, n = !1) {
  const { startPoint: r, endPoint: c, arcOffsets: s } = t, i = s.a > 0 ? s.a : (s.i ** 2 + s.j ** 2) ** 0.5;
  if (n || s.a > 0) {
    if (r.x === c.x && r.y === c.y)
      return xt(t);
    const [u, d, y] = fe(t, i).map((h) => D(r, c, h, e)).sort(([h, _], [E, m]) => {
      const x = Math.abs(_[2] - h[2]), l = Math.abs(m[2] - E[2]);
      return x - l;
    })[0];
    return { type: g, start: u, end: d, center: y, radius: i };
  }
  const a = {
    x: r.x + s.i,
    y: r.y + s.j
  }, [o, p, f] = D(
    r,
    c,
    a,
    e
  );
  return { type: g, start: o, end: p, center: f, radius: i };
}
function D(t, e, n, r) {
  let c = Math.atan2(
    t.y - n.y,
    t.x - n.x
  ), s = Math.atan2(
    e.y - n.y,
    e.x - n.x
  );
  return r === Q ? s = s > c ? s : s + A : c = c > s ? c : c + A, [
    [t.x, t.y, c],
    [e.x, e.y, s],
    [n.x, n.y]
  ];
}
function fe(t, e) {
  const { x: n, y: r } = t.startPoint, { x: c, y: s } = t.endPoint, [i, a] = [c - n, s - r], [o, p] = [c + n, s + r], f = Math.sqrt(i ** 2 + a ** 2);
  if (e <= f / 2)
    return [{ x: n + i / 2, y: r + a / 2 }];
  const u = Math.sqrt(4 * e ** 2 / f ** 2 - 1), [d, y] = [o / 2, p / 2], [h, _] = [a * u / 2, i * u / 2];
  return [
    { x: d + h, y: y - _ },
    { x: d - h, y: y + _ }
  ];
}
function ye(t, e) {
  const n = [], r = Object.fromEntries(
    t.variableValues.map((c, s) => [`$${s + 1}`, c])
  );
  for (const c of t.macro)
    if (c.type === bt && (r[c.name] = w(c.value, r)), c.type === Dt) {
      const s = [e.endPoint.x, e.endPoint.y], i = c.parameters.map((a) => w(a, r));
      n.push(...he(c.code, s, i));
    }
  return { type: k, shapes: n };
}
function w(t, e) {
  if (typeof t == "number")
    return t;
  if (typeof t == "string")
    return e[t];
  const n = w(t.left, e), r = w(t.right, e);
  switch (t.operator) {
    case "+":
      return n + r;
    case "-":
      return n - r;
    case "x":
      return n * r;
    case "/":
      return n / r;
  }
}
function he(t, e, n) {
  switch (t) {
    case Yt:
      return [de(e, n)];
    case Vt:
    case Wt:
      return [le(e, n)];
    case jt:
      return [_e(e, n)];
    case Bt:
      return [xe(e, n)];
    case zt:
      return [me(e, n)];
    case Ht:
      return [Ee(e, n)];
    case Ft:
      return Oe(e, n);
    case wt:
      return [Me(e, n)];
  }
  return [];
}
function de(t, e) {
  const [n, r, c, s, i] = e, a = r / 2, [o, p] = C([c, s], t, i);
  return { type: L, erase: n === 0, cx: o, cy: p, r: a };
}
function le(t, e) {
  const [n, r, c, s, i, a, o] = e, [p, f] = [a - s, i - c], u = r / 2, d = Math.sqrt(p ** 2 + f ** 2), [y, h] = [
    u * f / d,
    u * p / d
  ];
  return {
    type: M,
    erase: n === 0,
    points: [
      [c + y, s - h],
      [i + y, a - h],
      [i - y, a + h],
      [c - y, s + h]
    ].map((_) => C(_, t, o))
  };
}
function _e(t, e) {
  const [n, r, c, s, i, a] = e, [o, p] = [r / 2, c / 2];
  return {
    type: M,
    erase: n === 0,
    points: [
      [s - o, i - p],
      [s + o, i - p],
      [s + o, i + p],
      [s - o, i + p]
    ].map((f) => C(f, t, a))
  };
}
function xe(t, e) {
  const [n, r, c, s, i, a] = e;
  return {
    type: M,
    erase: n === 0,
    points: [
      [s, i],
      [s + r, i],
      [s + r, i + c],
      [s, i + c]
    ].map((o) => C(o, t, a))
  };
}
function me(t, e) {
  const [n, , ...r] = e.slice(0, -1), c = e[e.length - 1];
  return {
    type: M,
    erase: n === 0,
    points: r.flatMap(
      (s, i) => i % 2 === 1 ? [[r[i - 1], s]] : []
    ).map((s) => C(s, t, c))
  };
}
function Ee(t, e) {
  const [n, r, c, s, i, a] = e, o = i / 2, p = 2 * R / r, f = [];
  let u;
  for (u = 0; u < r; u++) {
    const d = p * u, y = c + o * Math.cos(d), h = s + o * Math.sin(d);
    f.push(C([y, h], t, a));
  }
  return { type: M, erase: n === 0, points: f };
}
function Oe(t, e) {
  const n = (x) => C(x, t, e[8]), [r, c, s, i, a, o, p, f] = e, [u, d] = n([r, c]), y = p / 2, h = f / 2, _ = [];
  let E = 0, m = s;
  for (; m >= 0 && E < o; ) {
    const x = m / 2, l = x - i;
    _.push(x), l > 0 && _.push(l), E += 1, m = 2 * (l - a);
  }
  return [
    {
      type: z,
      segments: _.flatMap((x) => $({ type: L, cx: u, cy: d, r: x }))
    },
    // Vertical stroke
    {
      type: M,
      points: [
        [r - y, c - h],
        [r + y, c - h],
        [r + y, c + h],
        [r - y, c + h]
      ].map(n)
    },
    // Horizontal stroke
    {
      type: M,
      points: [
        [r - h, c - y],
        [r + h, c - y],
        [r + h, c + y],
        [r - h, c + y]
      ].map(n)
    }
  ];
}
function Me(t, e) {
  const [n, r, c, s, i, a] = e, o = C([n, r], t, a), [p, f] = [c / 2, s / 2], u = i / 2, d = p ** 2 - u ** 2, y = f ** 2 - u ** 2, h = Math.sqrt(d), _ = y >= 0 ? Math.sqrt(y) : u, E = [0, 90, 180, 270], m = [];
  for (const x of E) {
    const l = [
      [_, u],
      [h, u],
      [u, h],
      [u, _]
    ].map((S) => C(S, [n, r], x)).map((S) => C(S, t, a)), [Et, Ot, Mt] = D(
      { x: l[1][0], y: l[1][1] },
      { x: l[2][0], y: l[2][1] },
      { x: o[0], y: o[1] },
      Q
    );
    if (m.push(
      { type: O, start: l[0], end: l[1] },
      { type: g, start: Et, end: Ot, center: Mt, radius: p },
      { type: O, start: l[2], end: l[3] }
    ), !pt(l[0], l[3])) {
      const [S, gt, At] = D(
        { x: l[3][0], y: l[3][1] },
        { x: l[0][0], y: l[0][1] },
        { x: o[0], y: o[1] },
        _t
      );
      m.push({
        type: g,
        start: S,
        end: gt,
        center: At,
        radius: f
      });
    }
  }
  return { type: z, segments: m };
}
function ge(t) {
  const e = Object.create(Ae);
  return t === qt ? Object.assign(e, Ce) : e;
}
const Ae = {
  _currentPath: void 0,
  _arcDirection: void 0,
  _ambiguousArcCenter: !1,
  _regionMode: !1,
  _defaultGraphic: void 0,
  _erase: !1,
  plot(t, e, n) {
    const r = [], c = this._setGraphicState(t), s = this._plotCurrentPath(t, e, c);
    if (s !== void 0 && (this._erase === !0 && (s.erase = !0), r.push(s)), c === I && (e == null ? void 0 : e.type) === b && r.push({
      type: v,
      shape: oe(e, n),
      erase: this._erase === !0 ? !0 : void 0
    }), c === I && (e == null ? void 0 : e.type) === lt && r.push({
      type: v,
      shape: ye(e, n),
      erase: this._erase === !0 ? !0 : void 0
    }), c === G && (this._currentPath = this._currentPath ?? {
      segments: [],
      region: this._regionMode,
      tool: e
    }, this._currentPath.segments.push(
      nt(n, this._arcDirection, this._ambiguousArcCenter)
    )), c === $t) {
      const i = rt([nt(n)], e);
      i !== void 0 && (this._erase === !0 && (i.erase = !0), r.push(i));
    }
    return r;
  },
  _setGraphicState(t) {
    if (t.type === st && (this._arcDirection = mt(t.mode)), t.type === kt && (this._ambiguousArcCenter = t.quadrant === Ut), t.type === Z && (this._regionMode = t.region), t.type === Xt && (this._erase = t.polarity === Qt), t.type === F)
      return t.graphic === G ? this._defaultGraphic = G : t.graphic !== void 0 && (this._defaultGraphic = void 0), t.graphic ?? this._defaultGraphic;
  },
  _plotCurrentPath(t, e, n) {
    if (this._currentPath !== void 0 && (e !== this._currentPath.tool || t.type === Z || t.type === Jt || n === W && this._currentPath.region || n === I)) {
      const r = rt(
        this._currentPath.segments,
        this._currentPath.tool,
        this._currentPath.region
      );
      return this._currentPath = void 0, r;
    }
  }
}, Ce = {
  _defaultGraphic: I,
  _ambiguousArcCenter: !0,
  _setGraphicState(t) {
    if (t.type === st) {
      const { mode: e } = t;
      this._arcDirection = mt(e), e === ct || e === it || e === Kt ? this._defaultGraphic = G : e === W ? this._defaultGraphic = W : this._defaultGraphic = I;
    }
    if (t.type === F)
      return t.graphic ?? this._defaultGraphic;
  }
};
function mt(t) {
  if (t === it)
    return Q;
  if (t === ct)
    return _t;
}
function Te(t) {
  const e = ne(t), n = re(), r = ce(), c = ge(t.filetype), s = [];
  for (const i of t.children) {
    const a = n.use(i), o = r.use(i, e), p = c.plot(i, a, o);
    s.push(...p);
  }
  return {
    type: Zt,
    units: e.units,
    size: ht(s),
    children: s
  };
}
export {
  g as ARC,
  Re as BoundingBox,
  L as CIRCLE,
  Zt as IMAGE,
  ot as IMAGE_PATH,
  te as IMAGE_REGION,
  v as IMAGE_SHAPE,
  k as LAYERED_SHAPE,
  O as LINE,
  z as OUTLINE,
  M as POLYGON,
  H as RECTANGLE,
  A as TWO_PI,
  Te as plot,
  pt as positionsEqual
};
//# sourceMappingURL=tracespace-plotter.js.map
