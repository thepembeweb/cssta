// @flow
/*
CAUTION!

This file could be included even after running the babel plugin.

Make sure you don't import large libraries.
*/
/* eslint-disable no-param-reassign */
const componentFactory = require("../factories/componentFactory");
const { getAppliedRules } = require("./util");
/*:: import type { Args } from './types' */

module.exports = componentFactory((ownProps, passedProps, args /*: Args */) => {
  let style = getAppliedRules(args.rules, ownProps).map(rule => rule.style);

  if ("style" in passedProps) style = style.concat(passedProps.style);

  return style.length > 0
    ? { ...passedProps, style: style.length === 1 ? style[0] : style }
    : passedProps;
});
