const o = "_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", u = `-0123456789${o}`, s = new RegExp(`^[^${o}]|[^\\${u}]`, "g"), r = 12;
function R(n = r) {
  return n = Number.isFinite(n) && n > 0 ? n : r, i(1, o) + i(n - 1, u);
}
function f(n) {
  return n.replace(s, "_");
}
function A(n, t = r) {
  return typeof n == "string" ? f(n) : R(t);
}
function i(n, t) {
  const c = t.length;
  let e = "";
  for (; n > 0; )
    n--, e += t[Math.floor(Math.random() * c)];
  return e;
}
export {
  A as ensure,
  R as random,
  f as sanitize
};
//# sourceMappingURL=tracespace-xml-id.js.map
