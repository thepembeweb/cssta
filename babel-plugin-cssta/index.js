/* eslint-disable no-param-reassign */
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const t = require('babel-types');
const _ = require('lodash/fp');
const webExtractRules = require('cssta/src/web/extractRules');
const nativeExtractRules = require('cssta/src/native/extractRules');
const { createValidatorNodeForSelector } = require('cssta/src/native/selectorTransform');
const cssNameGenerator = require('css-class-generator');

const animationKeywords = [
  'alternate',
  'alternate-reverse',
  'backwards',
  'both',
  'ease',
  'ease-in',
  'ease-in-out',
  'ease-out',
  'forwards',
  'infinite',
  'linear',
  'none',
  'normal',
  'paused',
  'reverse',
  'running',
  'step-end',
  'step-start',
  'initial',
  'inherit',
  'unset',
];

let classGenerator = null;
let animationGenerator = null;

const resetGenerators = () => {
  classGenerator = cssNameGenerator();
  animationGenerator = (function* gen() {
    for (const value of cssNameGenerator()) {
      if (!_.includes(value, animationKeywords)) yield value;
    }
  }());
};

resetGenerators();

const csstaConstructorExpressionTypes = {
  CallExpression: element => [element.callee, element.arguments[0]],
  MemberExpression: element => [
    element.object,
    element.computed ? element.property : t.stringLiteral(element.property.name),
  ],
};

const writeCssToFile = (outputCss, cssFilename) => {
  mkdirp.sync(path.dirname(cssFilename));
  fs.writeFileSync(cssFilename, outputCss, {
    encoding: 'utf-8',
    flag: 'w+',
  });
};

const jsonToNode = (object) => {
  if (typeof object === 'string') {
    return t.stringLiteral(object);
  }
  return t.objectExpression(Object.keys(object).map(key => (
    t.objectProperty(
      t.stringLiteral(key),
      jsonToNode(object[key]),
      true
    )
  )));
};

const transformWebCssta = (element, state, css, elementType) => {
  const filename = state.file.opts.filename;
  const cssFilename = path.resolve(
    process.cwd(),
    _.getOr('styles.css', ['opts', 'output'], state)
  );
  let existingCss;

  try {
    existingCss = fs.readFileSync(cssFilename, 'utf-8');
  } catch (e) {
    existingCss = '/* File generated by babel-plugin-cssta */\n';
  }

  const isInjectGlobal = t.isStringLiteral(elementType) && elementType.value === 'injectGlobal';

  let commentMarker;

  if (!isInjectGlobal) {
    state.outputIndexPerFile = _.update( // eslint-disable-line
      [filename],
      index => (index || 0) + 1,
      state.outputIndexPerFile || {}
    );

    const index = _.get([filename], state.outputIndexPerFile);

    commentMarker = `/* ${filename.replace(/\*/g, '')} (index: ${index}) */`;
  } else {
    commentMarker = '/* Injected Globals */';
  }

  if (existingCss.indexOf(commentMarker) !== -1) {
    throw new Error('You must remove the existing CSS file before running files through babel');
  }

  let outputCss;
  let newElement = null;

  if (!isInjectGlobal) {
    const { css: output, baseClassName, classNameMap } = webExtractRules(css, {
      generateClassName: () => classGenerator.next().value,
      generateAnimationName: () => animationGenerator.next().value,
    });

    outputCss = `${existingCss}\n${commentMarker}\n${output}`;
    writeCssToFile(outputCss, cssFilename);

    const createComponent = state.createComponentReferences[filename].web;
    const baseClass = baseClassName
      ? t.stringLiteral(baseClassName)
      : t.nullLiteral();

    newElement = t.callExpression(createComponent, [
      elementType,
      baseClass,
      jsonToNode(classNameMap),
    ]);
  } else {
    outputCss = `${existingCss}\n${commentMarker}\n${css}`;
  }

  writeCssToFile(outputCss, cssFilename);

  if (newElement) {
    element.replaceWith(newElement);
  } else {
    element.remove();
  }
};

