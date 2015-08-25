/*!
 *  (c) 2015 Beau Sorensen
 *  MIT Licensed
 *  For all details and documentation:
 *  https://github.com/sorensen/tendon.js
 */

// TODO: Verify on-change detection for all HTML element types
// TODO: make this operate without Backbone

;(function() {
'use strict'

/*!
 * Module dependencies.
 */

var Backbone, _, $, debug
  , slice = Array.prototype.slice

// Check for common.js support
if (typeof require !== 'undefined') {
  Backbone = require('backbone')
  _ = require('underscore')
  $ = require('jquery')
  debug = require('debug')('tendon')

  debug = function() {
    // console.log.apply(console, arguments)
  }

// Fall back to the root object (window)
} else {
  Backbone = this.Backbone
  _ = this._
  $ = this.$
  debug = function() {
    console.log.apply(null, arguments)
  }
}

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
 *   `tendon-set` {String} model attribute or method to be used as direct value
 *   `tendon-set-attribute` {String} element attribute to assign value to, innerHTML is set if not specified
 *   `tendon-listen` {String} jQuery selector to specify a child element(s) to listen for changes, instead of the current element
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
 *     tendon-set="false"
 *     tendon-set-attribute=""
 *     tendon-listen="li"
 *     tendon-uuid="tendon-3"
 *   />
 *
 * Any element found within the given HTML context will be setup 
 * automatically, and bound to the given context.
 */

function Tendon($selector, context, options) {
  var self = this

  _.extend(this, Backbone.Events)

  // Cache selector, create jQuery context if string provided
  this.$selector = typeof $selector === 'string' ? $($selector) : $selector
  this.context = context || {}
  
  var opt = this.options = _.extend({}, Tendon.defaults, options || {})
  this.prefix = opt.prefix

  debug('[Tendon.init]', $selector, context, opt)

  this.adapters = _.extend({}, Adapters, opt.adapters || {})
  this.setup()

  // Trigger the init with before and after hooks for 
  // controlling adapter ordering
  setTimeout(function() { self.trigger('init:before') }, 0)
  setTimeout(function() { self.trigger('init') }, 0)
  setTimeout(function() { self.trigger('init:after') }, 0)
}

/*!
 * Default class settings
 */

Tendon.defaults = {
  // DOM attribute prefix
  prefix: 'tendon-'

  // Debug mode to enable logging
, debug: true

  // Simple template settings. {{ }} vs <% %>
, templateSettings: {
    variable:    'data'
  , evaluate:    /\{\{(.+?)\}\}/g
  , interpolate: /\{\{=(.+?)\}\}/g
  , escape:      /\{\{-(.+?)\}\}/g
  }
}

/**
 * Setup JS to HTML change subscriptions
 *
 *
 * @chainable
 */

Tendon.prototype.setup = function() {
  var self = this
    , pre = this.prefix
    , adapterNames = Object.keys(this.adapters)

  // Find all elements that contain an attribute matching any 
  // adapter currently enabled
  var selector = adapterNames.map(function(name) {
    return '[' + pre + name + ']'
  }).join(',')

  // this.$selector.find('[tendon-template]:first-child').each(function(i, el) {
  this.$selector.find(selector).each(function(i, el) {
    var $el = $(el)
      , attrs = {}

    // Build the attribute object
    slice.call(el.attributes).forEach(function(item) {
      attrs[item.name] = item.value
    })

    // Storage container for active adapters and events
    $el._tendon = {}
    $el._events = {}

    // Find all autoloading adapters, these should be called 
    // regardless if the element contains the attribute, note: 
    // this requires at least one other tag to be discovered on init
    adapterNames.filter(function(name) {
      var al = self.adapters[name].autoload
      return _.isFunction(al) 
        ? al.apply(self, [$el, attrs])
        : al

    // Tack on `autoload` adapters to be included in logic below
    }).forEach(function(name) {
      if (!attrs[pre + name]) attrs[pre + name] = null
    })

    // Find all tendon specific attributes
    Object.keys(attrs).filter(function(attr) {
      return attr.indexOf(pre) === 0
    
    // Strip prefix from the name
    }).map(function(attr) {
      return attr.replace(pre, '')
    
    // Ensure we have an adapter for the attribute
    }).filter(function(name) {
      return self.adapters.hasOwnProperty(name)
    
    // Bind each adapter to the element for the given event, 
    // `init` will be used as a default if none provided
    }).forEach(function(name) {
      var adapter = self.adapters[name]
        , val = attrs[pre + name]
        , event = adapter.event || 'init'
        , method = _.isFunction(adapter) ? adapter : adapter.method 

      debug('[Tendon.enable] adapter=`%s` event=`%s` el=`%s`', name, event, attrs.id)
      
      // Store adapter and event information on the element
      $el._tendon[name] = adapter
      $el._events[event] || ($el._events[event] = [])
      $el._events[event].push(method)

      // Setup event proxy
      self.on(event, function() {
        console.log('[trigger] adapter=`%s` event=`%s` el=`%s`', name, event, attrs.id, arguments)
        
        // Init events don't have a normal context, use the current 
        // element and the value of the adapter attribute
        if (event.indexOf('init') === 0) {
          method.apply(self, [$el, val, name])
        // Pass through whatever was sent by this event
        } else {
          method.apply(self, arguments)
        }
      })
    })
  })

  console.log('[Tendon.enable] setup complete')

  return this
}

/**
 *
 *
 */

Tendon.prototype.ctx = function(path, value) {
  if (!path) return null

  var parts = path.split('.')           // object.prop1.prop2
    , last = parts.pop()                // lastProp:event:event2, event:event3
    , command = (last || '').split(':') // the first `:` indicates prop to argument 
    , prop = command[0]                 // we only care about the first `:` found
    , rest = command.slice(1).join(':') // piece the arg section back together
    , cmdArgs = rest.split(',')         // arguments are comma seperated
    , directArgs = slice.call(arguments, 1)

  // Support nested dot notation
  var target = this.context

  // Return direct value if it is not part of the context
  if (!parts.length && !target.hasOwnProperty(last)) {
    return path
  }

  // Follow the property chain to the end
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i]
    // if (!value && !target.hasOwnProperty(part)) {
    if (!target.hasOwnProperty(part)) {
      console.error('[Adapters.set] Invalid context: `%s`', parts.join('.'))
      return null
    }
    // ensure placeholder object for setting key / val 
    // target[part] || (target[part] = {})
    target = target[part]
  }

  // Remove any trailing whitespace
  cmdArgs = cmdArgs.map(function(x) {
    return x.trim()
  })

  // Check if this is a callable property
  if (_.isFunction(target[prop])) {
    var args = cmdArgs.concat(directArgs)

    console.log('[ctx]: ', target, prop, args)

    return target[prop].apply(target, args)
  }

  // Normal object usage, key -> value
  if (value) {
    return target[prop] = value
  }
  return target[prop]
}

