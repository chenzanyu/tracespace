var st = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function at(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
var Ae = { exports: {} };
(function(e) {
  (function(n, o) {
    e.exports ? e.exports = o() : n.moo = o();
  })(st, function() {
    var n = Object.prototype.hasOwnProperty, o = Object.prototype.toString, s = typeof new RegExp().sticky == "boolean";
    function a(r) {
      return r && o.call(r) === "[object RegExp]";
    }
    function l(r) {
      return r && typeof r == "object" && !a(r) && !Array.isArray(r);
    }
    function f(r) {
      return r.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    }
    function p(r) {
      var i = new RegExp("|" + r);
      return i.exec("").length - 1;
    }
    function N(r) {
      return "(" + r + ")";
    }
    function O(r) {
      if (!r.length)
        return "(?!)";
      var i = r.map(function(c) {
        return "(?:" + c + ")";
      }).join("|");
      return "(?:" + i + ")";
    }
    function T(r) {
      if (typeof r == "string")
        return "(?:" + f(r) + ")";
      if (a(r)) {
        if (r.ignoreCase)
          throw new Error("RegExp /i flag not allowed");
        if (r.global)
          throw new Error("RegExp /g flag is implied");
        if (r.sticky)
          throw new Error("RegExp /y flag is implied");
        if (r.multiline)
          throw new Error("RegExp /m flag is implied");
        return r.source;
      } else
        throw new Error("Not a pattern: " + r);
    }
    function I(r, i) {
      return r.length > i ? r : Array(i - r.length + 1).join(" ") + r;
    }
    function Ke(r, i) {
      for (var c = r.length, u = 0; ; ) {
        var m = r.lastIndexOf(`
`, c - 1);
        if (m === -1 || (u++, c = m, u === i) || c === 0)
          break;
      }
      var d = u < i ? 0 : c + 1;
      return r.substring(d).split(`
`);
    }
    function Qe(r) {
      for (var i = Object.getOwnPropertyNames(r), c = [], u = 0; u < i.length; u++) {
        var m = i[u], d = r[m], v = [].concat(d);
        if (m === "include") {
          for (var A = 0; A < v.length; A++)
            c.push({ include: v[A] });
          continue;
        }
        var E = [];
        v.forEach(function(h) {
          l(h) ? (E.length && c.push(X(m, E)), c.push(X(m, h)), E = []) : E.push(h);
        }), E.length && c.push(X(m, E));
      }
      return c;
    }
    function Je(r) {
      for (var i = [], c = 0; c < r.length; c++) {
        var u = r[c];
        if (u.include) {
          for (var m = [].concat(u.include), d = 0; d < m.length; d++)
            i.push({ include: m[d] });
          continue;
        }
        if (!u.type)
          throw new Error("Rule has no type: " + JSON.stringify(u));
        i.push(X(u.type, u));
      }
      return i;
    }
    function X(r, i) {
      if (l(i) || (i = { match: i }), i.include)
        throw new Error("Matching rules cannot also include states");
      var c = {
        defaultType: r,
        lineBreaks: !!i.error || !!i.fallback,
        pop: !1,
        next: null,
        push: null,
        error: !1,
        fallback: !1,
        value: null,
        type: null,
        shouldThrow: !1
      };
      for (var u in i)
        n.call(i, u) && (c[u] = i[u]);
      if (typeof c.type == "string" && r !== c.type)
        throw new Error("Type transform cannot be a string (type '" + c.type + "' for token '" + r + "')");
      var m = c.match;
      return c.match = Array.isArray(m) ? m : m ? [m] : [], c.match.sort(function(d, v) {
        return a(d) && a(v) ? 0 : a(v) ? -1 : a(d) ? 1 : v.length - d.length;
      }), c;
    }
    function ae(r) {
      return Array.isArray(r) ? Je(r) : Qe(r);
    }
    var je = X("error", { lineBreaks: !0, shouldThrow: !0 });
    function Oe(r, i) {
      for (var c = null, u = /* @__PURE__ */ Object.create(null), m = !0, d = null, v = [], A = [], E = 0; E < r.length; E++)
        r[E].fallback && (m = !1);
      for (var E = 0; E < r.length; E++) {
        var h = r[E];
        if (h.include)
          throw new Error("Inheritance is not allowed in stateless lexers");
        if (h.error || h.fallback) {
          if (c)
            throw !h.fallback == !c.fallback ? new Error("Multiple " + (h.fallback ? "fallback" : "error") + " rules not allowed (for token '" + h.defaultType + "')") : new Error("fallback and error are mutually exclusive (for token '" + h.defaultType + "')");
          c = h;
        }
        var _ = h.match.slice();
        if (m)
          for (; _.length && typeof _[0] == "string" && _[0].length === 1; ) {
            var B = _.shift();
            u[B.charCodeAt(0)] = h;
          }
        if (h.pop || h.push || h.next) {
          if (!i)
            throw new Error("State-switching options are not allowed in stateless lexers (for token '" + h.defaultType + "')");
          if (h.fallback)
            throw new Error("State-switching options are not allowed on fallback tokens (for token '" + h.defaultType + "')");
        }
        if (_.length !== 0) {
          m = !1, v.push(h);
          for (var q = 0; q < _.length; q++) {
            var H = _[q];
            if (a(H)) {
              if (d === null)
                d = H.unicode;
              else if (d !== H.unicode && h.fallback === !1)
                throw new Error("If one rule is /u then all must be");
            }
          }
          var $ = O(_.map(T)), L = new RegExp($);
          if (L.test(""))
            throw new Error("RegExp matches empty string: " + L);
          var Y = p($);
          if (Y > 0)
            throw new Error("RegExp has capture groups: " + L + `
Use (?: … ) instead`);
          if (!h.lineBreaks && L.test(`
`))
            throw new Error("Rule should declare lineBreaks: " + L);
          A.push(N($));
        }
      }
      var V = c && c.fallback, K = s && !V ? "ym" : "gm", te = s || V ? "" : "|";
      d === !0 && (K += "u");
      var it = new RegExp(O(A) + te, K);
      return { regexp: it, groups: v, fast: u, error: c || je };
    }
    function et(r) {
      var i = Oe(ae(r));
      return new x({ start: i }, "start");
    }
    function ge(r, i, c) {
      var u = r && (r.push || r.next);
      if (u && !c[u])
        throw new Error("Missing state '" + u + "' (in token '" + r.defaultType + "' of state '" + i + "')");
      if (r && r.pop && +r.pop != 1)
        throw new Error("pop must be 1 (in token '" + r.defaultType + "' of state '" + i + "')");
    }
    function tt(r, i) {
      var c = r.$all ? ae(r.$all) : [];
      delete r.$all;
      var u = Object.getOwnPropertyNames(r);
      i || (i = u[0]);
      for (var m = /* @__PURE__ */ Object.create(null), d = 0; d < u.length; d++) {
        var v = u[d];
        m[v] = ae(r[v]).concat(c);
      }
      for (var d = 0; d < u.length; d++)
        for (var v = u[d], A = m[v], E = /* @__PURE__ */ Object.create(null), h = 0; h < A.length; h++) {
          var _ = A[h];
          if (_.include) {
            var B = [h, 1];
            if (_.include !== v && !E[_.include]) {
              E[_.include] = !0;
              var q = m[_.include];
              if (!q)
                throw new Error("Cannot include nonexistent state '" + _.include + "' (in state '" + v + "')");
              for (var H = 0; H < q.length; H++) {
                var $ = q[H];
                A.indexOf($) === -1 && B.push($);
              }
            }
            A.splice.apply(A, B), h--;
          }
        }
      for (var L = /* @__PURE__ */ Object.create(null), d = 0; d < u.length; d++) {
        var v = u[d];
        L[v] = Oe(m[v], !0);
      }
      for (var d = 0; d < u.length; d++) {
        for (var Y = u[d], V = L[Y], K = V.groups, h = 0; h < K.length; h++)
          ge(K[h], Y, L);
        for (var te = Object.getOwnPropertyNames(V.fast), h = 0; h < te.length; h++)
          ge(V.fast[te[h]], Y, L);
      }
      return new x(L, i);
    }
    function rt(r) {
      for (var i = typeof Map < "u", c = i ? /* @__PURE__ */ new Map() : /* @__PURE__ */ Object.create(null), u = Object.getOwnPropertyNames(r), m = 0; m < u.length; m++) {
        var d = u[m], v = r[d], A = Array.isArray(v) ? v : [v];
        A.forEach(function(E) {
          if (typeof E != "string")
            throw new Error("keyword must be string (in keyword '" + d + "')");
          i ? c.set(E, d) : c[E] = d;
        });
      }
      return function(E) {
        return i ? c.get(E) : c[E];
      };
    }
    var x = function(r, i) {
      this.startState = i, this.states = r, this.buffer = "", this.stack = [], this.reset();
    };
    x.prototype.reset = function(r, i) {
      return this.buffer = r || "", this.index = 0, this.line = i ? i.line : 1, this.col = i ? i.col : 1, this.queuedToken = i ? i.queuedToken : null, this.queuedText = i ? i.queuedText : "", this.queuedThrow = i ? i.queuedThrow : null, this.setState(i ? i.state : this.startState), this.stack = i && i.stack ? i.stack.slice() : [], this;
    }, x.prototype.save = function() {
      return {
        line: this.line,
        col: this.col,
        state: this.state,
        stack: this.stack.slice(),
        queuedToken: this.queuedToken,
        queuedText: this.queuedText,
        queuedThrow: this.queuedThrow
      };
    }, x.prototype.setState = function(r) {
      if (!(!r || this.state === r)) {
        this.state = r;
        var i = this.states[r];
        this.groups = i.groups, this.error = i.error, this.re = i.regexp, this.fast = i.fast;
      }
    }, x.prototype.popState = function() {
      this.setState(this.stack.pop());
    }, x.prototype.pushState = function(r) {
      this.stack.push(this.state), this.setState(r);
    };
    var nt = s ? function(r, i) {
      return r.exec(i);
    } : function(r, i) {
      var c = r.exec(i);
      return c[0].length === 0 ? null : c;
    };
    x.prototype._getGroup = function(r) {
      for (var i = this.groups.length, c = 0; c < i; c++)
        if (r[c + 1] !== void 0)
          return this.groups[c];
      throw new Error("Cannot find token type for matched text");
    };
    function ot() {
      return this.value;
    }
    if (x.prototype.next = function() {
      var r = this.index;
      if (this.queuedGroup) {
        var i = this._token(this.queuedGroup, this.queuedText, r);
        return this.queuedGroup = null, this.queuedText = "", i;
      }
      var c = this.buffer;
      if (r !== c.length) {
        var v = this.fast[c.charCodeAt(r)];
        if (v)
          return this._token(v, c.charAt(r), r);
        var u = this.re;
        u.lastIndex = r;
        var m = nt(u, c), d = this.error;
        if (m == null)
          return this._token(d, c.slice(r, c.length), r);
        var v = this._getGroup(m), A = m[0];
        return d.fallback && m.index !== r ? (this.queuedGroup = v, this.queuedText = A, this._token(d, c.slice(r, m.index), r)) : this._token(v, A, r);
      }
    }, x.prototype._token = function(r, i, c) {
      var u = 0;
      if (r.lineBreaks) {
        var m = /\n/g, d = 1;
        if (i === `
`)
          u = 1;
        else
          for (; m.exec(i); )
            u++, d = m.lastIndex;
      }
      var v = {
        type: typeof r.type == "function" && r.type(i) || r.defaultType,
        value: typeof r.value == "function" ? r.value(i) : i,
        text: i,
        toString: ot,
        offset: c,
        lineBreaks: u,
        line: this.line,
        col: this.col
      }, A = i.length;
      if (this.index += A, this.line += u, u !== 0 ? this.col = A - d + 1 : this.col += A, r.shouldThrow) {
        var E = new Error(this.formatError(v, "invalid syntax"));
        throw E;
      }
      return r.pop ? this.popState() : r.push ? this.pushState(r.push) : r.next && this.setState(r.next), v;
    }, typeof Symbol < "u" && Symbol.iterator) {
      var ce = function(r) {
        this.lexer = r;
      };
      ce.prototype.next = function() {
        var r = this.lexer.next();
        return { value: r, done: !r };
      }, ce.prototype[Symbol.iterator] = function() {
        return this;
      }, x.prototype[Symbol.iterator] = function() {
        return new ce(this);
      };
    }
    return x.prototype.formatError = function(r, i) {
      if (r == null)
        var c = this.buffer.slice(this.index), r = {
          text: c,
          offset: this.index,
          lineBreaks: c.indexOf(`
`) === -1 ? 0 : 1,
          line: this.line,
          col: this.col
        };
      var u = 2, m = Math.max(r.line - u, 1), d = r.line + u, v = String(d).length, A = Ke(
        this.buffer,
        this.line - r.line + u + 1
      ).slice(0, 5), E = [];
      E.push(i + " at line " + r.line + " col " + r.col + ":"), E.push("");
      for (var h = 0; h < A.length; h++) {
        var _ = A[h], B = m + h;
        E.push(I(String(B), v) + "  " + _), B === r.line && E.push(I("", v + r.col + 1) + "^");
      }
      return E.join(`
`);
    }, x.prototype.clone = function() {
      return new x(this.states, this.state);
    }, x.prototype.has = function(r) {
      return !0;
    }, {
      compile: et,
      states: tt,
      error: Object.freeze({ error: !0 }),
      fallback: Object.freeze({ fallback: !0 }),
      keywords: rt
    };
  });
})(Ae);
var ct = Ae.exports;
const Me = /* @__PURE__ */ at(ct), Q = "T_CODE", R = "G_CODE", P = "M_CODE", b = "D_CODE", g = "ASTERISK", w = "PERCENT", Ce = "EQUALS", Z = "COMMA", U = "OPERATOR", ue = "GERBER_FORMAT", ne = "GERBER_UNITS", Ne = "GERBER_TOOL_MACRO", _e = "GERBER_TOOL_DEF", we = "GERBER_LOAD_POLARITY", xe = "GERBER_STEP_REPEAT", J = "GERBER_MACRO_VARIABLE", Ie = "SEMICOLON", Le = "DRILL_UNITS", fe = "DRILL_ZERO_INCLUSION", M = "COORD_CHAR", C = "NUMBER", lt = "WORD", ut = "WHITESPACE", S = "NEWLINE", ft = "CATCHALL", pt = "ERROR", dt = /^0*/, Se = (e) => e.replace(dt, ""), re = (e) => {
  const n = Se(e.slice(1));
  return n === "" ? "0" : n;
}, ht = {
  [Q]: {
    match: /T\d+/,
    value: re
  },
  [R]: {
    match: /G\d+/,
    value: re
  },
  [P]: {
    match: /M\d+/,
    value: re
  },
  [b]: {
    match: /D\d+/,
    value: re
  },
  [g]: "*",
  [w]: "%",
  [Ce]: "=",
  [ue]: {
    match: /FS[ADILT]+/,
    value: (e) => e.slice(2)
  },
  [ne]: {
    match: /MO(?:IN|MM)/,
    value: (e) => e.slice(2)
  },
  [Ne]: {
    // "-" in a tool name is illegal, but some gerber writers misbehave
    // https://github.com/mcous/gerber-parser/pull/13
    match: /AM[$.A-Z_a-z][\w.-]*/,
    value: (e) => e.slice(2)
  },
  [_e]: {
    match: /ADD\d+[$.A-Z_a-z][\w.-]*/,
    value: (e) => Se(e.slice(3))
  },
  [we]: {
    match: /LP[CD]/,
    value: (e) => e.slice(2)
  },
  [xe]: "SR",
  [J]: /\$\d+/,
  [Ie]: ";",
  [Le]: /^(?:METRIC|INCH)/,
  [fe]: {
    match: /,(?:TZ|LZ)/,
    value: (e) => e.slice(1)
  },
  [M]: /[A-CFH-JNSX-Z]/,
  [C]: /[+-]?[\d.]+/,
  [U]: ["x", "/", "+", "-", "(", ")"],
  [Z]: ",",
  [lt]: /[A-Za-z]+/,
  [ut]: /[\t ]+/,
  [S]: {
    match: /\r?\n/,
    lineBreaks: !0
  },
  [ft]: /\S/,
  [pt]: Me.error
};
function mt() {
  const e = Me.compile(ht);
  return { feed: n };
  function n(s, a) {
    return e.reset(s, a), o((a == null ? void 0 : a.offset) ?? 0);
  }
  function o(s) {
    return {
      [Symbol.iterator]() {
        return this;
      },
      next() {
        const a = e.next();
        if (a !== void 0) {
          const l = { ...a, offset: s + a.offset }, f = {
            ...e.save(),
            offset: s + (e.index ?? 0)
          };
          return { value: [l, f] };
        }
        return { value: void 0, done: !0 };
      }
    };
  }
}
const be = "gerber", oe = "drill", pe = "mm", de = "in", Pe = "leading", De = "trailing", vt = "absolute", Et = "incremental", he = "circle", Ge = "rectangle", yt = "obround", Rt = "polygon", Ot = "macroShape", Cr = "1", Nr = "2", _r = "20", wr = "21", xr = "22", Ir = "4", Lr = "5", Sr = "6", br = "7", gt = "shape", me = "move", Tt = "segment", At = "slot", Mt = "line", Ct = "cwArc", Nt = "ccwArc", _t = "single", wt = "multi", xt = "dark", It = "clear", ie = "TOKEN", W = "MIN_TO_MAX";
function t(e, n) {
  return { rule: ie, type: e, value: n };
}
function F(e, n) {
  return { rule: ie, type: e, value: n, negate: !0 };
}
function G(e) {
  return { rule: W, min: 1, max: 1, match: e };
}
function j(e) {
  return { rule: W, min: 0, max: 1, match: e };
}
function D(e) {
  return { rule: W, min: 0, max: Number.POSITIVE_INFINITY, match: e };
}
function Be(e) {
  return { rule: W, min: 1, max: Number.POSITIVE_INFINITY, match: e };
}
function k(e, n, o) {
  return { rule: W, min: e, max: n, match: o };
}
function qe(e, n) {
  const o = [];
  for (const s of n) {
    const a = St(e, s.rules);
    if (a === Ue)
      o.push(s);
    else if (a === He)
      return {
        filetype: s.filetype,
        nodes: s.createNodes(e)
      };
  }
  return o.length > 0 ? { candidates: o, tokens: e } : {};
}
const He = "FULL_MATCH", Ue = "PARTIAL_MATCH", Lt = "NO_MATCH";
function St(e, n) {
  let o = 0, s = 0, a = 0;
  for (; o < n.length && s < e.length; ) {
    const l = n[o], f = e[s];
    if (Fe(l, f))
      l.rule === ie || a >= l.max - 1 ? (o++, s++, a = 0) : (s++, a++);
    else if (l.rule === W && a >= l.min)
      a = 0, o++;
    else
      return Lt;
  }
  return o < n.length ? Ue : He;
}
function Fe(e, n) {
  if (e.rule === ie) {
    const o = e.type === n.type, s = e.value === null || e.value === void 0 || typeof e.value == "string" && e.value === n.value || e.value instanceof RegExp && e.value.test(n.value), a = o && s;
    return e.negate === !0 ? !a : a;
  }
  return Array.isArray(e.match) ? e.match.some((o) => Fe(o, n)) : !1;
}
const bt = "root", ke = "comment", Pt = "drillHeader", ze = "done", ve = "units", $e = "coordinateFormat", Ve = "toolDefinition", Dt = "toolMacro", Ee = "toolChange", Gt = "loadPolarity", Bt = "stepRepeat", ye = "graphic", ee = "interpolateMode", qt = "regionMode", Ht = "quadrantMode", Ut = "unimplemented", Ft = "macroComment", kt = "macroVariable", zt = "macroPrimitive";
function z(e) {
  return Object.fromEntries(
    e.map((n, o) => [
      n,
      o > 0 ? e[o - 1] : void 0
    ]).filter((n) => {
      const [o, s] = n;
      return o.type === C && (s == null ? void 0 : s.type) === M;
    }).map(([n, o]) => [o.value.toLowerCase(), n.value])
  );
}
function se(e) {
  const n = e.filter((o) => o.type === R).map((o) => o.value === "0" ? me : o.value === "1" ? Mt : o.value === "2" ? Ct : o.value === "3" ? Nt : o.value === "5" ? oe : !1);
  return typeof n[0] == "string" ? n[0] : void 0;
}
function $t(e) {
  const n = e.filter((o) => o.type === b).map((o) => o.value === "1" ? Tt : o.value === "2" ? me : o.value === "3" ? gt : !1);
  return typeof n[0] == "string" ? n[0] : void 0;
}
function Re(e) {
  return e.map((n) => n.value).join("").trim();
}
function y(e, n = {}) {
  const { head: o = e[0], length: s = 0 } = n, a = s > 0 ? e[e.indexOf(o) + s - 1] : e[e.length - 1];
  return {
    start: { line: o.line, column: o.col, offset: o.offset },
    end: { line: a.line, column: a.col, offset: a.offset }
  };
}
const Vt = {
  name: "units",
  rules: [
    G([
      t(Le),
      t(P, "71"),
      t(P, "72")
    ]),
    D([
      t(Z),
      t(fe),
      t(C, /^0{1,8}\.0{1,8}$/)
    ]),
    t(S)
  ],
  createNodes(e) {
    const n = e[0].value === "INCH" || e[0].value === "72" ? de : pe, o = e.filter((l) => l.type === fe).map((l) => l.value === "LZ" ? De : Pe), s = e.filter((l) => l.type === C).map((l) => {
      const [f = "", p = ""] = l.value.split(".");
      return [f.length, p.length];
    }), a = [
      { type: ve, position: y(e.slice(0, 2)), units: n }
    ];
    return (o.length > 0 || s.length > 0) && a.push({
      type: $e,
      position: y(e.slice(1)),
      mode: void 0,
      format: s[0],
      zeroSuppression: o[0]
    }), a;
  }
}, Zt = {
  name: "tool",
  rules: [
    t(Q),
    k(0, 12, [
      t(M, "C"),
      t(M, "F"),
      t(M, "S"),
      t(M, "B"),
      t(M, "H"),
      t(M, "Z"),
      t(C)
    ]),
    t(S)
  ],
  createNodes(e) {
    const n = e[0].value, o = y(e), { c: s } = z(e.slice(1, -1));
    return s === void 0 ? [{ type: Ee, position: o, code: n }] : [
      {
        type: Ve,
        shape: { type: he, diameter: Number(s) },
        hole: void 0,
        position: o,
        code: n
      }
    ];
  }
}, Wt = {
  name: "operationMode",
  rules: [
    G([
      t(R, "0"),
      t(R, "1"),
      t(R, "2"),
      t(R, "3"),
      t(R, "5")
    ]),
    t(S)
  ],
  createNodes: (e) => [
    {
      type: ee,
      position: y(e),
      mode: se(e)
    }
  ]
}, Xt = {
  name: "spindle",
  rules: [G([t(P, "15"), t(P, "16")]), t(S)],
  createNodes(e) {
    const n = e[0].value === "16";
    return [
      {
        type: ee,
        position: y(e),
        // M16 -> MOVE; M15 -> leave in a benign state (DRILL), real drawing
        // behaviour will be set by the next G01/line command
        mode: n ? me : oe
      }
    ];
  }
}, Yt = {
  name: "operation",
  rules: [
    k(0, 2, [
      t(Q),
      t(R, "0"),
      t(R, "1"),
      t(R, "2"),
      t(R, "3"),
      t(R, "5")
    ]),
    k(2, 8, [t(M), t(C)]),
    j([t(Q)]),
    t(S)
  ],
  createNodes(e) {
    const n = e.filter(
      (I) => I.type === M || I.type === C
    ), o = e.find((I) => I.type === R), s = e.find((I) => I.type === Q), a = z(n), l = s == null ? void 0 : s.value, f = se(e), p = y(e, {
      head: n[0],
      length: n.length + 1
    }), N = y(e, { head: o, length: 2 }), O = y(e, { head: s, length: 2 }), T = [
      {
        type: ye,
        position: p,
        graphic: void 0,
        coordinates: a
      }
    ];
    return f !== void 0 && T.unshift({ type: ee, position: N, mode: f }), l !== void 0 && T.unshift({ type: Ee, position: O, code: l }), T;
  }
}, Kt = {
  name: "slot",
  rules: [
    k(2, 4, [t(M), t(C)]),
    t(R, "85"),
    k(2, 4, [t(M), t(C)]),
    t(S)
  ],
  createNodes(e) {
    const n = e.find((l) => l.type === R), o = n === void 0 ? -1 : e.indexOf(n), s = Object.fromEntries(
      Object.entries(z(e.slice(0, o))).map(
        ([l, f]) => [`${l}0`, f]
      )
    ), a = z(e.slice(o));
    return [
      {
        type: ye,
        position: y(e),
        graphic: At,
        coordinates: { ...s, ...a }
      }
    ];
  }
}, Qt = {
  name: "done",
  rules: [
    G([t(P, "30"), t(P, "0")]),
    t(S)
  ],
  createNodes: (e) => [
    { type: ze, position: y(e) }
  ]
}, Jt = {
  name: "header",
  rules: [
    G([t(P, "48"), t(w)]),
    t(S)
  ],
  createNodes: (e) => [
    { type: Pt, position: y(e) }
  ]
}, jt = {
  name: "comment",
  rules: [
    t(Ie),
    D([F(S)]),
    t(S)
  ],
  createNodes: (e) => [
    {
      type: ke,
      comment: Re(e.slice(1, -1)),
      position: y(e)
    }
  ]
}, Ze = [
  Zt,
  Wt,
  Xt,
  Yt,
  Kt,
  jt,
  Vt,
  Qt,
  Jt
].map((e) => ({ ...e, filetype: oe })), er = {
  name: "macroComment",
  rules: [
    t(C, "0"),
    D([F(g)]),
    t(g)
  ],
  createNodes: nr
}, tr = {
  name: "macroVariable",
  rules: [
    t(J),
    t(Ce),
    Be([
      t(C),
      t(U),
      t(J),
      t(M, "X")
    ]),
    t(g)
  ],
  createNodes: ir
}, rr = {
  name: "macroPrimitive",
  rules: [
    t(C),
    t(Z),
    Be([
      t(Z),
      t(C),
      t(U),
      t(J),
      t(M, "X")
    ]),
    t(g)
  ],
  createNodes: or
};
function nr(e) {
  const n = e.slice(1, -1).map((o) => o.text).join("").trim();
  return [
    { type: Ft, position: y(e), comment: n }
  ];
}
function or(e) {
  const n = e[0].value, o = [[]];
  let s = o[0];
  for (const l of e.slice(2, -1))
    l.type === Z ? (s = [], o.push(s)) : s.push(l);
  const a = o.map(
    (l) => We(l)
  );
  return [
    {
      type: zt,
      position: y(e),
      code: n,
      parameters: a
    }
  ];
}
function ir(e) {
  const n = e[0].value, o = We(e.slice(2, -1));
  return [
    {
      type: kt,
      position: y(e),
      name: n,
      value: o
    }
  ];
}
function We(e) {
  const n = e.map((f) => f.type === M ? { ...f, type: U, value: "x" } : f);
  return l();
  function o() {
    return n[0];
  }
  function s() {
    const f = n.shift();
    if ((f == null ? void 0 : f.type) === C)
      return Number(f.value);
    if ((f == null ? void 0 : f.type) === J)
      return f.value;
    const p = l();
    return n.shift(), p;
  }
  function a() {
    let f = s(), p = o();
    for (; (p == null ? void 0 : p.type) === U && (p.value === "x" || p.value === "/"); )
      n.shift(), f = {
        left: f,
        right: s(),
        operator: p.value
      }, p = o();
    return f;
  }
  function l() {
    let f = a(), p = o();
    for (; (p == null ? void 0 : p.type) === U && (p.value === "+" || p.value === "-") || (p == null ? void 0 : p.type) === C; ) {
      let N = "+";
      p.type === U && (n.shift(), N = p.value);
      const O = a();
      f = { left: f, right: O, operator: N }, p = o();
    }
    return f;
  }
}
const Te = [rr, tr, er];
function sr(e) {
  let n = Te, o = [];
  const s = [];
  for (const a of e) {
    const l = qe([...o, a], n);
    l.nodes !== void 0 && s.push(...l.nodes), o = l.tokens ?? [], n = l.candidates ?? Te;
  }
  return s;
}
const le = (e) => {
  if (e.length === 1) {
    const [n] = e;
    return { type: he, diameter: n };
  }
  if (e.length === 2) {
    const [n, o] = e;
    return { type: Ge, xSize: n, ySize: o };
  }
}, ar = {
  name: "done",
  rules: [
    G([t(P, "0"), t(P, "2")]),
    t(g)
  ],
  createNodes: (e) => [
    { type: ze, position: y(e) }
  ]
}, cr = {
  name: "comment",
  rules: [
    t(R, "4"),
    D([F(g)]),
    t(g)
  ],
  createNodes: (e) => [
    {
      type: ke,
      position: y(e),
      comment: Re(e.slice(1, -1))
    }
  ]
}, lr = {
  name: "format",
  rules: [
    t(w),
    t(ue),
    D([F(M, "X")]),
    t(M, "X"),
    t(C),
    t(M, "Y"),
    t(C),
    D([F(g)]),
    t(g),
    // Including units here is invalid syntax, but Cadence Allegro does it
    // https://github.com/tracespace/tracespace/issues/234
    k(0, 2, [t(ne), t(g)]),
    t(w)
  ],
  createNodes(e) {
    var N;
    let n, o, s;
    const a = z(e), l = e.findIndex((O) => O.type === g), f = e.find((O) => O.type === ne);
    for (const O of e.filter((T) => T.type === ue))
      O.value.includes("T") && (o = De), O.value.includes("L") && (o = Pe), O.value.includes("I") && (s = Et), O.value.includes("A") && (s = vt);
    if (a.x === a.y && ((N = a.x) == null ? void 0 : N.length) === 2) {
      const O = Number(a.x[0]), T = Number(a.x[1]);
      O > 0 && T > 0 && (n = [O, T]);
    }
    const p = [
      {
        type: $e,
        position: y(e.slice(1, l + 1)),
        zeroSuppression: o,
        format: n,
        mode: s
      }
    ];
    return f !== void 0 && p.push({
      type: ve,
      position: y(e.slice(1, -1), { head: f }),
      units: f.value === "MM" ? pe : de
    }), p;
  }
}, ur = {
  name: "units",
  rules: [
    t(w),
    t(ne),
    t(g),
    t(w)
  ],
  createNodes: (e) => [
    {
      type: ve,
      position: y(e.slice(1, -1)),
      units: e[1].value === "MM" ? pe : de
    }
  ]
}, fr = {
  name: "toolMacro",
  rules: [
    t(w),
    t(Ne),
    t(g),
    D([F(w)]),
    t(w)
  ],
  createNodes(e) {
    const n = e[1].value, o = y(e.slice(1, -1)), s = e.slice(3, -1);
    return [
      {
        type: Dt,
        position: o,
        children: sr(s),
        name: n
      }
    ];
  }
}, pr = {
  name: "toolDefinition",
  rules: [
    t(w),
    t(_e),
    D([
      t(Z),
      t(C),
      t(M, "X")
    ]),
    t(g),
    t(w)
  ],
  createNodes(e) {
    let n, o;
    const s = /(\d+)(.+)/.exec(e[1].value), [, a = "", l = ""] = s ?? [], f = e.slice(3, -2).filter((p) => p.type === C).map((p) => Number(p.value));
    switch (l) {
      case "C": {
        const [p, ...N] = f;
        n = { type: he, diameter: p }, o = le(N);
        break;
      }
      case "R":
      case "O": {
        const [p, N, ...O] = f;
        n = { type: l === "R" ? Ge : yt, xSize: p, ySize: N }, o = le(O);
        break;
      }
      case "P": {
        const [p, N, O, ...T] = f;
        n = { type: Rt, diameter: p, vertices: N, rotation: O }, o = le(T);
        break;
      }
      default:
        n = { type: Ot, name: l, variableValues: f };
    }
    return [
      {
        type: Ve,
        position: y(e.slice(1, -1)),
        code: a,
        shape: n,
        hole: o
      }
    ];
  }
}, dr = {
  name: "toolChange",
  rules: [
    j([t(R, "54")]),
    t(b),
    t(g)
  ],
  createNodes: (e) => e.filter(({ type: n }) => n === b).map(({ value: n }) => ({
    type: Ee,
    position: y(e),
    code: n
  }))
}, Xe = (e) => {
  const n = $t(e), o = z(e), s = se(e), a = y(e, {
    head: s === void 0 ? e[0] : e[1]
  }), l = [
    { type: ye, position: a, graphic: n, coordinates: o }
  ];
  if (s !== void 0) {
    const f = y(e, { head: e[0], length: 2 });
    l.unshift({ type: ee, position: f, mode: s });
  }
  return l;
}, hr = {
  name: "operation",
  rules: [
    j([
      t(R, "1"),
      t(R, "2"),
      t(R, "3")
    ]),
    k(2, 8, [t(M), t(C)]),
    j([
      t(b, "1"),
      t(b, "2"),
      t(b, "3")
    ]),
    t(g)
  ],
  createNodes: Xe
}, mr = {
  name: "operationWithoutCoords",
  rules: [
    j([
      t(R, "1"),
      t(R, "2"),
      t(R, "3")
    ]),
    G([
      t(b, "1"),
      t(b, "2"),
      t(b, "3")
    ]),
    t(g)
  ],
  createNodes: Xe
}, vr = {
  name: "interpolationMode",
  rules: [
    G([
      t(R, "1"),
      t(R, "2"),
      t(R, "3")
    ]),
    t(g)
  ],
  createNodes: (e) => [
    {
      type: ee,
      position: y(e),
      mode: se(e)
    }
  ]
}, Er = {
  name: "regionMode",
  rules: [
    G([t(R, "36"), t(R, "37")]),
    t(g)
  ],
  createNodes: (e) => [
    {
      type: qt,
      position: y(e),
      region: e[0].value === "36"
    }
  ]
}, yr = {
  name: "quadrantMode",
  rules: [
    G([t(R, "74"), t(R, "75")]),
    t(g)
  ],
  createNodes: (e) => [
    {
      type: Ht,
      position: y(e),
      quadrant: e[0].value === "74" ? _t : wt
    }
  ]
}, Rr = {
  name: "loadPolarity",
  rules: [
    t(w),
    t(we),
    t(g),
    t(w)
  ],
  createNodes: (e) => [
    {
      type: Gt,
      position: y(e.slice(1, -1)),
      polarity: e[1].value === "D" ? xt : It
    }
  ]
}, Or = {
  name: "stepRepeat",
  rules: [
    t(w),
    t(xe),
    D([t(M), t(C)]),
    t(g),
    t(w)
  ],
  createNodes(e) {
    const n = z(e), o = Object.fromEntries(
      Object.entries(n).map(([s, a]) => [
        s,
        Number(a)
      ])
    );
    return [
      {
        type: Bt,
        position: y(e.slice(1, -1)),
        stepRepeat: o
      }
    ];
  }
}, gr = {
  name: "unimplementedExtendedCommand",
  rules: [
    t(w),
    D([F(g)]),
    t(g),
    t(w)
  ],
  createNodes: (e) => [
    {
      type: Ut,
      position: y(e.slice(1, -1)),
      value: Re(e)
    }
  ]
}, Ye = [
  hr,
  mr,
  vr,
  dr,
  pr,
  fr,
  cr,
  Er,
  yr,
  Rr,
  Or,
  lr,
  ur,
  ar,
  gr
].map((e) => ({ ...e, filetype: be })), Tr = [...Ye, ...Ze];
function Ar(e, n) {
  const o = [];
  let s = p(), a = [], l, f = "";
  for (const [N, O] of e) {
    const T = qe([...a, N], s);
    T.nodes === void 0 ? f += N.text : (o.push(...T.nodes), l = O, f = ""), n = n ?? T.filetype, a = T.tokens ?? [], s = T.candidates ?? p();
  }
  return {
    filetype: n,
    unmatched: f,
    nodes: o,
    lexerState: l
  };
  function p() {
    return n === be ? Ye : n === oe ? Ze : Tr;
  }
}
function Mr() {
  const e = mt(), n = [];
  let o, s, a = "";
  const l = { lexer: e, feed: f, result: p };
  return l;
  function f(N) {
    const O = e.feed(`${a}${N}`, s), T = Ar(O, o);
    o = o ?? T.filetype, a = T.unmatched, s = T.lexerState ?? s;
    for (const I of T.nodes)
      n.push(I);
    return l;
  }
  function p() {
    if (o === void 0)
      throw new Error("File type not recognized");
    return { type: bt, filetype: o, children: n };
  }
}
function Pr(e) {
  return Mr().feed(e).result();
}
export {
  vt as ABSOLUTE,
  g as ASTERISK,
  ft as CATCHALL,
  Nt as CCW_ARC,
  he as CIRCLE,
  It as CLEAR,
  Z as COMMA,
  ke as COMMENT,
  $e as COORDINATE_FORMAT,
  M as COORD_CHAR,
  Ct as CW_ARC,
  xt as DARK,
  ze as DONE,
  oe as DRILL,
  Pt as DRILL_HEADER,
  Le as DRILL_UNITS,
  fe as DRILL_ZERO_INCLUSION,
  b as D_CODE,
  Ce as EQUALS,
  pt as ERROR,
  be as GERBER,
  ue as GERBER_FORMAT,
  we as GERBER_LOAD_POLARITY,
  J as GERBER_MACRO_VARIABLE,
  xe as GERBER_STEP_REPEAT,
  _e as GERBER_TOOL_DEF,
  Ne as GERBER_TOOL_MACRO,
  ne as GERBER_UNITS,
  ye as GRAPHIC,
  R as G_CODE,
  de as IN,
  Et as INCREMENTAL,
  ee as INTERPOLATE_MODE,
  Pe as LEADING,
  Mt as LINE,
  Gt as LOAD_POLARITY,
  wr as MACRO_CENTER_LINE,
  Cr as MACRO_CIRCLE,
  Ft as MACRO_COMMENT,
  xr as MACRO_LOWER_LEFT_LINE_DEPRECATED,
  Sr as MACRO_MOIRE_DEPRECATED,
  Ir as MACRO_OUTLINE,
  Lr as MACRO_POLYGON,
  zt as MACRO_PRIMITIVE,
  Ot as MACRO_SHAPE,
  br as MACRO_THERMAL,
  kt as MACRO_VARIABLE,
  _r as MACRO_VECTOR_LINE,
  Nr as MACRO_VECTOR_LINE_DEPRECATED,
  pe as MM,
  me as MOVE,
  wt as MULTI,
  P as M_CODE,
  S as NEWLINE,
  C as NUMBER,
  yt as OBROUND,
  U as OPERATOR,
  w as PERCENT,
  Rt as POLYGON,
  Ht as QUADRANT_MODE,
  Ge as RECTANGLE,
  qt as REGION_MODE,
  bt as ROOT,
  Tt as SEGMENT,
  Ie as SEMICOLON,
  gt as SHAPE,
  _t as SINGLE,
  At as SLOT,
  Bt as STEP_REPEAT,
  Ee as TOOL_CHANGE,
  Ve as TOOL_DEFINITION,
  Dt as TOOL_MACRO,
  De as TRAILING,
  Q as T_CODE,
  Ut as UNIMPLEMENTED,
  ve as UNITS,
  ut as WHITESPACE,
  lt as WORD,
  mt as createLexer,
  Mr as createParser,
  Pr as parse
};
//# sourceMappingURL=tracespace-parser.js.map