const transformNativeCssta = (element, state, css, elementType) => {
  const { rules, styleSheetBody, propTypes } = nativeExtractRules(css);
  const styleSheetReference = element.scope.generateUidIdentifier('csstaStyle');
  const validator = _.map(rule => (
    t.objectLiteral([
      t.objectProperty(
        t.stringLiteral('validator'),
        createValidatorNodeForSelector(rule.selector)
      ),
      t.objectProperty(
        t.stringLiteral('style'),
        t.memberExpression(
          styleSheetReference,
          t.stringLiteral(rule.styleName),
          true
        )
      ),
    ])
  ), rules);
  console.log(rules, validator);
};

const transformCsstaCall = (element, state, node, stringArg) => {
  if (!(node.type in csstaConstructorExpressionTypes)) return;

  const [callee, elementType] = csstaConstructorExpressionTypes[node.type](node);

  if (!t.isIdentifier(callee)) return;

  const filename = state.file.opts.filename;
  const csstaType = _.get([filename, callee.name], state.csstaReferenceTypesPerFile);

  if (!csstaType) return;

  if (t.isTemplateLiteral(stringArg) && stringArg.expressions.length > 0) {
    throw new Error('You cannot use interpolation in template strings (i.e. `color: ${primary}`)'); // eslint-disable-line
  }

  let css = _.get(['quasis', 0, 'value', 'raw'], stringArg);
  if (!css) css = _.get(['value'], stringArg);
  if (css === undefined) throw new Error('Failed to read CSS');

  if (csstaType === 'web') {
    transformWebCssta(element, state, css, elementType);
  } else if (csstaType === 'native') {
    transformNativeCssta(element, state, css, elementType);
  }
};

const createComponentLocations = {
  web: 'cssta/lib/web/createComponent',
  native: 'cssta/lib/native/createComponent',
};

const externalReferences = {
  'react-native': {
    StyleSheet: 'stylesheet',
  },
};

module.exports = () => ({
  visitor: {
    ImportDeclaration(element, state) {
      let csstaType;

      const dependency = element.node.source.value;
      const specifiers = element.node.specifiers;

      const filename = state.file.opts.filename;

      if (dependency in externalReferences) {
        const referencesToRecord = externalReferences[dependency];

        _.forEach((specifier) => {
          let importName;
          if (t.isImportSpecifier(specifier)) {
            importName = specifier.imported.name;
          } else if (t.isDefaultSpecifier(specifier)) {
            importName = 'default';
          }

          if (importName && importName in referencesToRecord) {
            state.externalReferencesPerFile = _.set(
              [filename, referencesToRecord[importName]],
              specifier.local,
              state.externalReferencesPerFile
            );
          }
        }, specifiers);

        return;
      }

      if (dependency === 'cssta' || dependency === 'cssta/web') {
        csstaType = 'web';
      } else if (dependency === 'cssta/native') {
        csstaType = 'native';
      }

      if (!csstaType) return;

      const defaultSpecifiers = _.flow(
        _.filter({ type: 'ImportDefaultSpecifier' }),
        _.map('local.name'),
        _.compact
      )(specifiers);

      const specifierReferenceTypes = _.flow(
        _.map(reference => [reference, csstaType]),
        _.fromPairs
      )(defaultSpecifiers);

      state.csstaReferenceTypesPerFile = _.update(
        [filename],
        _.assign(specifierReferenceTypes),
        state.csstaReferenceTypesPerFile || {}
      );

      const createComponentReferencePath = [filename, csstaType];
      if (!_.get(createComponentReferencePath, state.createComponentReferences)) {
        const reference = element.scope.generateUidIdentifier('csstaCreateComponent');

        state.createComponentReferences = _.set(
          createComponentReferencePath,
          reference,
          state.createComponentReferences
        );
        const newImport = t.importDeclaration([
          t.importDefaultSpecifier(reference),
        ], t.stringLiteral(createComponentLocations[csstaType]));
        element.replaceWith(newImport);
      } else {
        element.remove();
      }
    },
    CallExpression(element, state) {
      const { node } = element;
      const { callee } = node;
      const [stringArg] = node.arguments;
      if (!t.isTemplateLiteral(stringArg) && !t.isStringLiteral(stringArg)) return;
      transformCsstaCall(element, state, callee, stringArg);
    },
    TaggedTemplateExpression(element, state) {
      const { quasi, tag } = element.node;
      transformCsstaCall(element, state, tag, quasi);
    },
  },
});

module.exports.resetGenerators = resetGenerators;
