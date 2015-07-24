/*!
 *  (c) 2015 Beau Sorensen
 *  MIT Licensed
 *  For all details and documentation:
 *  https://github.com/sorensen/tendon.js
 */

// TODO: Verify on-change detection for all HTML element types

;(function() {
'use strict'

/*!
 * Module dependencies.
 */

var Backbone = this.Backbone
  , _ = this._
  , $ = this.$

/**
 * Tendon constructor
 *
 * @param {Object|String} HTML bounding, jQuery object or selector
 * @param {Object} rendering / update context object
 * @param {Object} options hash
 *   - `prefix` {String} custom dom selector prefix (optional, default `tendon-`)
 *
 * HTML element attributes used:
 *
 *   `tendon-subscribe` {String} list of model events to listen to in the format `model.event:property`
 *   `tendon-publish` {String} list of model events to publish HTML changes to
 *   `tendon-auto-render` {Boolean} flag to signal initial rendering call, use if the data already exists in the `context` and the page was not bootstrapped with content
 *   `tendon-template` {String} jQuery selector for underscore template, if set this will be run with the provided `context` and set as the inner HTML
 *   `tendon-set-value` {String} model attribute or method to be used as direct value
 *   `tendon-set-attribute` {String} element attribute to assign value to, innerHTML is set if not specified
 *   `tendon-listen-to` {String} jQuery selector to specify a child element(s) to listen for changes, instead of the current element
 *   `tendon-uuid` {String} internally set UUID to identify source of HTML update events
 *
 * Example usage:
 *
 *   <script type="text/html" id="my-list-template">
 *     {{ var active = __.sessionModel.get('menuItem') }}
 *
 *     {{ __.appModel.get('menuItems').forEach(function(item) { }}
 *       <li {{= (item === cur) ? 'class="active"' : '' }}>{{ item }}</li>
 *     {{ }) }}
 *   </script>
 *
 *   <ul 
 *     tendon-subscribe="appModel:menuItems, sessionModel:menuItem"
 *     tendon-publish="sessionModel:menuItem"
 *     tendon-auto-render="true"
 *     tendon-template="script#my-list-template"
 *     tendon-set-value="false"
 *     tendon-set-attribute=""
 *     tendon-listen-to="li"
 *     tendon-uuid="tendon-3"
 *   />
 *
 * Any element found within the given HTML context will be setup 
 * automatically, and bound to the given context.
 */

function Tendon($main, context, options) {
  this.log('[Tendon.init]')

  var self = this

  _.extend(this, Backbone.Events)

  // Cache selector, create jQuery context if string provided
  this.$main = typeof $main === 'string' ? $($main) : $main
  this.context = context || {}
  this.options = _.extend({}, Tendon.defaults, options || {})

  var pre = this.options.prefix

  // Find all HTML elements with tendon-based properties, 
  // run each element found through setup process
  var $found = $main.find([
    'template'
  , 'set-value'
  , 'set-attribute'
  , 'listen-to'
  , 'auto-render'
  , 'publish'
  , 'subscribe'
  ].map(function(prop) {
    return pre + prop
  }).join(','))

  $found.each(function(i, el) {
    self.setup(el)
  })
}

/*!
 * Default class settings
 */

Tendon.defaults = Object.freeze({
  // DOM attribute prefix
  prefix: 'tendon-'

  // Simple template settings. {{ }} vs <% %>
, templateSettings: {
    variable:    '__'
  , evaluate:    /\{\{(.+?)\}\}/g
  , interpolate: /\{\{=(.+?)\}\}/g
  , escape:      /\{\{-(.+?)\}\}/g
  }
})

/**
 * Logging helper, send to console if `debug` mode is enabled
 *
 * @param {Any} args to send to `console.log`
 * @chainable
 */

Tendon.prototype.log = function() {
  if (!this.options.debug) return this
  console.log.apply(console, arguments)
  return this
}

/**
 * Find an embedded underscore template within the HTML context, 
 * and create a template function with its content
 *
 * @param {String} template selector
 * @return {Function} template function
 */

Tendon.prototype.getTemplate = function(selector) {
  this.log('[Tendon.getTemplate] selector=`%s`', selector)

  var $tmpl = this.$main.find(selector)
    , str = $tmpl.html()

  if (!str) {
    throw new Error('Invalid template: ' + selector)
  }
  return _.template(str, this.options.templateSettings)
}

/**
 * Get the Backbone value for a given element defined in the 
 * `tendon-set-value` attribute. Can be direct property or method.
 *
 * Example:
 *
 *   method: <div tendon-set-value="model:getSites" />
 *   property: <div tendon-set-value="model:sites" />
 *
 * @param {Object} jQuery selector
 * @return {Any} model value
 */

Tendon.prototype.getValue = function($el) {
  var setValue = $el.attr(this.prefix + 'set-value')
    , split = setValue.split(':')
    , from = this.context[split[0]]
    , prop = split[1]

  if (_.isFunction(from[prop])) return from[prop]() // 'model:getSites'
  return from.get(prop) // model:sites
}

/**
 * Setup JS to HTML change subscriptions
 *
 *
 * @chainable
 */

Tendon.prototype.updateElement = function($el) {
  var pre = this.prefix
    , tmpl = $el.attr(pre + 'template')
    , setValue = $el.attr(pre + 'set-value')
    , setAttr = $el.attr(pre + 'set-attribute')
    , id = $el.attr('id')

  this.log('[Tendon.updateElement] id=`%s`', id)

  if (tmpl) tmpl = this.getTemplate(tmpl)

  // Get the new value to use from either the template, 
  // or the specified direct value from an object in the context
  var tmp
  if (tmpl) tmp = tmpl(this.context)
  else if (setValue) tmp = this.getValue($el)

  // Update the element
  if (setAttr) {
    $el.attr(setAttr, tmp || '')
  } else if (tmpl) {
    $el.html(tmp)
  } else if ($el.is('input, select, textarea')) {
    $el.val(tmp)
  } else {
    $el.html(tmp)
  }
  if (id) {
    this.log('[Tendon.updateElement] id=' + id, $el)
    this.trigger('updateElement:' + id, $el)
  }
  return this
}

/**
 * TODO: Ensure all HTML element change events are captured
 *
 * Setup HTML to JS publishing, listen to the given element or 
 * a custom child element for changes
 *
 * Example:
 *
 *   <input tendon-publish="model:property" />
 *   <ul tendon-listen-to="li" />
 *
 * @param {Object} jQuery selector
 * @chainable
 */

Tendon.prototype.setupPublish = function($el) {
  var self = this
    , pre = this.prefix
    , pubs = $el.attr(pre + 'publish')
    , listenTo = $el.attr(pre + 'listen-to')

  if (!pubs) return this

  // Form input element, listen to the `change` event
  if ($el.is('input, select, textarea')) {
    $el.on('change', function() {
      self.onHTMLChange($el)
    })
  // Custom `listenTo` attribute, bind to `click` event
  } else if (listenTo) {
    $el.on('click', listenTo, function(e) {
      var $child = $(e.target).closest(listenTo)

      self.onHTMLChange($el, $child)
    })
  // Default listen mode, bind to `click` event
  } else {
    $el.on('click', function() {
      self.onHTMLChange($el)
    })
  }
  return this
}

/**
 * HTML change handler
 *
 * Example:
 *
 *   <ul 
 *     tendon-publish="model:menuItem" 
 *     tendon-listen-to="li"
 *   />
 *
 * @chainable
 */

Tendon.prototype.onHTMLChange = function($el, $child) {
  var self = this
    , pre = this.prefix
    , $target = $child || $el
    , pubs = $el.attr(pre + 'publish') || ''
    , listenTo = $el.attr(pre + 'listen-to')
    , uuid = this.id($el)

  // TODO: Verify the `html` vs. `data` method usage here is correct
  var val
  if ($target.is('input, select, textarea')) val = $target.val()
  else if (listenTo) val = $target.data()
  else val = $target.html()

  this.log('[Tendon.onHTMLChange] value=`%s` publish=`%s` $el=`%s`', val, pubs, $el)

  pubs.split(',').forEach(function(pub) {
    var cmd = pub.split(':')
      , subject = self.context[cmd[0]]
      , prop = cmd[1]

    // Set the Backbone model value, sending the current HTML element 
    // UUID as the source to prevent circular update logic
    subject.set(prop, val, { source: uuid })
  })
  return this
}

/**
 * Setup HTML to JS change subscriptions, using the `tendon-subscribe`
 * attribute as a CSV list of events to listen to. Values found are 
 * fed directly into the Backbone event system
 *
 * Example:
 *
 *   <div tendon-subscribe="model.change:title change:author" />
 *   <div tendon-subscribe="state.change:version" />
 *
 * @param {Object} jQuery selector
 * @chainable
 */

Tendon.prototype.setupSubscribe = function($el) {
  var self = this
    , subs = $el.attr(this.prefix + 'subscribe') || ''

  subs.split(',').forEach(function(sub) {
    var cmd = sub.split('.')
      , name = cmd[0]
      , event = cmd[1]
      , subject = self.context[name]

    if (!subject) {
      throw new Error('Invalid subject: ' + sub)
    }
    self.log('[Tendon.setupSubscribe] obj=`%s` event=`%s` id=`%s`', name, event, $el.attr('id'))

    subject.on(event, function(model, changed, options) {
      self.onJSChange($el, model, changed, options)
    })
  })
  return this
}

/**
 * JS triggered change, ensure the source of the event is not the 
 * element we are about to update
 *
 * @param {Object} jQuery selector
 * @param {Object} Backbone model
 * @param {Object} changed attributes hash
 * @param {Object} change event options
 */

Tendon.prototype.onJSChange = function($el, model, changed, options) {
  var uuid = this.id($el)

  // Short out if the element was the original trigger
  if (options && options.source === uuid) return this

  return this.updateElement($el)
}

/**
 * Element setup, find all custom HTML attributes for a given element
 * and run it through all sub-setup processes
 *
 * Example:
 *
 *   <div tendon-subscribe="model.change:property change:author" />
 *   <div tendon-publish="model:property" />
 *   <div tendon-auto-render="true" />
 *
 * @param {Object} jQuery element
 * @chainable
 */

Tendon.prototype.setup = function(el) {
  var $el = $(el)
    , pre = this.prefix
    , id = $el.attr('id')
    , subs = $el.attr(pre + 'subscribe')
    , pubs = $el.attr(pre + 'publish')
    , auto = $el.attr(pre + 'auto-render')

    // , tmpl = $el.attr(pre + 'template')
    // , setValue = $el.attr(pre + 'set-value')
    // , setClass = $el.attr(pre + 'set-class')
    // , listenTo = $el.attr(pre + 'listen-to')
    // , uuid = this.id($el)

  this.log('[Tendon.setup] id=`%s` subs=`%s` pubs=`%s` auto=`%s`', id, subs, pubs, auto)

  // Check for initial auto-render
  if (auto) this.updateElement($el)
  if (subs) this.setupSubscribe($el)
  if (pubs) this.setupPublish($el)

  return this
}

/**
 * Find the UUID of a given element, create a new one if one is
 * not found, used to prevent circular update logic.
 *
 * Example:
 *
 *   <div tendon-uuid="12305982-ab23" />
 *
 * @param {Object} jQuery element
 * @return {String} uuid
 */

Tendon.prototype.id = function($el) {
  var q = this.prefix + 'uuid'
    , uuid = $el.attr(q)

  if (!uuid) {
    uuid = _.uniqueId(this.prefix)
    $el.attr(q, uuid)
  }
  return uuid
}

/*!
 * Module exports
 */

if (typeof exports !== 'undefined') {
  module.exports = Tendon
} else {
  this.Tendon = Tendon
}

}).call(this);
