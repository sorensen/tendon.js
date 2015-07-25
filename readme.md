Tendon.js
=========

> Two way data binding for [Backbone](http://backbonejs.org/) and the DOM

[![Build Status](https://secure.travis-ci.org/sorensen/tendon.js.png)](http://travis-ci.org/sorensen/tendon.js) 
[![devDependency Status](https://david-dm.org/sorensen/tendon.js.png)](https://david-dm.org/sorensen/tendon.js#info=dependencies)
[![NPM version](https://badge.fury.io/js/tendon.js.png)](http://badge.fury.io/js/tendon.js)

Tired of writing tons of repetative Backbone code to update the DOM? Tired of wiring
up DOM listeners to update your Backbone models? Well then this might be what you're 
looking for!

This library has 3 primary purposes.

1. Update the DOM when the JS data changes
2. Update the JS when the DOM data changes
3. Handle templating because thats how I roll

This library takes a slightly different approach for data bindings, in that nearly 
all of the configuration is in the HTML markup itself. The primary reason for this 
is that it provided me a way to keep my JS very lightweight and straight forward, 
as well as allow me to rapidly change the UI/UX of an application without having 
to rewrite my entire JS app.

It may be somewhat of an anti-pattern to put so much control in HTML, but hey, this 
library is mainly about rendering and keeping state in sync. If you prefer putting 
your HTML inside your JS and then embedded JS inside of that HTML, maybe React is for you.


### Table of Contents

* [Install](#install)
* [Usage](#usage)
* [API](#api)
* [License](#license)


Install
-------

This is a client side library, but still exports to Node.js if you are doing 
some fancy backend stuff. Writing the obligatory install steps, but if you've 
made it this far you probably know what to do here.

With [npm](https://npmjs.org)

```sh
npm install tendon
```

With [bower](http://bower.io/)

```sh
bower install tendon
```

Or download the JS files directly and load into the browser.

```html
<script src="path/to/tendon.js"></script>
```


Usage
-----

Generally, there shouldn't be much JS interaction with the library, it is meant to 
do as much as it can automatically for you based on the HTML markup it finds within 
the element you give it.

```js
var Model = Backbone.Model.extend({
  defaults: {
    menuItems: ['Home', 'About', 'Contact']
  , activeItem: null
  , locked: 'locked'
  }
})

var View = Backbone.View.extend({
  el: 'body'
  
, initialize: function() {
    // All template rendering will use this, as well as any subscribe
    // or publish events specified in the markup
    var context = {
      view: this
    , model: this.model
    , store: window.localStorage
    }

    // The initialize of Tendon is going to find all relevant elements and do 
    // what the markup attributes say
    this.tendon = new window.Tendon(this.$el, context)

    // You can also listen for specific changes if you want to some extra fancy
    // stuff. Think of things like JSONView or Highlight.js calls.
    this.tendon.on('updateElement:elementID', function($element, content) {

    })

    // Backbone-esque version of above
    this.tendon.on('updateElement', function($element, content) {

    })
  }
})

// Such app creation, new models, wow.
window.app = new View({
  model: new Model()
})
```

Examples
--------

### 1 Way Binding - Contents

Lets start off small and create a 1 way binding to update the contents of a div.
We need to know what events trigger a DOM update, and how to get the data for 
the update.

1. Listen to the model event `change:username`
2. Update content with the model `username` property

```html
<div 
  tendon-subscribe="model.change:username" 
  tendon-set-value="model:username"
></div>
```

### 1 Way Binding - Attribute

Here we have an element that we only want to update the class attribute on. This 
is a one-way binding as there is no `tendon-publish` attribute and no way to get 
a value. The attributes here do the following:

1. Bind content changes to an attribute, `class` in this case, using `tendon-set-attribute`
2. Use the specific value, `model:status` aka `model.get('status')`, using `tendon-set-value`
3. Trigger a content update on `model.change:locked` aka `model.on('change:status')`

Using this setup, anytime the model's `status` attribute changes, the DOM element 
will update its `class` attribute with that value.

```html
<div 
  tendon-set-value="model:status" 
  tendon-set-attribute="class"
  tendon-subscribe="model.change:status"
/>
```

Here we are going to use templates and publishing to setup two way binding. 

1. Listen to the `model` events; `sync`, `change:menuItems`, and `change:activeItem`
2. Update the innerHTML content using the results of the template from `tendon-template` attribute.
   The template will be called with the `context` provided on initialization
3. Listen to all child `li` element changes via the `tendon-listen-to` attribute
4. Publish any changes found by setting the `model:activeItem` prop, aka `model.set('activeItem')`
5. Trigger an render on initialization via `tendon-auto-render`

```html
<script type="text/html" id="my-list-template">
  {{ var active = __.model.get('activeItem') }}

  {{ __.model.get('menuItems').forEach(function(item) { }}
    <li {{= (item === cur) ? 'class="active"' : '' }}>{{ item }}</li>
  {{ }) }}
</script>

<ul 
  tendon-subscribe="model.sync, model.change:menuItems, model.change:activeItem"
  tendon-auto-render="true"
  tendon-template="script#my-list-template"
  tendon-listen-to="li"
  tendon-publish="model:activeItem"
><!-- filed in by Tendon using template above --></ul>
```


HTML Attribute Options
----------------------

* `tendon-subscribe` {String} list of model events to listen to in the format `model.event:property`
* `tendon-publish` {String} list of model events to publish HTML changes to
* `tendon-auto-render` {Boolean} flag to signal initial rendering call, use if the data already exists in the `context` and the page was not bootstrapped with content
* `tendon-template` {String} jQuery selector for underscore template, if set this will be run with the provided `context` and set as the inner HTML
* `tendon-set-value` {String} model attribute or method to be used as direct value
* `tendon-set-attribute` {String} element attribute to assign value to, innerHTML is set if not specified
* `tendon-listen-to` {String} jQuery selector to specify a child element(s) to listen for changes, instead of the current element
* `tendon-uuid` {String} internally set UUID to identify source of HTML update events



Events
------

* `updateElement`
* `updateElement:id`



API
---

The methods here are mainly all to be used internally, they aren't named fairly 
well at the moment and will most likely be changed.


### new Tendon($selector, context, options)

Class constructor, automatically creates all DOM and Backbone event bindings for 
any element found within the `$selector` containing `tendon-` attributes.

* `$selector` - jQuery element or string selector, this is the DOM context
* `context` - JS context object
* `options` - option overrides, merged with `Tendon.defaults` described below

```js
var App = Backbone.View.extend({
  initialize: function() {
    var context = {
      view: this
    }
    this.tendon = new Tendon(this.$el, context)
  }
})
```

### Tendon.defaults

* `prefix` - HTML attribute prefix
* `debug` - boolean to toggle debug logging
* `templateSettings` - custom underscore template settings

```js
{
  prefix: 'tendon-'
, debug: false
, templateSettings: {
    variable:    '__'
  , evaluate:    /\{\{(.+?)\}\}/g
  , interpolate: /\{\{=(.+?)\}\}/g
  , escape:      /\{\{-(.+?)\}\}/g
  }
}
```

### instance.log(args, ...)

Simple wrapper around `console.log`, shorts out if not in `debug` mode

```js
tendon.log('the time is %d', Date.now())
```


### instance.getTemplate(args, ...)

Find an embedded underscore template within the current DOM context, create and 
return a template method using the current `templateSettings`. This is triggered 
by an element containing the `tendon-template="selector"` attribute.

* `selector` - jQuery selector string of template

```js
var tmpl = tendon.getTemplate('script#my-list-template')
```


### instance.getValue(args, ...)

Description

* `arg` - description

```js
example
```


### instance.updateElement(args, ...)

Description

* `arg` - description

```js
example
```


### instance.setupPublish(args, ...)

Description

* `arg` - description

```js
example
```


### instance.onHTMLChange(args, ...)

Description

* `arg` - description

```js
example
```


### instance.setupSubscribe(args, ...)

Description

* `arg` - description

```js
example
```


### instance.onJSChange(args, ...)

Description

* `arg` - description

```js
example
```


### instance.setup(args, ...)

Description

* `arg` - description

```js
example
```


### instance.id(args, ...)

Description

* `arg` - description

```js
example
```


License
-------

(The MIT License)

Copyright (c) 2015 Beau Sorensen

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.