/*!
 * Built-in adapters
 */

var Adapters = {}

/**
 *
 *
 * @param {Object} jQuery selector
 * @param {String} html get directive (auto|data|val|html)
 */

Adapters.get = {
  event: 'init:before'
, autoload: true
, method: function($el, get) {
    var listenTo = $el.attr(this.prefix + 'listen')
      , cmd = (get || '').split(':')
      , prop = cmd.pop()
      , selector = cmd[0]
      // , selector = this.ctx(get)
      , $target = selector ? $el.find(selector) : $el

    $el.tendonGet = function(e) {
      // Check for specific jQuery property / method to use
      if (get && $target.hasOwnProperty(prop)) {
        return _.isFunction($target[prop])
          ? $target[prop]()
          : $target[prop]
      }

      // Check for input type, we generally always want the value
      if ($el.is('input, select, textarea')) {
        return $el.val()
      }

      // Check for associated data
      if (e && listenTo) {
        $target = $(e.target).closest(listenTo)
        
        var data = $target.data()

        if (!_.isEmpty(data)) return data
      }

      // Use the inner contents as default
      return $target.html()
    }
    return this
  }
}

/**
 * Find an embedded underscore template within the HTML context, 
 * and create a template function with its content
 *
 * @param {String} template selector
 * @return {Function} template function
 */

Adapters.template = {
  event: 'change:js'
, method: function($el, model, changed, options) {
    var self = this
      , template = $el.attr(this.prefix + 'template')
      , id = $el.attr('id')
      , selector = this.ctx(template)
      , tmpl

    // Check if called directly against invalid `$el`
    if (!selector) return this

    console.log('[Adapters.template] running: selector=`%s`', selector, arguments)

    // Create caching store if needed
    if (!this._cache) this._cache = {}

    var tmpl = this._cache[selector]

    // Lookup and cache the template
    if (!tmpl) {
      var str = this.$selector.find(selector).html()
        , fn = _.template(str, this.options.templateSettings)

      tmpl = this._cache[selector] = fn
    }

    if (!tmpl) throw new Error('Invalid template: ' + selector)

    var val = tmpl(this.context)

    if ($el.is('input, textarea')) {
      $el.val(val)
    } else {
      $el.html(val || '')
    }

    // Trigger rendered event
    setTimeout(function() {
      if (id) self.trigger('render:html:' + id, $el, val, model, changed, options)
      self.trigger('render:html', $el, val, model, changed, options)
    }, 0)
    return this
  }
}

