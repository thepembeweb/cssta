---
layout: page
title: Native
permalink: /native/
---

# 📱 Native

For React Native, you need to import `cssta/native`, and unlike the web version, there’s no `cssta.View` syntax. Other than that, it works as normal.

```jsx
import { cssta } from "cssta/native"
import { Text } from "react-native"

const StyledView = cssta(Text)`
  color: red;
`
```

You’ll still want to run your code through the babel plugin, as we do a lot of optimisations. See [Production Builds]({{ site.baseurl }}/production-builds#-native) for how to do this.

## 📝 CSS Support

Cssta for React Native supports all the CSS React Native supports, and has the same syntax as your browser.

```css
font-size: 12px;
color: red;
```

There’s also support for short-hands.

```css
margin: 0px 5px; /* { marginTop: 0, marginRight: 5, ... } */
font: bold italic 12px/18px "Helvetica";
```

And support for more complicated attributes.

```css
shadow-offset: 10px 5px; /* { width: 10, height: 5 } */
font-variant: small-caps; /* ["small-caps"] */
transform: scale(3) rotate(30deg); /* [{ scale: 3 }, { rotate: "30deg" }] */
```

For more information, see [css-to-react-native](https://www.npmjs.com/package/css-to-react-native).

## 🔍 Selectors

The only selectors supported on React Native are,

* Prop selectors (`[@boolAttribute]` and `[@stringAttribute="stringValue"]`)
* `:not(…)`
* `:matches(…)`

And these selectors work as normal.

```jsx
cssta(Text)`
  &[@color="red"] { ... }

  &:matches([@color="red"], [@color="blue"]) { ... }

  &:not([@allowOverflow]) { ... }
`
```

Cssta for React Native does not use specificity: rules get applied in the order defined.

## 🎚 Polyfills

Cssta includes a load of wrappers around React Native’s built-in features that you from CSS. Any components that aren’t using certain polyfills won’t run any code for them, and even better, if you aren’t using a polyfill at all, the code won’t even be included in your production build!

The ones we include are,

* [Media Queries]({{ site.baseurl }}/native/custom-properties-interpolation): `var(--property)`
* [Transitions and Animations]({{ site.baseurl }}/native/animations): `@keyframes` etc.
* [CSS custom properties]({{ site.baseurl }}/native/custom-properties-interpolation): `var(--property)`
* [CSS color function](https://drafts.csswg.org/css-color/#modifying-colors): `color(red tint(50%))`

### ❓ Media Queries

These work as normal. You don’t need to specify [screen](https://developer.mozilla.org/en-US/docs/Web/CSS/@media#Media_types). The [media features](https://developer.mozilla.org/en-US/docs/Web/CSS/@media#Media_features) we support are,

* Width and height (including min and max)
* Aspect ratio (including min and max)
* Orientation

```jsx
cssta(View)`
  font-size: 12px;

  @media (max-width: 800px) {
    font-size: 14px;
  }
`
```
