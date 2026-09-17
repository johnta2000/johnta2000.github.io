// Generated from convex/noteRichText.ts. Run node scripts/build-note-rich-text.mjs.
var RallyNoteRichText = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // convex/noteRichText.ts
  var noteRichText_exports = {};
  __export(noteRichText_exports, {
    normalizeRichText: () => normalizeRichText,
    richTextHtml: () => richTextHtml,
    richTextPlain: () => richTextPlain,
    safeNoteLink: () => safeNoteLink
  });
  var containers = /* @__PURE__ */ new Set(["p", "strong", "em", "u", "ul", "ol", "li", "a"]);
  function safeNoteLink(value) {
    if (typeof value !== "string" || value.length > 2e3 || /[\u0000-\u0020\u007f]/.test(value)) return "";
    try {
      const url = new URL(value);
      return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function normalizeRichText(value) {
    let count = 0, characters = 0;
    const walk = (nodes, depth) => {
      if (!Array.isArray(nodes) || depth > 12) throw new Error("This note has too much formatting. Simplify it and try again.");
      return nodes.map((node) => {
        if (++count > 2e3 || !node || typeof node !== "object") throw new Error("Invalid note formatting.");
        if (node.type === "text") {
          if (typeof node.text !== "string" || (characters += node.text.length) > 4e3) throw new Error("Write a note between 1 and 4,000 characters.");
          return { type: "text", text: node.text };
        }
        if (node.type === "br") return { type: "br" };
        if (!containers.has(node.type)) throw new Error("Unsupported note formatting.");
        const children = walk(node.children, depth + 1);
        if (node.type === "a") {
          const href = safeNoteLink(node.href);
          if (!href) throw new Error("Use an https://, http://, or mailto: link.");
          return { type: "a", href, children };
        }
        return { type: node.type, children };
      });
    };
    return walk(value, 0);
  }
  function richTextPlain(nodes) {
    return nodes.map((node) => node.type === "text" ? node.text : node.type === "br" ? "\n" : richTextPlain(node.children || []) + (["p", "li"].includes(node.type) ? "\n" : "")).join("");
  }
  var escape = (value) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function richTextHtml(value) {
    const render = (nodes) => nodes.map((node) => node.type === "text" ? escape(node.text || "") : node.type === "br" ? "<br>" : `<${node.type}${node.type === "a" ? ` href="${escape(node.href)}" target="_blank" rel="noopener noreferrer"` : ""}>${render(node.children || [])}</${node.type}>`).join("");
    return render(normalizeRichText(value));
  }
  return __toCommonJS(noteRichText_exports);
})();
