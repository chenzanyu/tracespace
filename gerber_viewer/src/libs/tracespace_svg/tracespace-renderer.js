import { IMAGE_SHAPE as J, LAYERED_SHAPE as Q, BoundingBox as D, OUTLINE as nn, POLYGON as ln, RECTANGLE as en, CIRCLE as on, IMAGE_PATH as tn, positionsEqual as rn, LINE as an } from "./tracespace-plotter.js";
import { random as un } from "./tracespace-xml-id.js";
class M {
  /**
   * @constructor
   * @param {Properties} property
   * @param {Normal} normal
   * @param {string} [space]
   */
  constructor(l, t, o) {
    this.property = l, this.normal = t, o && (this.space = o);
  }
}
M.prototype.property = {};
M.prototype.normal = {};
M.prototype.space = null;
function H(n, l) {
  const t = {}, o = {};
  let a = -1;
  for (; ++a < n.length; )
    Object.assign(t, n[a].property), Object.assign(o, n[a].normal);
  return new M(t, o, l);
}
function P(n) {
  return n.toLowerCase();
}
class m {
  /**
   * @constructor
   * @param {string} property
   * @param {string} attribute
   */
  constructor(l, t) {
    this.property = l, this.attribute = t;
  }
}
m.prototype.space = null;
m.prototype.boolean = !1;
m.prototype.booleanish = !1;
m.prototype.overloadedBoolean = !1;
m.prototype.number = !1;
m.prototype.commaSeparated = !1;
m.prototype.spaceSeparated = !1;
m.prototype.commaOrSpaceSeparated = !1;
m.prototype.mustUseProperty = !1;
m.prototype.defined = !1;
let sn = 0;
const u = x(), d = x(), j = x(), e = x(), s = x(), C = x(), f = x();
function x() {
  return 2 ** ++sn;
}
const A = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  boolean: u,
  booleanish: d,
  commaOrSpaceSeparated: f,
  commaSeparated: C,
  number: e,
  overloadedBoolean: j,
  spaceSeparated: s
}, Symbol.toStringTag, { value: "Module" })), O = Object.keys(A);
class U extends m {
  /**
   * @constructor
   * @param {string} property
   * @param {string} attribute
   * @param {number|null} [mask]
   * @param {string} [space]
   */
  constructor(l, t, o, a) {
    let i = -1;
    if (super(l, t), I(this, "space", a), typeof o == "number")
      for (; ++i < O.length; ) {
        const r = O[i];
        I(this, O[i], (o & A[r]) === A[r]);
      }
  }
}
U.prototype.defined = !0;
function I(n, l, t) {
  t && (n[l] = t);
}
const cn = {}.hasOwnProperty;
function w(n) {
  const l = {}, t = {};
  let o;
  for (o in n.properties)
    if (cn.call(n.properties, o)) {
      const a = n.properties[o], i = new U(
        o,
        n.transform(n.attributes || {}, o),
        a,
        n.space
      );
      n.mustUseProperty && n.mustUseProperty.includes(o) && (i.mustUseProperty = !0), l[o] = i, t[P(o)] = o, t[P(i.attribute)] = o;
    }
  return new M(l, t, n.space);
}
const V = w({
  space: "xlink",
  transform(n, l) {
    return "xlink:" + l.slice(5).toLowerCase();
  },
  properties: {
    xLinkActuate: null,
    xLinkArcRole: null,
    xLinkHref: null,
    xLinkRole: null,
    xLinkShow: null,
    xLinkTitle: null,
    xLinkType: null
  }
}), _ = w({
  space: "xml",
  transform(n, l) {
    return "xml:" + l.slice(3).toLowerCase();
  },
  properties: { xmlLang: null, xmlBase: null, xmlSpace: null }
});
function G(n, l) {
  return l in n ? n[l] : l;
}
function W(n, l) {
  return G(n, l.toLowerCase());
}
const q = w({
  space: "xmlns",
  attributes: { xmlnsxlink: "xmlns:xlink" },
  transform: W,
  properties: { xmlns: null, xmlnsXLink: null }
}), K = w({
  transform(n, l) {
    return l === "role" ? l : "aria-" + l.slice(4).toLowerCase();
  },
  properties: {
    ariaActiveDescendant: null,
    ariaAtomic: d,
    ariaAutoComplete: null,
    ariaBusy: d,
    ariaChecked: d,
    ariaColCount: e,
    ariaColIndex: e,
    ariaColSpan: e,
    ariaControls: s,
    ariaCurrent: null,
    ariaDescribedBy: s,
    ariaDetails: null,
    ariaDisabled: d,
    ariaDropEffect: s,
    ariaErrorMessage: null,
    ariaExpanded: d,
    ariaFlowTo: s,
    ariaGrabbed: d,
    ariaHasPopup: null,
    ariaHidden: d,
    ariaInvalid: null,
    ariaKeyShortcuts: null,
    ariaLabel: null,
    ariaLabelledBy: s,
    ariaLevel: e,
    ariaLive: null,
    ariaModal: d,
    ariaMultiLine: d,
    ariaMultiSelectable: d,
    ariaOrientation: null,
    ariaOwns: s,
    ariaPlaceholder: null,
    ariaPosInSet: e,
    ariaPressed: d,
    ariaReadOnly: d,
    ariaRelevant: null,
    ariaRequired: d,
    ariaRoleDescription: s,
    ariaRowCount: e,
    ariaRowIndex: e,
    ariaRowSpan: e,
    ariaSelected: d,
    ariaSetSize: e,
    ariaSort: null,
    ariaValueMax: e,
    ariaValueMin: e,
    ariaValueNow: e,
    ariaValueText: null,
    role: null
  }
}), pn = w({
  space: "html",
  attributes: {
    acceptcharset: "accept-charset",
    classname: "class",
    htmlfor: "for",
    httpequiv: "http-equiv"
  },
  transform: W,
  mustUseProperty: ["checked", "multiple", "muted", "selected"],
  properties: {
    // Standard Properties.
    abbr: null,
    accept: C,
    acceptCharset: s,
    accessKey: s,
    action: null,
    allow: null,
    allowFullScreen: u,
    allowPaymentRequest: u,
    allowUserMedia: u,
    alt: null,
    as: null,
    async: u,
    autoCapitalize: null,
    autoComplete: s,
    autoFocus: u,
    autoPlay: u,
    blocking: s,
    capture: null,
    charSet: null,
    checked: u,
    cite: null,
    className: s,
    cols: e,
    colSpan: null,
    content: null,
    contentEditable: d,
    controls: u,
    controlsList: s,
    coords: e | C,
    crossOrigin: null,
    data: null,
    dateTime: null,
    decoding: null,
    default: u,
    defer: u,
    dir: null,
    dirName: null,
    disabled: u,
    download: j,
    draggable: d,
    encType: null,
    enterKeyHint: null,
    fetchPriority: null,
    form: null,
    formAction: null,
    formEncType: null,
    formMethod: null,
    formNoValidate: u,
    formTarget: null,
    headers: s,
    height: e,
    hidden: u,
    high: e,
    href: null,
    hrefLang: null,
    htmlFor: s,
    httpEquiv: s,
    id: null,
    imageSizes: null,
    imageSrcSet: null,
    inert: u,
    inputMode: null,
    integrity: null,
    is: null,
    isMap: u,
    itemId: null,
    itemProp: s,
    itemRef: s,
    itemScope: u,
    itemType: s,
    kind: null,
    label: null,
    lang: null,
    language: null,
    list: null,
    loading: null,
    loop: u,
    low: e,
    manifest: null,
    max: null,
    maxLength: e,
    media: null,
    method: null,
    min: null,
    minLength: e,
    multiple: u,
    muted: u,
    name: null,
    nonce: null,
    noModule: u,
    noValidate: u,
    onAbort: null,
    onAfterPrint: null,
    onAuxClick: null,
    onBeforeMatch: null,
    onBeforePrint: null,
    onBeforeToggle: null,
    onBeforeUnload: null,
    onBlur: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onContextLost: null,
    onContextMenu: null,
    onContextRestored: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFormData: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLanguageChange: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadEnd: null,
    onLoadStart: null,
    onMessage: null,
    onMessageError: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRejectionHandled: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onScrollEnd: null,
    onSecurityPolicyViolation: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onSlotChange: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnhandledRejection: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onWheel: null,
    open: u,
    optimum: e,
    pattern: null,
    ping: s,
    placeholder: null,
    playsInline: u,
    popover: null,
    popoverTarget: null,
    popoverTargetAction: null,
    poster: null,
    preload: null,
    readOnly: u,
    referrerPolicy: null,
    rel: s,
    required: u,
    reversed: u,
    rows: e,
    rowSpan: e,
    sandbox: s,
    scope: null,
    scoped: u,
    seamless: u,
    selected: u,
    shadowRootClonable: u,
    shadowRootDelegatesFocus: u,
    shadowRootMode: null,
    shape: null,
    size: e,
    sizes: null,
    slot: null,
    span: e,
    spellCheck: d,
    src: null,
    srcDoc: null,
    srcLang: null,
    srcSet: null,
    start: e,
    step: null,
    style: null,
    tabIndex: e,
    target: null,
    title: null,
    translate: null,
    type: null,
    typeMustMatch: u,
    useMap: null,
    value: d,
    width: e,
    wrap: null,
    writingSuggestions: null,
    // Legacy.
    // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
    align: null,
    // Several. Use CSS `text-align` instead,
    aLink: null,
    // `<body>`. Use CSS `a:active {color}` instead
    archive: s,
    // `<object>`. List of URIs to archives
    axis: null,
    // `<td>` and `<th>`. Use `scope` on `<th>`
    background: null,
    // `<body>`. Use CSS `background-image` instead
    bgColor: null,
    // `<body>` and table elements. Use CSS `background-color` instead
    border: e,
    // `<table>`. Use CSS `border-width` instead,
    borderColor: null,
    // `<table>`. Use CSS `border-color` instead,
    bottomMargin: e,
    // `<body>`
    cellPadding: null,
    // `<table>`
    cellSpacing: null,
    // `<table>`
    char: null,
    // Several table elements. When `align=char`, sets the character to align on
    charOff: null,
    // Several table elements. When `char`, offsets the alignment
    classId: null,
    // `<object>`
    clear: null,
    // `<br>`. Use CSS `clear` instead
    code: null,
    // `<object>`
    codeBase: null,
    // `<object>`
    codeType: null,
    // `<object>`
    color: null,
    // `<font>` and `<hr>`. Use CSS instead
    compact: u,
    // Lists. Use CSS to reduce space between items instead
    declare: u,
    // `<object>`
    event: null,
    // `<script>`
    face: null,
    // `<font>`. Use CSS instead
    frame: null,
    // `<table>`
    frameBorder: null,
    // `<iframe>`. Use CSS `border` instead
    hSpace: e,
    // `<img>` and `<object>`
    leftMargin: e,
    // `<body>`
    link: null,
    // `<body>`. Use CSS `a:link {color: *}` instead
    longDesc: null,
    // `<frame>`, `<iframe>`, and `<img>`. Use an `<a>`
    lowSrc: null,
    // `<img>`. Use a `<picture>`
    marginHeight: e,
    // `<body>`
    marginWidth: e,
    // `<body>`
    noResize: u,
    // `<frame>`
    noHref: u,
    // `<area>`. Use no href instead of an explicit `nohref`
    noShade: u,
    // `<hr>`. Use background-color and height instead of borders
    noWrap: u,
    // `<td>` and `<th>`
    object: null,
    // `<applet>`
    profile: null,
    // `<head>`
    prompt: null,
    // `<isindex>`
    rev: null,
    // `<link>`
    rightMargin: e,
    // `<body>`
    rules: null,
    // `<table>`
    scheme: null,
    // `<meta>`
    scrolling: d,
    // `<frame>`. Use overflow in the child context
    standby: null,
    // `<object>`
    summary: null,
    // `<table>`
    text: null,
    // `<body>`. Use CSS `color` instead
    topMargin: e,
    // `<body>`
    valueType: null,
    // `<param>`
    version: null,
    // `<html>`. Use a doctype.
    vAlign: null,
    // Several. Use CSS `vertical-align` instead
    vLink: null,
    // `<body>`. Use CSS `a:visited {color}` instead
    vSpace: e,
    // `<img>` and `<object>`
    // Non-standard Properties.
    allowTransparency: null,
    autoCorrect: null,
    autoSave: null,
    disablePictureInPicture: u,
    disableRemotePlayback: u,
    prefix: null,
    property: null,
    results: e,
    security: null,
    unselectable: null
  }
}), dn = w({
  space: "svg",
  attributes: {
    accentHeight: "accent-height",
    alignmentBaseline: "alignment-baseline",
    arabicForm: "arabic-form",
    baselineShift: "baseline-shift",
    capHeight: "cap-height",
    className: "class",
    clipPath: "clip-path",
    clipRule: "clip-rule",
    colorInterpolation: "color-interpolation",
    colorInterpolationFilters: "color-interpolation-filters",
    colorProfile: "color-profile",
    colorRendering: "color-rendering",
    crossOrigin: "crossorigin",
    dataType: "datatype",
    dominantBaseline: "dominant-baseline",
    enableBackground: "enable-background",
    fillOpacity: "fill-opacity",
    fillRule: "fill-rule",
    floodColor: "flood-color",
    floodOpacity: "flood-opacity",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontSizeAdjust: "font-size-adjust",
    fontStretch: "font-stretch",
    fontStyle: "font-style",
    fontVariant: "font-variant",
    fontWeight: "font-weight",
    glyphName: "glyph-name",
    glyphOrientationHorizontal: "glyph-orientation-horizontal",
    glyphOrientationVertical: "glyph-orientation-vertical",
    hrefLang: "hreflang",
    horizAdvX: "horiz-adv-x",
    horizOriginX: "horiz-origin-x",
    horizOriginY: "horiz-origin-y",
    imageRendering: "image-rendering",
    letterSpacing: "letter-spacing",
    lightingColor: "lighting-color",
    markerEnd: "marker-end",
    markerMid: "marker-mid",
    markerStart: "marker-start",
    navDown: "nav-down",
    navDownLeft: "nav-down-left",
    navDownRight: "nav-down-right",
    navLeft: "nav-left",
    navNext: "nav-next",
    navPrev: "nav-prev",
    navRight: "nav-right",
    navUp: "nav-up",
    navUpLeft: "nav-up-left",
    navUpRight: "nav-up-right",
    onAbort: "onabort",
    onActivate: "onactivate",
    onAfterPrint: "onafterprint",
    onBeforePrint: "onbeforeprint",
    onBegin: "onbegin",
    onCancel: "oncancel",
    onCanPlay: "oncanplay",
    onCanPlayThrough: "oncanplaythrough",
    onChange: "onchange",
    onClick: "onclick",
    onClose: "onclose",
    onCopy: "oncopy",
    onCueChange: "oncuechange",
    onCut: "oncut",
    onDblClick: "ondblclick",
    onDrag: "ondrag",
    onDragEnd: "ondragend",
    onDragEnter: "ondragenter",
    onDragExit: "ondragexit",
    onDragLeave: "ondragleave",
    onDragOver: "ondragover",
    onDragStart: "ondragstart",
    onDrop: "ondrop",
    onDurationChange: "ondurationchange",
    onEmptied: "onemptied",
    onEnd: "onend",
    onEnded: "onended",
    onError: "onerror",
    onFocus: "onfocus",
    onFocusIn: "onfocusin",
    onFocusOut: "onfocusout",
    onHashChange: "onhashchange",
    onInput: "oninput",
    onInvalid: "oninvalid",
    onKeyDown: "onkeydown",
    onKeyPress: "onkeypress",
    onKeyUp: "onkeyup",
    onLoad: "onload",
    onLoadedData: "onloadeddata",
    onLoadedMetadata: "onloadedmetadata",
    onLoadStart: "onloadstart",
    onMessage: "onmessage",
    onMouseDown: "onmousedown",
    onMouseEnter: "onmouseenter",
    onMouseLeave: "onmouseleave",
    onMouseMove: "onmousemove",
    onMouseOut: "onmouseout",
    onMouseOver: "onmouseover",
    onMouseUp: "onmouseup",
    onMouseWheel: "onmousewheel",
    onOffline: "onoffline",
    onOnline: "ononline",
    onPageHide: "onpagehide",
    onPageShow: "onpageshow",
    onPaste: "onpaste",
    onPause: "onpause",
    onPlay: "onplay",
    onPlaying: "onplaying",
    onPopState: "onpopstate",
    onProgress: "onprogress",
    onRateChange: "onratechange",
    onRepeat: "onrepeat",
    onReset: "onreset",
    onResize: "onresize",
    onScroll: "onscroll",
    onSeeked: "onseeked",
    onSeeking: "onseeking",
    onSelect: "onselect",
    onShow: "onshow",
    onStalled: "onstalled",
    onStorage: "onstorage",
    onSubmit: "onsubmit",
    onSuspend: "onsuspend",
    onTimeUpdate: "ontimeupdate",
    onToggle: "ontoggle",
    onUnload: "onunload",
    onVolumeChange: "onvolumechange",
    onWaiting: "onwaiting",
    onZoom: "onzoom",
    overlinePosition: "overline-position",
    overlineThickness: "overline-thickness",
    paintOrder: "paint-order",
    panose1: "panose-1",
    pointerEvents: "pointer-events",
    referrerPolicy: "referrerpolicy",
    renderingIntent: "rendering-intent",
    shapeRendering: "shape-rendering",
    stopColor: "stop-color",
    stopOpacity: "stop-opacity",
    strikethroughPosition: "strikethrough-position",
    strikethroughThickness: "strikethrough-thickness",
    strokeDashArray: "stroke-dasharray",
    strokeDashOffset: "stroke-dashoffset",
    strokeLineCap: "stroke-linecap",
    strokeLineJoin: "stroke-linejoin",
    strokeMiterLimit: "stroke-miterlimit",
    strokeOpacity: "stroke-opacity",
    strokeWidth: "stroke-width",
    tabIndex: "tabindex",
    textAnchor: "text-anchor",
    textDecoration: "text-decoration",
    textRendering: "text-rendering",
    transformOrigin: "transform-origin",
    typeOf: "typeof",
    underlinePosition: "underline-position",
    underlineThickness: "underline-thickness",
    unicodeBidi: "unicode-bidi",
    unicodeRange: "unicode-range",
    unitsPerEm: "units-per-em",
    vAlphabetic: "v-alphabetic",
    vHanging: "v-hanging",
    vIdeographic: "v-ideographic",
    vMathematical: "v-mathematical",
    vectorEffect: "vector-effect",
    vertAdvY: "vert-adv-y",
    vertOriginX: "vert-origin-x",
    vertOriginY: "vert-origin-y",
    wordSpacing: "word-spacing",
    writingMode: "writing-mode",
    xHeight: "x-height",
    // These were camelcased in Tiny. Now lowercased in SVG 2
    playbackOrder: "playbackorder",
    timelineBegin: "timelinebegin"
  },
  transform: G,
  properties: {
    about: f,
    accentHeight: e,
    accumulate: null,
    additive: null,
    alignmentBaseline: null,
    alphabetic: e,
    amplitude: e,
    arabicForm: null,
    ascent: e,
    attributeName: null,
    attributeType: null,
    azimuth: e,
    bandwidth: null,
    baselineShift: null,
    baseFrequency: null,
    baseProfile: null,
    bbox: null,
    begin: null,
    bias: e,
    by: null,
    calcMode: null,
    capHeight: e,
    className: s,
    clip: null,
    clipPath: null,
    clipPathUnits: null,
    clipRule: null,
    color: null,
    colorInterpolation: null,
    colorInterpolationFilters: null,
    colorProfile: null,
    colorRendering: null,
    content: null,
    contentScriptType: null,
    contentStyleType: null,
    crossOrigin: null,
    cursor: null,
    cx: null,
    cy: null,
    d: null,
    dataType: null,
    defaultAction: null,
    descent: e,
    diffuseConstant: e,
    direction: null,
    display: null,
    dur: null,
    divisor: e,
    dominantBaseline: null,
    download: u,
    dx: null,
    dy: null,
    edgeMode: null,
    editable: null,
    elevation: e,
    enableBackground: null,
    end: null,
    event: null,
    exponent: e,
    externalResourcesRequired: null,
    fill: null,
    fillOpacity: e,
    fillRule: null,
    filter: null,
    filterRes: null,
    filterUnits: null,
    floodColor: null,
    floodOpacity: null,
    focusable: null,
    focusHighlight: null,
    fontFamily: null,
    fontSize: null,
    fontSizeAdjust: null,
    fontStretch: null,
    fontStyle: null,
    fontVariant: null,
    fontWeight: null,
    format: null,
    fr: null,
    from: null,
    fx: null,
    fy: null,
    g1: C,
    g2: C,
    glyphName: C,
    glyphOrientationHorizontal: null,
    glyphOrientationVertical: null,
    glyphRef: null,
    gradientTransform: null,
    gradientUnits: null,
    handler: null,
    hanging: e,
    hatchContentUnits: null,
    hatchUnits: null,
    height: null,
    href: null,
    hrefLang: null,
    horizAdvX: e,
    horizOriginX: e,
    horizOriginY: e,
    id: null,
    ideographic: e,
    imageRendering: null,
    initialVisibility: null,
    in: null,
    in2: null,
    intercept: e,
    k: e,
    k1: e,
    k2: e,
    k3: e,
    k4: e,
    kernelMatrix: f,
    kernelUnitLength: null,
    keyPoints: null,
    // SEMI_COLON_SEPARATED
    keySplines: null,
    // SEMI_COLON_SEPARATED
    keyTimes: null,
    // SEMI_COLON_SEPARATED
    kerning: null,
    lang: null,
    lengthAdjust: null,
    letterSpacing: null,
    lightingColor: null,
    limitingConeAngle: e,
    local: null,
    markerEnd: null,
    markerMid: null,
    markerStart: null,
    markerHeight: null,
    markerUnits: null,
    markerWidth: null,
    mask: null,
    maskContentUnits: null,
    maskUnits: null,
    mathematical: null,
    max: null,
    media: null,
    mediaCharacterEncoding: null,
    mediaContentEncodings: null,
    mediaSize: e,
    mediaTime: null,
    method: null,
    min: null,
    mode: null,
    name: null,
    navDown: null,
    navDownLeft: null,
    navDownRight: null,
    navLeft: null,
    navNext: null,
    navPrev: null,
    navRight: null,
    navUp: null,
    navUpLeft: null,
    navUpRight: null,
    numOctaves: null,
    observer: null,
    offset: null,
    onAbort: null,
    onActivate: null,
    onAfterPrint: null,
    onBeforePrint: null,
    onBegin: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnd: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFocusIn: null,
    onFocusOut: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadStart: null,
    onMessage: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onMouseWheel: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRepeat: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onShow: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onZoom: null,
    opacity: null,
    operator: null,
    order: null,
    orient: null,
    orientation: null,
    origin: null,
    overflow: null,
    overlay: null,
    overlinePosition: e,
    overlineThickness: e,
    paintOrder: null,
    panose1: null,
    path: null,
    pathLength: e,
    patternContentUnits: null,
    patternTransform: null,
    patternUnits: null,
    phase: null,
    ping: s,
    pitch: null,
    playbackOrder: null,
    pointerEvents: null,
    points: null,
    pointsAtX: e,
    pointsAtY: e,
    pointsAtZ: e,
    preserveAlpha: null,
    preserveAspectRatio: null,
    primitiveUnits: null,
    propagate: null,
    property: f,
    r: null,
    radius: null,
    referrerPolicy: null,
    refX: null,
    refY: null,
    rel: f,
    rev: f,
    renderingIntent: null,
    repeatCount: null,
    repeatDur: null,
    requiredExtensions: f,
    requiredFeatures: f,
    requiredFonts: f,
    requiredFormats: f,
    resource: null,
    restart: null,
    result: null,
    rotate: null,
    rx: null,
    ry: null,
    scale: null,
    seed: null,
    shapeRendering: null,
    side: null,
    slope: null,
    snapshotTime: null,
    specularConstant: e,
    specularExponent: e,
    spreadMethod: null,
    spacing: null,
    startOffset: null,
    stdDeviation: null,
    stemh: null,
    stemv: null,
    stitchTiles: null,
    stopColor: null,
    stopOpacity: null,
    strikethroughPosition: e,
    strikethroughThickness: e,
    string: null,
    stroke: null,
    strokeDashArray: f,
    strokeDashOffset: null,
    strokeLineCap: null,
    strokeLineJoin: null,
    strokeMiterLimit: e,
    strokeOpacity: e,
    strokeWidth: null,
    style: null,
    surfaceScale: e,
    syncBehavior: null,
    syncBehaviorDefault: null,
    syncMaster: null,
    syncTolerance: null,
    syncToleranceDefault: null,
    systemLanguage: f,
    tabIndex: e,
    tableValues: null,
    target: null,
    targetX: e,
    targetY: e,
    textAnchor: null,
    textDecoration: null,
    textRendering: null,
    textLength: null,
    timelineBegin: null,
    title: null,
    transformBehavior: null,
    type: null,
    typeOf: f,
    to: null,
    transform: null,
    transformOrigin: null,
    u1: null,
    u2: null,
    underlinePosition: e,
    underlineThickness: e,
    unicode: null,
    unicodeBidi: null,
    unicodeRange: null,
    unitsPerEm: e,
    values: null,
    vAlphabetic: e,
    vMathematical: e,
    vectorEffect: null,
    vHanging: e,
    vIdeographic: e,
    version: null,
    vertAdvY: e,
    vertOriginX: e,
    vertOriginY: e,
    viewBox: null,
    viewTarget: null,
    visibility: null,
    width: null,
    widths: null,
    wordSpacing: null,
    writingMode: null,
    x: null,
    x1: null,
    x2: null,
    xChannelSelector: null,
    xHeight: e,
    y: null,
    y1: null,
    y2: null,
    yChannelSelector: null,
    z: null,
    zoomAndPan: null
  }
}), gn = /^data[-\w.:]+$/i, N = /-[a-z]/g, hn = /[A-Z]/g;
function fn(n, l) {
  const t = P(l);
  let o = l, a = m;
  if (t in n.normal)
    return n.property[n.normal[t]];
  if (t.length > 4 && t.slice(0, 4) === "data" && gn.test(l)) {
    if (l.charAt(4) === "-") {
      const i = l.slice(5).replace(N, yn);
      o = "data" + i.charAt(0).toUpperCase() + i.slice(1);
    } else {
      const i = l.slice(4);
      if (!N.test(i)) {
        let r = i.replace(hn, mn);
        r.charAt(0) !== "-" && (r = "-" + r), l = "data" + r;
      }
    }
    a = U;
  }
  return new a(o, l);
}
function mn(n) {
  return "-" + n.toLowerCase();
}
function yn(n) {
  return n.charAt(1).toUpperCase();
}
H([_, V, q, K, pn], "html");
const kn = H([_, V, q, K, dn], "svg"), B = /[#.]/g;
function Sn(n, l) {
  const t = n || "", o = {};
  let a = 0, i, r;
  for (; a < t.length; ) {
    B.lastIndex = a;
    const p = B.exec(t), h = t.slice(a, p ? p.index : t.length);
    h && (i ? i === "#" ? o.id = h : Array.isArray(o.className) ? o.className.push(h) : o.className = [h] : r = h, a += h.length), p && (i = p[0], a++);
  }
  return {
    type: "element",
    // @ts-expect-error: fine.
    tagName: r || l || "div",
    properties: o,
    children: []
  };
}
function z(n) {
  const l = String(n || "").trim();
  return l ? l.split(/[ \t\n\r\f]+/g) : [];
}
function F(n) {
  const l = [], t = String(n || "");
  let o = t.indexOf(","), a = 0, i = !1;
  for (; !i; ) {
    o === -1 && (o = t.length, i = !0);
    const r = t.slice(a, o).trim();
    (r || !i) && l.push(r), a = o + 1, o = t.indexOf(",", a);
  }
  return l;
}
const bn = /* @__PURE__ */ new Set(["menu", "submit", "reset", "button"]), E = {}.hasOwnProperty;
function xn(n, l, t) {
  const o = t && Pn(t);
  return (
    /**
     * @type {{
     *   (): Root
     *   (selector: null | undefined, ...children: Array<HChild>): Root
     *   (selector: string, properties?: HProperties, ...children: Array<HChild>): Element
     *   (selector: string, ...children: Array<HChild>): Element
     * }}
     */
    /**
     * Hyperscript compatible DSL for creating virtual hast trees.
     *
     * @param {string | null} [selector]
     * @param {HProperties | HChild} [properties]
     * @param {Array<HChild>} children
     * @returns {HResult}
     */
    function(i, r, ...p) {
      let h = -1, c;
      if (i == null)
        c = { type: "root", children: [] }, p.unshift(r);
      else if (c = Sn(i, l), c.tagName = c.tagName.toLowerCase(), o && E.call(o, c.tagName) && (c.tagName = o[c.tagName]), vn(r, c.tagName)) {
        let y;
        for (y in r)
          E.call(r, y) && Cn(n, c.properties, y, r[y]);
      } else
        p.unshift(r);
      for (; ++h < p.length; )
        R(c.children, p[h]);
      return c.type === "element" && c.tagName === "template" && (c.content = { type: "root", children: c.children }, c.children = []), c;
    }
  );
}
function vn(n, l) {
  return n == null || typeof n != "object" || Array.isArray(n) ? !1 : l === "input" || !n.type || typeof n.type != "string" ? !0 : "children" in n && Array.isArray(n.children) ? !1 : l === "button" ? bn.has(n.type.toLowerCase()) : !("value" in n);
}
function Cn(n, l, t, o) {
  const a = fn(n, t);
  let i = -1, r;
  if (o != null) {
    if (typeof o == "number") {
      if (Number.isNaN(o))
        return;
      r = o;
    } else
      typeof o == "boolean" ? r = o : typeof o == "string" ? a.spaceSeparated ? r = z(o) : a.commaSeparated ? r = F(o) : a.commaOrSpaceSeparated ? r = z(F(o).join(" ")) : r = $(a, a.property, o) : Array.isArray(o) ? r = o.concat() : r = a.property === "style" ? wn(o) : String(o);
    if (Array.isArray(r)) {
      const p = [];
      for (; ++i < r.length; )
        p[i] = $(a, a.property, r[i]);
      r = p;
    }
    a.property === "className" && Array.isArray(l.className) && (r = l.className.concat(r)), l[a.property] = r;
  }
}
function R(n, l) {
  let t = -1;
  if (l != null)
    if (typeof l == "string" || typeof l == "number")
      n.push({ type: "text", value: String(l) });
    else if (Array.isArray(l))
      for (; ++t < l.length; )
        R(n, l[t]);
    else if (typeof l == "object" && "type" in l)
      l.type === "root" ? R(n, l.children) : n.push(l);
    else
      throw new Error("Expected node, nodes, or string, got `" + l + "`");
}
function $(n, l, t) {
  if (typeof t == "string") {
    if (n.number && t && !Number.isNaN(Number(t)))
      return Number(t);
    if ((n.boolean || n.overloadedBoolean) && (t === "" || P(t) === P(l)))
      return !0;
  }
  return t;
}
function wn(n) {
  const l = [];
  let t;
  for (t in n)
    E.call(n, t) && l.push([t, n[t]].join(": "));
  return l.join("; ");
}
function Pn(n) {
  const l = {};
  let t = -1;
  for (; ++t < n.length; )
    l[n[t].toLowerCase()] = n[t];
  return l;
}
const Mn = [
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "clipPath",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "glyphRef",
  "linearGradient",
  "radialGradient",
  "solidColor",
  "textArea",
  "textPath"
], g = xn(kn, "g", Mn);
function Y(n) {
  return n.type === J ? Ln(n) : On(n);
}
function Ln(n) {
  const { shape: l } = n;
  return T(l);
}
function T(n) {
  switch (n.type) {
    case on: {
      const { cx: l, cy: t, r: o } = n;
      return g("circle", { cx: l, cy: -t, r: o });
    }
    case en: {
      const { x: l, y: t, xSize: o, ySize: a, r: i } = n;
      return g("rect", {
        x: l,
        y: -t - a,
        width: o,
        height: a,
        rx: i,
        ry: i
      });
    }
    case ln: {
      const l = n.points.map(([t, o]) => `${t},${-o}`).join(" ");
      return g("polygon", { points: l });
    }
    case nn:
      return g("path", { d: X(n.segments) });
    case Q: {
      const l = D.fromShape(n), t = un(), o = [];
      let a = [];
      for (const [i, r] of n.shapes.entries())
        if (r.erase === !0 && !D.isEmpty(l)) {
          const p = `${t}__m${i}`, [h, c, y, v] = l, [k, S, b, L] = [h, c, y - h, v - c];
          o.push(
            g("mask", { id: p, maskUnits: "userSpaceOnUse" }, [
              // Invert Y for user-space rectangle to match shape mapping
              g("rect", { x: k, y: -S - L, width: b, height: L, fill: "#fff" }),
              g("g", { color: "#000" }, [T(r)])
            ])
          ), a = [g("g", { mask: `url(#${p})` }, a)];
        } else
          a.push(T(r));
      return o.length > 0 && a.unshift(g("defs", o)), a.length === 1 ? a[0] : g("g", a);
    }
    default:
      return g("g");
  }
}
function On(n) {
  const l = X(n.segments), t = n.type === tn ? { strokeWidth: n.width, fill: "none" } : {};
  return g("path", { ...t, d: l });
}
function X(n) {
  const l = [];
  for (const [t, o] of n.entries()) {
    const a = t > 0 ? n[t - 1] : void 0, { start: i, end: r } = o;
    if ((a === void 0 || !rn(a.end, i)) && l.push(`M${i[0]} ${-i[1]}`), o.type === an)
      l.push(`L${r[0]} ${-r[1]}`);
    else {
      const { start: p, end: h } = o, c = h[2] - p[2], y = Math.abs(c), { center: v, radius: k } = o, S = c < 0 ? "1" : "0";
      let b = y <= Math.PI ? "0" : "1";
      if (y === 2 * Math.PI) {
        const [L, Z] = [2 * v[0] - r[0], -(2 * v[1] - r[1])];
        b = "0", l.push(`A${k} ${k} 0 0 ${S} ${L} ${Z}`);
      }
      l.push(
        `A${k} ${k} 0 ${b} ${S} ${r[0]} ${-r[1]}`
      );
    }
  }
  return l.join("");
}
const Dn = {
  version: "1.1",
  xmlns: "http://www.w3.org/2000/svg",
  "xmlns:xlink": "http://www.w3.org/1999/xlink"
}, An = {
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "0",
  "fill-rule": "evenodd",
  "clip-rule": "evenodd",
  fill: "currentColor",
  stroke: "currentColor"
};
function Un(n, l) {
  const { units: t, size: o, children: a } = n;
  l = l ?? En(o);
  const i = [], r = [];
  let p = [];
  const [h, c, y, v] = l;
  for (const k of a) {
    const S = Y(k);
    if (k.erase === !0) {
      const b = `erase-${Math.random().toString(36).slice(2)}`;
      r.push(
        g("mask", { id: b }, [
          g("rect", { x: h, y: c, width: y, height: v, fill: "#fff" }),
          g("g", { color: "#000" }, [S])
        ])
      ), p = [g("g", { mask: `url(#${b})` }, p)];
    } else
      p.push(S);
  }
  return r.length > 0 && i.push(g("defs", r)), i.push(...p), g(
    "svg",
    {
      ...Dn,
      ...An,
      viewBox: l.join(" "),
      width: `${l[2]}${t}`,
      height: `${l[3]}${t}`
    },
    i
  );
}
function In(n) {
  return g("g", {}, n.children.map(Y));
}
function En(n) {
  return D.isEmpty(n) ? [0, 0, 0, 0] : [n[0], -n[3], n[2] - n[0], n[3] - n[1]];
}
export {
  An as BASE_IMAGE_PROPS,
  Dn as BASE_SVG_PROPS,
  Un as render,
  In as renderFragment,
  Y as renderGraphic,
  En as sizeToViewBox
};
//# sourceMappingURL=tracespace-renderer.js.map
