import * as Fe from "./tracespace-parser.js";
import { GERBER as un, DRILL as cn, UNITS as le, COORDINATE_FORMAT as Z } from "./tracespace-parser.js";
import * as ie from "./tracespace-plotter.js";
import { LINE as $, IMAGE_REGION as me, IMAGE_PATH as se, BoundingBox as B } from "./tracespace-plotter.js";
import * as j from "./tracespace-renderer.js";
import { sizeToViewBox as pn, renderGraphic as dn } from "./tracespace-renderer.js";
import { random as fe } from "./tracespace-xml-id.js";
import { identifyLayers as gn, TYPE_DRILL as ze, SIDE_ALL as mn, TYPE_OUTLINE as fn, TYPE_COPPER as hn, TYPE_SOLDERMASK as yn, TYPE_SILKSCREEN as bn, TYPE_SOLDERPASTE as Sn, SIDE_TOP as he, SIDE_BOTTOM as ee } from "./tracespace-identify-layers.js";
class V {
  /**
   * @constructor
   * @param {Properties} property
   * @param {Normal} normal
   * @param {string} [space]
   */
  constructor(t, l, e) {
    this.property = t, this.normal = l, e && (this.space = e);
  }
}
V.prototype.property = {};
V.prototype.normal = {};
V.prototype.space = null;
function _e(n, t) {
  const l = {}, e = {};
  let o = -1;
  for (; ++o < n.length; )
    Object.assign(l, n[o].property), Object.assign(e, n[o].normal);
  return new V(l, e, t);
}
function G(n) {
  return n.toLowerCase();
}
class N {
  /**
   * @constructor
   * @param {string} property
   * @param {string} attribute
   */
  constructor(t, l) {
    this.property = t, this.attribute = l;
  }
}
N.prototype.space = null;
N.prototype.boolean = !1;
N.prototype.booleanish = !1;
N.prototype.overloadedBoolean = !1;
N.prototype.number = !1;
N.prototype.commaSeparated = !1;
N.prototype.spaceSeparated = !1;
N.prototype.commaOrSpaceSeparated = !1;
N.prototype.mustUseProperty = !1;
N.prototype.defined = !1;
let xn = 0;
const g = T(), v = T(), je = T(), i = T(), h = T(), z = T(), O = T();
function T() {
  return 2 ** ++xn;
}
const ue = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  boolean: g,
  booleanish: v,
  commaOrSpaceSeparated: O,
  commaSeparated: z,
  number: i,
  overloadedBoolean: je,
  spaceSeparated: h
}, Symbol.toStringTag, { value: "Module" })), oe = Object.keys(ue);
class ye extends N {
  /**
   * @constructor
   * @param {string} property
   * @param {string} attribute
   * @param {number|null} [mask]
   * @param {string} [space]
   */
  constructor(t, l, e, o) {
    let a = -1;
    if (super(t, l), Pe(this, "space", o), typeof e == "number")
      for (; ++a < oe.length; ) {
        const r = oe[a];
        Pe(this, oe[a], (e & ue[r]) === ue[r]);
      }
  }
}
ye.prototype.defined = !0;
function Pe(n, t, l) {
  l && (n[t] = l);
}
const vn = {}.hasOwnProperty;
function q(n) {
  const t = {}, l = {};
  let e;
  for (e in n.properties)
    if (vn.call(n.properties, e)) {
      const o = n.properties[e], a = new ye(
        e,
        n.transform(n.attributes || {}, e),
        o,
        n.space
      );
      n.mustUseProperty && n.mustUseProperty.includes(e) && (a.mustUseProperty = !0), t[e] = a, l[G(e)] = e, l[G(a.attribute)] = e;
    }
  return new V(t, l, n.space);
}
const qe = q({
  space: "xlink",
  transform(n, t) {
    return "xlink:" + t.slice(5).toLowerCase();
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
}), He = q({
  space: "xml",
  transform(n, t) {
    return "xml:" + t.slice(3).toLowerCase();
  },
  properties: { xmlLang: null, xmlBase: null, xmlSpace: null }
});
function $e(n, t) {
  return t in n ? n[t] : t;
}
function Ge(n, t) {
  return $e(n, t.toLowerCase());
}
const Ye = q({
  space: "xmlns",
  attributes: { xmlnsxlink: "xmlns:xlink" },
  transform: Ge,
  properties: { xmlns: null, xmlnsXLink: null }
}), Ve = q({
  transform(n, t) {
    return t === "role" ? t : "aria-" + t.slice(4).toLowerCase();
  },
  properties: {
    ariaActiveDescendant: null,
    ariaAtomic: v,
    ariaAutoComplete: null,
    ariaBusy: v,
    ariaChecked: v,
    ariaColCount: i,
    ariaColIndex: i,
    ariaColSpan: i,
    ariaControls: h,
    ariaCurrent: null,
    ariaDescribedBy: h,
    ariaDetails: null,
    ariaDisabled: v,
    ariaDropEffect: h,
    ariaErrorMessage: null,
    ariaExpanded: v,
    ariaFlowTo: h,
    ariaGrabbed: v,
    ariaHasPopup: null,
    ariaHidden: v,
    ariaInvalid: null,
    ariaKeyShortcuts: null,
    ariaLabel: null,
    ariaLabelledBy: h,
    ariaLevel: i,
    ariaLive: null,
    ariaModal: v,
    ariaMultiLine: v,
    ariaMultiSelectable: v,
    ariaOrientation: null,
    ariaOwns: h,
    ariaPlaceholder: null,
    ariaPosInSet: i,
    ariaPressed: v,
    ariaReadOnly: v,
    ariaRelevant: null,
    ariaRequired: v,
    ariaRoleDescription: h,
    ariaRowCount: i,
    ariaRowIndex: i,
    ariaRowSpan: i,
    ariaSelected: v,
    ariaSetSize: i,
    ariaSort: null,
    ariaValueMax: i,
    ariaValueMin: i,
    ariaValueNow: i,
    ariaValueText: null,
    role: null
  }
}), wn = q({
  space: "html",
  attributes: {
    acceptcharset: "accept-charset",
    classname: "class",
    htmlfor: "for",
    httpequiv: "http-equiv"
  },
  transform: Ge,
  mustUseProperty: ["checked", "multiple", "muted", "selected"],
  properties: {
    // Standard Properties.
    abbr: null,
    accept: z,
    acceptCharset: h,
    accessKey: h,
    action: null,
    allow: null,
    allowFullScreen: g,
    allowPaymentRequest: g,
    allowUserMedia: g,
    alt: null,
    as: null,
    async: g,
    autoCapitalize: null,
    autoComplete: h,
    autoFocus: g,
    autoPlay: g,
    blocking: h,
    capture: null,
    charSet: null,
    checked: g,
    cite: null,
    className: h,
    cols: i,
    colSpan: null,
    content: null,
    contentEditable: v,
    controls: g,
    controlsList: h,
    coords: i | z,
    crossOrigin: null,
    data: null,
    dateTime: null,
    decoding: null,
    default: g,
    defer: g,
    dir: null,
    dirName: null,
    disabled: g,
    download: je,
    draggable: v,
    encType: null,
    enterKeyHint: null,
    fetchPriority: null,
    form: null,
    formAction: null,
    formEncType: null,
    formMethod: null,
    formNoValidate: g,
    formTarget: null,
    headers: h,
    height: i,
    hidden: g,
    high: i,
    href: null,
    hrefLang: null,
    htmlFor: h,
    httpEquiv: h,
    id: null,
    imageSizes: null,
    imageSrcSet: null,
    inert: g,
    inputMode: null,
    integrity: null,
    is: null,
    isMap: g,
    itemId: null,
    itemProp: h,
    itemRef: h,
    itemScope: g,
    itemType: h,
    kind: null,
    label: null,
    lang: null,
    language: null,
    list: null,
    loading: null,
    loop: g,
    low: i,
    manifest: null,
    max: null,
    maxLength: i,
    media: null,
    method: null,
    min: null,
    minLength: i,
    multiple: g,
    muted: g,
    name: null,
    nonce: null,
    noModule: g,
    noValidate: g,
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
    open: g,
    optimum: i,
    pattern: null,
    ping: h,
    placeholder: null,
    playsInline: g,
    popover: null,
    popoverTarget: null,
    popoverTargetAction: null,
    poster: null,
    preload: null,
    readOnly: g,
    referrerPolicy: null,
    rel: h,
    required: g,
    reversed: g,
    rows: i,
    rowSpan: i,
    sandbox: h,
    scope: null,
    scoped: g,
    seamless: g,
    selected: g,
    shadowRootClonable: g,
    shadowRootDelegatesFocus: g,
    shadowRootMode: null,
    shape: null,
    size: i,
    sizes: null,
    slot: null,
    span: i,
    spellCheck: v,
    src: null,
    srcDoc: null,
    srcLang: null,
    srcSet: null,
    start: i,
    step: null,
    style: null,
    tabIndex: i,
    target: null,
    title: null,
    translate: null,
    type: null,
    typeMustMatch: g,
    useMap: null,
    value: v,
    width: i,
    wrap: null,
    writingSuggestions: null,
    // Legacy.
    // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
    align: null,
    // Several. Use CSS `text-align` instead,
    aLink: null,
    // `<body>`. Use CSS `a:active {color}` instead
    archive: h,
    // `<object>`. List of URIs to archives
    axis: null,
    // `<td>` and `<th>`. Use `scope` on `<th>`
    background: null,
    // `<body>`. Use CSS `background-image` instead
    bgColor: null,
    // `<body>` and table elements. Use CSS `background-color` instead
    border: i,
    // `<table>`. Use CSS `border-width` instead,
    borderColor: null,
    // `<table>`. Use CSS `border-color` instead,
    bottomMargin: i,
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
    compact: g,
    // Lists. Use CSS to reduce space between items instead
    declare: g,
    // `<object>`
    event: null,
    // `<script>`
    face: null,
    // `<font>`. Use CSS instead
    frame: null,
    // `<table>`
    frameBorder: null,
    // `<iframe>`. Use CSS `border` instead
    hSpace: i,
    // `<img>` and `<object>`
    leftMargin: i,
    // `<body>`
    link: null,
    // `<body>`. Use CSS `a:link {color: *}` instead
    longDesc: null,
    // `<frame>`, `<iframe>`, and `<img>`. Use an `<a>`
    lowSrc: null,
    // `<img>`. Use a `<picture>`
    marginHeight: i,
    // `<body>`
    marginWidth: i,
    // `<body>`
    noResize: g,
    // `<frame>`
    noHref: g,
    // `<area>`. Use no href instead of an explicit `nohref`
    noShade: g,
    // `<hr>`. Use background-color and height instead of borders
    noWrap: g,
    // `<td>` and `<th>`
    object: null,
    // `<applet>`
    profile: null,
    // `<head>`
    prompt: null,
    // `<isindex>`
    rev: null,
    // `<link>`
    rightMargin: i,
    // `<body>`
    rules: null,
    // `<table>`
    scheme: null,
    // `<meta>`
    scrolling: v,
    // `<frame>`. Use overflow in the child context
    standby: null,
    // `<object>`
    summary: null,
    // `<table>`
    text: null,
    // `<body>`. Use CSS `color` instead
    topMargin: i,
    // `<body>`
    valueType: null,
    // `<param>`
    version: null,
    // `<html>`. Use a doctype.
    vAlign: null,
    // Several. Use CSS `vertical-align` instead
    vLink: null,
    // `<body>`. Use CSS `a:visited {color}` instead
    vSpace: i,
    // `<img>` and `<object>`
    // Non-standard Properties.
    allowTransparency: null,
    autoCorrect: null,
    autoSave: null,
    disablePictureInPicture: g,
    disableRemotePlayback: g,
    prefix: null,
    property: null,
    results: i,
    security: null,
    unselectable: null
  }
}), kn = q({
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
  transform: $e,
  properties: {
    about: O,
    accentHeight: i,
    accumulate: null,
    additive: null,
    alignmentBaseline: null,
    alphabetic: i,
    amplitude: i,
    arabicForm: null,
    ascent: i,
    attributeName: null,
    attributeType: null,
    azimuth: i,
    bandwidth: null,
    baselineShift: null,
    baseFrequency: null,
    baseProfile: null,
    bbox: null,
    begin: null,
    bias: i,
    by: null,
    calcMode: null,
    capHeight: i,
    className: h,
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
    descent: i,
    diffuseConstant: i,
    direction: null,
    display: null,
    dur: null,
    divisor: i,
    dominantBaseline: null,
    download: g,
    dx: null,
    dy: null,
    edgeMode: null,
    editable: null,
    elevation: i,
    enableBackground: null,
    end: null,
    event: null,
    exponent: i,
    externalResourcesRequired: null,
    fill: null,
    fillOpacity: i,
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
    g1: z,
    g2: z,
    glyphName: z,
    glyphOrientationHorizontal: null,
    glyphOrientationVertical: null,
    glyphRef: null,
    gradientTransform: null,
    gradientUnits: null,
    handler: null,
    hanging: i,
    hatchContentUnits: null,
    hatchUnits: null,
    height: null,
    href: null,
    hrefLang: null,
    horizAdvX: i,
    horizOriginX: i,
    horizOriginY: i,
    id: null,
    ideographic: i,
    imageRendering: null,
    initialVisibility: null,
    in: null,
    in2: null,
    intercept: i,
    k: i,
    k1: i,
    k2: i,
    k3: i,
    k4: i,
    kernelMatrix: O,
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
    limitingConeAngle: i,
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
    mediaSize: i,
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
    overlinePosition: i,
    overlineThickness: i,
    paintOrder: null,
    panose1: null,
    path: null,
    pathLength: i,
    patternContentUnits: null,
    patternTransform: null,
    patternUnits: null,
    phase: null,
    ping: h,
    pitch: null,
    playbackOrder: null,
    pointerEvents: null,
    points: null,
    pointsAtX: i,
    pointsAtY: i,
    pointsAtZ: i,
    preserveAlpha: null,
    preserveAspectRatio: null,
    primitiveUnits: null,
    propagate: null,
    property: O,
    r: null,
    radius: null,
    referrerPolicy: null,
    refX: null,
    refY: null,
    rel: O,
    rev: O,
    renderingIntent: null,
    repeatCount: null,
    repeatDur: null,
    requiredExtensions: O,
    requiredFeatures: O,
    requiredFonts: O,
    requiredFormats: O,
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
    specularConstant: i,
    specularExponent: i,
    spreadMethod: null,
    spacing: null,
    startOffset: null,
    stdDeviation: null,
    stemh: null,
    stemv: null,
    stitchTiles: null,
    stopColor: null,
    stopOpacity: null,
    strikethroughPosition: i,
    strikethroughThickness: i,
    string: null,
    stroke: null,
    strokeDashArray: O,
    strokeDashOffset: null,
    strokeLineCap: null,
    strokeLineJoin: null,
    strokeMiterLimit: i,
    strokeOpacity: i,
    strokeWidth: null,
    style: null,
    surfaceScale: i,
    syncBehavior: null,
    syncBehaviorDefault: null,
    syncMaster: null,
    syncTolerance: null,
    syncToleranceDefault: null,
    systemLanguage: O,
    tabIndex: i,
    tableValues: null,
    target: null,
    targetX: i,
    targetY: i,
    textAnchor: null,
    textDecoration: null,
    textRendering: null,
    textLength: null,
    timelineBegin: null,
    title: null,
    transformBehavior: null,
    type: null,
    typeOf: O,
    to: null,
    transform: null,
    transformOrigin: null,
    u1: null,
    u2: null,
    underlinePosition: i,
    underlineThickness: i,
    unicode: null,
    unicodeBidi: null,
    unicodeRange: null,
    unitsPerEm: i,
    values: null,
    vAlphabetic: i,
    vMathematical: i,
    vectorEffect: null,
    vHanging: i,
    vIdeographic: i,
    version: null,
    vertAdvY: i,
    vertOriginX: i,
    vertOriginY: i,
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
    xHeight: i,
    y: null,
    y1: null,
    y2: null,
    yChannelSelector: null,
    z: null,
    zoomAndPan: null
  }
}), Cn = /^data[-\w.:]+$/i, Oe = /-[a-z]/g, Pn = /[A-Z]/g;
function We(n, t) {
  const l = G(t);
  let e = t, o = N;
  if (l in n.normal)
    return n.property[n.normal[l]];
  if (l.length > 4 && l.slice(0, 4) === "data" && Cn.test(t)) {
    if (t.charAt(4) === "-") {
      const a = t.slice(5).replace(Oe, Nn);
      e = "data" + a.charAt(0).toUpperCase() + a.slice(1);
    } else {
      const a = t.slice(4);
      if (!Oe.test(a)) {
        let r = a.replace(Pn, On);
        r.charAt(0) !== "-" && (r = "-" + r), t = "data" + r;
      }
    }
    o = ye;
  }
  return new o(e, t);
}
function On(n) {
  return "-" + n.toLowerCase();
}
function Nn(n) {
  return n.charAt(1).toUpperCase();
}
const En = _e([He, qe, Ye, Ve, wn], "html"), be = _e([He, qe, Ye, Ve, kn], "svg"), Ne = /[#.]/g;
function An(n, t) {
  const l = n || "", e = {};
  let o = 0, a, r;
  for (; o < l.length; ) {
    Ne.lastIndex = o;
    const s = Ne.exec(l), u = l.slice(o, s ? s.index : l.length);
    u && (a ? a === "#" ? e.id = u : Array.isArray(e.className) ? e.className.push(u) : e.className = [u] : r = u, o += u.length), s && (a = s[0], o++);
  }
  return {
    type: "element",
    // @ts-expect-error: fine.
    tagName: r || t || "div",
    properties: e,
    children: []
  };
}
function Ee(n) {
  const t = String(n || "").trim();
  return t ? t.split(/[ \t\n\r\f]+/g) : [];
}
function Ln(n) {
  return n.join(" ").trim();
}
function Ae(n) {
  const t = [], l = String(n || "");
  let e = l.indexOf(","), o = 0, a = !1;
  for (; !a; ) {
    e === -1 && (e = l.length, a = !0);
    const r = l.slice(o, e).trim();
    (r || !a) && t.push(r), o = e + 1, e = l.indexOf(",", o);
  }
  return t;
}
function Tn(n, t) {
  const l = t || {};
  return (n[n.length - 1] === "" ? [...n, ""] : n).join(
    (l.padRight ? " " : "") + "," + (l.padLeft === !1 ? "" : " ")
  ).trim();
}
const Rn = /* @__PURE__ */ new Set(["menu", "submit", "reset", "button"]), ce = {}.hasOwnProperty;
function Mn(n, t, l) {
  const e = l && Un(l);
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
    function(a, r, ...s) {
      let u = -1, p;
      if (a == null)
        p = { type: "root", children: [] }, s.unshift(r);
      else if (p = An(a, t), p.tagName = p.tagName.toLowerCase(), e && ce.call(e, p.tagName) && (p.tagName = e[p.tagName]), Dn(r, p.tagName)) {
        let d;
        for (d in r)
          ce.call(r, d) && In(n, p.properties, d, r[d]);
      } else
        s.unshift(r);
      for (; ++u < s.length; )
        pe(p.children, s[u]);
      return p.type === "element" && p.tagName === "template" && (p.content = { type: "root", children: p.children }, p.children = []), p;
    }
  );
}
function Dn(n, t) {
  return n == null || typeof n != "object" || Array.isArray(n) ? !1 : t === "input" || !n.type || typeof n.type != "string" ? !0 : "children" in n && Array.isArray(n.children) ? !1 : t === "button" ? Rn.has(n.type.toLowerCase()) : !("value" in n);
}
function In(n, t, l, e) {
  const o = We(n, l);
  let a = -1, r;
  if (e != null) {
    if (typeof e == "number") {
      if (Number.isNaN(e))
        return;
      r = e;
    } else
      typeof e == "boolean" ? r = e : typeof e == "string" ? o.spaceSeparated ? r = Ee(e) : o.commaSeparated ? r = Ae(e) : o.commaOrSpaceSeparated ? r = Ee(Ae(e).join(" ")) : r = Le(o, o.property, e) : Array.isArray(e) ? r = e.concat() : r = o.property === "style" ? Bn(e) : String(e);
    if (Array.isArray(r)) {
      const s = [];
      for (; ++a < r.length; )
        s[a] = Le(o, o.property, r[a]);
      r = s;
    }
    o.property === "className" && Array.isArray(t.className) && (r = t.className.concat(r)), t[o.property] = r;
  }
}
function pe(n, t) {
  let l = -1;
  if (t != null)
    if (typeof t == "string" || typeof t == "number")
      n.push({ type: "text", value: String(t) });
    else if (Array.isArray(t))
      for (; ++l < t.length; )
        pe(n, t[l]);
    else if (typeof t == "object" && "type" in t)
      t.type === "root" ? pe(n, t.children) : n.push(t);
    else
      throw new Error("Expected node, nodes, or string, got `" + t + "`");
}
function Le(n, t, l) {
  if (typeof l == "string") {
    if (n.number && l && !Number.isNaN(Number(l)))
      return Number(l);
    if ((n.boolean || n.overloadedBoolean) && (l === "" || G(l) === G(t)))
      return !0;
  }
  return l;
}
function Bn(n) {
  const t = [];
  let l;
  for (l in n)
    ce.call(n, l) && t.push([l, n[l]].join(": "));
  return t.join("; ");
}
function Un(n) {
  const t = {};
  let l = -1;
  for (; ++l < n.length; )
    t[n[l].toLowerCase()] = n[l];
  return t;
}
const Fn = [
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
], k = Mn(be, "g", Fn);
async function zn(n) {
  return await (typeof n == "string" ? jn(n) : _n(n));
}
async function _n(n) {
  if (typeof File > "u" || typeof FileReader > "u")
    throw new TypeError(
      `Cannot read "file" object of type ${typeof n} in a non-browser environment`
    );
  return await new Promise((t, l) => {
    const e = new FileReader();
    e.addEventListener("load", o, { once: !0 }), e.addEventListener("error", a, { once: !0 }), e.readAsText(n);
    function o() {
      const r = e.result;
      e.removeEventListener("error", a), t({ filename: n.name, contents: r });
    }
    function a() {
      e.removeEventListener("load", o), l(e.error);
    }
  });
}
async function jn(n) {
  const [t, l] = await Promise.all([
    import("node:fs/promises"),
    import("node:path")
  ]).catch(() => {
    throw new TypeError(
      "Cannot read a file path string in a non-Node.js environment"
    );
  }), e = l.basename(n), o = await t.readFile(n, "utf8");
  return { filename: e, contents: o };
}
function qn(n) {
  const t = n.filter((e) => e.parseTree.filetype === un).map((e) => e.filename), l = gn(t);
  return Object.fromEntries(
    n.map(({ id: e, filename: o, parseTree: a }) => {
      const r = a.filetype === cn ? { type: ze, side: mn } : l[o];
      return [e, r];
    })
  );
}
const U = ({ id: n }) => n, F = (n, t) => (l) => l.type === n && (t === void 0 || l.side === t);
function Hn(n) {
  return n.filter(F(fn)).map(U)[0];
}
function Ke(n) {
  return n.filter(F(ze)).map(U);
}
function de(n, t) {
  return {
    copper: t.filter(F(hn, n)).map(U),
    solderMask: t.filter(F(yn, n)).map(U),
    silkScreen: t.filter(F(bn, n)).map(U),
    solderPaste: t.filter(F(Sn, n)).map(U)
  };
}
function $n(n) {
  const t = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map();
  for (const o of n) {
    const a = Yn(o);
    t.set(a, o);
    for (const r of [o.start, o.end]) {
      const s = Y(r), u = l.get(s) ?? [];
      u.push(a), l.set(s, u);
    }
  }
  return Object.assign(Object.create(Gn), {
    segmentsById: t,
    segmentIdsByPointId: l
  }).walk();
}
const Gn = {
  walk() {
    const n = [];
    for (; this.segmentsById.size > 0; ) {
      const t = this.segmentIdsByPointId.keys().next().value, l = this.walkPath(t);
      if (l.length > 0) {
        const e = l[0], o = l[l.length - 1], a = [e.start[0], e.start[1]], r = [o.end[0], o.end[1]];
        n.push({ start: a, end: r, segments: l });
      }
    }
    return n;
  },
  walkPath(n) {
    const t = this.shiftNextSegment(n);
    if (t !== void 0) {
      const l = Y(t.start), e = Y(t.end), o = n === l ? e : l;
      return [
        n === l ? t : Xe(t),
        ...this.walkPath(o)
      ];
    }
    return [];
  },
  shiftNextSegment(n) {
    const t = this.shiftSegmentId(n);
    if (t !== void 0)
      return this.consumeSegment(t) ?? this.shiftNextSegment(n);
  },
  shiftSegmentId(n) {
    const t = this.segmentIdsByPointId.get(n), l = t == null ? void 0 : t.shift();
    return (t == null ? void 0 : t.length) === 0 && this.segmentIdsByPointId.delete(n), l;
  },
  consumeSegment(n) {
    const t = this.segmentsById.get(n);
    return this.segmentsById.delete(n), t;
  }
};
function Y(n) {
  return `${n[0]},${n[1]}`;
}
function Yn(n) {
  const { type: t } = n, [l, e] = Vn(n.start, n.end);
  return `${t}:${Y(l)}:${Y(e)}`;
}
function Vn(n, t) {
  return t[0] < n[0] ? [t, n] : t[0] > n[0] ? [n, t] : t[1] < n[1] ? [t, n] : [n, t];
}
function Xe(n) {
  return { ...n, start: n.end, end: n.start };
}
const Wn = (n) => ({
  type: me,
  segments: n
}), Kn = (n) => ({
  type: se,
  width: 0,
  segments: n
});
function Xn(n, t) {
  const l = t ** 2, e = [...n], o = [], a = [];
  let r;
  for (; (r = e.shift()) !== void 0; ) {
    let s = Te(r.end, r.start), u = r, p = r.start;
    if (s === 0) {
      o.push(r.segments);
      continue;
    }
    for (const d of e)
      for (const b of [d.start, d.end]) {
        const S = Te(r.end, b);
        S < s && (s = S, u = d, p = b);
      }
    if (s <= l) {
      const d = {
        type: $,
        start: r.end,
        end: p
      };
      if (r === u) {
        o.push([...r.segments, d]);
        continue;
      }
      const b = e.indexOf(u);
      b !== -1 && e.splice(b, 1);
      const S = p === u.start ? u.segments : u.segments.map(Xe).reverse(), C = p === u.start ? u.end : u.start;
      e.unshift({
        start: r.start,
        end: C,
        segments: [...r.segments, d, ...S]
      });
    } else
      a.push(r.segments);
  }
  return [o.map(Wn), a.map(Kn)];
}
function Te(n, t) {
  return n[0] !== t[0] || n[1] !== t[1] ? (n[0] - t[0]) ** 2 + (n[1] - t[1]) ** 2 : 0;
}
const Zn = "missingOutlineLayer", Jn = "noPathsInOutlineLayer", Qn = "noClosedRegionsFound";
function Ze(n, t, l) {
  const e = Hn(n), o = e === void 0 ? void 0 : t[e], a = B.sum(
    Object.values(t).map(({ size: d }) => d)
  );
  if (o === void 0)
    return {
      size: a,
      regions: [],
      openPaths: [],
      failureReason: Zn
    };
  const r = o.children.filter((d) => d.type === se).flatMap((d) => d.segments);
  if (r.length === 0)
    return {
      size: a,
      regions: [],
      openPaths: [],
      failureReason: Jn
    };
  const s = $n(r), [u, p] = Xn(s, l);
  if (u.length === 0) {
    const d = o.children.filter(
      (b) => b.type === se
    );
    if (d.length > 0) {
      const b = d.map((S) => B.fromPath(S.segments, S.width)).reduce(B.add, B.empty());
      if (!B.isEmpty(b)) {
        const [S, C, A, E] = b;
        return {
          regions: [{
            type: me,
            segments: [
              { type: $, start: [S, C], end: [A, C] },
              { type: $, start: [A, C], end: [A, E] },
              { type: $, start: [A, E], end: [S, E] },
              { type: $, start: [S, E], end: [S, C] }
            ]
          }],
          openPaths: p,
          size: b
        };
      }
    }
    return { size: a, regions: u, openPaths: p, failureReason: Qn };
  }
  return {
    regions: u,
    openPaths: p,
    size: B.fromGraphics(u)
  };
}
function Se(n) {
  const { regions: t, size: l, failureReason: e } = n, o = pn(l), a = t.flatMap((r) => r.segments);
  return e === void 0 ? { viewBox: o, path: dn({ type: me, segments: a }) } : { viewBox: o, failureReason: e };
}
const et = [
  "area",
  "base",
  "basefont",
  "bgsound",
  "br",
  "col",
  "command",
  "embed",
  "frame",
  "hr",
  "image",
  "img",
  "input",
  "isindex",
  "keygen",
  "link",
  "menuitem",
  "meta",
  "nextid",
  "param",
  "source",
  "track",
  "wbr"
], Re = {}.hasOwnProperty;
function nt(n, t) {
  const l = t || {};
  function e(o, ...a) {
    let r = e.invalid;
    const s = e.handlers;
    if (o && Re.call(o, n)) {
      const u = String(o[n]);
      r = Re.call(s, u) ? s[u] : e.unknown;
    }
    if (r)
      return r.call(this, o, ...a);
  }
  return e.handlers = l.handlers || {}, e.invalid = l.invalid, e.unknown = l.unknown, e;
}
const tt = /["&'<>`]/g, lt = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ot = (
  // eslint-disable-next-line no-control-regex, unicorn/no-hex-escape
  /[\x01-\t\v\f\x0E-\x1F\x7F\x81\x8D\x8F\x90\x9D\xA0-\uFFFF]/g
), rt = /[|\\{}()[\]^$+*?.]/g, Me = /* @__PURE__ */ new WeakMap();
function at(n, t) {
  if (n = n.replace(
    t.subset ? it(t.subset) : tt,
    e
  ), t.subset || t.escapeOnly)
    return n;
  return n.replace(lt, l).replace(ot, e);
  function l(o, a, r) {
    return t.format(
      (o.charCodeAt(0) - 55296) * 1024 + o.charCodeAt(1) - 56320 + 65536,
      r.charCodeAt(a + 2),
      t
    );
  }
  function e(o, a, r) {
    return t.format(
      o.charCodeAt(0),
      r.charCodeAt(a + 1),
      t
    );
  }
}
function it(n) {
  let t = Me.get(n);
  return t || (t = st(n), Me.set(n, t)), t;
}
function st(n) {
  const t = [];
  let l = -1;
  for (; ++l < n.length; )
    t.push(n[l].replace(rt, "\\$&"));
  return new RegExp("(?:" + t.join("|") + ")", "g");
}
const ut = /[\dA-Fa-f]/;
function ct(n, t, l) {
  const e = "&#x" + n.toString(16).toUpperCase();
  return l && t && !ut.test(String.fromCharCode(t)) ? e : e + ";";
}
const pt = /\d/;
function dt(n, t, l) {
  const e = "&#" + String(n);
  return l && t && !pt.test(String.fromCharCode(t)) ? e : e + ";";
}
const gt = [
  "AElig",
  "AMP",
  "Aacute",
  "Acirc",
  "Agrave",
  "Aring",
  "Atilde",
  "Auml",
  "COPY",
  "Ccedil",
  "ETH",
  "Eacute",
  "Ecirc",
  "Egrave",
  "Euml",
  "GT",
  "Iacute",
  "Icirc",
  "Igrave",
  "Iuml",
  "LT",
  "Ntilde",
  "Oacute",
  "Ocirc",
  "Ograve",
  "Oslash",
  "Otilde",
  "Ouml",
  "QUOT",
  "REG",
  "THORN",
  "Uacute",
  "Ucirc",
  "Ugrave",
  "Uuml",
  "Yacute",
  "aacute",
  "acirc",
  "acute",
  "aelig",
  "agrave",
  "amp",
  "aring",
  "atilde",
  "auml",
  "brvbar",
  "ccedil",
  "cedil",
  "cent",
  "copy",
  "curren",
  "deg",
  "divide",
  "eacute",
  "ecirc",
  "egrave",
  "eth",
  "euml",
  "frac12",
  "frac14",
  "frac34",
  "gt",
  "iacute",
  "icirc",
  "iexcl",
  "igrave",
  "iquest",
  "iuml",
  "laquo",
  "lt",
  "macr",
  "micro",
  "middot",
  "nbsp",
  "not",
  "ntilde",
  "oacute",
  "ocirc",
  "ograve",
  "ordf",
  "ordm",
  "oslash",
  "otilde",
  "ouml",
  "para",
  "plusmn",
  "pound",
  "quot",
  "raquo",
  "reg",
  "sect",
  "shy",
  "sup1",
  "sup2",
  "sup3",
  "szlig",
  "thorn",
  "times",
  "uacute",
  "ucirc",
  "ugrave",
  "uml",
  "uuml",
  "yacute",
  "yen",
  "yuml"
], re = {
  nbsp: " ",
  iexcl: "¡",
  cent: "¢",
  pound: "£",
  curren: "¤",
  yen: "¥",
  brvbar: "¦",
  sect: "§",
  uml: "¨",
  copy: "©",
  ordf: "ª",
  laquo: "«",
  not: "¬",
  shy: "­",
  reg: "®",
  macr: "¯",
  deg: "°",
  plusmn: "±",
  sup2: "²",
  sup3: "³",
  acute: "´",
  micro: "µ",
  para: "¶",
  middot: "·",
  cedil: "¸",
  sup1: "¹",
  ordm: "º",
  raquo: "»",
  frac14: "¼",
  frac12: "½",
  frac34: "¾",
  iquest: "¿",
  Agrave: "À",
  Aacute: "Á",
  Acirc: "Â",
  Atilde: "Ã",
  Auml: "Ä",
  Aring: "Å",
  AElig: "Æ",
  Ccedil: "Ç",
  Egrave: "È",
  Eacute: "É",
  Ecirc: "Ê",
  Euml: "Ë",
  Igrave: "Ì",
  Iacute: "Í",
  Icirc: "Î",
  Iuml: "Ï",
  ETH: "Ð",
  Ntilde: "Ñ",
  Ograve: "Ò",
  Oacute: "Ó",
  Ocirc: "Ô",
  Otilde: "Õ",
  Ouml: "Ö",
  times: "×",
  Oslash: "Ø",
  Ugrave: "Ù",
  Uacute: "Ú",
  Ucirc: "Û",
  Uuml: "Ü",
  Yacute: "Ý",
  THORN: "Þ",
  szlig: "ß",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  eth: "ð",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  divide: "÷",
  oslash: "ø",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  yacute: "ý",
  thorn: "þ",
  yuml: "ÿ",
  fnof: "ƒ",
  Alpha: "Α",
  Beta: "Β",
  Gamma: "Γ",
  Delta: "Δ",
  Epsilon: "Ε",
  Zeta: "Ζ",
  Eta: "Η",
  Theta: "Θ",
  Iota: "Ι",
  Kappa: "Κ",
  Lambda: "Λ",
  Mu: "Μ",
  Nu: "Ν",
  Xi: "Ξ",
  Omicron: "Ο",
  Pi: "Π",
  Rho: "Ρ",
  Sigma: "Σ",
  Tau: "Τ",
  Upsilon: "Υ",
  Phi: "Φ",
  Chi: "Χ",
  Psi: "Ψ",
  Omega: "Ω",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigmaf: "ς",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  thetasym: "ϑ",
  upsih: "ϒ",
  piv: "ϖ",
  bull: "•",
  hellip: "…",
  prime: "′",
  Prime: "″",
  oline: "‾",
  frasl: "⁄",
  weierp: "℘",
  image: "ℑ",
  real: "ℜ",
  trade: "™",
  alefsym: "ℵ",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  crarr: "↵",
  lArr: "⇐",
  uArr: "⇑",
  rArr: "⇒",
  dArr: "⇓",
  hArr: "⇔",
  forall: "∀",
  part: "∂",
  exist: "∃",
  empty: "∅",
  nabla: "∇",
  isin: "∈",
  notin: "∉",
  ni: "∋",
  prod: "∏",
  sum: "∑",
  minus: "−",
  lowast: "∗",
  radic: "√",
  prop: "∝",
  infin: "∞",
  ang: "∠",
  and: "∧",
  or: "∨",
  cap: "∩",
  cup: "∪",
  int: "∫",
  there4: "∴",
  sim: "∼",
  cong: "≅",
  asymp: "≈",
  ne: "≠",
  equiv: "≡",
  le: "≤",
  ge: "≥",
  sub: "⊂",
  sup: "⊃",
  nsub: "⊄",
  sube: "⊆",
  supe: "⊇",
  oplus: "⊕",
  otimes: "⊗",
  perp: "⊥",
  sdot: "⋅",
  lceil: "⌈",
  rceil: "⌉",
  lfloor: "⌊",
  rfloor: "⌋",
  lang: "〈",
  rang: "〉",
  loz: "◊",
  spades: "♠",
  clubs: "♣",
  hearts: "♥",
  diams: "♦",
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  OElig: "Œ",
  oelig: "œ",
  Scaron: "Š",
  scaron: "š",
  Yuml: "Ÿ",
  circ: "ˆ",
  tilde: "˜",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "‌",
  zwj: "‍",
  lrm: "‎",
  rlm: "‏",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  permil: "‰",
  lsaquo: "‹",
  rsaquo: "›",
  euro: "€"
}, mt = [
  "cent",
  "copy",
  "divide",
  "gt",
  "lt",
  "not",
  "para",
  "times"
], Je = {}.hasOwnProperty, ge = {};
let J;
for (J in re)
  Je.call(re, J) && (ge[re[J]] = J);
const ft = /[^\dA-Za-z]/;
function ht(n, t, l, e) {
  const o = String.fromCharCode(n);
  if (Je.call(ge, o)) {
    const a = ge[o], r = "&" + a;
    return l && gt.includes(a) && !mt.includes(a) && (!e || t && t !== 61 && ft.test(String.fromCharCode(t))) ? r : r + ";";
  }
  return "";
}
function yt(n, t, l) {
  let e = ct(n, t, l.omitOptionalSemicolons), o;
  if ((l.useNamedReferences || l.useShortestReferences) && (o = ht(
    n,
    t,
    l.omitOptionalSemicolons,
    l.attribute
  )), (l.useShortestReferences || !o) && l.useShortestReferences) {
    const a = dt(n, t, l.omitOptionalSemicolons);
    a.length < e.length && (e = a);
  }
  return o && (!l.useShortestReferences || o.length < e.length) ? o : e;
}
function _(n, t) {
  return at(n, Object.assign({ format: yt }, t));
}
function bt(n, t, l, e) {
  return e.settings.bogusComments ? "<?" + _(
    n.value,
    Object.assign({}, e.settings.characterReferences, { subset: [">"] })
  ) + ">" : "<!--" + n.value.replace(/^>|^->|<!--|-->|--!>|<!-$/g, o) + "-->";
  function o(a) {
    return _(
      a,
      Object.assign({}, e.settings.characterReferences, {
        subset: ["<", ">"]
      })
    );
  }
}
function St(n, t, l, e) {
  return "<!" + (e.settings.upperDoctype ? "DOCTYPE" : "doctype") + (e.settings.tightDoctype ? "" : " ") + "html>";
}
function De(n, t) {
  const l = String(n);
  if (typeof t != "string")
    throw new TypeError("Expected character");
  let e = 0, o = l.indexOf(t);
  for (; o !== -1; )
    e++, o = l.indexOf(t, o + t.length);
  return e;
}
function xe(n) {
  const t = (
    // @ts-expect-error looks like a node.
    n && typeof n == "object" && n.type === "text" ? (
      // @ts-expect-error looks like a text.
      n.value || ""
    ) : n
  );
  return typeof t == "string" && t.replace(/[ \t\n\f\r]/g, "") === "";
}
const w = en(1), Qe = en(-1);
function en(n) {
  return t;
  function t(l, e, o) {
    const a = l ? l.children : [];
    let r = (e || 0) + n, s = a && a[r];
    if (!o)
      for (; s && xe(s); )
        r += n, s = a[r];
    return s;
  }
}
const xt = {}.hasOwnProperty;
function nn(n) {
  return t;
  function t(l, e, o) {
    return xt.call(n, l.tagName) && n[l.tagName](l, e, o);
  }
}
const ve = nn({
  html: vt,
  head: ae,
  body: wt,
  p: kt,
  li: Ct,
  dt: Pt,
  dd: Ot,
  rt: Ie,
  rp: Ie,
  optgroup: Nt,
  option: Et,
  menuitem: At,
  colgroup: ae,
  caption: ae,
  thead: Lt,
  tbody: Tt,
  tfoot: Rt,
  tr: Mt,
  td: Be,
  th: Be
});
function ae(n, t, l) {
  const e = w(l, t, !0);
  return !e || e.type !== "comment" && !(e.type === "text" && xe(e.value.charAt(0)));
}
function vt(n, t, l) {
  const e = w(l, t);
  return !e || e.type !== "comment";
}
function wt(n, t, l) {
  const e = w(l, t);
  return !e || e.type !== "comment";
}
function kt(n, t, l) {
  const e = w(l, t);
  return e ? e.type === "element" && (e.tagName === "address" || e.tagName === "article" || e.tagName === "aside" || e.tagName === "blockquote" || e.tagName === "details" || e.tagName === "div" || e.tagName === "dl" || e.tagName === "fieldset" || e.tagName === "figcaption" || e.tagName === "figure" || e.tagName === "footer" || e.tagName === "form" || e.tagName === "h1" || e.tagName === "h2" || e.tagName === "h3" || e.tagName === "h4" || e.tagName === "h5" || e.tagName === "h6" || e.tagName === "header" || e.tagName === "hgroup" || e.tagName === "hr" || e.tagName === "main" || e.tagName === "menu" || e.tagName === "nav" || e.tagName === "ol" || e.tagName === "p" || e.tagName === "pre" || e.tagName === "section" || e.tagName === "table" || e.tagName === "ul") : !l || // Confusing parent.
  !(l.type === "element" && (l.tagName === "a" || l.tagName === "audio" || l.tagName === "del" || l.tagName === "ins" || l.tagName === "map" || l.tagName === "noscript" || l.tagName === "video"));
}
function Ct(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && e.tagName === "li";
}
function Pt(n, t, l) {
  const e = w(l, t);
  return e && e.type === "element" && (e.tagName === "dt" || e.tagName === "dd");
}
function Ot(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && (e.tagName === "dt" || e.tagName === "dd");
}
function Ie(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && (e.tagName === "rp" || e.tagName === "rt");
}
function Nt(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && e.tagName === "optgroup";
}
function Et(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && (e.tagName === "option" || e.tagName === "optgroup");
}
function At(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && (e.tagName === "menuitem" || e.tagName === "hr" || e.tagName === "menu");
}
function Lt(n, t, l) {
  const e = w(l, t);
  return e && e.type === "element" && (e.tagName === "tbody" || e.tagName === "tfoot");
}
function Tt(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && (e.tagName === "tbody" || e.tagName === "tfoot");
}
function Rt(n, t, l) {
  return !w(l, t);
}
function Mt(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && e.tagName === "tr";
}
function Be(n, t, l) {
  const e = w(l, t);
  return !e || e.type === "element" && (e.tagName === "td" || e.tagName === "th");
}
const Dt = nn({
  html: It,
  head: Bt,
  body: Ut,
  colgroup: Ft,
  tbody: zt
});
function It(n) {
  const t = w(n, -1);
  return !t || t.type !== "comment";
}
function Bt(n) {
  const t = n.children, l = [];
  let e = -1;
  for (; ++e < t.length; ) {
    const o = t[e];
    if (o.type === "element" && (o.tagName === "title" || o.tagName === "base")) {
      if (l.includes(o.tagName))
        return !1;
      l.push(o.tagName);
    }
  }
  return t.length > 0;
}
function Ut(n) {
  const t = w(n, -1, !0);
  return !t || t.type !== "comment" && !(t.type === "text" && xe(t.value.charAt(0))) && !(t.type === "element" && (t.tagName === "meta" || t.tagName === "link" || t.tagName === "script" || t.tagName === "style" || t.tagName === "template"));
}
function Ft(n, t, l) {
  const e = Qe(l, t), o = w(n, -1, !0);
  return l && e && e.type === "element" && e.tagName === "colgroup" && ve(e, l.children.indexOf(e), l) ? !1 : o && o.type === "element" && o.tagName === "col";
}
function zt(n, t, l) {
  const e = Qe(l, t), o = w(n, -1);
  return l && e && e.type === "element" && (e.tagName === "thead" || e.tagName === "tbody") && ve(e, l.children.indexOf(e), l) ? !1 : o && o.type === "element" && o.tagName === "tr";
}
const Q = {
  // See: <https://html.spec.whatwg.org/#attribute-name-state>.
  name: [
    [`	
\f\r &/=>`.split(""), `	
\f\r "&'/=>\``.split("")],
    [`\0	
\f\r "&'/<=>`.split(""), `\0	
\f\r "&'/<=>\``.split("")]
  ],
  // See: <https://html.spec.whatwg.org/#attribute-value-(unquoted)-state>.
  unquoted: [
    [`	
\f\r &>`.split(""), `\0	
\f\r "&'<=>\``.split("")],
    [`\0	
\f\r "&'<=>\``.split(""), `\0	
\f\r "&'<=>\``.split("")]
  ],
  // See: <https://html.spec.whatwg.org/#attribute-value-(single-quoted)-state>.
  single: [
    ["&'".split(""), "\"&'`".split("")],
    ["\0&'".split(""), "\0\"&'`".split("")]
  ],
  // See: <https://html.spec.whatwg.org/#attribute-value-(double-quoted)-state>.
  double: [
    ['"&'.split(""), "\"&'`".split("")],
    ['\0"&'.split(""), "\0\"&'`".split("")]
  ]
};
function _t(n, t, l, e) {
  const o = e.schema, a = o.space === "svg" ? !1 : e.settings.omitOptionalTags;
  let r = o.space === "svg" ? e.settings.closeEmptyElements : e.settings.voids.includes(n.tagName.toLowerCase());
  const s = [];
  let u;
  o.space === "html" && n.tagName === "svg" && (e.schema = be);
  const p = jt(e, n.properties), d = e.all(
    o.space === "html" && n.tagName === "template" ? n.content : n
  );
  return e.schema = o, d && (r = !1), (p || !a || !Dt(n, t, l)) && (s.push("<", n.tagName, p ? " " + p : ""), r && (o.space === "svg" || e.settings.closeSelfClosing) && (u = p.charAt(p.length - 1), (!e.settings.tightSelfClosing || u === "/" || u && u !== '"' && u !== "'") && s.push(" "), s.push("/")), s.push(">")), s.push(d), !r && (!a || !ve(n, t, l)) && s.push("</" + n.tagName + ">"), s.join("");
}
function jt(n, t) {
  const l = [];
  let e = -1, o;
  if (t) {
    for (o in t)
      if (t[o] !== void 0 && t[o] !== null) {
        const a = qt(n, o, t[o]);
        a && l.push(a);
      }
  }
  for (; ++e < l.length; ) {
    const a = n.settings.tightAttributes ? l[e].charAt(l[e].length - 1) : null;
    e !== l.length - 1 && a !== '"' && a !== "'" && (l[e] += " ");
  }
  return l.join("");
}
function qt(n, t, l) {
  const e = We(n.schema, t), o = n.settings.allowParseErrors && n.schema.space === "html" ? 0 : 1, a = n.settings.allowDangerousCharacters ? 0 : 1;
  let r = n.quote, s;
  if (e.overloadedBoolean && (l === e.attribute || l === "") ? l = !0 : (e.boolean || e.overloadedBoolean && typeof l != "string") && (l = !!l), l == null || l === !1 || typeof l == "number" && Number.isNaN(l))
    return "";
  const u = _(
    e.attribute,
    Object.assign({}, n.settings.characterReferences, {
      // Always encode without parse errors in non-HTML.
      subset: Q.name[o][a]
    })
  );
  return l === !0 || (l = Array.isArray(l) ? (e.commaSeparated ? Tn : Ln)(l, {
    padLeft: !n.settings.tightCommaSeparatedLists
  }) : String(l), n.settings.collapseEmptyAttributes && !l) ? u : (n.settings.preferUnquoted && (s = _(
    l,
    Object.assign({}, n.settings.characterReferences, {
      subset: Q.unquoted[o][a],
      attribute: !0
    })
  )), s !== l && (n.settings.quoteSmart && De(l, r) > De(l, n.alternative) && (r = n.alternative), s = r + _(
    l,
    Object.assign({}, n.settings.characterReferences, {
      // Always encode without parse errors in non-HTML.
      subset: (r === "'" ? Q.single : Q.double)[o][a],
      attribute: !0
    })
  ) + r), u + (s && "=" + s));
}
function tn(n, t, l, e) {
  return l && l.type === "element" && (l.tagName === "script" || l.tagName === "style") ? n.value : _(
    n.value,
    Object.assign({}, e.settings.characterReferences, {
      subset: ["<", "&"]
    })
  );
}
function Ht(n, t, l, e) {
  return e.settings.allowDangerousHtml ? n.value : tn(n, t, l, e);
}
function $t(n, t, l, e) {
  return e.all(n);
}
const Gt = nt("type", {
  invalid: Yt,
  unknown: Vt,
  handlers: { comment: bt, doctype: St, element: _t, raw: Ht, root: $t, text: tn }
});
function Yt(n) {
  throw new Error("Expected node, not `" + n + "`");
}
function Vt(n) {
  throw new Error("Cannot compile unknown node `" + n.type + "`");
}
function Wt(n, t) {
  const l = t || {}, e = l.quote || '"', o = e === '"' ? "'" : '"';
  if (e !== '"' && e !== "'")
    throw new Error("Invalid quote `" + e + "`, expected `'` or `\"`");
  return {
    one: Kt,
    all: Xt,
    settings: {
      omitOptionalTags: l.omitOptionalTags || !1,
      allowParseErrors: l.allowParseErrors || !1,
      allowDangerousCharacters: l.allowDangerousCharacters || !1,
      quoteSmart: l.quoteSmart || !1,
      preferUnquoted: l.preferUnquoted || !1,
      tightAttributes: l.tightAttributes || !1,
      upperDoctype: l.upperDoctype || !1,
      tightDoctype: l.tightDoctype || !1,
      bogusComments: l.bogusComments || !1,
      tightCommaSeparatedLists: l.tightCommaSeparatedLists || !1,
      tightSelfClosing: l.tightSelfClosing || !1,
      collapseEmptyAttributes: l.collapseEmptyAttributes || !1,
      allowDangerousHtml: l.allowDangerousHtml || !1,
      voids: l.voids || et,
      characterReferences: l.characterReferences || l.entities || {},
      closeSelfClosing: l.closeSelfClosing || !1,
      closeEmptyElements: l.closeEmptyElements || !1
    },
    schema: l.space === "svg" ? be : En,
    quote: e,
    alternative: o
  }.one(
    Array.isArray(n) ? { type: "root", children: n } : n,
    void 0,
    void 0
  );
}
function Kt(n, t, l) {
  return Gt(n, t, l, this);
}
function Xt(n) {
  const t = [], l = n && n.children || [];
  let e = -1;
  for (; ++e < l.length; )
    t[e] = this.one(l[e], e, n);
  return t.join("");
}
function Ue(n) {
  return Wt(n, { space: "svg" });
}
async function ol(n) {
  const t = n.map(Zt), l = await Promise.all(t), e = qn(l), o = [], a = {};
  for (const { id: r, filename: s, parseTree: u } of l) {
    const { type: p, side: d } = e[r];
    o.push({ id: r, filename: s, type: p, side: d }), a[r] = u;
  }
  return { layers: o, parseTreesById: a };
}
async function Zt(n) {
  const t = fe(), { filename: l, contents: e } = await zn(n), o = Fe.parse(e);
  return { id: t, filename: l, parseTree: o };
}
function rl(n) {
  const { layers: t, parseTreesById: l } = n, e = {};
  for (const { id: a } of t)
    e[a] = ie.plot(l[a]);
  const o = Ze(t, e, 0.02);
  return { layers: t, plotTreesById: e, boardShape: o };
}
function al(n) {
  const { layers: t, boardShape: l, plotTreesById: e } = n, o = Se(l), a = {};
  for (const { id: r } of t)
    a[r] = j.render(
      e[r],
      o.viewBox
    );
  return { layers: t, rendersById: a, boardShapeRender: o };
}
function Jt(n) {
  const { layers: t, rendersById: l, boardShapeRender: e } = n, { viewBox: o, path: a } = e, r = Ke(t), [s, u, p, d] = o, b = {}, S = (C) => l[C].children;
  for (const C of [he, ee]) {
    const {
      copper: A,
      solderMask: E,
      silkScreen: W,
      solderPaste: ne
    } = de(C, t), H = fe(), R = `drill-${H}`, M = `resist-${H}`, D = `shape-${H}`, K = a === void 0 ? void 0 : `url(#${D})`, X = C === ee ? `translate(${2 * s + p},0) scale(-1,1)` : void 0, te = a === void 0 ? void 0 : {
      ...a,
      properties: {
        ...a.properties ?? {},
        // Some renderers honor fill-rule on the element inside clipPath
        // rather than clip-rule; set both for compatibility.
        "clip-rule": "evenodd",
        "fill-rule": "evenodd"
      }
    };
    b[C] = k(
      "svg",
      {
        ...j.BASE_SVG_PROPS,
        ...j.BASE_IMAGE_PROPS,
        viewBox: `${s} ${u} ${p} ${d}`
      },
      [
        k("defs", [
          // Board-level masks use user-space coordinates for both the mask
          // region (x/y/width/height) and the mask contents to ensure the
          // white rect fully covers the board extents.
          k(
            "mask",
            {
              id: R,
              maskUnits: "userSpaceOnUse",
              maskContentUnits: "userSpaceOnUse",
              x: s,
              y: u,
              width: p,
              height: d
            },
            [
              k("rect", { x: s, y: u, width: p, height: d, fill: "#fff" }),
              k("g", { color: "#000" }, r.flatMap(S))
            ]
          ),
          k(
            "mask",
            {
              id: M,
              maskUnits: "userSpaceOnUse",
              maskContentUnits: "userSpaceOnUse",
              x: s,
              y: u,
              width: p,
              height: d
            },
            [
              k("rect", { x: s, y: u, width: p, height: d, fill: "#fff" }),
              k("g", { color: "#000" }, E.flatMap(S))
            ]
          ),
          a === void 0 ? void 0 : k(
            "clipPath",
            { id: D, clipPathUnits: "userSpaceOnUse" },
            te
          )
        ]),
        k("g", { transform: X, "clip-path": K }, [
          k("g", { mask: `url(#${R})` }, [
            k("rect", { fill: "#666", x: s, y: u, width: p, height: d }),
            k("g", { color: "#c93" }, A.flatMap(S))
          ]),
          k("g", { mask: `url(#${M})` }, [
            k("rect", { fill: "#004200", opacity: "0.8", x: s, y: u, width: p, height: d }),
            k("g", { color: "#fff" }, W.flatMap(S))
          ]),
          k("g", { color: "#999" }, ne.flatMap(S))
        ])
      ]
    );
  }
  return b;
}
function il(n) {
  const { layers: t, plotTreesById: l, boardShape: e } = n, { viewBox: o, path: a } = Se(e), r = de(he, t), s = de(ee, t), u = Ke(t), p = {
    viewBox: o,
    svgFragment: a === void 0 ? void 0 : Ue(a)
  }, d = {};
  for (const { id: b } of t)
    d[b] = Ue(
      j.renderFragment(l[b])
    );
  return {
    layers: t,
    topLayers: r,
    bottomLayers: s,
    drillLayers: u,
    boardShapeRenderFragment: p,
    svgFragmentsById: d
  };
}
async function sl(n, t = {}) {
  var Ce;
  const l = (c) => typeof c == "string" ? c : c instanceof Uint8Array ? new TextDecoder().decode(c) : c instanceof ArrayBuffer ? new TextDecoder().decode(new Uint8Array(c)) : String(c), e = (c) => {
    if (c)
      switch (String(c).toLowerCase()) {
        case "top":
          return "top";
        case "bottom":
          return "bottom";
        case "inner":
          return "inner";
        case "all":
          return "all";
        default:
          return;
      }
  }, o = (c) => {
    if (c)
      switch (c) {
        case "copper":
        case "soldermask":
        case "silkscreen":
        case "solderpaste":
        case "drill":
        case "outline":
        case "drawing":
          return c;
        default:
          return;
      }
  }, a = [];
  for (const c of n) {
    const f = fe(), m = l(c.gerber), I = Fe.parse(m);
    a.push({
      id: f,
      filename: c.filename,
      type: o(c.type),
      side: e(c.side),
      parseTree: I
    });
  }
  const r = a.map((c) => ({
    id: c.id,
    filename: c.filename,
    type: c.type,
    side: c.side
  })), s = Object.fromEntries(
    a.map((c) => [c.id, c.parseTree])
  );
  let u, p, d;
  for (const c of a) {
    const f = c.parseTree.children;
    for (const m of f)
      !u && (m == null ? void 0 : m.type) === le && m.units && (u = m.units), !p && (m == null ? void 0 : m.type) === Z && m.format && (p = m.format), !d && (m == null ? void 0 : m.type) === Z && m.zeroSuppression && (d = m.zeroSuppression);
  }
  if (u || p || d)
    for (const c of a) {
      const f = c.parseTree.children, m = f.some((x) => (x == null ? void 0 : x.type) === le), I = f.some((x) => (x == null ? void 0 : x.type) === Z), P = [];
      !m && u && P.push({ type: le, units: u }), !I && (p || d) && P.push({ type: Z, format: p, zeroSuppression: d }), P.length > 0 && (c.parseTree.children = [...P, ...f]);
    }
  const b = Object.fromEntries(
    r.map((c) => [c.id, ie.plot(s[c.id])])
  ), S = b[(Ce = r[0]) == null ? void 0 : Ce.id], C = (S == null ? void 0 : S.units) ?? "mm", A = (c) => C === "mm" ? c : c / 25.4, E = (c) => C === "mm" ? c : c * 25.4, W = t.maxOutlineGapMm != null ? A(t.maxOutlineGapMm) : C === "mm" ? A(0.5) : 0.02, ne = Ze(r, b, W), H = ie.BoundingBox.sum(
    Object.values(b).map((c) => c.size)
  ), R = j.sizeToViewBox(H), M = Se(ne), D = {};
  for (const { id: c } of r) {
    const f = j.render(b[c], M.viewBox);
    D[c] = f;
  }
  let K = {
    layers: r,
    rendersById: D,
    boardShapeRender: M
  }, X = Jt(K);
  const [, , te, ln] = M.viewBox, we = `${E(te)}mm`, ke = `${E(ln)}mm`, on = new Map(
    n.map((c, f) => [r[f].id, { color: c.color, opacity: c.opacity }])
  );
  for (const { id: c } of r) {
    const f = D[c];
    if (!f)
      continue;
    f.properties = f.properties ?? {}, f.properties.width = we, f.properties.height = ke;
    const m = on.get(c);
    m != null && m.color && (f.properties.color = m.color), typeof (m == null ? void 0 : m.opacity) == "number" && (f.properties.opacity = String(m.opacity));
  }
  const L = t.boardColors ?? {}, rn = (c) => {
    var I;
    const f = [c], m = [];
    for (; f.length; ) {
      const P = f.pop();
      m.push(P);
      const x = P.children ?? [];
      for (const y of x)
        y && y.type === "element" && f.push(y);
    }
    for (const P of m.filter((x) => {
      var y;
      return x.tagName === "g" && typeof ((y = x.properties) == null ? void 0 : y.mask) == "string" && x.properties.mask.startsWith("url(#drill-");
    }))
      if (L.copper) {
        const x = P.children ?? [];
        for (const y of x)
          y.tagName === "g" && (y.properties = y.properties ?? {}, y.properties.color = L.copper);
      }
    for (const P of m.filter((x) => {
      var y;
      return x.tagName === "g" && typeof ((y = x.properties) == null ? void 0 : y.mask) == "string" && x.properties.mask.startsWith("url(#resist-");
    })) {
      const x = P.children ?? [];
      for (const y of x)
        y.tagName === "rect" && L.soldermask && (y.properties = y.properties ?? {}, y.properties.fill = L.soldermask), y.tagName === "g" && L.silkscreen && (y.properties = y.properties ?? {}, y.properties.color = L.silkscreen);
    }
    if (L.solderpaste)
      for (const P of m)
        P.tagName === "g" && typeof ((I = P.properties) == null ? void 0 : I.color) == "string" && P.properties.color === "#999" && (P.properties.color = L.solderpaste);
  };
  for (const c of [he, ee]) {
    const f = X[c];
    f && (f.properties = f.properties ?? {}, f.properties.width = we, f.properties.height = ke, rn(f));
  }
  const an = `${E(R[2])}mm`, sn = `${E(R[3])}mm`;
  return { renderLayersResult: K, renderBoardResult: X, compositeViewBox: R, compositeWidthMm: an, compositeHeightMm: sn };
}
export {
  sl as fromMemoryLayers,
  rl as plot,
  ol as read,
  Jt as renderBoard,
  il as renderFragments,
  al as renderLayers,
  Ue as stringifySvg
};
//# sourceMappingURL=tracespace-core.js.map
