// @flow
/*
CAUTION!

This file could be included even after running the babel plugin.

Make sure you don't import large libraries.
*/
/* eslint-disable no-param-reassign */
const componentFactory = require("../factories/componentFactory");
/*:: import type { Args } from './types' */

const factory = componentFactory((ownProps, passedProps, args /*: Args */) => {
  const { defaultClassName, classNameMap } = args;
  const classNames = Object.keys(ownProps)
    .map(propName => classNameMap[propName][ownProps[propName]])
    .filter(Boolean); // remove undefined values

  if (defaultClassName) classNames.push(defaultClassName);
  if (passedProps.className) classNames.push(passedProps.className);

  const className = classNames.join(" ");

  return className.length > 0
    ? Object.assign({}, passedProps, { className })
    : passedProps;
});

// Optimisation allows not passing propTypes on prod
module.exports = (
  component /*: any */,
  propTypes /*: ?Object */,
  args /*: Args */
) => factory(component, propTypes || Object.keys(args.classNameMap), args);
