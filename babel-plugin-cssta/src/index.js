/* eslint-disable no-param-reassign */
const p = require('path');
const t = require('babel-types');
const _ = require('lodash/fp');
const { varRegExp } = require('cssta/dist/util');
const transformWebCssta = require('./converters/web');
const transformNativeCssta = require('./converters/native');
const removeSetPostCssPipeline = require('./optimizations/removeSetPostCssPipeline');
const singleSourceOfVariables = require('./optimizations/singleSourceOfVariables');
const {
  getCsstaReferences, interpolationTypes, extractCsstaCallParts,
} = require('./transformUtil/extractCsstaCallParts');
const {
  csstaModules, getImportReferences, getCsstaTypeForCallee,
  getOptimisationOpts,
} = require('./util');

const canInterpolate = {
  web: false,
  native: true,
};

const transformCsstaTypes = {
  web: transformWebCssta,
  native: transformNativeCssta,
};

const transformCsstaCall = (path, state, target, stringArg) => {
  const csstaReferenceParts = getCsstaReferences(path, target);
  if (!csstaReferenceParts) return;

  const { callee, component, csstaType } = csstaReferenceParts;

  let interpolationType;
  const interpolateValuesOnly = Boolean(getOptimisationOpts(state, 'interpolateValuesOnly'));

  if (!canInterpolate[csstaType]) {
    interpolationType = interpolationTypes.DISALLOW;
  } else if (!interpolateValuesOnly) {
    interpolationType = interpolationTypes.IGNORE;
  } else {
    interpolationType = interpolationTypes.ALLOW;
  }

  const callParts = extractCsstaCallParts(stringArg, interpolationType);
  if (!callParts) return;

  let { cssText, substitutionMap } = callParts; // eslint-disable-line

  if (state.singleSourceOfVariables) {
    cssText = cssText.replace(varRegExp, (m, variableName, fallback) => (
      state.singleSourceOfVariables[variableName] || fallback
    ));
  }

  transformCsstaTypes[csstaType](path, state, component, cssText, substitutionMap);
  const binding = path.scope.getBinding(callee.name);
  binding.dereference();
};


module.exports = () => ({
  visitor: {
    Program: {
      enter(path, state) {
        const singleSourceVariableOpts = getOptimisationOpts(state, 'singleSourceOfVariables');

        if (!state.singleSourceOfVariables && singleSourceVariableOpts) {
          if (!singleSourceVariableOpts.sourceFilename) {
            throw new Error(
              'You must provide `sourceFilename` in the options for singleSourceOfVariables'
            );
          }

          const fileContainingVariables = p.join(
            state.opts.cwd || process.cwd(),
            singleSourceVariableOpts.sourceFilename
          );
          const exportedVariables =
            singleSourceOfVariables(fileContainingVariables, state.file.opts);
          state.singleSourceOfVariables = exportedVariables;
        }
      },
      exit(path, state) {
        const allCsstaImportRefences = _.flatMap(moduleName => (
          getImportReferences(path, state, moduleName, 'default')
        ), _.keys(csstaModules));
        const unreferencedCsstaImportReferences = _.filter(csstaPath => (
          csstaPath.references === 0
        ), allCsstaImportRefences);

        _.forEach((reference) => {
          const importDeclaration = reference.path.findParent(t.isImportDeclaration);
          importDeclaration.remove();
        }, unreferencedCsstaImportReferences);
      },
    },
    CallExpression(path, state) {
      const { node } = path;
      const { callee } = node;
      const [arg] = node.arguments;
      if (
        t.isMemberExpression(callee) &&
        _.get('property.name', callee) === 'setPostCssPipeline' &&
        getCsstaTypeForCallee(path, callee.object)
      ) {
        removeSetPostCssPipeline(path);
      } else {
        transformCsstaCall(path, state, callee, arg);
      }
    },
    TaggedTemplateExpression(path, state) {
      const { quasi, tag } = path.node;
      transformCsstaCall(path, state, tag, quasi);
    },
  },
});

module.exports.resetGenerators = transformWebCssta.resetGenerators;