/**
 * Get the context value for a given element defined in the 
 * `tendon-set` attribute. Can be direct property or method.
 *
 * Example:
 *
 *   property: <div tendon-set="model.attributes" />
 *   property: <div tendon-set="model.get:sites" />
 *
 * @param {Object} jQuery selector
 * @return {Any} model value
 */

Adapters.set = {
  event: 'change:js'
, children: [
    'set-attribute' // not a thing.. yet..
  ]
, method: function($el, model, changed, options) {
    var self = this
      , pre = this.prefix
      , id = $el.attr('id')
      , setValue = $el.attr(pre + 'set') || ''
      , setAttr = $el.attr(pre + 'set-attribute')
      , val = this.ctx(setValue)

    if (setAttr) {
      $el.attr(setAttr, val || '')
    } else {
      if ($el.is('input, textarea')) {
        $el.val(val)
      } else {
        $el.html(val)
      }
    }

    // Trigger rendered event
    setTimeout(function() { 
      if (id) self.trigger('render:html:' + id, $el, val, model, changed, options)
      self.trigger('render:html', $el, val, model, changed, options)
    }, 0)
    return this
  }
}

/**
 * Attempt to auto render HTML from JS after primary adapters loaded
 *
 * @param {Object} jQuery selector
 */

Adapters['auto-render'] = {
  event: 'init:after'
, method: function($el) {
    var self = this

    // Call each built in rendering adapter
    ;['set'
    , 'template'
    ].forEach(function(name) {
      if (self.adapters[name]) {
        self.adapters[name].method.apply(self, [$el])
      }
    })
  
    return this
  }
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
 * @param {String} bootstrapped or internal uuid (optional)
 */

Adapters.uuid = {
  event: 'init'
, autoload: true
, method: function($el, uuid) {
    var pre = this.prefix
      , q = pre + 'uuid'

    // Add a uuid value if none found
    if (!uuid) $el.attr(q, _.uniqueId(pre))
    return this
  }
}

/**
 * Listen for html changes, then, update the designated context with the 
 * new element value
 *
 * @param {Object} jQuery element
 * @param {Any} new html value
 * @param {Object} js event
 * @param {Object|Null} child element if using custom `listen` attribute
 */

Adapters.publish = {
  event: 'change:html'
, method: function($el, val, e) {
    var self = this
      , pre = this.prefix
      , pubs = $el.attr(pre + 'publish')
      , uuid = $el.attr(pre + 'uuid')

    pubs.split('/').forEach(function(pub) {
      self.ctx(pub, val, { 
        source: uuid 
      })
    })
      
    return this
  }
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
 *   <ul tendon-listen="li" />
 *
 * @param {Object} jQuery selector
 * @param {String} child element selector
 * @chainable
 */

Adapters.listen = {
  event: 'init'

  // Autoload this adapter only if the element has a `publish`
  // property, assume that we want to listen for changes
, autoload: function($el, attributes) {
    var pre = this.prefix

    return attributes.hasOwnProperty(pre + 'publish')
  }
, method: function($el, listenTo) {
    var self = this
      , id = $el.attr('id')

    // Check if specifically disabled
    if (listenTo === 'false') return this

    function broadcast(e) {
      var val = $el.tendonGet(e)

      debug('[Adapters.listen] triggering `change:html` event id=`%s` el=', id, $el)

      // if (id) self.trigger('change:html:' + id, $el, val, e)
      var methods = $el._events['change:html'] || []
      methods.forEach(function(method) {
        method.apply(self, [$el, val, e])
      })
      // self.trigger('change:html', $el, val, e)
      return this
    }

    // Form input element, listen to the `change` event
    if ($el.is('input, select, textarea')) {
      $el.on('change', broadcast)
    // Custom `listenTo` attribute, bind to `click` event
    } else if (listenTo) {
      // TODO: this kinda sucks...
      $el.on('click', listenTo, broadcast)
    // Default listen mode, bind to `click` event
    } else {
      // TODO: should this be specified by an attribute?
      $el.on('click', broadcast)
    }
    return this
  }
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
 * @param {String} context subscriptions
 * @chainable
 */

Adapters.subscribe = {
  event: 'init'
, method: function($el, subs) {
    var self = this
      , pre = this.prefix

    subs.split('/').forEach(function(sub) {
      self.ctx(sub, function(model, changed, options) {
        var uuid = $el.attr(pre + 'uuid')
        
        // Ensure the event was triggered outside of this lib to prevent circles
        if (options && options.source === uuid) {
          return
        }
        console.log('\n\ntriggering `change:js` for: ', sub, changed, $el.attr('id'))

        // this is broken, cant re-broadcast here
        // self.trigger('change:js', $el, model, changed, options)

        // Directly call all change events
        var methods = $el._events['change:js'] || []
        console.log('methods: ', methods)
        methods.forEach(function(method) {
          method.apply(self, [$el, model, changed, options])
        })
      })
    })
    return this
  }
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
