const p = require("path");
const f = require("fs");
const { createMacro } = require("babel-plugin-macros");
const csstaCall = require("../babel-plugin/visitors/csstaCall");
const { addImport } = require("./util");

module.exports = createMacro(arg => {
  const { babel, state, references } = arg;

  const jsFilename = state.file.opts.filename;
  const cssFilename = p.join(
    p.dirname(jsFilename),
    `.cssta-${p.basename(jsFilename, ".js")}.css`
  );
  /* eslint-disable no-param-reassign */
  state.currentWebCss = "/* File generated by babel-plugin-cssta */\n";
  references.default
    .map(path => path.findParent(babel.types.isTaggedTemplateExpression))
    .forEach(path => {
      csstaCall.TaggedTemplateExpression(babel, path, state);
    });

  const { currentWebCss } = state;
  if (currentWebCss) {
    // Force CSS to be loaded last
    // Safe to insert at the end, as import statements are hoisted
    addImport(arg, {}, cssFilename, { atEndOfProgram: true });
    f.writeFileSync(cssFilename, currentWebCss);
  }
});