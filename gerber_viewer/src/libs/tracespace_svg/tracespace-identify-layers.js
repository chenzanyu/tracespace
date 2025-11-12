function f(t) {
  let e, h = 0;
  const o = {};
  for (const d of t) {
    const { cad: l } = d;
    if (l !== void 0) {
      const g = (o[l] ?? 0) + 1;
      g > h && (h = g, e = l), o[l] = g;
    }
  }
  return e;
}
const E = "copper", k = "soldermask", u = "silkscreen", v = "solderpaste", C = "drill", D = "outline", L = "drawing", b = "top", y = "bottom", T = "inner", A = "all", a = "kicad", p = "altium", P = "allegro", r = "eagle", c = "eagle-legacy", s = "eagle-oshpark", m = "eagle-pcbng", n = "geda-pcb", i = "orcad", x = "diptrace", _ = [
  // High-priority non-matches
  {
    type: void 0,
    side: void 0,
    matchers: [
      // Eagle gerber generation metadata
      {
        ext: "gpi",
        cad: [r, c, s, m]
      },
      // Eagle drill generation metadata
      {
        ext: "dri",
        cad: [r, c, s, m]
      },
      // General data/BOM files
      { ext: "csv", cad: void 0 },
      // Pick-n-place BOMs
      { match: /pnp_bom/, cad: m }
    ]
  },
  {
    type: E,
    side: b,
    matchers: [
      { ext: "cmp", cad: c },
      { ext: "top", cad: [c, i] },
      { ext: "gtl", cad: [a, p] },
      { ext: "toplayer\\.ger", cad: s },
      { match: /top\.\w+$/, cad: [n, x] },
      { match: /f[._]cu/, cad: a },
      { match: /copper_top/, cad: r },
      { match: /top_copper/, cad: m },
      { match: /top copper/, cad: void 0 }
    ]
  },
  {
    type: k,
    side: b,
    matchers: [
      { ext: "stc", cad: c },
      { ext: "tsm", cad: c },
      { ext: "gts", cad: [a, p] },
      { ext: "smt", cad: i },
      { ext: "topsoldermask\\.ger", cad: s },
      { match: /topmask\.\w+$/, cad: [n, x] },
      { match: /f[._]mask/, cad: a },
      { match: /soldermask_top/, cad: r },
      { match: /top_mask/, cad: m },
      { match: /top solder resist/, cad: void 0 }
    ]
  },
  {
    type: u,
    side: b,
    matchers: [
      { ext: "plc", cad: c },
      { ext: "tsk", cad: c },
      { ext: "gto", cad: [a, p] },
      { ext: "sst", cad: i },
      { ext: "topsilkscreen\\.ger", cad: s },
      { match: /topsilk\.\w+$/, cad: [n, x] },
      { match: /f[._]silks/, cad: a },
      { match: /silkscreen_top/, cad: r },
      { match: /top_silk/, cad: m },
      { match: /top silk screen/, cad: void 0 }
    ]
  },
  {
    type: v,
    side: b,
    matchers: [
      { ext: "crc", cad: c },
      { ext: "tsp", cad: c },
      { ext: "gtp", cad: [a, p] },
      { ext: "spt", cad: i },
      { ext: "tcream\\.ger", cad: s },
      { match: /toppaste\.\w+$/, cad: [n, x] },
      { match: /f[._]paste/, cad: a },
      { match: /solderpaste_top/, cad: r },
      { match: /top_paste/, cad: m }
    ]
  },
  {
    type: E,
    side: y,
    matchers: [
      { ext: "sol", cad: c },
      { ext: "bot", cad: [c, i] },
      { ext: "gbl", cad: [a, p] },
      { ext: "bottomlayer\\.ger", cad: s },
      { match: /bottom\.\w+$/, cad: [n, x] },
      { match: /b[._]cu/, cad: a },
      { match: /copper_bottom/, cad: r },
      { match: /bottom_copper/, cad: m },
      { match: /bottom copper/, cad: void 0 }
    ]
  },
  {
    type: k,
    side: y,
    matchers: [
      { ext: "sts", cad: c },
      { ext: "bsm", cad: c },
      { ext: "gbs", cad: [a, p] },
      { ext: "smb", cad: i },
      { ext: "bottomsoldermask\\.ger", cad: s },
      { match: /bottommask\.\w+$/, cad: [n, x] },
      { match: /b[._]mask/, cad: a },
      { match: /soldermask_bottom/, cad: r },
      { match: /bottom_mask/, cad: m },
      { match: /bottom solder resist/, cad: void 0 }
    ]
  },
  {
    type: u,
    side: y,
    matchers: [
      { ext: "pls", cad: c },
      { ext: "bsk", cad: c },
      { ext: "gbo", cad: [a, p] },
      { ext: "ssb", cad: i },
      { ext: "bottomsilkscreen\\.ger", cad: s },
      { match: /bottomsilk\.\w+$/, cad: [n, x] },
      { match: /b[._]silks/, cad: a },
      { match: /silkscreen_bottom/, cad: r },
      { match: /bottom_silk/, cad: m },
      { match: /bottom silk screen/, cad: void 0 }
    ]
  },
  {
    type: v,
    side: y,
    matchers: [
      { ext: "crs", cad: c },
      { ext: "bsp", cad: c },
      { ext: "gbp", cad: [a, p] },
      { ext: "spb", cad: i },
      { ext: "bcream\\.ger", cad: s },
      { match: /bottompaste\.\w+$/, cad: [n, x] },
      { match: /b[._]paste/, cad: a },
      { match: /solderpaste_bottom/, cad: r },
      { match: /bottom_paste/, cad: m }
    ]
  },
  {
    type: E,
    side: T,
    matchers: [
      { ext: "ly\\d+", cad: c },
      { ext: "gp?\\d+", cad: [a, p] },
      { ext: "in\\d+", cad: i },
      { ext: "internalplane\\d+\\.ger", cad: s },
      { match: /in(?:ner)?\d+[._]cu/, cad: a },
      { match: /inner/, cad: x }
    ]
  },
  {
    type: D,
    side: A,
    matchers: [
      { ext: "dim", cad: c },
      { ext: "mil", cad: c },
      { ext: "gml", cad: c },
      { ext: "gm\\d+", cad: [a, p] },
      { ext: "gko", cad: p },
      { ext: "fab", cad: i },
      { ext: "drd", cad: i },
      { match: /outline/, cad: [n, m] },
      { match: /boardoutline/, cad: [s, x] },
      { match: /edge[._]cuts/, cad: a },
      { match: /profile/, cad: r },
      { match: /mechanical \d+/, cad: void 0 }
    ]
  },
  {
    type: C,
    side: A,
    matchers: [
      { ext: "txt", cad: [c, p] },
      {
        ext: "xln",
        cad: [r, c, s]
      },
      { ext: "exc", cad: c },
      { ext: "drd", cad: c },
      { ext: "drl", cad: [a, x] },
      { ext: "tap", cad: i },
      { ext: "npt", cad: i },
      { ext: "plated-drill\\.cnc", cad: n },
      { match: /fab/, cad: n },
      { match: /npth/, cad: a },
      { match: /drill/, cad: m }
    ]
  },
  {
    type: L,
    side: void 0,
    matchers: [
      { ext: "pos", cad: a },
      { ext: "art", cad: P },
      { ext: "gbr", cad: void 0 },
      { ext: "gbx", cad: void 0 },
      { ext: "ger", cad: void 0 },
      { ext: "pho", cad: void 0 }
    ]
  }
], I = _.flatMap((t) => t.matchers.flatMap((e) => {
  const h = Array.isArray(e.cad) ? e.cad : [e.cad], o = "ext" in e ? new RegExp("\\." + e.ext + "$", "i") : new RegExp(e.match, "i");
  return h.map((d) => ({
    type: t.type,
    side: t.side,
    match: o,
    cad: d
  }));
}));
function R(t) {
  return I.map((e) => e.match.test(t) ? { ...e, filename: t } : void 0).filter((e) => e !== void 0);
}
function w(t) {
  typeof t == "string" && (t = [t]);
  const e = t.flatMap((o) => R(o)), h = f(e);
  return Object.fromEntries(
    t.map((o) => {
      const d = S(e, o, h), l = d === void 0 ? { type: void 0, side: void 0 } : { type: d.type, side: d.side };
      return [o, l];
    })
  );
}
function O() {
  return _.map((t) => ({ type: t.type, side: t.side })).filter((t) => t.type !== void 0);
}
function G(t) {
  const e = _.some((d) => d.side === t.side && d.type === t.type), h = _.some((d) => d.side === t.side), o = _.some((d) => d.type === t.type);
  return {
    valid: e,
    side: h ? t.side : void 0,
    type: o ? t.type : void 0
  };
}
function S(t, e, h) {
  const o = t.filter((l) => l.filename === e);
  return o.find((l) => l.cad === h) ?? o[0];
}
export {
  P as CAD_ALLEGRO,
  p as CAD_ALTIUM,
  x as CAD_DIPTRACE,
  r as CAD_EAGLE,
  c as CAD_EAGLE_LEGACY,
  s as CAD_EAGLE_OSHPARK,
  m as CAD_EAGLE_PCBNG,
  n as CAD_GEDA_PCB,
  a as CAD_KICAD,
  i as CAD_ORCAD,
  A as SIDE_ALL,
  y as SIDE_BOTTOM,
  T as SIDE_INNER,
  b as SIDE_TOP,
  E as TYPE_COPPER,
  L as TYPE_DRAWING,
  C as TYPE_DRILL,
  D as TYPE_OUTLINE,
  u as TYPE_SILKSCREEN,
  k as TYPE_SOLDERMASK,
  v as TYPE_SOLDERPASTE,
  O as getAllLayers,
  w as identifyLayers,
  G as validate
};
//# sourceMappingURL=tracespace-identify-layers.js.map
