!(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['uilab_infra/work/js/jquery'], function($) {
      return factory(root, $);
    });
  } else if (typeof exports === 'object') {
    factory(root, require('uilab_infra/work/js/jquery'));
  } else {
    factory(root, root.jQuery || root.Zepto);
  }
})(this, function(global, $) {

  'use strict';

  /**
   * Name of the plugin
   * @private
   * @const
   * @type {String}
   */
  var PLUGIN_NAME = 'remodal';

  /**
   * Namespace for CSS and events
   * @private
   * @const
   * @type {String}
   */
  var NAMESPACE = global.REMODAL_GLOBALS && global.REMODAL_GLOBALS.NAMESPACE || PLUGIN_NAME;

  /**
   * Animationstart event with vendor prefixes
   * @private
   * @const
   * @type {String}
   */
  var ANIMATIONSTART_EVENTS = $.map(
    ['animationstart', 'webkitAnimationStart', 'MSAnimationStart', 'oAnimationStart'],

    function(eventName) {
      return eventName + '.' + NAMESPACE;
    }

  ).join(' ');

  /**
   * Animationend event with vendor prefixes
   * @private
   * @const
   * @type {String}
   */
  var ANIMATIONEND_EVENTS = $.map(
    ['animationend', 'webkitAnimationEnd', 'MSAnimationEnd', 'oAnimationEnd'],

    function(eventName) {
      return eventName + '.' + NAMESPACE;
    }

  ).join(' ');

  /**
   * Default settings
   * @private
   * @const
   * @type {Object}
   */
  var DEFAULTS = $.extend({
    hashTracking: true,
    closeOnConfirm: true,
    closeOnCancel: true,
    closeOnEscape: true,
    closeOnOutsideClick: true,
    modifier: '',
    appendTo: null
  }, global.REMODAL_GLOBALS && global.REMODAL_GLOBALS.DEFAULTS);

  /**
   * States of the Remodal
   * @private
   * @const
   * @enum {String}
   */
  var STATES = {
    CLOSING: 'closing',
    CLOSED: 'closed',
    OPENING: 'opening',
    OPENED: 'opened'
  };

  /**
   * Reasons of the state change.
   * @private
   * @const
   * @enum {String}
   */
  var STATE_CHANGE_REASONS = {
    CONFIRMATION: 'confirmation',
    CANCELLATION: 'cancellation'
  };

  /**
   * Is animation supported?
   * @private
   * @const
   * @type {Boolean}
   */
  var IS_ANIMATION = (function() {
    var style = document.createElement('div').style;

    return style.animationName !== undefined ||
      style.WebkitAnimationName !== undefined ||
      style.MozAnimationName !== undefined ||
      style.msAnimationName !== undefined ||
      style.OAnimationName !== undefined;
  })();

  /**
   * Is iOS?
   * @private
   * @const
   * @type {Boolean}
   */
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.platform);

  /**
   * Current modal
   * @private
   * @type {Remodal}
   */
  var current;

  /**
   * Scrollbar position
   * @private
   * @type {Number}
   */
  var scrollTop;

  /**
   * Returns an animation duration
   * @private
   * @param {jQuery} $elem
   * @returns {Number}
   */
  function getAnimationDuration($elem) {
    if (
      IS_ANIMATION &&
      $elem.css('animation-name') === 'none' &&
      $elem.css('-webkit-animation-name') === 'none' &&
      $elem.css('-moz-animation-name') === 'none' &&
      $elem.css('-o-animation-name') === 'none' &&
      $elem.css('-ms-animation-name') === 'none'
    ) {
      return 0;
    }

    var duration = $elem.css('animation-duration') ||
      $elem.css('-webkit-animation-duration') ||
      $elem.css('-moz-animation-duration') ||
      $elem.css('-o-animation-duration') ||
      $elem.css('-ms-animation-duration') ||
      '0s';

    var delay = $elem.css('animation-delay') ||
      $elem.css('-webkit-animation-delay') ||
      $elem.css('-moz-animation-delay') ||
      $elem.css('-o-animation-delay') ||
      $elem.css('-ms-animation-delay') ||
      '0s';

    var iterationCount = $elem.css('animation-iteration-count') ||
      $elem.css('-webkit-animation-iteration-count') ||
      $elem.css('-moz-animation-iteration-count') ||
      $elem.css('-o-animation-iteration-count') ||
      $elem.css('-ms-animation-iteration-count') ||
      '1';

    var max;
    var len;
    var num;
    var i;

    duration = duration.split(', ');
    delay = delay.split(', ');
    iterationCount = iterationCount.split(', ');

    // The 'duration' size is the same as the 'delay' size
    for (i = 0, len = duration.length, max = Number.NEGATIVE_INFINITY; i < len; i++) {
      num = parseFloat(duration[i]) * parseInt(iterationCount[i], 10) + parseFloat(delay[i]);

      if (num > max) {
        max = num;
      }
    }

    return max;
  }

  /**
   * Returns a scrollbar width
   * @private
   * @returns {Number}
   */
  function getScrollbarWidth() {
    if ($(document).height() <= $(window).height()) {
      return 0;
    }

    var outer = document.createElement('div');
    var inner = document.createElement('div');
    var widthNoScroll;
    var widthWithScroll;

    outer.style.visibility = 'hidden';
    outer.style.width = '100px';
    document.body.appendChild(outer);

    widthNoScroll = outer.offsetWidth;

    // Force scrollbars
    outer.style.overflow = 'scroll';

    // Add inner div
    inner.style.width = '100%';
    outer.appendChild(inner);

    widthWithScroll = inner.offsetWidth;

    // Remove divs
    outer.parentNode.removeChild(outer);

    return widthNoScroll - widthWithScroll;
  }

  /**
   * Locks the screen
   * @private
   */
  function lockScreen() {
    if (IS_IOS) {
      return;
    }

    var $html = $('html');
    var lockedClass = namespacify('is-locked');
    var paddingRight;
    var $body;

    if (!$html.hasClass(lockedClass)) {
      $body = $(document.body);

      // Zepto does not support '-=', '+=' in the `css` method
      paddingRight = parseInt($body.css('padding-right'), 10) + getScrollbarWidth();

      $body.css('padding-right', paddingRight + 'px');
      $html.addClass(lockedClass);
    }
  }

  /**
   * Unlocks the screen
   * @private
   */
  function unlockScreen() {
    if (IS_IOS) {
      return;
    }

    var $html = $('html');
    var lockedClass = namespacify('is-locked');
    var paddingRight;
    var $body;

    if ($html.hasClass(lockedClass)) {
      $body = $(document.body);

      // Zepto does not support '-=', '+=' in the `css` method
      paddingRight = parseInt($body.css('padding-right'), 10) - getScrollbarWidth();

      $body.css('padding-right', paddingRight + 'px');
      $html.removeClass(lockedClass);
    }
  }

  /**
   * Sets a state for an instance
   * @private
   * @param {Remodal} instance
   * @param {STATES} state
   * @param {Boolean} isSilent If true, Remodal does not trigger events
   * @param {String} Reason of a state change.
   */
  function setState(instance, state, isSilent, reason) {

    var newState = namespacify('is', state);
    var allStates = [namespacify('is', STATES.CLOSING),
                     namespacify('is', STATES.OPENING),
                     namespacify('is', STATES.CLOSED),
                     namespacify('is', STATES.OPENED)].join(' ');

    instance.$bg
      .removeClass(allStates)
      .addClass(newState);

    instance.$overlay
      .removeClass(allStates)
      .addClass(newState);

    instance.$wrapper
      .removeClass(allStates)
      .addClass(newState);

    instance.$modal
      .removeClass(allStates)
      .addClass(newState);

    instance.state = state;
    !isSilent && instance.$modal.trigger({
      type: state,
      reason: reason
    }, [{ reason: reason }]);
  }

  /**
   * Synchronizes with the animation
   * @param {Function} doBeforeAnimation
   * @param {Function} doAfterAnimation
   * @param {Remodal} instance
   */
  function syncWithAnimation(doBeforeAnimation, doAfterAnimation, instance) {
    var runningAnimationsCount = 0;

    var handleAnimationStart = function(e) {
      if (e.target !== this) {
        return;
      }

      runningAnimationsCount++;
    };

    var handleAnimationEnd = function(e) {
      if (e.target !== this) {
        return;
      }

      if (--runningAnimationsCount === 0) {

        // Remove event listeners
        $.each(['$bg', '$overlay', '$wrapper', '$modal'], function(index, elemName) {
          instance[elemName].off(ANIMATIONSTART_EVENTS + ' ' + ANIMATIONEND_EVENTS);
        });

        doAfterAnimation();
      }
    };

    $.each(['$bg', '$overlay', '$wrapper', '$modal'], function(index, elemName) {
      instance[elemName]
        .on(ANIMATIONSTART_EVENTS, handleAnimationStart)
        .on(ANIMATIONEND_EVENTS, handleAnimationEnd);
    });

    doBeforeAnimation();

    // If the animation is not supported by a browser or its duration is 0
    if (
      getAnimationDuration(instance.$bg) === 0 &&
      getAnimationDuration(instance.$overlay) === 0 &&
      getAnimationDuration(instance.$wrapper) === 0 &&
      getAnimationDuration(instance.$modal) === 0
    ) {

      // Remove event listeners
      $.each(['$bg', '$overlay', '$wrapper', '$modal'], function(index, elemName) {
        instance[elemName].off(ANIMATIONSTART_EVENTS + ' ' + ANIMATIONEND_EVENTS);
      });

      doAfterAnimation();
    }
  }

  /**
   * Closes immediately
   * @private
   * @param {Remodal} instance
   */
  function halt(instance) {
    if (instance.state === STATES.CLOSED) {
      return;
    }

    $.each(['$bg', '$overlay', '$wrapper', '$modal'], function(index, elemName) {
      instance[elemName].off(ANIMATIONSTART_EVENTS + ' ' + ANIMATIONEND_EVENTS);
    });

    instance.$bg.removeClass(instance.settings.modifier);
    instance.$overlay.removeClass(instance.settings.modifier).hide();
    instance.$wrapper.hide();
    unlockScreen();
    setState(instance, STATES.CLOSED, true);
  }

  /**
   * Parses a string with options
   * @private
   * @param str
   * @returns {Object}
   */
  function parseOptions(str) {
    var obj = {};
    var arr;
    var len;
    var val;
    var i;

    // Remove spaces before and after delimiters
    str = str.replace(/\s*:\s*/g, ':').replace(/\s*,\s*/g, ',');

    // Parse a string
    arr = str.split(',');
    for (i = 0, len = arr.length; i < len; i++) {
      arr[i] = arr[i].split(':');
      val = arr[i][1];

      // Convert a string value if it is like a boolean
      if (typeof val === 'string' || val instanceof String) {
        val = val === 'true' || (val === 'false' ? false : val);
      }

      // Convert a string value if it is like a number
      if (typeof val === 'string' || val instanceof String) {
        val = !isNaN(val) ? +val : val;
      }

      obj[arr[i][0]] = val;
    }

    return obj;
  }

  /**
   * Generates a string separated by dashes and prefixed with NAMESPACE
   * @private
   * @param {...String}
   * @returns {String}
   */
  function namespacify() {
    var result = NAMESPACE;

    for (var i = 0; i < arguments.length; ++i) {
      result += '-' + arguments[i];
    }

    return result;
  }

  /**
   * Handles the hashchange event
   * @private
   * @listens hashchange
   */
  function handleHashChangeEvent() {
    var id = location.hash.replace('#', '');
    var instance;
    var $elem;

    if (!id) {

      // Check if we have currently opened modal and animation was completed
      if (current && current.state === STATES.OPENED && current.settings.hashTracking) {
        current.close();
      }
    } else {

      // Catch syntax error if your hash is bad
      try {
        $elem = $(
          '[data-' + PLUGIN_NAME + '-id="' + id + '"]'
        );
      } catch (err) {}

      if ($elem && $elem.length) {
        instance = $[PLUGIN_NAME].lookup[$elem.data(PLUGIN_NAME)];

        if (instance && instance.settings.hashTracking) {
          instance.open();
        }
      }

    }
  }

  /**
   * Remodal constructor
   * @constructor
   * @param {jQuery} $modal
   * @param {Object} options
   */
  function Remodal($modal, options) {
    var $body = $(document.body);
    var $appendTo = $body;
    var remodal = this;

    remodal.settings = $.extend({}, DEFAULTS, options);
    remodal.index = $[PLUGIN_NAME].lookup.push(remodal) - 1;
    remodal.state = STATES.CLOSED;

    remodal.$overlay = $('.' + namespacify('overlay'));

    if (remodal.settings.appendTo !== null && remodal.settings.appendTo.length) {
      $appendTo = $(remodal.settings.appendTo);
    }

    if (!remodal.$overlay.length) {
      remodal.$overlay = $('<div>').addClass(namespacify('overlay') + ' ' + namespacify('is', STATES.CLOSED)).hide();
      $appendTo.append(remodal.$overlay);
    }

    remodal.$bg = $('.' + namespacify('bg')).addClass(namespacify('is', STATES.CLOSED));

    remodal.$modal = $modal
      .addClass(
        NAMESPACE + ' ' +
        namespacify('is-initialized') + ' ' +
        remodal.settings.modifier + ' ' +
        namespacify('is', STATES.CLOSED))
      .attr('tabindex', '-1');

    remodal.$wrapper = $('<div>')
      .addClass(
        namespacify('wrapper') + ' ' +
        remodal.settings.modifier + ' ' +
        namespacify('is', STATES.CLOSED))
      .hide()
      .append(remodal.$modal);
    $appendTo.append(remodal.$wrapper);

    // Add the event listener for the close button
    remodal.$wrapper.on('click.' + NAMESPACE, '[data-' + PLUGIN_NAME + '-action="close"]', function(e) {
      e.preventDefault();

      remodal.close();
    });

    // Add the event listener for the cancel button
    remodal.$wrapper.on('click.' + NAMESPACE, '[data-' + PLUGIN_NAME + '-action="cancel"]', function(e) {
      e.preventDefault();

      remodal.$modal.trigger(STATE_CHANGE_REASONS.CANCELLATION);

      if (remodal.settings.closeOnCancel) {
        remodal.close(STATE_CHANGE_REASONS.CANCELLATION);
      }
    });

    // Add the event listener for the confirm button
    remodal.$wrapper.on('click.' + NAMESPACE, '[data-' + PLUGIN_NAME + '-action="confirm"]', function(e) {
      e.preventDefault();

      remodal.$modal.trigger(STATE_CHANGE_REASONS.CONFIRMATION);

      if (remodal.settings.closeOnConfirm) {
        remodal.close(STATE_CHANGE_REASONS.CONFIRMATION);
      }
    });

    // Add the event listener for the overlay
    remodal.$wrapper.on('click.' + NAMESPACE, function(e) {
      var $target = $(e.target);

      if (!$target.hasClass(namespacify('wrapper'))) {
        return;
      }

      if (remodal.settings.closeOnOutsideClick) {
        remodal.close();
      }
    });
  }

  /**
   * Opens a modal window
   * @public
   */
  Remodal.prototype.open = function() {
    var remodal = this;
    var id;

    // Check if the animation was completed
    if (remodal.state === STATES.OPENING || remodal.state === STATES.CLOSING) {
      return;
    }

    id = remodal.$modal.attr('data-' + PLUGIN_NAME + '-id');

    if (id && remodal.settings.hashTracking) {
      scrollTop = $(window).scrollTop();
      location.hash = id;
    }

    if (current && current !== remodal) {
      halt(current);
    }

    current = remodal;
    lockScreen();
    remodal.$bg.addClass(remodal.settings.modifier);
    remodal.$overlay.addClass(remodal.settings.modifier).show();
    remodal.$wrapper.show().scrollTop(0);
    remodal.$modal.focus();

    syncWithAnimation(
      function() {
        setState(remodal, STATES.OPENING);
      },

      function() {
        setState(remodal, STATES.OPENED);
      },

      remodal);
  };

  /**
   * Closes a modal window
   * @public
   * @param {String} reason
   */
  Remodal.prototype.close = function(reason) {
    var remodal = this;

    // Check if the animation was completed
    if (remodal.state === STATES.OPENING || remodal.state === STATES.CLOSING || remodal.state === STATES.CLOSED) {
      return;
    }

    if (
      remodal.settings.hashTracking &&
      remodal.$modal.attr('data-' + PLUGIN_NAME + '-id') === location.hash.substr(1)
    ) {
      location.hash = '';
      $(window).scrollTop(scrollTop);
    }

    syncWithAnimation(
      function() {
        setState(remodal, STATES.CLOSING, false, reason);
      },

      function() {
        remodal.$bg.removeClass(remodal.settings.modifier);
        remodal.$overlay.removeClass(remodal.settings.modifier).hide();
        remodal.$wrapper.hide();
        unlockScreen();

        setState(remodal, STATES.CLOSED, false, reason);
      },

      remodal);
  };

  /**
   * Returns a current state of a modal
   * @public
   * @returns {STATES}
   */
  Remodal.prototype.getState = function() {
    return this.state;
  };

  /**
   * Destroys a modal
   * @public
   */
  Remodal.prototype.destroy = function() {
    var lookup = $[PLUGIN_NAME].lookup;
    var instanceCount;

    halt(this);
    this.$wrapper.remove();

    delete lookup[this.index];
    instanceCount = $.grep(lookup, function(instance) {
      return !!instance;
    }).length;

    if (instanceCount === 0) {
      this.$overlay.remove();
      this.$bg.removeClass(
        namespacify('is', STATES.CLOSING) + ' ' +
        namespacify('is', STATES.OPENING) + ' ' +
        namespacify('is', STATES.CLOSED) + ' ' +
        namespacify('is', STATES.OPENED));
    }
  };

  /**
   * Special plugin object for instances
   * @public
   * @type {Object}
   */
  $[PLUGIN_NAME] = {
    lookup: []
  };

  /**
   * Plugin constructor
   * @constructor
   * @param {Object} options
   * @returns {JQuery}
   */
  $.fn[PLUGIN_NAME] = function(opts) {
    var instance;
    var $elem;

    this.each(function(index, elem) {
      $elem = $(elem);

      if ($elem.data(PLUGIN_NAME) == null) {
        instance = new Remodal($elem, opts);
        $elem.data(PLUGIN_NAME, instance.index);

        if (
          instance.settings.hashTracking &&
          $elem.attr('data-' + PLUGIN_NAME + '-id') === location.hash.substr(1)
        ) {
          instance.open();
        }
      } else {
        instance = $[PLUGIN_NAME].lookup[$elem.data(PLUGIN_NAME)];
      }
    });

    return instance;
  };

  $(document).ready(function() {

    // data-remodal-target opens a modal window with the special Id
    $(document).on('click', '[data-' + PLUGIN_NAME + '-target]', function(e) {
      e.preventDefault();

      var elem = e.currentTarget;
      var id = elem.getAttribute('data-' + PLUGIN_NAME + '-target');
      var $target = $('[data-' + PLUGIN_NAME + '-id="' + id + '"]');

      $[PLUGIN_NAME].lookup[$target.data(PLUGIN_NAME)].open();
    });

    // Auto initialization of modal windows
    // They should have the 'remodal' class attribute
    // Also you can write the `data-remodal-options` attribute to pass params into the modal
    $(document).find('.' + NAMESPACE).each(function(i, container) {
      var $container = $(container);
      var options = $container.data(PLUGIN_NAME + '-options');

      if (!options) {
        options = {};
      } else if (typeof options === 'string' || options instanceof String) {
        options = parseOptions(options);
      }

      $container[PLUGIN_NAME](options);
    });

    // Handles the keydown event
    $(document).on('keydown.' + NAMESPACE, function(e) {
      if (current && current.settings.closeOnEscape && current.state === STATES.OPENED && e.keyCode === 27) {
        current.close();
      }
    });

    // Handles the hashchange event
    $(window).on('hashchange.' + NAMESPACE, handleHashChangeEvent);
  });
});

/*
     _ _      _       _
 ___| (_) ___| | __  (_)___
/ __| | |/ __| |/ /  | / __|
\__ \ | | (__|   < _ | \__ \
|___/_|_|\___|_|\_(_)/ |___/
                   |__/

 Version: 1.8.0
  Author: Ken Wheeler
 Website: http://kenwheeler.github.io
    Docs: http://kenwheeler.github.io/slick
    Repo: http://github.com/kenwheeler/slick
  Issues: http://github.com/kenwheeler/slick/issues

 */
/* global window, document, define, jQuery, setInterval, clearInterval */
;(function(factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        define(['uilab_infra/work/js/jquery'], factory);
    } else if (typeof exports !== 'undefined') {
        module.exports = factory(require('uilab_infra/work/js/jquery'));
    } else {
        factory(jQuery);
    }

}(function($) {
    'use strict';
    var Slick = window.Slick || {};

    Slick = (function() {

        var instanceUid = 0;

        function Slick(element, settings) {

            var _ = this, dataSettings;

            _.defaults = {
                accessibility: true,
                adaptiveHeight: false,
                appendArrows: $(element),
                appendDots: $(element),
                arrows: true,
                asNavFor: null,
                prevArrow: '<button class="slick-prev" aria-label="Previous" type="button">Previous</button>',
                nextArrow: '<button class="slick-next" aria-label="Next" type="button">Next</button>',
                autoplay: false,
                autoplaySpeed: 3000,
                centerMode: false,
                centerPadding: '50px',
                cssEase: 'ease',
                customPaging: function(slider, i) {
                    return $('<button type="button" />').text(i + 1);
                },
                dots: false,
                dotsClass: 'slick-dots',
                draggable: true,
                easing: 'linear',
                edgeFriction: 0.35,
                fade: false,
                focusOnSelect: false,
                focusOnChange: false,
                infinite: true,
                initialSlide: 0,
                lazyLoad: 'ondemand',
                mobileFirst: false,
                pauseOnHover: true,
                pauseOnFocus: true,
                pauseOnDotsHover: false,
                respondTo: 'window',
                responsive: null,
                rows: 1,
                rtl: false,
                slide: '',
                slidesPerRow: 1,
                slidesToShow: 1,
                slidesToScroll: 1,
                speed: 500,
                swipe: true,
                swipeToSlide: false,
                touchMove: true,
                touchThreshold: 5,
                useCSS: true,
                useTransform: true,
                variableWidth: false,
                vertical: false,
                verticalSwiping: false,
                waitForAnimate: true,
                zIndex: 1000
            };

            _.initials = {
                animating: false,
                dragging: false,
                autoPlayTimer: null,
                currentDirection: 0,
                currentLeft: null,
                currentSlide: 0,
                direction: 1,
                $dots: null,
                listWidth: null,
                listHeight: null,
                loadIndex: 0,
                $nextArrow: null,
                $prevArrow: null,
                scrolling: false,
                slideCount: null,
                slideWidth: null,
                $slideTrack: null,
                $slides: null,
                sliding: false,
                slideOffset: 0,
                swipeLeft: null,
                swiping: false,
                $list: null,
                touchObject: {},
                transformsEnabled: false,
                unslicked: false
            };

            $.extend(_, _.initials);

            _.activeBreakpoint = null;
            _.animType = null;
            _.animProp = null;
            _.breakpoints = [];
            _.breakpointSettings = [];
            _.cssTransitions = false;
            _.focussed = false;
            _.interrupted = false;
            _.hidden = 'hidden';
            _.paused = true;
            _.positionProp = null;
            _.respondTo = null;
            _.rowCount = 1;
            _.shouldClick = true;
            _.$slider = $(element);
            _.$slidesCache = null;
            _.transformType = null;
            _.transitionType = null;
            _.visibilityChange = 'visibilitychange';
            _.windowWidth = 0;
            _.windowTimer = null;

            dataSettings = $(element).data('slick') || {};

            _.options = $.extend({}, _.defaults, settings, dataSettings);

            _.currentSlide = _.options.initialSlide;

            _.originalSettings = _.options;

            if (typeof document.mozHidden !== 'undefined') {
                _.hidden = 'mozHidden';
                _.visibilityChange = 'mozvisibilitychange';
            } else if (typeof document.webkitHidden !== 'undefined') {
                _.hidden = 'webkitHidden';
                _.visibilityChange = 'webkitvisibilitychange';
            }

            _.autoPlay = $.proxy(_.autoPlay, _);
            _.autoPlayClear = $.proxy(_.autoPlayClear, _);
            _.autoPlayIterator = $.proxy(_.autoPlayIterator, _);
            _.changeSlide = $.proxy(_.changeSlide, _);
            _.clickHandler = $.proxy(_.clickHandler, _);
            _.selectHandler = $.proxy(_.selectHandler, _);
            _.setPosition = $.proxy(_.setPosition, _);
            _.swipeHandler = $.proxy(_.swipeHandler, _);
            _.dragHandler = $.proxy(_.dragHandler, _);
            _.keyHandler = $.proxy(_.keyHandler, _);

            _.instanceUid = instanceUid++;

            // A simple way to check for HTML strings
            // Strict HTML recognition (must start with <)
            // Extracted from jQuery v1.11 source
            _.htmlExpr = /^(?:\s*(<[\w\W]+>)[^>]*)$/;


            _.registerBreakpoints();
            _.init(true);

        }

        return Slick;

    }());

    Slick.prototype.activateADA = function() {
        var _ = this;

        _.$slideTrack.find('.slick-active').attr({
            'aria-hidden': 'false'
        }).find('a, input, button, select').attr({
            'tabindex': '0'
        });

    };

    Slick.prototype.addSlide = Slick.prototype.slickAdd = function(markup, index, addBefore) {

        var _ = this;

        if (typeof(index) === 'boolean') {
            addBefore = index;
            index = null;
        } else if (index < 0 || (index >= _.slideCount)) {
            return false;
        }

        _.unload();

        if (typeof(index) === 'number') {
            if (index === 0 && _.$slides.length === 0) {
                $(markup).appendTo(_.$slideTrack);
            } else if (addBefore) {
                $(markup).insertBefore(_.$slides.eq(index));
            } else {
                $(markup).insertAfter(_.$slides.eq(index));
            }
        } else {
            if (addBefore === true) {
                $(markup).prependTo(_.$slideTrack);
            } else {
                $(markup).appendTo(_.$slideTrack);
            }
        }

        _.$slides = _.$slideTrack.children(this.options.slide);

        _.$slideTrack.children(this.options.slide).detach();

        _.$slideTrack.append(_.$slides);

        _.$slides.each(function(index, element) {
            $(element).attr('data-slick-index', index);
        });

        _.$slidesCache = _.$slides;

        _.reinit();

    };

    Slick.prototype.animateHeight = function() {
        var _ = this;
        if (_.options.slidesToShow === 1 && _.options.adaptiveHeight === true && _.options.vertical === false) {
            var targetHeight = _.$slides.eq(_.currentSlide).outerHeight(true);
            _.$list.animate({
                height: targetHeight
            }, _.options.speed);
        }
    };

    Slick.prototype.animateSlide = function(targetLeft, callback) {

        var animProps = {},
            _ = this;

        _.animateHeight();

        if (_.options.rtl === true && _.options.vertical === false) {
            targetLeft = -targetLeft;
        }
        if (_.transformsEnabled === false) {
            if (_.options.vertical === false) {
                _.$slideTrack.animate({
                    left: targetLeft
                }, _.options.speed, _.options.easing, callback);
            } else {
                _.$slideTrack.animate({
                    top: targetLeft
                }, _.options.speed, _.options.easing, callback);
            }

        } else {

            if (_.cssTransitions === false) {
                if (_.options.rtl === true) {
                    _.currentLeft = -(_.currentLeft);
                }
                $({
                    animStart: _.currentLeft
                }).animate({
                    animStart: targetLeft
                }, {
                    duration: _.options.speed,
                    easing: _.options.easing,
                    step: function(now) {
                        now = Math.ceil(now);
                        if (_.options.vertical === false) {
                            animProps[_.animType] = 'translate(' +
                                now + 'px, 0px)';
                            _.$slideTrack.css(animProps);
                        } else {
                            animProps[_.animType] = 'translate(0px,' +
                                now + 'px)';
                            _.$slideTrack.css(animProps);
                        }
                    },
                    complete: function() {
                        if (callback) {
                            callback.call();
                        }
                    }
                });

            } else {

                _.applyTransition();
                targetLeft = Math.ceil(targetLeft);

                if (_.options.vertical === false) {
                    animProps[_.animType] = 'translate3d(' + targetLeft + 'px, 0px, 0px)';
                } else {
                    animProps[_.animType] = 'translate3d(0px,' + targetLeft + 'px, 0px)';
                }
                _.$slideTrack.css(animProps);

                if (callback) {
                    setTimeout(function() {

                        _.disableTransition();

                        callback.call();
                    }, _.options.speed);
                }

            }

        }

    };

    Slick.prototype.getNavTarget = function() {

        var _ = this,
            asNavFor = _.options.asNavFor;

        if ( asNavFor && asNavFor !== null ) {
            asNavFor = $(asNavFor).not(_.$slider);
        }

        return asNavFor;

    };

    Slick.prototype.asNavFor = function(index) {

        var _ = this,
            asNavFor = _.getNavTarget();

        if ( asNavFor !== null && typeof asNavFor === 'object' ) {
            asNavFor.each(function() {
                var target = $(this).slick('getSlick');
                if(!target.unslicked) {
                    target.slideHandler(index, true);
                }
            });
        }

    };

    Slick.prototype.applyTransition = function(slide) {

        var _ = this,
            transition = {};

        if (_.options.fade === false) {
            transition[_.transitionType] = _.transformType + ' ' + _.options.speed + 'ms ' + _.options.cssEase;
        } else {
            transition[_.transitionType] = 'opacity ' + _.options.speed + 'ms ' + _.options.cssEase;
        }

        if (_.options.fade === false) {
            _.$slideTrack.css(transition);
        } else {
            _.$slides.eq(slide).css(transition);
        }

    };

    Slick.prototype.autoPlay = function() {

        var _ = this;

        _.autoPlayClear();

        if ( _.slideCount > _.options.slidesToShow ) {
            _.autoPlayTimer = setInterval( _.autoPlayIterator, _.options.autoplaySpeed );
        }

    };

    Slick.prototype.autoPlayClear = function() {

        var _ = this;

        if (_.autoPlayTimer) {
            clearInterval(_.autoPlayTimer);
        }

    };

    Slick.prototype.autoPlayIterator = function() {

        var _ = this,
            slideTo = _.currentSlide + _.options.slidesToScroll;

        if ( !_.paused && !_.interrupted && !_.focussed ) {

            if ( _.options.infinite === false ) {

                if ( _.direction === 1 && ( _.currentSlide + 1 ) === ( _.slideCount - 1 )) {
                    _.direction = 0;
                }

                else if ( _.direction === 0 ) {

                    slideTo = _.currentSlide - _.options.slidesToScroll;

                    if ( _.currentSlide - 1 === 0 ) {
                        _.direction = 1;
                    }

                }

            }

            _.slideHandler( slideTo );

        }

    };

    Slick.prototype.buildArrows = function() {

        var _ = this;

        if (_.options.arrows === true ) {

            _.$prevArrow = $(_.options.prevArrow).addClass('slick-arrow');
            _.$nextArrow = $(_.options.nextArrow).addClass('slick-arrow');

            if( _.slideCount > _.options.slidesToShow ) {

                _.$prevArrow.removeClass('slick-hidden').removeAttr('aria-hidden tabindex');
                _.$nextArrow.removeClass('slick-hidden').removeAttr('aria-hidden tabindex');

                if (_.htmlExpr.test(_.options.prevArrow)) {
                    _.$prevArrow.prependTo(_.options.appendArrows);
                }

                if (_.htmlExpr.test(_.options.nextArrow)) {
                    _.$nextArrow.appendTo(_.options.appendArrows);
                }

                if (_.options.infinite !== true) {
                    _.$prevArrow
                        .addClass('slick-disabled')
                        .attr('aria-disabled', 'true');
                }

            } else {

                _.$prevArrow.add( _.$nextArrow )

                    .addClass('slick-hidden')
                    .attr({
                        'aria-disabled': 'true',
                        'tabindex': '-1'
                    });

            }

        }

    };

    Slick.prototype.buildDots = function() {

        var _ = this,
            i, dot;

        if (_.options.dots === true) {

            _.$slider.addClass('slick-dotted');

            dot = $('<ul />').addClass(_.options.dotsClass);

            for (i = 0; i <= _.getDotCount(); i += 1) {
                dot.append($('<li />').append(_.options.customPaging.call(this, _, i)));
            }

            _.$dots = dot.appendTo(_.options.appendDots);

            _.$dots.find('li').first().addClass('slick-active');

        }

    };

    Slick.prototype.buildOut = function() {

        var _ = this;

        _.$slides =
            _.$slider
                .children( _.options.slide + ':not(.slick-cloned)')
                .addClass('slick-slide');

        _.slideCount = _.$slides.length;

        _.$slides.each(function(index, element) {
            $(element)
                .attr('data-slick-index', index)
                .data('originalStyling', $(element).attr('style') || '');
        });

        _.$slider.addClass('slick-slider');

        _.$slideTrack = (_.slideCount === 0) ?
            $('<div class="slick-track"/>').appendTo(_.$slider) :
            _.$slides.wrapAll('<div class="slick-track"/>').parent();

        _.$list = _.$slideTrack.wrap(
            '<div class="slick-list"/>').parent();
        _.$slideTrack.css('opacity', 0);

        if (_.options.centerMode === true || _.options.swipeToSlide === true) {
            _.options.slidesToScroll = 1;
        }

        $('img[data-lazy]', _.$slider).not('[src]').addClass('slick-loading');

        _.setupInfinite();

        _.buildArrows();

        _.buildDots();

        _.updateDots();


        _.setSlideClasses(typeof _.currentSlide === 'number' ? _.currentSlide : 0);

        if (_.options.draggable === true) {
            _.$list.addClass('draggable');
        }

    };

    Slick.prototype.buildRows = function() {

        var _ = this, a, b, c, newSlides, numOfSlides, originalSlides,slidesPerSection;

        newSlides = document.createDocumentFragment();
        originalSlides = _.$slider.children();

        if(_.options.rows > 1) {

            slidesPerSection = _.options.slidesPerRow * _.options.rows;
            numOfSlides = Math.ceil(
                originalSlides.length / slidesPerSection
            );

            for(a = 0; a < numOfSlides; a++){
                var slide = document.createElement('div');
                for(b = 0; b < _.options.rows; b++) {
                    var row = document.createElement('div');
                    for(c = 0; c < _.options.slidesPerRow; c++) {
                        var target = (a * slidesPerSection + ((b * _.options.slidesPerRow) + c));
                        if (originalSlides.get(target)) {
                            row.appendChild(originalSlides.get(target));
                        }
                    }
                    slide.appendChild(row);
                }
                newSlides.appendChild(slide);
            }

            _.$slider.empty().append(newSlides);
            _.$slider.children().children().children()
                .css({
                    'width':(100 / _.options.slidesPerRow) + '%',
                    'display': 'inline-block'
                });

        }

    };

    Slick.prototype.checkResponsive = function(initial, forceUpdate) {

        var _ = this,
            breakpoint, targetBreakpoint, respondToWidth, triggerBreakpoint = false;
        var sliderWidth = _.$slider.width();
        var windowWidth = window.innerWidth || $(window).width();

        if (_.respondTo === 'window') {
            respondToWidth = windowWidth;
        } else if (_.respondTo === 'slider') {
            respondToWidth = sliderWidth;
        } else if (_.respondTo === 'min') {
            respondToWidth = Math.min(windowWidth, sliderWidth);
        }

        if ( _.options.responsive &&
            _.options.responsive.length &&
            _.options.responsive !== null) {

            targetBreakpoint = null;

            for (breakpoint in _.breakpoints) {
                if (_.breakpoints.hasOwnProperty(breakpoint)) {
                    if (_.originalSettings.mobileFirst === false) {
                        if (respondToWidth < _.breakpoints[breakpoint]) {
                            targetBreakpoint = _.breakpoints[breakpoint];
                        }
                    } else {
                        if (respondToWidth > _.breakpoints[breakpoint]) {
                            targetBreakpoint = _.breakpoints[breakpoint];
                        }
                    }
                }
            }

            if (targetBreakpoint !== null) {
                if (_.activeBreakpoint !== null) {
                    if (targetBreakpoint !== _.activeBreakpoint || forceUpdate) {
                        _.activeBreakpoint =
                            targetBreakpoint;
                        if (_.breakpointSettings[targetBreakpoint] === 'unslick') {
                            _.unslick(targetBreakpoint);
                        } else {
                            _.options = $.extend({}, _.originalSettings,
                                _.breakpointSettings[
                                    targetBreakpoint]);
                            if (initial === true) {
                                _.currentSlide = _.options.initialSlide;
                            }
                            _.refresh(initial);
                        }
                        triggerBreakpoint = targetBreakpoint;
                    }
                } else {
                    _.activeBreakpoint = targetBreakpoint;
                    if (_.breakpointSettings[targetBreakpoint] === 'unslick') {
                        _.unslick(targetBreakpoint);
                    } else {
                        _.options = $.extend({}, _.originalSettings,
                            _.breakpointSettings[
                                targetBreakpoint]);
                        if (initial === true) {
                            _.currentSlide = _.options.initialSlide;
                        }
                        _.refresh(initial);
                    }
                    triggerBreakpoint = targetBreakpoint;
                }
            } else {
                if (_.activeBreakpoint !== null) {
                    _.activeBreakpoint = null;
                    _.options = _.originalSettings;
                    if (initial === true) {
                        _.currentSlide = _.options.initialSlide;
                    }
                    _.refresh(initial);
                    triggerBreakpoint = targetBreakpoint;
                }
            }

            // only trigger breakpoints during an actual break. not on initialize.
            if( !initial && triggerBreakpoint !== false ) {
                _.$slider.trigger('breakpoint', [_, triggerBreakpoint]);
            }
        }

    };

    Slick.prototype.changeSlide = function(event, dontAnimate) {

        var _ = this,
            $target = $(event.currentTarget),
            indexOffset, slideOffset, unevenOffset;

        // If target is a link, prevent default action.
        if($target.is('a')) {
            event.preventDefault();
        }

        // If target is not the <li> element (ie: a child), find the <li>.
        if(!$target.is('li')) {
            $target = $target.closest('li');
        }

        unevenOffset = (_.slideCount % _.options.slidesToScroll !== 0);
        indexOffset = unevenOffset ? 0 : (_.slideCount - _.currentSlide) % _.options.slidesToScroll;

        switch (event.data.message) {

            case 'previous':
                slideOffset = indexOffset === 0 ? _.options.slidesToScroll : _.options.slidesToShow - indexOffset;
                if (_.slideCount > _.options.slidesToShow) {
                    _.slideHandler(_.currentSlide - slideOffset, false, dontAnimate);
                }
                break;

            case 'next':
                slideOffset = indexOffset === 0 ? _.options.slidesToScroll : indexOffset;
                if (_.slideCount > _.options.slidesToShow) {
                    _.slideHandler(_.currentSlide + slideOffset, false, dontAnimate);
                }
                break;

            case 'index':
                var index = event.data.index === 0 ? 0 :
                    event.data.index || $target.index() * _.options.slidesToScroll;

                _.slideHandler(_.checkNavigable(index), false, dontAnimate);
                $target.children().trigger('focus');
                break;

            default:
                return;
        }

    };

    Slick.prototype.checkNavigable = function(index) {

        var _ = this,
            navigables, prevNavigable;

        navigables = _.getNavigableIndexes();
        prevNavigable = 0;
        if (index > navigables[navigables.length - 1]) {
            index = navigables[navigables.length - 1];
        } else {
            for (var n in navigables) {
                if (index < navigables[n]) {
                    index = prevNavigable;
                    break;
                }
                prevNavigable = navigables[n];
            }
        }

        return index;
    };

    Slick.prototype.cleanUpEvents = function() {

        var _ = this;

        if (_.options.dots && _.$dots !== null) {

            $('li', _.$dots)
                .off('click.slick', _.changeSlide)
                .off('mouseenter.slick', $.proxy(_.interrupt, _, true))
                .off('mouseleave.slick', $.proxy(_.interrupt, _, false));

            if (_.options.accessibility === true) {
                _.$dots.off('keydown.slick', _.keyHandler);
            }
        }

        _.$slider.off('focus.slick blur.slick');

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
            _.$prevArrow && _.$prevArrow.off('click.slick', _.changeSlide);
            _.$nextArrow && _.$nextArrow.off('click.slick', _.changeSlide);

            if (_.options.accessibility === true) {
                _.$prevArrow && _.$prevArrow.off('keydown.slick', _.keyHandler);
                _.$nextArrow && _.$nextArrow.off('keydown.slick', _.keyHandler);
            }
        }

        _.$list.off('touchstart.slick mousedown.slick', _.swipeHandler);
        _.$list.off('touchmove.slick mousemove.slick', _.swipeHandler);
        _.$list.off('touchend.slick mouseup.slick', _.swipeHandler);
        _.$list.off('touchcancel.slick mouseleave.slick', _.swipeHandler);

        _.$list.off('click.slick', _.clickHandler);

        $(document).off(_.visibilityChange, _.visibility);

        _.cleanUpSlideEvents();

        if (_.options.accessibility === true) {
            _.$list.off('keydown.slick', _.keyHandler);
        }

        if (_.options.focusOnSelect === true) {
            $(_.$slideTrack).children().off('click.slick', _.selectHandler);
        }

        $(window).off('orientationchange.slick.slick-' + _.instanceUid, _.orientationChange);

        $(window).off('resize.slick.slick-' + _.instanceUid, _.resize);

        $('[draggable!=true]', _.$slideTrack).off('dragstart', _.preventDefault);

        $(window).off('load.slick.slick-' + _.instanceUid, _.setPosition);

    };

    Slick.prototype.cleanUpSlideEvents = function() {

        var _ = this;

        _.$list.off('mouseenter.slick', $.proxy(_.interrupt, _, true));
        _.$list.off('mouseleave.slick', $.proxy(_.interrupt, _, false));

    };

    Slick.prototype.cleanUpRows = function() {

        var _ = this, originalSlides;

        if(_.options.rows > 1) {
            originalSlides = _.$slides.children().children();
            originalSlides.removeAttr('style');
            _.$slider.empty().append(originalSlides);
        }

    };

    Slick.prototype.clickHandler = function(event) {

        var _ = this;

        if (_.shouldClick === false) {
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.preventDefault();
        }

    };

    Slick.prototype.destroy = function(refresh) {

        var _ = this;

        _.autoPlayClear();

        _.touchObject = {};

        _.cleanUpEvents();

        $('.slick-cloned', _.$slider).detach();

        if (_.$dots) {
            _.$dots.remove();
        }

        if ( _.$prevArrow && _.$prevArrow.length ) {

            _.$prevArrow
                .removeClass('slick-disabled slick-arrow slick-hidden')
                .removeAttr('aria-hidden aria-disabled tabindex')
                .css('display','');

            if ( _.htmlExpr.test( _.options.prevArrow )) {
                _.$prevArrow.remove();
            }
        }

        if ( _.$nextArrow && _.$nextArrow.length ) {

            _.$nextArrow
                .removeClass('slick-disabled slick-arrow slick-hidden')
                .removeAttr('aria-hidden aria-disabled tabindex')
                .css('display','');

            if ( _.htmlExpr.test( _.options.nextArrow )) {
                _.$nextArrow.remove();
            }
        }


        if (_.$slides) {

            _.$slides
                .removeClass('slick-slide slick-active slick-center slick-visible slick-current')
                .removeAttr('aria-hidden')
                .removeAttr('data-slick-index')
                .each(function(){
                    $(this).attr('style', $(this).data('originalStyling'));
                });

            _.$slideTrack.children(this.options.slide).detach();

            _.$slideTrack.detach();

            _.$list.detach();

            _.$slider.append(_.$slides);
        }

        _.cleanUpRows();

        _.$slider.removeClass('slick-slider');
        _.$slider.removeClass('slick-initialized');
        _.$slider.removeClass('slick-dotted');

        _.unslicked = true;

        if(!refresh) {
            _.$slider.trigger('destroy', [_]);
        }

    };

    Slick.prototype.disableTransition = function(slide) {

        var _ = this,
            transition = {};

        transition[_.transitionType] = '';

        if (_.options.fade === false) {
            _.$slideTrack.css(transition);
        } else {
            _.$slides.eq(slide).css(transition);
        }

    };

    Slick.prototype.fadeSlide = function(slideIndex, callback) {

        var _ = this;

        if (_.cssTransitions === false) {

            _.$slides.eq(slideIndex).css({
                zIndex: _.options.zIndex
            });

            _.$slides.eq(slideIndex).animate({
                opacity: 1
            }, _.options.speed, _.options.easing, callback);

        } else {

            _.applyTransition(slideIndex);

            _.$slides.eq(slideIndex).css({
                opacity: 1,
                zIndex: _.options.zIndex
            });

            if (callback) {
                setTimeout(function() {

                    _.disableTransition(slideIndex);

                    callback.call();
                }, _.options.speed);
            }

        }

    };

    Slick.prototype.fadeSlideOut = function(slideIndex) {

        var _ = this;

        if (_.cssTransitions === false) {

            _.$slides.eq(slideIndex).animate({
                opacity: 0,
                zIndex: _.options.zIndex - 2
            }, _.options.speed, _.options.easing);

        } else {

            _.applyTransition(slideIndex);

            _.$slides.eq(slideIndex).css({
                opacity: 0,
                zIndex: _.options.zIndex - 2
            });

        }

    };

    Slick.prototype.filterSlides = Slick.prototype.slickFilter = function(filter) {

        var _ = this;

        if (filter !== null) {

            _.$slidesCache = _.$slides;

            _.unload();

            _.$slideTrack.children(this.options.slide).detach();

            _.$slidesCache.filter(filter).appendTo(_.$slideTrack);

            _.reinit();

        }

    };

    Slick.prototype.focusHandler = function() {

        var _ = this;

        _.$slider
            .off('focus.slick blur.slick')
            .on('focus.slick blur.slick', '*', function(event) {

            event.stopImmediatePropagation();
            var $sf = $(this);

            setTimeout(function() {

                if( _.options.pauseOnFocus ) {
                    _.focussed = $sf.is(':focus');
                    _.autoPlay();
                }

            }, 0);

        });
    };

    Slick.prototype.getCurrent = Slick.prototype.slickCurrentSlide = function() {

        var _ = this;
        return _.currentSlide;

    };

    Slick.prototype.getDotCount = function() {

        var _ = this;

        var breakPoint = 0;
        var counter = 0;
        var pagerQty = 0;

        if (_.options.infinite === true) {
            if (_.slideCount <= _.options.slidesToShow) {
                 ++pagerQty;
            } else {
                while (breakPoint < _.slideCount) {
                    ++pagerQty;
                    breakPoint = counter + _.options.slidesToScroll;
                    counter += _.options.slidesToScroll <= _.options.slidesToShow ? _.options.slidesToScroll : _.options.slidesToShow;
                }
            }
        } else if (_.options.centerMode === true) {
            pagerQty = _.slideCount;
        } else if(!_.options.asNavFor) {
            pagerQty = 1 + Math.ceil((_.slideCount - _.options.slidesToShow) / _.options.slidesToScroll);
        }else {
            while (breakPoint < _.slideCount) {
                ++pagerQty;
                breakPoint = counter + _.options.slidesToScroll;
                counter += _.options.slidesToScroll <= _.options.slidesToShow ? _.options.slidesToScroll : _.options.slidesToShow;
            }
        }

        return pagerQty - 1;

    };

    Slick.prototype.getLeft = function(slideIndex) {

        var _ = this,
            targetLeft,
            verticalHeight,
            verticalOffset = 0,
            targetSlide,
            coef;

        _.slideOffset = 0;
        verticalHeight = _.$slides.first().outerHeight(true);

        if (_.options.infinite === true) {
            if (_.slideCount > _.options.slidesToShow) {
                _.slideOffset = (_.slideWidth * _.options.slidesToShow) * -1;
                coef = -1

                if (_.options.vertical === true && _.options.centerMode === true) {
                    if (_.options.slidesToShow === 2) {
                        coef = -1.5;
                    } else if (_.options.slidesToShow === 1) {
                        coef = -2
                    }
                }
                verticalOffset = (verticalHeight * _.options.slidesToShow) * coef;
            }
            if (_.slideCount % _.options.slidesToScroll !== 0) {
                if (slideIndex + _.options.slidesToScroll > _.slideCount && _.slideCount > _.options.slidesToShow) {
                    if (slideIndex > _.slideCount) {
                        _.slideOffset = ((_.options.slidesToShow - (slideIndex - _.slideCount)) * _.slideWidth) * -1;
                        verticalOffset = ((_.options.slidesToShow - (slideIndex - _.slideCount)) * verticalHeight) * -1;
                    } else {
                        _.slideOffset = ((_.slideCount % _.options.slidesToScroll) * _.slideWidth) * -1;
                        verticalOffset = ((_.slideCount % _.options.slidesToScroll) * verticalHeight) * -1;
                    }
                }
            }
        } else {
            if (slideIndex + _.options.slidesToShow > _.slideCount) {
                _.slideOffset = ((slideIndex + _.options.slidesToShow) - _.slideCount) * _.slideWidth;
                verticalOffset = ((slideIndex + _.options.slidesToShow) - _.slideCount) * verticalHeight;
            }
        }

        if (_.slideCount <= _.options.slidesToShow) {
            _.slideOffset = 0;
            verticalOffset = 0;
        }

        if (_.options.centerMode === true && _.slideCount <= _.options.slidesToShow) {
            _.slideOffset = ((_.slideWidth * Math.floor(_.options.slidesToShow)) / 2) - ((_.slideWidth * _.slideCount) / 2);
        } else if (_.options.centerMode === true && _.options.infinite === true) {
            _.slideOffset += _.slideWidth * Math.floor(_.options.slidesToShow / 2) - _.slideWidth;
        } else if (_.options.centerMode === true) {
            _.slideOffset = 0;
            _.slideOffset += _.slideWidth * Math.floor(_.options.slidesToShow / 2);
        }

        if (_.options.vertical === false) {
            targetLeft = ((slideIndex * _.slideWidth) * -1) + _.slideOffset;
        } else {
            targetLeft = ((slideIndex * verticalHeight) * -1) + verticalOffset;
        }

        if (_.options.variableWidth === true) {

            if (_.slideCount <= _.options.slidesToShow || _.options.infinite === false) {
                targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex);
            } else {
                targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex + _.options.slidesToShow);
            }

            if (_.options.rtl === true) {
                if (targetSlide[0]) {
                    targetLeft = (_.$slideTrack.width() - targetSlide[0].offsetLeft - targetSlide.width()) * -1;
                } else {
                    targetLeft =  0;
                }
            } else {
                targetLeft = targetSlide[0] ? targetSlide[0].offsetLeft * -1 : 0;
            }

            if (_.options.centerMode === true) {
                if (_.slideCount <= _.options.slidesToShow || _.options.infinite === false) {
                    targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex);
                } else {
                    targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex + _.options.slidesToShow + 1);
                }

                if (_.options.rtl === true) {
                    if (targetSlide[0]) {
                        targetLeft = (_.$slideTrack.width() - targetSlide[0].offsetLeft - targetSlide.width()) * -1;
                    } else {
                        targetLeft =  0;
                    }
                } else {
                    targetLeft = targetSlide[0] ? targetSlide[0].offsetLeft * -1 : 0;
                }

                targetLeft += (_.$list.width() - targetSlide.outerWidth()) / 2;
            }
        }

        return targetLeft;

    };

    Slick.prototype.getOption = Slick.prototype.slickGetOption = function(option) {

        var _ = this;

        return _.options[option];

    };

    Slick.prototype.getNavigableIndexes = function() {

        var _ = this,
            breakPoint = 0,
            counter = 0,
            indexes = [],
            max;

        if (_.options.infinite === false) {
            max = _.slideCount;
        } else {
            breakPoint = _.options.slidesToScroll * -1;
            counter = _.options.slidesToScroll * -1;
            max = _.slideCount * 2;
        }

        while (breakPoint < max) {
            indexes.push(breakPoint);
            breakPoint = counter + _.options.slidesToScroll;
            counter += _.options.slidesToScroll <= _.options.slidesToShow ? _.options.slidesToScroll : _.options.slidesToShow;
        }

        return indexes;

    };

    Slick.prototype.getSlick = function() {

        return this;

    };

    Slick.prototype.getSlideCount = function() {

        var _ = this,
            slidesTraversed, swipedSlide, centerOffset;

        centerOffset = _.options.centerMode === true ? _.slideWidth * Math.floor(_.options.slidesToShow / 2) : 0;

        if (_.options.swipeToSlide === true) {
            _.$slideTrack.find('.slick-slide').each(function(index, slide) {
                if (slide.offsetLeft - centerOffset + ($(slide).outerWidth() / 2) > (_.swipeLeft * -1)) {
                    swipedSlide = slide;
                    return false;
                }
            });

            slidesTraversed = Math.abs($(swipedSlide).attr('data-slick-index') - _.currentSlide) || 1;

            return slidesTraversed;

        } else {
            return _.options.slidesToScroll;
        }

    };

    Slick.prototype.goTo = Slick.prototype.slickGoTo = function(slide, dontAnimate) {

        var _ = this;

        _.changeSlide({
            data: {
                message: 'index',
                index: parseInt(slide)
            }
        }, dontAnimate);

    };

    Slick.prototype.init = function(creation) {

        var _ = this;

        if (!$(_.$slider).hasClass('slick-initialized')) {

            $(_.$slider).addClass('slick-initialized');

            _.buildRows();
            _.buildOut();
            _.setProps();
            _.startLoad();
            _.loadSlider();
            _.initializeEvents();
            _.updateArrows();
            _.updateDots();
            _.checkResponsive(true);
            _.focusHandler();

        }

        if (creation) {
            _.$slider.trigger('init', [_]);
        }

        if (_.options.accessibility === true) {
            _.initADA();
        }

        if ( _.options.autoplay ) {

            _.paused = false;
            _.autoPlay();

        }

    };

    Slick.prototype.initADA = function() {
        var _ = this,
                numDotGroups = Math.ceil(_.slideCount / _.options.slidesToShow),
                tabControlIndexes = _.getNavigableIndexes().filter(function(val) {
                    return (val >= 0) && (val < _.slideCount);
                });

        _.$slides.add(_.$slideTrack.find('.slick-cloned')).attr({
            'aria-hidden': 'true',
            'tabindex': '-1'
        }).find('a, input, button, select').attr({
            'tabindex': '-1'
        });

        if (_.$dots !== null) {
            _.$slides.not(_.$slideTrack.find('.slick-cloned')).each(function(i) {
                var slideControlIndex = tabControlIndexes.indexOf(i);

                $(this).attr({
                    'role': 'tabpanel',
                    'id': 'slick-slide' + _.instanceUid + i,
                    'tabindex': -1
                });

                if (slideControlIndex !== -1) {
                    $(this).attr({
                        'aria-describedby': 'slick-slide-control' + _.instanceUid + slideControlIndex
                    });
                }
            });

            _.$dots.attr('role', 'tablist').find('li').each(function(i) {
                var mappedSlideIndex = tabControlIndexes[i];

                $(this).attr({
                    'role': 'presentation'
                });

                $(this).find('button').first().attr({
                    'role': 'tab',
                    'id': 'slick-slide-control' + _.instanceUid + i,
                    'aria-controls': 'slick-slide' + _.instanceUid + mappedSlideIndex,
                    'aria-label': (i + 1) + ' of ' + numDotGroups,
                    'aria-selected': null,
                    'tabindex': '-1'
                });

            }).eq(_.currentSlide).find('button').attr({
                'aria-selected': 'true',
                'tabindex': '0'
            }).end();
        }

        for (var i=_.currentSlide, max=i+_.options.slidesToShow; i < max; i++) {
            _.$slides.eq(i).attr('tabindex', 0);
        }

        _.activateADA();

    };

    Slick.prototype.initArrowEvents = function() {

        var _ = this;

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
            _.$prevArrow
               .off('click.slick')
               .on('click.slick', {
                    message: 'previous'
               }, _.changeSlide);
            _.$nextArrow
               .off('click.slick')
               .on('click.slick', {
                    message: 'next'
               }, _.changeSlide);

            if (_.options.accessibility === true) {
                _.$prevArrow.on('keydown.slick', _.keyHandler);
                _.$nextArrow.on('keydown.slick', _.keyHandler);
            }
        }

    };

    Slick.prototype.initDotEvents = function() {

        var _ = this;

        if (_.options.dots === true) {
            $('li', _.$dots).on('click.slick', {
                message: 'index'
            }, _.changeSlide);

            if (_.options.accessibility === true) {
                _.$dots.on('keydown.slick', _.keyHandler);
            }
        }

        if ( _.options.dots === true && _.options.pauseOnDotsHover === true ) {

            $('li', _.$dots)
                .on('mouseenter.slick', $.proxy(_.interrupt, _, true))
                .on('mouseleave.slick', $.proxy(_.interrupt, _, false));

        }

    };

    Slick.prototype.initSlideEvents = function() {

        var _ = this;

        if ( _.options.pauseOnHover ) {

            _.$list.on('mouseenter.slick', $.proxy(_.interrupt, _, true));
            _.$list.on('mouseleave.slick', $.proxy(_.interrupt, _, false));

        }

    };

    Slick.prototype.initializeEvents = function() {

        var _ = this;

        _.initArrowEvents();

        _.initDotEvents();
        _.initSlideEvents();

        _.$list.on('touchstart.slick mousedown.slick', {
            action: 'start'
        }, _.swipeHandler);
        _.$list.on('touchmove.slick mousemove.slick', {
            action: 'move'
        }, _.swipeHandler);
        _.$list.on('touchend.slick mouseup.slick', {
            action: 'end'
        }, _.swipeHandler);
        _.$list.on('touchcancel.slick mouseleave.slick', {
            action: 'end'
        }, _.swipeHandler);

        _.$list.on('click.slick', _.clickHandler);

        $(document).on(_.visibilityChange, $.proxy(_.visibility, _));

        if (_.options.accessibility === true) {
            _.$list.on('keydown.slick', _.keyHandler);
        }

        if (_.options.focusOnSelect === true) {
            $(_.$slideTrack).children().on('click.slick', _.selectHandler);
        }

        $(window).on('orientationchange.slick.slick-' + _.instanceUid, $.proxy(_.orientationChange, _));

        $(window).on('resize.slick.slick-' + _.instanceUid, $.proxy(_.resize, _));

        $('[draggable!=true]', _.$slideTrack).on('dragstart', _.preventDefault);

        $(window).on('load.slick.slick-' + _.instanceUid, _.setPosition);
        $(_.setPosition);

    };

    Slick.prototype.initUI = function() {

        var _ = this;

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {

            _.$prevArrow.show();
            _.$nextArrow.show();

        }

        if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {

            _.$dots.show();

        }

    };

    Slick.prototype.keyHandler = function(event) {

        var _ = this;
         //Dont slide if the cursor is inside the form fields and arrow keys are pressed
        if(!event.target.tagName.match('TEXTAREA|INPUT|SELECT')) {
            if (event.keyCode === 37 && _.options.accessibility === true) {
                _.changeSlide({
                    data: {
                        message: _.options.rtl === true ? 'next' :  'previous'
                    }
                });
            } else if (event.keyCode === 39 && _.options.accessibility === true) {
                _.changeSlide({
                    data: {
                        message: _.options.rtl === true ? 'previous' : 'next'
                    }
                });
            }
        }

    };

    Slick.prototype.lazyLoad = function() {

        var _ = this,
            loadRange, cloneRange, rangeStart, rangeEnd;

        function loadImages(imagesScope) {

            $('img[data-lazy]', imagesScope).each(function() {

                var image = $(this),
                    imageSource = $(this).attr('data-lazy'),
                    imageSrcSet = $(this).attr('data-srcset'),
                    imageSizes  = $(this).attr('data-sizes') || _.$slider.attr('data-sizes'),
                    imageToLoad = document.createElement('img');

                imageToLoad.onload = function() {

                    image
                        .animate({ opacity: 0 }, 100, function() {

                            if (imageSrcSet) {
                                image
                                    .attr('srcset', imageSrcSet );

                                if (imageSizes) {
                                    image
                                        .attr('sizes', imageSizes );
                                }
                            }

                            image
                                .attr('src', imageSource)
                                .animate({ opacity: 1 }, 200, function() {
                                    image
                                        .removeAttr('data-lazy data-srcset data-sizes')
                                        .removeClass('slick-loading');
                                });
                            _.$slider.trigger('lazyLoaded', [_, image, imageSource]);
                        });

                };

                imageToLoad.onerror = function() {

                    image
                        .removeAttr( 'data-lazy' )
                        .removeClass( 'slick-loading' )
                        .addClass( 'slick-lazyload-error' );

                    _.$slider.trigger('lazyLoadError', [ _, image, imageSource ]);

                };

                imageToLoad.src = imageSource;

            });

        }

        if (_.options.centerMode === true) {
            if (_.options.infinite === true) {
                rangeStart = _.currentSlide + (_.options.slidesToShow / 2 + 1);
                rangeEnd = rangeStart + _.options.slidesToShow + 2;
            } else {
                rangeStart = Math.max(0, _.currentSlide - (_.options.slidesToShow / 2 + 1));
                rangeEnd = 2 + (_.options.slidesToShow / 2 + 1) + _.currentSlide;
            }
        } else {
            rangeStart = _.options.infinite ? _.options.slidesToShow + _.currentSlide : _.currentSlide;
            rangeEnd = Math.ceil(rangeStart + _.options.slidesToShow);
            if (_.options.fade === true) {
                if (rangeStart > 0) rangeStart--;
                if (rangeEnd <= _.slideCount) rangeEnd++;
            }
        }

        loadRange = _.$slider.find('.slick-slide').slice(rangeStart, rangeEnd);

        if (_.options.lazyLoad === 'anticipated') {
            var prevSlide = rangeStart - 1,
                nextSlide = rangeEnd,
                $slides = _.$slider.find('.slick-slide');

            for (var i = 0; i < _.options.slidesToScroll; i++) {
                if (prevSlide < 0) prevSlide = _.slideCount - 1;
                loadRange = loadRange.add($slides.eq(prevSlide));
                loadRange = loadRange.add($slides.eq(nextSlide));
                prevSlide--;
                nextSlide++;
            }
        }

        loadImages(loadRange);

        if (_.slideCount <= _.options.slidesToShow) {
            cloneRange = _.$slider.find('.slick-slide');
            loadImages(cloneRange);
        } else
        if (_.currentSlide >= _.slideCount - _.options.slidesToShow) {
            cloneRange = _.$slider.find('.slick-cloned').slice(0, _.options.slidesToShow);
            loadImages(cloneRange);
        } else if (_.currentSlide === 0) {
            cloneRange = _.$slider.find('.slick-cloned').slice(_.options.slidesToShow * -1);
            loadImages(cloneRange);
        }

    };

    Slick.prototype.loadSlider = function() {

        var _ = this;

        _.setPosition();

        _.$slideTrack.css({
            opacity: 1
        });

        _.$slider.removeClass('slick-loading');

        _.initUI();

        if (_.options.lazyLoad === 'progressive') {
            _.progressiveLazyLoad();
        }

    };

    Slick.prototype.next = Slick.prototype.slickNext = function() {

        var _ = this;

        _.changeSlide({
            data: {
                message: 'next'
            }
        });

    };

    Slick.prototype.orientationChange = function() {

        var _ = this;

        _.checkResponsive();
        _.setPosition();

    };

    Slick.prototype.pause = Slick.prototype.slickPause = function() {

        var _ = this;

        _.autoPlayClear();
        _.paused = true;

    };

    Slick.prototype.play = Slick.prototype.slickPlay = function() {

        var _ = this;

        _.autoPlay();
        _.options.autoplay = true;
        _.paused = false;
        _.focussed = false;
        _.interrupted = false;

    };

    Slick.prototype.postSlide = function(index) {

        var _ = this;

        if( !_.unslicked ) {

            _.$slider.trigger('afterChange', [_, index]);

            _.animating = false;

            if (_.slideCount > _.options.slidesToShow) {
                _.setPosition();
            }

            _.swipeLeft = null;

            if ( _.options.autoplay ) {
                _.autoPlay();
            }

            if (_.options.accessibility === true) {
                _.initADA();
                
                if (_.options.focusOnChange) {
                    var $currentSlide = $(_.$slides.get(_.currentSlide));
                    $currentSlide.attr('tabindex', 0).focus();
                }
            }

        }

    };

    Slick.prototype.prev = Slick.prototype.slickPrev = function() {

        var _ = this;

        _.changeSlide({
            data: {
                message: 'previous'
            }
        });

    };

    Slick.prototype.preventDefault = function(event) {

        event.preventDefault();

    };

    Slick.prototype.progressiveLazyLoad = function( tryCount ) {

        tryCount = tryCount || 1;

        var _ = this,
            $imgsToLoad = $( 'img[data-lazy]', _.$slider ),
            image,
            imageSource,
            imageSrcSet,
            imageSizes,
            imageToLoad;

        if ( $imgsToLoad.length ) {

            image = $imgsToLoad.first();
            imageSource = image.attr('data-lazy');
            imageSrcSet = image.attr('data-srcset');
            imageSizes  = image.attr('data-sizes') || _.$slider.attr('data-sizes');
            imageToLoad = document.createElement('img');

            imageToLoad.onload = function() {

                if (imageSrcSet) {
                    image
                        .attr('srcset', imageSrcSet );

                    if (imageSizes) {
                        image
                            .attr('sizes', imageSizes );
                    }
                }

                image
                    .attr( 'src', imageSource )
                    .removeAttr('data-lazy data-srcset data-sizes')
                    .removeClass('slick-loading');

                if ( _.options.adaptiveHeight === true ) {
                    _.setPosition();
                }

                _.$slider.trigger('lazyLoaded', [ _, image, imageSource ]);
                _.progressiveLazyLoad();

            };

            imageToLoad.onerror = function() {

                if ( tryCount < 3 ) {

                    /**
                     * try to load the image 3 times,
                     * leave a slight delay so we don't get
                     * servers blocking the request.
                     */
                    setTimeout( function() {
                        _.progressiveLazyLoad( tryCount + 1 );
                    }, 500 );

                } else {

                    image
                        .removeAttr( 'data-lazy' )
                        .removeClass( 'slick-loading' )
                        .addClass( 'slick-lazyload-error' );

                    _.$slider.trigger('lazyLoadError', [ _, image, imageSource ]);

                    _.progressiveLazyLoad();

                }

            };

            imageToLoad.src = imageSource;

        } else {

            _.$slider.trigger('allImagesLoaded', [ _ ]);

        }

    };

    Slick.prototype.refresh = function( initializing ) {

        var _ = this, currentSlide, lastVisibleIndex;

        lastVisibleIndex = _.slideCount - _.options.slidesToShow;

        // in non-infinite sliders, we don't want to go past the
        // last visible index.
        if( !_.options.infinite && ( _.currentSlide > lastVisibleIndex )) {
            _.currentSlide = lastVisibleIndex;
        }

        // if less slides than to show, go to start.
        if ( _.slideCount <= _.options.slidesToShow ) {
            _.currentSlide = 0;

        }

        currentSlide = _.currentSlide;

        _.destroy(true);

        $.extend(_, _.initials, { currentSlide: currentSlide });

        _.init();

        if( !initializing ) {

            _.changeSlide({
                data: {
                    message: 'index',
                    index: currentSlide
                }
            }, false);

        }

    };

    Slick.prototype.registerBreakpoints = function() {

        var _ = this, breakpoint, currentBreakpoint, l,
            responsiveSettings = _.options.responsive || null;

        if ( $.type(responsiveSettings) === 'array' && responsiveSettings.length ) {

            _.respondTo = _.options.respondTo || 'window';

            for ( breakpoint in responsiveSettings ) {

                l = _.breakpoints.length-1;

                if (responsiveSettings.hasOwnProperty(breakpoint)) {
                    currentBreakpoint = responsiveSettings[breakpoint].breakpoint;

                    // loop through the breakpoints and cut out any existing
                    // ones with the same breakpoint number, we don't want dupes.
                    while( l >= 0 ) {
                        if( _.breakpoints[l] && _.breakpoints[l] === currentBreakpoint ) {
                            _.breakpoints.splice(l,1);
                        }
                        l--;
                    }

                    _.breakpoints.push(currentBreakpoint);
                    _.breakpointSettings[currentBreakpoint] = responsiveSettings[breakpoint].settings;

                }

            }

            _.breakpoints.sort(function(a, b) {
                return ( _.options.mobileFirst ) ? a-b : b-a;
            });

        }

    };

    Slick.prototype.reinit = function() {

        var _ = this;

        _.$slides =
            _.$slideTrack
                .children(_.options.slide)
                .addClass('slick-slide');

        _.slideCount = _.$slides.length;

        if (_.currentSlide >= _.slideCount && _.currentSlide !== 0) {
            _.currentSlide = _.currentSlide - _.options.slidesToScroll;
        }

        if (_.slideCount <= _.options.slidesToShow) {
            _.currentSlide = 0;
        }

        _.registerBreakpoints();

        _.setProps();
        _.setupInfinite();
        _.buildArrows();
        _.updateArrows();
        _.initArrowEvents();
        _.buildDots();
        _.updateDots();
        _.initDotEvents();
        _.cleanUpSlideEvents();
        _.initSlideEvents();

        _.checkResponsive(false, true);

        if (_.options.focusOnSelect === true) {
            $(_.$slideTrack).children().on('click.slick', _.selectHandler);
        }

        _.setSlideClasses(typeof _.currentSlide === 'number' ? _.currentSlide : 0);

        _.setPosition();
        _.focusHandler();

        _.paused = !_.options.autoplay;
        _.autoPlay();

        _.$slider.trigger('reInit', [_]);

    };

    Slick.prototype.resize = function() {

        var _ = this;

        if ($(window).width() !== _.windowWidth) {
            clearTimeout(_.windowDelay);
            _.windowDelay = window.setTimeout(function() {
                _.windowWidth = $(window).width();
                _.checkResponsive();
                if( !_.unslicked ) { _.setPosition(); }
            }, 50);
        }
    };

    Slick.prototype.removeSlide = Slick.prototype.slickRemove = function(index, removeBefore, removeAll) {

        var _ = this;

        if (typeof(index) === 'boolean') {
            removeBefore = index;
            index = removeBefore === true ? 0 : _.slideCount - 1;
        } else {
            index = removeBefore === true ? --index : index;
        }

        if (_.slideCount < 1 || index < 0 || index > _.slideCount - 1) {
            return false;
        }

        _.unload();

        if (removeAll === true) {
            _.$slideTrack.children().remove();
        } else {
            _.$slideTrack.children(this.options.slide).eq(index).remove();
        }

        _.$slides = _.$slideTrack.children(this.options.slide);

        _.$slideTrack.children(this.options.slide).detach();

        _.$slideTrack.append(_.$slides);

        _.$slidesCache = _.$slides;

        _.reinit();

    };

    Slick.prototype.setCSS = function(position) {

        var _ = this,
            positionProps = {},
            x, y;

        if (_.options.rtl === true) {
            position = -position;
        }
        x = _.positionProp == 'left' ? Math.ceil(position) + 'px' : '0px';
        y = _.positionProp == 'top' ? Math.ceil(position) + 'px' : '0px';

        positionProps[_.positionProp] = position;

        if (_.transformsEnabled === false) {
            _.$slideTrack.css(positionProps);
        } else {
            positionProps = {};
            if (_.cssTransitions === false) {
                positionProps[_.animType] = 'translate(' + x + ', ' + y + ')';
                _.$slideTrack.css(positionProps);
            } else {
                positionProps[_.animType] = 'translate3d(' + x + ', ' + y + ', 0px)';
                _.$slideTrack.css(positionProps);
            }
        }

    };

    Slick.prototype.setDimensions = function() {

        var _ = this;

        if (_.options.vertical === false) {
            if (_.options.centerMode === true) {
                _.$list.css({
                    padding: ('0px ' + _.options.centerPadding)
                });
            }
        } else {
            _.$list.height(_.$slides.first().outerHeight(true) * _.options.slidesToShow);
            if (_.options.centerMode === true) {
                _.$list.css({
                    padding: (_.options.centerPadding + ' 0px')
                });
            }
        }

        _.listWidth = _.$list.width();
        _.listHeight = _.$list.height();


        if (_.options.vertical === false && _.options.variableWidth === false) {
            _.slideWidth = Math.ceil(_.listWidth / _.options.slidesToShow);
            _.$slideTrack.width(Math.ceil((_.slideWidth * _.$slideTrack.children('.slick-slide').length)));

        } else if (_.options.variableWidth === true) {
            _.$slideTrack.width(5000 * _.slideCount);
        } else {
            _.slideWidth = Math.ceil(_.listWidth);
            _.$slideTrack.height(Math.ceil((_.$slides.first().outerHeight(true) * _.$slideTrack.children('.slick-slide').length)));
        }

        var offset = _.$slides.first().outerWidth(true) - _.$slides.first().width();
        if (_.options.variableWidth === false) _.$slideTrack.children('.slick-slide').width(_.slideWidth - offset);

    };

    Slick.prototype.setFade = function() {

        var _ = this,
            targetLeft;

        _.$slides.each(function(index, element) {
            targetLeft = (_.slideWidth * index) * -1;
            if (_.options.rtl === true) {
                $(element).css({
                    position: 'relative',
                    right: targetLeft,
                    top: 0,
                    zIndex: _.options.zIndex - 2,
                    opacity: 0
                });
            } else {
                $(element).css({
                    position: 'relative',
                    left: targetLeft,
                    top: 0,
                    zIndex: _.options.zIndex - 2,
                    opacity: 0
                });
            }
        });

        _.$slides.eq(_.currentSlide).css({
            zIndex: _.options.zIndex - 1,
            opacity: 1
        });

    };

    Slick.prototype.setHeight = function() {

        var _ = this;

        if (_.options.slidesToShow === 1 && _.options.adaptiveHeight === true && _.options.vertical === false) {
            var targetHeight = _.$slides.eq(_.currentSlide).outerHeight(true);
            _.$list.css('height', targetHeight);
        }

    };

    Slick.prototype.setOption =
    Slick.prototype.slickSetOption = function() {

        /**
         * accepts arguments in format of:
         *
         *  - for changing a single option's value:
         *     .slick("setOption", option, value, refresh )
         *
         *  - for changing a set of responsive options:
         *     .slick("setOption", 'responsive', [{}, ...], refresh )
         *
         *  - for updating multiple values at once (not responsive)
         *     .slick("setOption", { 'option': value, ... }, refresh )
         */

        var _ = this, l, item, option, value, refresh = false, type;

        if( $.type( arguments[0] ) === 'object' ) {

            option =  arguments[0];
            refresh = arguments[1];
            type = 'multiple';

        } else if ( $.type( arguments[0] ) === 'string' ) {

            option =  arguments[0];
            value = arguments[1];
            refresh = arguments[2];

            if ( arguments[0] === 'responsive' && $.type( arguments[1] ) === 'array' ) {

                type = 'responsive';

            } else if ( typeof arguments[1] !== 'undefined' ) {

                type = 'single';

            }

        }

        if ( type === 'single' ) {

            _.options[option] = value;


        } else if ( type === 'multiple' ) {

            $.each( option , function( opt, val ) {

                _.options[opt] = val;

            });


        } else if ( type === 'responsive' ) {

            for ( item in value ) {

                if( $.type( _.options.responsive ) !== 'array' ) {

                    _.options.responsive = [ value[item] ];

                } else {

                    l = _.options.responsive.length-1;

                    // loop through the responsive object and splice out duplicates.
                    while( l >= 0 ) {

                        if( _.options.responsive[l].breakpoint === value[item].breakpoint ) {

                            _.options.responsive.splice(l,1);

                        }

                        l--;

                    }

                    _.options.responsive.push( value[item] );

                }

            }

        }

        if ( refresh ) {

            _.unload();
            _.reinit();

        }

    };

    Slick.prototype.setPosition = function() {

        var _ = this;

        _.setDimensions();

        _.setHeight();

        if (_.options.fade === false) {
            _.setCSS(_.getLeft(_.currentSlide));
        } else {
            _.setFade();
        }

        _.$slider.trigger('setPosition', [_]);

    };

    Slick.prototype.setProps = function() {

        var _ = this,
            bodyStyle = document.body.style;

        _.positionProp = _.options.vertical === true ? 'top' : 'left';

        if (_.positionProp === 'top') {
            _.$slider.addClass('slick-vertical');
        } else {
            _.$slider.removeClass('slick-vertical');
        }

        if (bodyStyle.WebkitTransition !== undefined ||
            bodyStyle.MozTransition !== undefined ||
            bodyStyle.msTransition !== undefined) {
            if (_.options.useCSS === true) {
                _.cssTransitions = true;
            }
        }

        if ( _.options.fade ) {
            if ( typeof _.options.zIndex === 'number' ) {
                if( _.options.zIndex < 3 ) {
                    _.options.zIndex = 3;
                }
            } else {
                _.options.zIndex = _.defaults.zIndex;
            }
        }

        if (bodyStyle.OTransform !== undefined) {
            _.animType = 'OTransform';
            _.transformType = '-o-transform';
            _.transitionType = 'OTransition';
            if (bodyStyle.perspectiveProperty === undefined && bodyStyle.webkitPerspective === undefined) _.animType = false;
        }
        if (bodyStyle.MozTransform !== undefined) {
            _.animType = 'MozTransform';
            _.transformType = '-moz-transform';
            _.transitionType = 'MozTransition';
            if (bodyStyle.perspectiveProperty === undefined && bodyStyle.MozPerspective === undefined) _.animType = false;
        }
        if (bodyStyle.webkitTransform !== undefined) {
            _.animType = 'webkitTransform';
            _.transformType = '-webkit-transform';
            _.transitionType = 'webkitTransition';
            if (bodyStyle.perspectiveProperty === undefined && bodyStyle.webkitPerspective === undefined) _.animType = false;
        }
        if (bodyStyle.msTransform !== undefined) {
            _.animType = 'msTransform';
            _.transformType = '-ms-transform';
            _.transitionType = 'msTransition';
            if (bodyStyle.msTransform === undefined) _.animType = false;
        }
        if (bodyStyle.transform !== undefined && _.animType !== false) {
            _.animType = 'transform';
            _.transformType = 'transform';
            _.transitionType = 'transition';
        }
        _.transformsEnabled = _.options.useTransform && (_.animType !== null && _.animType !== false);
    };


    Slick.prototype.setSlideClasses = function(index) {

        var _ = this,
            centerOffset, allSlides, indexOffset, remainder;

        allSlides = _.$slider
            .find('.slick-slide')
            .removeClass('slick-active slick-center slick-current')
            .attr('aria-hidden', 'true');

        _.$slides
            .eq(index)
            .addClass('slick-current');

        if (_.options.centerMode === true) {

            var evenCoef = _.options.slidesToShow % 2 === 0 ? 1 : 0;

            centerOffset = Math.floor(_.options.slidesToShow / 2);

            if (_.options.infinite === true) {

                if (index >= centerOffset && index <= (_.slideCount - 1) - centerOffset) {
                    _.$slides
                        .slice(index - centerOffset + evenCoef, index + centerOffset + 1)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                } else {

                    indexOffset = _.options.slidesToShow + index;
                    allSlides
                        .slice(indexOffset - centerOffset + 1 + evenCoef, indexOffset + centerOffset + 2)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                }

                if (index === 0) {

                    allSlides
                        .eq(allSlides.length - 1 - _.options.slidesToShow)
                        .addClass('slick-center');

                } else if (index === _.slideCount - 1) {

                    allSlides
                        .eq(_.options.slidesToShow)
                        .addClass('slick-center');

                }

            }

            _.$slides
                .eq(index)
                .addClass('slick-center');

        } else {

            if (index >= 0 && index <= (_.slideCount - _.options.slidesToShow)) {

                _.$slides
                    .slice(index, index + _.options.slidesToShow)
                    .addClass('slick-active')
                    .attr('aria-hidden', 'false');

            } else if (allSlides.length <= _.options.slidesToShow) {

                allSlides
                    .addClass('slick-active')
                    .attr('aria-hidden', 'false');

            } else {

                remainder = _.slideCount % _.options.slidesToShow;
                indexOffset = _.options.infinite === true ? _.options.slidesToShow + index : index;

                if (_.options.slidesToShow == _.options.slidesToScroll && (_.slideCount - index) < _.options.slidesToShow) {

                    allSlides
                        .slice(indexOffset - (_.options.slidesToShow - remainder), indexOffset + remainder)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                } else {

                    allSlides
                        .slice(indexOffset, indexOffset + _.options.slidesToShow)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                }

            }

        }

        if (_.options.lazyLoad === 'ondemand' || _.options.lazyLoad === 'anticipated') {
            _.lazyLoad();
        }
    };

    Slick.prototype.setupInfinite = function() {

        var _ = this,
            i, slideIndex, infiniteCount;

        if (_.options.fade === true) {
            _.options.centerMode = false;
        }

        if (_.options.infinite === true && _.options.fade === false) {

            slideIndex = null;

            if (_.slideCount > _.options.slidesToShow) {

                if (_.options.centerMode === true) {
                    infiniteCount = _.options.slidesToShow + 1;
                } else {
                    infiniteCount = _.options.slidesToShow;
                }

                for (i = _.slideCount; i > (_.slideCount -
                        infiniteCount); i -= 1) {
                    slideIndex = i - 1;
                    $(_.$slides[slideIndex]).clone(true).attr('id', '')
                        .attr('data-slick-index', slideIndex - _.slideCount)
                        .prependTo(_.$slideTrack).addClass('slick-cloned');
                }
                for (i = 0; i < infiniteCount  + _.slideCount; i += 1) {
                    slideIndex = i;
                    $(_.$slides[slideIndex]).clone(true).attr('id', '')
                        .attr('data-slick-index', slideIndex + _.slideCount)
                        .appendTo(_.$slideTrack).addClass('slick-cloned');
                }
                _.$slideTrack.find('.slick-cloned').find('[id]').each(function() {
                    $(this).attr('id', '');
                });

            }

        }

    };

    Slick.prototype.interrupt = function( toggle ) {

        var _ = this;

        if( !toggle ) {
            _.autoPlay();
        }
        _.interrupted = toggle;

    };

    Slick.prototype.selectHandler = function(event) {

        var _ = this;

        var targetElement =
            $(event.target).is('.slick-slide') ?
                $(event.target) :
                $(event.target).parents('.slick-slide');

        var index = parseInt(targetElement.attr('data-slick-index'));

        if (!index) index = 0;

        if (_.slideCount <= _.options.slidesToShow) {

            _.slideHandler(index, false, true);
            return;

        }

        _.slideHandler(index);

    };

    Slick.prototype.slideHandler = function(index, sync, dontAnimate) {

        var targetSlide, animSlide, oldSlide, slideLeft, targetLeft = null,
            _ = this, navTarget;

        sync = sync || false;

        if (_.animating === true && _.options.waitForAnimate === true) {
            return;
        }

        if (_.options.fade === true && _.currentSlide === index) {
            return;
        }

        if (sync === false) {
            _.asNavFor(index);
        }

        targetSlide = index;
        targetLeft = _.getLeft(targetSlide);
        slideLeft = _.getLeft(_.currentSlide);

        _.currentLeft = _.swipeLeft === null ? slideLeft : _.swipeLeft;

        if (_.options.infinite === false && _.options.centerMode === false && (index < 0 || index > _.getDotCount() * _.options.slidesToScroll)) {
            if (_.options.fade === false) {
                targetSlide = _.currentSlide;
                if (dontAnimate !== true) {
                    _.animateSlide(slideLeft, function() {
                        _.postSlide(targetSlide);
                    });
                } else {
                    _.postSlide(targetSlide);
                }
            }
            return;
        } else if (_.options.infinite === false && _.options.centerMode === true && (index < 0 || index > (_.slideCount - _.options.slidesToScroll))) {
            if (_.options.fade === false) {
                targetSlide = _.currentSlide;
                if (dontAnimate !== true) {
                    _.animateSlide(slideLeft, function() {
                        _.postSlide(targetSlide);
                    });
                } else {
                    _.postSlide(targetSlide);
                }
            }
            return;
        }

        if ( _.options.autoplay ) {
            clearInterval(_.autoPlayTimer);
        }

        if (targetSlide < 0) {
            if (_.slideCount % _.options.slidesToScroll !== 0) {
                animSlide = _.slideCount - (_.slideCount % _.options.slidesToScroll);
            } else {
                animSlide = _.slideCount + targetSlide;
            }
        } else if (targetSlide >= _.slideCount) {
            if (_.slideCount % _.options.slidesToScroll !== 0) {
                animSlide = 0;
            } else {
                animSlide = targetSlide - _.slideCount;
            }
        } else {
            animSlide = targetSlide;
        }

        _.animating = true;

        _.$slider.trigger('beforeChange', [_, _.currentSlide, animSlide]);

        oldSlide = _.currentSlide;
        _.currentSlide = animSlide;

        _.setSlideClasses(_.currentSlide);

        if ( _.options.asNavFor ) {

            navTarget = _.getNavTarget();
            navTarget = navTarget.slick('getSlick');

            if ( navTarget.slideCount <= navTarget.options.slidesToShow ) {
                navTarget.setSlideClasses(_.currentSlide);
            }

        }

        _.updateDots();
        _.updateArrows();

        if (_.options.fade === true) {
            if (dontAnimate !== true) {

                _.fadeSlideOut(oldSlide);

                _.fadeSlide(animSlide, function() {
                    _.postSlide(animSlide);
                });

            } else {
                _.postSlide(animSlide);
            }
            _.animateHeight();
            return;
        }

        if (dontAnimate !== true) {
            _.animateSlide(targetLeft, function() {
                _.postSlide(animSlide);
            });
        } else {
            _.postSlide(animSlide);
        }

    };

    Slick.prototype.startLoad = function() {

        var _ = this;

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {

            _.$prevArrow.hide();
            _.$nextArrow.hide();

        }

        if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {

            _.$dots.hide();

        }

        _.$slider.addClass('slick-loading');

    };

    Slick.prototype.swipeDirection = function() {

        var xDist, yDist, r, swipeAngle, _ = this;

        xDist = _.touchObject.startX - _.touchObject.curX;
        yDist = _.touchObject.startY - _.touchObject.curY;
        r = Math.atan2(yDist, xDist);

        swipeAngle = Math.round(r * 180 / Math.PI);
        if (swipeAngle < 0) {
            swipeAngle = 360 - Math.abs(swipeAngle);
        }

        if ((swipeAngle <= 45) && (swipeAngle >= 0)) {
            return (_.options.rtl === false ? 'left' : 'right');
        }
        if ((swipeAngle <= 360) && (swipeAngle >= 315)) {
            return (_.options.rtl === false ? 'left' : 'right');
        }
        if ((swipeAngle >= 135) && (swipeAngle <= 225)) {
            return (_.options.rtl === false ? 'right' : 'left');
        }
        if (_.options.verticalSwiping === true) {
            if ((swipeAngle >= 35) && (swipeAngle <= 135)) {
                return 'down';
            } else {
                return 'up';
            }
        }

        return 'vertical';

    };

    Slick.prototype.swipeEnd = function(event) {

        var _ = this,
            slideCount,
            direction;

        _.dragging = false;
        _.swiping = false;

        if (_.scrolling) {
            _.scrolling = false;
            return false;
        }

        _.interrupted = false;
        _.shouldClick = ( _.touchObject.swipeLength > 10 ) ? false : true;

        if ( _.touchObject.curX === undefined ) {
            return false;
        }

        if ( _.touchObject.edgeHit === true ) {
            _.$slider.trigger('edge', [_, _.swipeDirection() ]);
        }

        if ( _.touchObject.swipeLength >= _.touchObject.minSwipe ) {

            direction = _.swipeDirection();

            switch ( direction ) {

                case 'left':
                case 'down':

                    slideCount =
                        _.options.swipeToSlide ?
                            _.checkNavigable( _.currentSlide + _.getSlideCount() ) :
                            _.currentSlide + _.getSlideCount();

                    _.currentDirection = 0;

                    break;

                case 'right':
                case 'up':

                    slideCount =
                        _.options.swipeToSlide ?
                            _.checkNavigable( _.currentSlide - _.getSlideCount() ) :
                            _.currentSlide - _.getSlideCount();

                    _.currentDirection = 1;

                    break;

                default:


            }

            if( direction != 'vertical' ) {

                _.slideHandler( slideCount );
                _.touchObject = {};
                _.$slider.trigger('swipe', [_, direction ]);

            }

        } else {

            if ( _.touchObject.startX !== _.touchObject.curX ) {

                _.slideHandler( _.currentSlide );
                _.touchObject = {};

            }

        }

    };

    Slick.prototype.swipeHandler = function(event) {

        var _ = this;

        if ((_.options.swipe === false) || ('ontouchend' in document && _.options.swipe === false)) {
            return;
        } else if (_.options.draggable === false && event.type.indexOf('mouse') !== -1) {
            return;
        }

        _.touchObject.fingerCount = event.originalEvent && event.originalEvent.touches !== undefined ?
            event.originalEvent.touches.length : 1;

        _.touchObject.minSwipe = _.listWidth / _.options
            .touchThreshold;

        if (_.options.verticalSwiping === true) {
            _.touchObject.minSwipe = _.listHeight / _.options
                .touchThreshold;
        }

        switch (event.data.action) {

            case 'start':
                _.swipeStart(event);
                break;

            case 'move':
                _.swipeMove(event);
                break;

            case 'end':
                _.swipeEnd(event);
                break;

        }

    };

    Slick.prototype.swipeMove = function(event) {

        var _ = this,
            edgeWasHit = false,
            curLeft, swipeDirection, swipeLength, positionOffset, touches, verticalSwipeLength;

        touches = event.originalEvent !== undefined ? event.originalEvent.touches : null;

        if (!_.dragging || _.scrolling || touches && touches.length !== 1) {
            return false;
        }

        curLeft = _.getLeft(_.currentSlide);

        _.touchObject.curX = touches !== undefined ? touches[0].pageX : event.clientX;
        _.touchObject.curY = touches !== undefined ? touches[0].pageY : event.clientY;

        _.touchObject.swipeLength = Math.round(Math.sqrt(
            Math.pow(_.touchObject.curX - _.touchObject.startX, 2)));

        verticalSwipeLength = Math.round(Math.sqrt(
            Math.pow(_.touchObject.curY - _.touchObject.startY, 2)));

        if (!_.options.verticalSwiping && !_.swiping && verticalSwipeLength > 4) {
            _.scrolling = true;
            return false;
        }

        if (_.options.verticalSwiping === true) {
            _.touchObject.swipeLength = verticalSwipeLength;
        }

        swipeDirection = _.swipeDirection();

        if (event.originalEvent !== undefined && _.touchObject.swipeLength > 4) {
            _.swiping = true;
            event.preventDefault();
        }

        positionOffset = (_.options.rtl === false ? 1 : -1) * (_.touchObject.curX > _.touchObject.startX ? 1 : -1);
        if (_.options.verticalSwiping === true) {
            positionOffset = _.touchObject.curY > _.touchObject.startY ? 1 : -1;
        }


        swipeLength = _.touchObject.swipeLength;

        _.touchObject.edgeHit = false;

        if (_.options.infinite === false) {
            if ((_.currentSlide === 0 && swipeDirection === 'right') || (_.currentSlide >= _.getDotCount() && swipeDirection === 'left')) {
                swipeLength = _.touchObject.swipeLength * _.options.edgeFriction;
                _.touchObject.edgeHit = true;
            }
        }

        if (_.options.vertical === false) {
            _.swipeLeft = curLeft + swipeLength * positionOffset;
        } else {
            _.swipeLeft = curLeft + (swipeLength * (_.$list.height() / _.listWidth)) * positionOffset;
        }
        if (_.options.verticalSwiping === true) {
            _.swipeLeft = curLeft + swipeLength * positionOffset;
        }

        if (_.options.fade === true || _.options.touchMove === false) {
            return false;
        }

        if (_.animating === true) {
            _.swipeLeft = null;
            return false;
        }

        _.setCSS(_.swipeLeft);

    };

    Slick.prototype.swipeStart = function(event) {

        var _ = this,
            touches;

        _.interrupted = true;

        if (_.touchObject.fingerCount !== 1 || _.slideCount <= _.options.slidesToShow) {
            _.touchObject = {};
            return false;
        }

        if (event.originalEvent !== undefined && event.originalEvent.touches !== undefined) {
            touches = event.originalEvent.touches[0];
        }

        _.touchObject.startX = _.touchObject.curX = touches !== undefined ? touches.pageX : event.clientX;
        _.touchObject.startY = _.touchObject.curY = touches !== undefined ? touches.pageY : event.clientY;

        _.dragging = true;

    };

    Slick.prototype.unfilterSlides = Slick.prototype.slickUnfilter = function() {

        var _ = this;

        if (_.$slidesCache !== null) {

            _.unload();

            _.$slideTrack.children(this.options.slide).detach();

            _.$slidesCache.appendTo(_.$slideTrack);

            _.reinit();

        }

    };

    Slick.prototype.unload = function() {

        var _ = this;

        $('.slick-cloned', _.$slider).remove();

        if (_.$dots) {
            _.$dots.remove();
        }

        if (_.$prevArrow && _.htmlExpr.test(_.options.prevArrow)) {
            _.$prevArrow.remove();
        }

        if (_.$nextArrow && _.htmlExpr.test(_.options.nextArrow)) {
            _.$nextArrow.remove();
        }

        _.$slides
            .removeClass('slick-slide slick-active slick-visible slick-current')
            .attr('aria-hidden', 'true')
            .css('width', '');

    };

    Slick.prototype.unslick = function(fromBreakpoint) {

        var _ = this;
        _.$slider.trigger('unslick', [_, fromBreakpoint]);
        _.destroy();

    };

    Slick.prototype.updateArrows = function() {

        var _ = this,
            centerOffset;

        centerOffset = Math.floor(_.options.slidesToShow / 2);

        if ( _.options.arrows === true &&
            _.slideCount > _.options.slidesToShow &&
            !_.options.infinite ) {

            _.$prevArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');
            _.$nextArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            if (_.currentSlide === 0) {

                _.$prevArrow.addClass('slick-disabled').attr('aria-disabled', 'true');
                _.$nextArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            } else if (_.currentSlide >= _.slideCount - _.options.slidesToShow && _.options.centerMode === false) {

                _.$nextArrow.addClass('slick-disabled').attr('aria-disabled', 'true');
                _.$prevArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            } else if (_.currentSlide >= _.slideCount - 1 && _.options.centerMode === true) {

                _.$nextArrow.addClass('slick-disabled').attr('aria-disabled', 'true');
                _.$prevArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            }

        }

    };

    Slick.prototype.updateDots = function() {

        var _ = this;

        if (_.$dots !== null) {

            _.$dots
                .find('li')
                    .removeClass('slick-active')
                    .end();

            _.$dots
                .find('li')
                .eq(Math.floor(_.currentSlide / _.options.slidesToScroll))
                .addClass('slick-active');

        }

    };

    Slick.prototype.visibility = function() {

        var _ = this;

        if ( _.options.autoplay ) {

            if ( document[_.hidden] ) {

                _.interrupted = true;

            } else {

                _.interrupted = false;

            }

        }

    };

    $.fn.slick = function() {
        var _ = this,
            opt = arguments[0],
            args = Array.prototype.slice.call(arguments, 1),
            l = _.length,
            i,
            ret;
        for (i = 0; i < l; i++) {
            if (typeof opt == 'object' || typeof opt == 'undefined')
                _[i].slick = new Slick(_[i], opt);
            else
                ret = _[i].slick[opt].apply(_[i].slick, args);
            if (typeof ret != 'undefined') return ret;
        }
        return _;
    };

}));

/*! jQuery UI - v1.12.1 - 2018-12-03
* http://jqueryui.com
* Includes: keycode.js, widgets/datepicker.js
* Copyright jQuery Foundation and other contributors; Licensed MIT */

(function( factory ) {
    if ( typeof define === "function" && define.amd ) {

        // AMD. Register as an anonymous module.
        define([ "../js/jquery" ], factory );
    } else {

        // Browser globals
        factory( jQuery );
    }
}(function( $ ) {

    $.ui = $.ui || {};

    var version = $.ui.version = "1.12.1";


    /*!
     * jQuery UI Keycode 1.12.1
     * http://jqueryui.com
     *
     * Copyright jQuery Foundation and other contributors
     * Released under the MIT license.
     * http://jquery.org/license
     */

//>>label: Keycode
//>>group: Core
//>>description: Provide keycodes as keynames
//>>docs: http://api.jqueryui.com/jQuery.ui.keyCode/


    var keycode = $.ui.keyCode = {
        BACKSPACE: 8,
        COMMA: 188,
        DELETE: 46,
        DOWN: 40,
        END: 35,
        ENTER: 13,
        ESCAPE: 27,
        HOME: 36,
        LEFT: 37,
        PAGE_DOWN: 34,
        PAGE_UP: 33,
        PERIOD: 190,
        RIGHT: 39,
        SPACE: 32,
        TAB: 9,
        UP: 38
    };


// jscs:disable maximumLineLength
    /* jscs:disable requireCamelCaseOrUpperCaseIdentifiers */
    /*!
     * jQuery UI Datepicker 1.12.1
     * http://jqueryui.com
     *
     * Copyright jQuery Foundation and other contributors
     * Released under the MIT license.
     * http://jquery.org/license
     */

//>>label: Datepicker
//>>group: Widgets
//>>description: Displays a calendar from an input or inline for selecting dates.
//>>docs: http://api.jqueryui.com/datepicker/
//>>demos: http://jqueryui.com/datepicker/
//>>css.structure: ../../themes/base/core.css
//>>css.structure: ../../themes/base/datepicker.css
//>>css.theme: ../../themes/base/theme.css



    $.extend( $.ui, { datepicker: { version: "1.12.1" } } );

    var datepicker_instActive;

    function datepicker_getZindex( elem ) {
        var position, value;
        while ( elem.length && elem[ 0 ] !== document ) {

            // Ignore z-index if position is set to a value where z-index is ignored by the browser
            // This makes behavior of this function consistent across browsers
            // WebKit always returns auto if the element is positioned
            position = elem.css( "position" );
            if ( position === "absolute" || position === "relative" || position === "fixed" ) {

                // IE returns 0 when zIndex is not specified
                // other browsers return a string
                // we ignore the case of nested elements with an explicit value of 0
                // <div style="z-index: -10;"><div style="z-index: 0;"></div></div>
                value = parseInt( elem.css( "zIndex" ), 10 );
                if ( !isNaN( value ) && value !== 0 ) {
                    return value;
                }
            }
            elem = elem.parent();
        }

        return 0;
    }
    /* Date picker manager.
       Use the singleton instance of this class, $.datepicker, to interact with the date picker.
       Settings for (groups of) date pickers are maintained in an instance object,
       allowing multiple different settings on the same page. */

    function Datepicker() {
        this._curInst = null; // The current instance in use
        this._keyEvent = false; // If the last event was a key event
        this._disabledInputs = []; // List of date picker inputs that have been disabled
        this._datepickerShowing = false; // True if the popup picker is showing , false if not
        this._inDialog = false; // True if showing within a "dialog", false if not
        this._mainDivId = "ui-datepicker-div"; // The ID of the main datepicker division
        this._inlineClass = "ui-datepicker-inline"; // The name of the inline marker class
        this._appendClass = "ui-datepicker-append"; // The name of the append marker class
        this._triggerClass = "ui-datepicker-trigger"; // The name of the trigger marker class
        this._dialogClass = "ui-datepicker-dialog"; // The name of the dialog marker class
        this._disableClass = "ui-datepicker-disabled"; // The name of the disabled covering marker class
        this._unselectableClass = "ui-datepicker-unselectable"; // The name of the unselectable cell marker class
        this._currentClass = "ui-datepicker-current-day"; // The name of the current day marker class
        this._dayOverClass = "ui-datepicker-days-cell-over"; // The name of the day hover marker class
        this.regional = []; // Available regional settings, indexed by language code
        this.regional[ "" ] = { // Default regional settings
            closeText: "Done", // Display text for close link
            prevText: "Prev", // Display text for previous month link
            nextText: "Next", // Display text for next month link
            currentText: "Today", // Display text for current month link
            monthNames: [ "January","February","March","April","May","June",
                "July","August","September","October","November","December" ], // Names of months for drop-down and formatting
            monthNamesShort: [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ], // For formatting
            dayNames: [ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ], // For formatting
            dayNamesShort: [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ], // For formatting
            dayNamesMin: [ "Su","Mo","Tu","We","Th","Fr","Sa" ], // Column headings for days starting at Sunday
            weekHeader: "Wk", // Column header for week of the year
            dateFormat: "mm/dd/yy", // See format options on parseDate
            firstDay: 0, // The first day of the week, Sun = 0, Mon = 1, ...
            isRTL: false, // True if right-to-left language, false if left-to-right
            showMonthAfterYear: false, // True if the year select precedes month, false for month then year
            yearSuffix: "" // Additional text to append to the year in the month headers
        };
        this._defaults = { // Global defaults for all the date picker instances
            showOn: "focus", // "focus" for popup on focus,
            // "button" for trigger button, or "both" for either
            showAnim: "fadeIn", // Name of jQuery animation for popup
            showOptions: {}, // Options for enhanced animations
            defaultDate: null, // Used when field is blank: actual date,
            // +/-number for offset from today, null for today
            appendText: "", // Display text following the input box, e.g. showing the format
            buttonText: "...", // Text for trigger button
            buttonImage: "", // URL for trigger button image
            buttonImageOnly: false, // True if the image appears alone, false if it appears on a button
            hideIfNoPrevNext: false, // True to hide next/previous month links
            // if not applicable, false to just disable them
            navigationAsDateFormat: false, // True if date formatting applied to prev/today/next links
            gotoCurrent: false, // True if today link goes back to current selection instead
            changeMonth: false, // True if month can be selected directly, false if only prev/next
            changeYear: false, // True if year can be selected directly, false if only prev/next
            yearRange: "c-10:c+10", // Range of years to display in drop-down,
            // either relative to today's year (-nn:+nn), relative to currently displayed year
            // (c-nn:c+nn), absolute (nnnn:nnnn), or a combination of the above (nnnn:-n)
            showOtherMonths: false, // True to show dates in other months, false to leave blank
            selectOtherMonths: false, // True to allow selection of dates in other months, false for unselectable
            showWeek: false, // True to show week of the year, false to not show it
            calculateWeek: this.iso8601Week, // How to calculate the week of the year,
            // takes a Date and returns the number of the week for it
            shortYearCutoff: "+10", // Short year values < this are in the current century,
            // > this are in the previous century,
            // string value starting with "+" for current year + value
            minDate: null, // The earliest selectable date, or null for no limit
            maxDate: null, // The latest selectable date, or null for no limit
            duration: "fast", // Duration of display/closure
            beforeShowDay: null, // Function that takes a date and returns an array with
            // [0] = true if selectable, false if not, [1] = custom CSS class name(s) or "",
            // [2] = cell title (optional), e.g. $.datepicker.noWeekends
            beforeShow: null, // Function that takes an input field and
            // returns a set of custom settings for the date picker
            onSelect: null, // Define a callback function when a date is selected
            onChangeMonthYear: null, // Define a callback function when the month or year is changed
            onClose: null, // Define a callback function when the datepicker is closed
            numberOfMonths: 1, // Number of months to show at a time
            showCurrentAtPos: 0, // The position in multipe months at which to show the current month (starting at 0)
            stepMonths: 1, // Number of months to step back/forward
            stepBigMonths: 12, // Number of months to step back/forward for the big links
            altField: "", // Selector for an alternate field to store selected dates into
            altFormat: "", // The date format to use for the alternate field
            constrainInput: true, // The input is constrained by the current date format
            showButtonPanel: false, // True to show button panel, false to not show it
            autoSize: false, // True to size the input for the date format, false to leave as is
            disabled: false // The initial disabled state
        };
        $.extend( this._defaults, this.regional[ "" ] );
        this.regional.en = $.extend( true, {}, this.regional[ "" ] );
        this.regional[ "en-US" ] = $.extend( true, {}, this.regional.en );
        this.dpDiv = datepicker_bindHover( $( "<div id='" + this._mainDivId + "' class='ui-datepicker ui-widget ui-widget-content ui-helper-clearfix ui-corner-all'></div>" ) );
    }

    $.extend( Datepicker.prototype, {
        /* Class name added to elements to indicate already configured with a date picker. */
        markerClassName: "hasDatepicker",

        //Keep track of the maximum number of rows displayed (see #7043)
        maxRows: 4,

        // TODO rename to "widget" when switching to widget factory
        _widgetDatepicker: function() {
            return this.dpDiv;
        },

        /* Override the default settings for all instances of the date picker.
         * @param  settings  object - the new settings to use as defaults (anonymous object)
         * @return the manager object
         */
        setDefaults: function( settings ) {
            datepicker_extendRemove( this._defaults, settings || {} );
            return this;
        },

        /* Attach the date picker to a jQuery selection.
         * @param  target	element - the target input field or division or span
         * @param  settings  object - the new settings to use for this date picker instance (anonymous)
         */
        _attachDatepicker: function( target, settings ) {
            var nodeName, inline, inst;
            nodeName = target.nodeName.toLowerCase();
            inline = ( nodeName === "div" || nodeName === "span" );
            if ( !target.id ) {
                this.uuid += 1;
                target.id = "dp" + this.uuid;
            }
            inst = this._newInst( $( target ), inline );
            inst.settings = $.extend( {}, settings || {} );
            if ( nodeName === "input" ) {
                this._connectDatepicker( target, inst );
            } else if ( inline ) {
                this._inlineDatepicker( target, inst );
            }
        },

        /* Create a new instance object. */
        _newInst: function( target, inline ) {
            var id = target[ 0 ].id.replace( /([^A-Za-z0-9_\-])/g, "\\\\$1" ); // escape jQuery meta chars
            return { id: id, input: target, // associated target
                selectedDay: 0, selectedMonth: 0, selectedYear: 0, // current selection
                drawMonth: 0, drawYear: 0, // month being drawn
                inline: inline, // is datepicker inline or not
                dpDiv: ( !inline ? this.dpDiv : // presentation div
                    datepicker_bindHover( $( "<div class='" + this._inlineClass + " ui-datepicker ui-widget ui-widget-content ui-helper-clearfix ui-corner-all'></div>" ) ) ) };
        },

        /* Attach the date picker to an input field. */
        _connectDatepicker: function( target, inst ) {
            var input = $( target );
            inst.append = $( [] );
            inst.trigger = $( [] );
            if ( input.hasClass( this.markerClassName ) ) {
                return;
            }
            this._attachments( input, inst );
            input.addClass( this.markerClassName ).on( "keydown", this._doKeyDown ).
            on( "keypress", this._doKeyPress ).on( "keyup", this._doKeyUp );
            this._autoSize( inst );
            $.data( target, "datepicker", inst );

            //If disabled option is true, disable the datepicker once it has been attached to the input (see ticket #5665)
            if ( inst.settings.disabled ) {
                this._disableDatepicker( target );
            }
        },

        /* Make attachments based on settings. */
        _attachments: function( input, inst ) {
            var showOn, buttonText, buttonImage,
                appendText = this._get( inst, "appendText" ),
                isRTL = this._get( inst, "isRTL" );

            if ( inst.append ) {
                inst.append.remove();
            }
            if ( appendText ) {
                inst.append = $( "<span class='" + this._appendClass + "'>" + appendText + "</span>" );
                input[ isRTL ? "before" : "after" ]( inst.append );
            }

            input.off( "focus", this._showDatepicker );

            if ( inst.trigger ) {
                inst.trigger.remove();
            }

            showOn = this._get( inst, "showOn" );
            if ( showOn === "focus" || showOn === "both" ) { // pop-up date picker when in the marked field
                input.on( "focus", this._showDatepicker );
            }
            if ( showOn === "button" || showOn === "both" ) { // pop-up date picker when button clicked
                buttonText = this._get( inst, "buttonText" );
                buttonImage = this._get( inst, "buttonImage" );
                inst.trigger = $( this._get( inst, "buttonImageOnly" ) ?
                    $( "<img/>" ).addClass( this._triggerClass ).
                    attr( { src: buttonImage, alt: buttonText, title: buttonText } ) :
                    $( "<button type='button'></button>" ).addClass( this._triggerClass ).
                    html( !buttonImage ? buttonText : $( "<img/>" ).attr(
                        { src:buttonImage, alt:buttonText, title:buttonText } ) ) );
                input[ isRTL ? "before" : "after" ]( inst.trigger );
                inst.trigger.on( "click", function() {
                    if ( $.datepicker._datepickerShowing && $.datepicker._lastInput === input[ 0 ] ) {
                        $.datepicker._hideDatepicker();
                    } else if ( $.datepicker._datepickerShowing && $.datepicker._lastInput !== input[ 0 ] ) {
                        $.datepicker._hideDatepicker();
                        $.datepicker._showDatepicker( input[ 0 ] );
                    } else {
                        $.datepicker._showDatepicker( input[ 0 ] );
                    }
                    return false;
                } );
            }
        },

        /* Apply the maximum length for the date format. */
        _autoSize: function( inst ) {
            if ( this._get( inst, "autoSize" ) && !inst.inline ) {
                var findMax, max, maxI, i,
                    date = new Date( 2009, 12 - 1, 20 ), // Ensure double digits
                    dateFormat = this._get( inst, "dateFormat" );

                if ( dateFormat.match( /[DM]/ ) ) {
                    findMax = function( names ) {
                        max = 0;
                        maxI = 0;
                        for ( i = 0; i < names.length; i++ ) {
                            if ( names[ i ].length > max ) {
                                max = names[ i ].length;
                                maxI = i;
                            }
                        }
                        return maxI;
                    };
                    date.setMonth( findMax( this._get( inst, ( dateFormat.match( /MM/ ) ?
                        "monthNames" : "monthNamesShort" ) ) ) );
                    date.setDate( findMax( this._get( inst, ( dateFormat.match( /DD/ ) ?
                        "dayNames" : "dayNamesShort" ) ) ) + 20 - date.getDay() );
                }
                inst.input.attr( "size", this._formatDate( inst, date ).length );
            }
        },

        /* Attach an inline date picker to a div. */
        _inlineDatepicker: function( target, inst ) {
            var divSpan = $( target );
            if ( divSpan.hasClass( this.markerClassName ) ) {
                return;
            }
            divSpan.addClass( this.markerClassName ).append( inst.dpDiv );
            $.data( target, "datepicker", inst );
            this._setDate( inst, this._getDefaultDate( inst ), true );
            this._updateDatepicker( inst );
            this._updateAlternate( inst );

            //If disabled option is true, disable the datepicker before showing it (see ticket #5665)
            if ( inst.settings.disabled ) {
                this._disableDatepicker( target );
            }

            // Set display:block in place of inst.dpDiv.show() which won't work on disconnected elements
            // http://bugs.jqueryui.com/ticket/7552 - A Datepicker created on a detached div has zero height
            inst.dpDiv.css( "display", "block" );
        },

        /* Pop-up the date picker in a "dialog" box.
         * @param  input element - ignored
         * @param  date	string or Date - the initial date to display
         * @param  onSelect  function - the function to call when a date is selected
         * @param  settings  object - update the dialog date picker instance's settings (anonymous object)
         * @param  pos int[2] - coordinates for the dialog's position within the screen or
         *					event - with x/y coordinates or
         *					leave empty for default (screen centre)
         * @return the manager object
         */
        _dialogDatepicker: function( input, date, onSelect, settings, pos ) {
            var id, browserWidth, browserHeight, scrollX, scrollY,
                inst = this._dialogInst; // internal instance

            if ( !inst ) {
                this.uuid += 1;
                id = "dp" + this.uuid;
                this._dialogInput = $( "<input type='text' id='" + id +
                    "' style='position: absolute; top: -100px; width: 0px;'/>" );
                this._dialogInput.on( "keydown", this._doKeyDown );
                $( "body" ).append( this._dialogInput );
                inst = this._dialogInst = this._newInst( this._dialogInput, false );
                inst.settings = {};
                $.data( this._dialogInput[ 0 ], "datepicker", inst );
            }
            datepicker_extendRemove( inst.settings, settings || {} );
            date = ( date && date.constructor === Date ? this._formatDate( inst, date ) : date );
            this._dialogInput.val( date );

            this._pos = ( pos ? ( pos.length ? pos : [ pos.pageX, pos.pageY ] ) : null );
            if ( !this._pos ) {
                browserWidth = document.documentElement.clientWidth;
                browserHeight = document.documentElement.clientHeight;
                scrollX = document.documentElement.scrollLeft || document.body.scrollLeft;
                scrollY = document.documentElement.scrollTop || document.body.scrollTop;
                this._pos = // should use actual width/height below
                    [ ( browserWidth / 2 ) - 100 + scrollX, ( browserHeight / 2 ) - 150 + scrollY ];
            }

            // Move input on screen for focus, but hidden behind dialog
            this._dialogInput.css( "left", ( this._pos[ 0 ] + 20 ) + "px" ).css( "top", this._pos[ 1 ] + "px" );
            inst.settings.onSelect = onSelect;
            this._inDialog = true;
            this.dpDiv.addClass( this._dialogClass );
            this._showDatepicker( this._dialogInput[ 0 ] );
            if ( $.blockUI ) {
                $.blockUI( this.dpDiv );
            }
            $.data( this._dialogInput[ 0 ], "datepicker", inst );
            return this;
        },

        /* Detach a datepicker from its control.
         * @param  target	element - the target input field or division or span
         */
        _destroyDatepicker: function( target ) {
            var nodeName,
                $target = $( target ),
                inst = $.data( target, "datepicker" );

            if ( !$target.hasClass( this.markerClassName ) ) {
                return;
            }

            nodeName = target.nodeName.toLowerCase();
            $.removeData( target, "datepicker" );
            if ( nodeName === "input" ) {
                inst.append.remove();
                inst.trigger.remove();
                $target.removeClass( this.markerClassName ).
                off( "focus", this._showDatepicker ).
                off( "keydown", this._doKeyDown ).
                off( "keypress", this._doKeyPress ).
                off( "keyup", this._doKeyUp );
            } else if ( nodeName === "div" || nodeName === "span" ) {
                $target.removeClass( this.markerClassName ).empty();
            }

            if ( datepicker_instActive === inst ) {
                datepicker_instActive = null;
            }
        },

        /* Enable the date picker to a jQuery selection.
         * @param  target	element - the target input field or division or span
         */
        _enableDatepicker: function( target ) {
            var nodeName, inline,
                $target = $( target ),
                inst = $.data( target, "datepicker" );

            if ( !$target.hasClass( this.markerClassName ) ) {
                return;
            }

            nodeName = target.nodeName.toLowerCase();
            if ( nodeName === "input" ) {
                target.disabled = false;
                inst.trigger.filter( "button" ).
                each( function() { this.disabled = false; } ).end().
                filter( "img" ).css( { opacity: "1.0", cursor: "" } );
            } else if ( nodeName === "div" || nodeName === "span" ) {
                inline = $target.children( "." + this._inlineClass );
                inline.children().removeClass( "ui-state-disabled" );
                inline.find( "select.ui-datepicker-month, select.ui-datepicker-year" ).
                prop( "disabled", false );
            }
            this._disabledInputs = $.map( this._disabledInputs,
                function( value ) { return ( value === target ? null : value ); } ); // delete entry
        },

        /* Disable the date picker to a jQuery selection.
         * @param  target	element - the target input field or division or span
         */
        _disableDatepicker: function( target ) {
            var nodeName, inline,
                $target = $( target ),
                inst = $.data( target, "datepicker" );

            if ( !$target.hasClass( this.markerClassName ) ) {
                return;
            }

            nodeName = target.nodeName.toLowerCase();
            if ( nodeName === "input" ) {
                target.disabled = true;
                inst.trigger.filter( "button" ).
                each( function() { this.disabled = true; } ).end().
                filter( "img" ).css( { opacity: "0.5", cursor: "default" } );
            } else if ( nodeName === "div" || nodeName === "span" ) {
                inline = $target.children( "." + this._inlineClass );
                inline.children().addClass( "ui-state-disabled" );
                inline.find( "select.ui-datepicker-month, select.ui-datepicker-year" ).
                prop( "disabled", true );
            }
            this._disabledInputs = $.map( this._disabledInputs,
                function( value ) { return ( value === target ? null : value ); } ); // delete entry
            this._disabledInputs[ this._disabledInputs.length ] = target;
        },

        /* Is the first field in a jQuery collection disabled as a datepicker?
         * @param  target	element - the target input field or division or span
         * @return boolean - true if disabled, false if enabled
         */
        _isDisabledDatepicker: function( target ) {
            if ( !target ) {
                return false;
            }
            for ( var i = 0; i < this._disabledInputs.length; i++ ) {
                if ( this._disabledInputs[ i ] === target ) {
                    return true;
                }
            }
            return false;
        },

        /* Retrieve the instance data for the target control.
         * @param  target  element - the target input field or division or span
         * @return  object - the associated instance data
         * @throws  error if a jQuery problem getting data
         */
        _getInst: function( target ) {
            try {
                return $.data( target, "datepicker" );
            }
            catch ( err ) {
                throw "Missing instance data for this datepicker";
            }
        },

        /* Update or retrieve the settings for a date picker attached to an input field or division.
         * @param  target  element - the target input field or division or span
         * @param  name	object - the new settings to update or
         *				string - the name of the setting to change or retrieve,
         *				when retrieving also "all" for all instance settings or
         *				"defaults" for all global defaults
         * @param  value   any - the new value for the setting
         *				(omit if above is an object or to retrieve a value)
         */
        _optionDatepicker: function( target, name, value ) {
            var settings, date, minDate, maxDate,
                inst = this._getInst( target );

            if ( arguments.length === 2 && typeof name === "string" ) {
                return ( name === "defaults" ? $.extend( {}, $.datepicker._defaults ) :
                    ( inst ? ( name === "all" ? $.extend( {}, inst.settings ) :
                        this._get( inst, name ) ) : null ) );
            }

            settings = name || {};
            if ( typeof name === "string" ) {
                settings = {};
                settings[ name ] = value;
            }

            if ( inst ) {
                if ( this._curInst === inst ) {
                    this._hideDatepicker();
                }

                date = this._getDateDatepicker( target, true );
                minDate = this._getMinMaxDate( inst, "min" );
                maxDate = this._getMinMaxDate( inst, "max" );
                datepicker_extendRemove( inst.settings, settings );

                // reformat the old minDate/maxDate values if dateFormat changes and a new minDate/maxDate isn't provided
                if ( minDate !== null && settings.dateFormat !== undefined && settings.minDate === undefined ) {
                    inst.settings.minDate = this._formatDate( inst, minDate );
                }
                if ( maxDate !== null && settings.dateFormat !== undefined && settings.maxDate === undefined ) {
                    inst.settings.maxDate = this._formatDate( inst, maxDate );
                }
                if ( "disabled" in settings ) {
                    if ( settings.disabled ) {
                        this._disableDatepicker( target );
                    } else {
                        this._enableDatepicker( target );
                    }
                }
                this._attachments( $( target ), inst );
                this._autoSize( inst );
                this._setDate( inst, date );
                this._updateAlternate( inst );
                this._updateDatepicker( inst );
            }
        },

        // Change method deprecated
        _changeDatepicker: function( target, name, value ) {
            this._optionDatepicker( target, name, value );
        },

        /* Redraw the date picker attached to an input field or division.
         * @param  target  element - the target input field or division or span
         */
        _refreshDatepicker: function( target ) {
            var inst = this._getInst( target );
            if ( inst ) {
                this._updateDatepicker( inst );
            }
        },

        /* Set the dates for a jQuery selection.
         * @param  target element - the target input field or division or span
         * @param  date	Date - the new date
         */
        _setDateDatepicker: function( target, date ) {
            var inst = this._getInst( target );
            if ( inst ) {
                this._setDate( inst, date );
                this._updateDatepicker( inst );
                this._updateAlternate( inst );
            }
        },

        /* Get the date(s) for the first entry in a jQuery selection.
         * @param  target element - the target input field or division or span
         * @param  noDefault boolean - true if no default date is to be used
         * @return Date - the current date
         */
        _getDateDatepicker: function( target, noDefault ) {
            var inst = this._getInst( target );
            if ( inst && !inst.inline ) {
                this._setDateFromField( inst, noDefault );
            }
            return ( inst ? this._getDate( inst ) : null );
        },

        /* Handle keystrokes. */
        _doKeyDown: function( event ) {
            var onSelect, dateStr, sel,
                inst = $.datepicker._getInst( event.target ),
                handled = true,
                isRTL = inst.dpDiv.is( ".ui-datepicker-rtl" );

            inst._keyEvent = true;
            if ( $.datepicker._datepickerShowing ) {
                switch ( event.keyCode ) {
                    case 9: $.datepicker._hideDatepicker();
                        handled = false;
                        break; // hide on tab out
                    case 13: sel = $( "td." + $.datepicker._dayOverClass + ":not(." +
                        $.datepicker._currentClass + ")", inst.dpDiv );
                        if ( sel[ 0 ] ) {
                            $.datepicker._selectDay( event.target, inst.selectedMonth, inst.selectedYear, sel[ 0 ] );
                        }

                        onSelect = $.datepicker._get( inst, "onSelect" );
                        if ( onSelect ) {
                            dateStr = $.datepicker._formatDate( inst );

                            // Trigger custom callback
                            onSelect.apply( ( inst.input ? inst.input[ 0 ] : null ), [ dateStr, inst ] );
                        } else {
                            $.datepicker._hideDatepicker();
                        }

                        return false; // don't submit the form
                    case 27: $.datepicker._hideDatepicker();
                        break; // hide on escape
                    case 33: $.datepicker._adjustDate( event.target, ( event.ctrlKey ?
                        -$.datepicker._get( inst, "stepBigMonths" ) :
                        -$.datepicker._get( inst, "stepMonths" ) ), "M" );
                        break; // previous month/year on page up/+ ctrl
                    case 34: $.datepicker._adjustDate( event.target, ( event.ctrlKey ?
                        +$.datepicker._get( inst, "stepBigMonths" ) :
                        +$.datepicker._get( inst, "stepMonths" ) ), "M" );
                        break; // next month/year on page down/+ ctrl
                    case 35: if ( event.ctrlKey || event.metaKey ) {
                        $.datepicker._clearDate( event.target );
                    }
                        handled = event.ctrlKey || event.metaKey;
                        break; // clear on ctrl or command +end
                    case 36: if ( event.ctrlKey || event.metaKey ) {
                        $.datepicker._gotoToday( event.target );
                    }
                        handled = event.ctrlKey || event.metaKey;
                        break; // current on ctrl or command +home
                    case 37: if ( event.ctrlKey || event.metaKey ) {
                        $.datepicker._adjustDate( event.target, ( isRTL ? +1 : -1 ), "D" );
                    }
                        handled = event.ctrlKey || event.metaKey;

                        // -1 day on ctrl or command +left
                        if ( event.originalEvent.altKey ) {
                            $.datepicker._adjustDate( event.target, ( event.ctrlKey ?
                                -$.datepicker._get( inst, "stepBigMonths" ) :
                                -$.datepicker._get( inst, "stepMonths" ) ), "M" );
                        }

                        // next month/year on alt +left on Mac
                        break;
                    case 38: if ( event.ctrlKey || event.metaKey ) {
                        $.datepicker._adjustDate( event.target, -7, "D" );
                    }
                        handled = event.ctrlKey || event.metaKey;
                        break; // -1 week on ctrl or command +up
                    case 39: if ( event.ctrlKey || event.metaKey ) {
                        $.datepicker._adjustDate( event.target, ( isRTL ? -1 : +1 ), "D" );
                    }
                        handled = event.ctrlKey || event.metaKey;

                        // +1 day on ctrl or command +right
                        if ( event.originalEvent.altKey ) {
                            $.datepicker._adjustDate( event.target, ( event.ctrlKey ?
                                +$.datepicker._get( inst, "stepBigMonths" ) :
                                +$.datepicker._get( inst, "stepMonths" ) ), "M" );
                        }

                        // next month/year on alt +right
                        break;
                    case 40: if ( event.ctrlKey || event.metaKey ) {
                        $.datepicker._adjustDate( event.target, +7, "D" );
                    }
                        handled = event.ctrlKey || event.metaKey;
                        break; // +1 week on ctrl or command +down
                    default: handled = false;
                }
            } else if ( event.keyCode === 36 && event.ctrlKey ) { // display the date picker on ctrl+home
                $.datepicker._showDatepicker( this );
            } else {
                handled = false;
            }

            if ( handled ) {
                event.preventDefault();
                event.stopPropagation();
            }
        },

        /* Filter entered characters - based on date format. */
        _doKeyPress: function( event ) {
            var chars, chr,
                inst = $.datepicker._getInst( event.target );

            if ( $.datepicker._get( inst, "constrainInput" ) ) {
                chars = $.datepicker._possibleChars( $.datepicker._get( inst, "dateFormat" ) );
                chr = String.fromCharCode( event.charCode == null ? event.keyCode : event.charCode );
                return event.ctrlKey || event.metaKey || ( chr < " " || !chars || chars.indexOf( chr ) > -1 );
            }
        },

        /* Synchronise manual entry and field/alternate field. */
        _doKeyUp: function( event ) {
            var date,
                inst = $.datepicker._getInst( event.target );

            if ( inst.input.val() !== inst.lastVal ) {
                try {
                    date = $.datepicker.parseDate( $.datepicker._get( inst, "dateFormat" ),
                        ( inst.input ? inst.input.val() : null ),
                        $.datepicker._getFormatConfig( inst ) );

                    if ( date ) { // only if valid
                        $.datepicker._setDateFromField( inst );
                        $.datepicker._updateAlternate( inst );
                        $.datepicker._updateDatepicker( inst );
                    }
                }
                catch ( err ) {
                }
            }
            return true;
        },

        /* Pop-up the date picker for a given input field.
         * If false returned from beforeShow event handler do not show.
         * @param  input  element - the input field attached to the date picker or
         *					event - if triggered by focus
         */
        _showDatepicker: function( input ) {
            input = input.target || input;
            if ( input.nodeName.toLowerCase() !== "input" ) { // find from button/image trigger
                input = $( "input", input.parentNode )[ 0 ];
            }

            if ( $.datepicker._isDisabledDatepicker( input ) || $.datepicker._lastInput === input ) { // already here
                return;
            }

            var inst, beforeShow, beforeShowSettings, isFixed,
                offset, showAnim, duration;

            inst = $.datepicker._getInst( input );
            if ( $.datepicker._curInst && $.datepicker._curInst !== inst ) {
                $.datepicker._curInst.dpDiv.stop( true, true );
                if ( inst && $.datepicker._datepickerShowing ) {
                    $.datepicker._hideDatepicker( $.datepicker._curInst.input[ 0 ] );
                }
            }

            beforeShow = $.datepicker._get( inst, "beforeShow" );
            beforeShowSettings = beforeShow ? beforeShow.apply( input, [ input, inst ] ) : {};
            if ( beforeShowSettings === false ) {
                return;
            }
            datepicker_extendRemove( inst.settings, beforeShowSettings );

            inst.lastVal = null;
            $.datepicker._lastInput = input;
            $.datepicker._setDateFromField( inst );

            if ( $.datepicker._inDialog ) { // hide cursor
                input.value = "";
            }
            if ( !$.datepicker._pos ) { // position below input
                $.datepicker._pos = $.datepicker._findPos( input );
                $.datepicker._pos[ 1 ] += input.offsetHeight; // add the height
            }

            isFixed = false;
            $( input ).parents().each( function() {
                isFixed |= $( this ).css( "position" ) === "fixed";
                return !isFixed;
            } );

            offset = { left: $.datepicker._pos[ 0 ], top: $.datepicker._pos[ 1 ] };
            $.datepicker._pos = null;

            //to avoid flashes on Firefox
            inst.dpDiv.empty();

            // determine sizing offscreen
            inst.dpDiv.css( { position: "absolute", display: "block", top: "-1000px" } );
            $.datepicker._updateDatepicker( inst );

            // fix width for dynamic number of date pickers
            // and adjust position before showing
            offset = $.datepicker._checkOffset( inst, offset, isFixed );
            inst.dpDiv.css( { position: ( $.datepicker._inDialog && $.blockUI ?
                    "static" : ( isFixed ? "fixed" : "absolute" ) ), display: "none",
                left: offset.left + "px", top: offset.top + "px" } );

            if ( !inst.inline ) {
                showAnim = $.datepicker._get( inst, "showAnim" );
                duration = $.datepicker._get( inst, "duration" );
                inst.dpDiv.css( "z-index", datepicker_getZindex( $( input ) ) + 1 );
                $.datepicker._datepickerShowing = true;

                if ( $.effects && $.effects.effect[ showAnim ] ) {
                    inst.dpDiv.show( showAnim, $.datepicker._get( inst, "showOptions" ), duration );
                } else {
                    inst.dpDiv[ showAnim || "show" ]( showAnim ? duration : null );
                }

                if ( $.datepicker._shouldFocusInput( inst ) ) {
                    inst.input.trigger( "focus" );
                }

                $.datepicker._curInst = inst;
            }
        },

        /* Generate the date picker content. */
        _updateDatepicker: function( inst ) {
            this.maxRows = 4; //Reset the max number of rows being displayed (see #7043)
            datepicker_instActive = inst; // for delegate hover events
            inst.dpDiv.empty().append( this._generateHTML( inst ) );
            this._attachHandlers( inst );

            var origyearshtml,
                numMonths = this._getNumberOfMonths( inst ),
                cols = numMonths[ 1 ],
                width = 17,
                activeCell = inst.dpDiv.find( "." + this._dayOverClass + " a" );

            if ( activeCell.length > 0 ) {
                datepicker_handleMouseover.apply( activeCell.get( 0 ) );
            }

            inst.dpDiv.removeClass( "ui-datepicker-multi-2 ui-datepicker-multi-3 ui-datepicker-multi-4" ).width( "" );
            if ( cols > 1 ) {
                inst.dpDiv.addClass( "ui-datepicker-multi-" + cols ).css( "width", ( width * cols ) + "em" );
            }
            inst.dpDiv[ ( numMonths[ 0 ] !== 1 || numMonths[ 1 ] !== 1 ? "add" : "remove" ) +
            "Class" ]( "ui-datepicker-multi" );
            inst.dpDiv[ ( this._get( inst, "isRTL" ) ? "add" : "remove" ) +
            "Class" ]( "ui-datepicker-rtl" );

            if ( inst === $.datepicker._curInst && $.datepicker._datepickerShowing && $.datepicker._shouldFocusInput( inst ) ) {
                inst.input.trigger( "focus" );
            }

            // Deffered render of the years select (to avoid flashes on Firefox)
            if ( inst.yearshtml ) {
                origyearshtml = inst.yearshtml;
                setTimeout( function() {

                    //assure that inst.yearshtml didn't change.
                    if ( origyearshtml === inst.yearshtml && inst.yearshtml ) {
                        inst.dpDiv.find( "select.ui-datepicker-year:first" ).replaceWith( inst.yearshtml );
                    }
                    origyearshtml = inst.yearshtml = null;
                }, 0 );
            }
        },

        // #6694 - don't focus the input if it's already focused
        // this breaks the change event in IE
        // Support: IE and jQuery <1.9
        _shouldFocusInput: function( inst ) {
            return inst.input && inst.input.is( ":visible" ) && !inst.input.is( ":disabled" ) && !inst.input.is( ":focus" );
        },

        /* Check positioning to remain on screen. */
        _checkOffset: function( inst, offset, isFixed ) {
            var dpWidth = inst.dpDiv.outerWidth(),
                dpHeight = inst.dpDiv.outerHeight(),
                inputWidth = inst.input ? inst.input.outerWidth() : 0,
                inputHeight = inst.input ? inst.input.outerHeight() : 0,
                viewWidth = document.documentElement.clientWidth + ( isFixed ? 0 : $( document ).scrollLeft() ),
                viewHeight = document.documentElement.clientHeight + ( isFixed ? 0 : $( document ).scrollTop() );

            offset.left -= ( this._get( inst, "isRTL" ) ? ( dpWidth - inputWidth ) : 0 );
            offset.left -= ( isFixed && offset.left === inst.input.offset().left ) ? $( document ).scrollLeft() : 0;
            offset.top -= ( isFixed && offset.top === ( inst.input.offset().top + inputHeight ) ) ? $( document ).scrollTop() : 0;

            // Now check if datepicker is showing outside window viewport - move to a better place if so.
            offset.left -= Math.min( offset.left, ( offset.left + dpWidth > viewWidth && viewWidth > dpWidth ) ?
                Math.abs( offset.left + dpWidth - viewWidth ) : 0 );
            offset.top -= Math.min( offset.top, ( offset.top + dpHeight > viewHeight && viewHeight > dpHeight ) ?
                Math.abs( dpHeight + inputHeight ) : 0 );

            return offset;
        },

        /* Find an object's position on the screen. */
        _findPos: function( obj ) {
            var position,
                inst = this._getInst( obj ),
                isRTL = this._get( inst, "isRTL" );

            while ( obj && ( obj.type === "hidden" || obj.nodeType !== 1 || $.expr.filters.hidden( obj ) ) ) {
                obj = obj[ isRTL ? "previousSibling" : "nextSibling" ];
            }

            position = $( obj ).offset();
            return [ position.left, position.top ];
        },

        /* Hide the date picker from view.
         * @param  input  element - the input field attached to the date picker
         */
        _hideDatepicker: function( input ) {
            var showAnim, duration, postProcess, onClose,
                inst = this._curInst;

            if ( !inst || ( input && inst !== $.data( input, "datepicker" ) ) ) {
                return;
            }

            if ( this._datepickerShowing ) {
                showAnim = this._get( inst, "showAnim" );
                duration = this._get( inst, "duration" );
                postProcess = function() {
                    $.datepicker._tidyDialog( inst );
                };

                // DEPRECATED: after BC for 1.8.x $.effects[ showAnim ] is not needed
                if ( $.effects && ( $.effects.effect[ showAnim ] || $.effects[ showAnim ] ) ) {
                    inst.dpDiv.hide( showAnim, $.datepicker._get( inst, "showOptions" ), duration, postProcess );
                } else {
                    inst.dpDiv[ ( showAnim === "slideDown" ? "slideUp" :
                        ( showAnim === "fadeIn" ? "fadeOut" : "hide" ) ) ]( ( showAnim ? duration : null ), postProcess );
                }

                if ( !showAnim ) {
                    postProcess();
                }
                this._datepickerShowing = false;

                onClose = this._get( inst, "onClose" );
                if ( onClose ) {
                    onClose.apply( ( inst.input ? inst.input[ 0 ] : null ), [ ( inst.input ? inst.input.val() : "" ), inst ] );
                }

                this._lastInput = null;
                if ( this._inDialog ) {
                    this._dialogInput.css( { position: "absolute", left: "0", top: "-100px" } );
                    if ( $.blockUI ) {
                        $.unblockUI();
                        $( "body" ).append( this.dpDiv );
                    }
                }
                this._inDialog = false;
            }
        },

        /* Tidy up after a dialog display. */
        _tidyDialog: function( inst ) {
            inst.dpDiv.removeClass( this._dialogClass ).off( ".ui-datepicker-calendar" );
        },

        /* Close date picker if clicked elsewhere. */
        _checkExternalClick: function( event ) {
            if ( !$.datepicker._curInst ) {
                return;
            }

            var $target = $( event.target ),
                inst = $.datepicker._getInst( $target[ 0 ] );

            if ( ( ( $target[ 0 ].id !== $.datepicker._mainDivId &&
                $target.parents( "#" + $.datepicker._mainDivId ).length === 0 &&
                !$target.hasClass( $.datepicker.markerClassName ) &&
                !$target.closest( "." + $.datepicker._triggerClass ).length &&
                $.datepicker._datepickerShowing && !( $.datepicker._inDialog && $.blockUI ) ) ) ||
                ( $target.hasClass( $.datepicker.markerClassName ) && $.datepicker._curInst !== inst ) ) {
                $.datepicker._hideDatepicker();
            }
        },

        /* Adjust one of the date sub-fields. */
        _adjustDate: function( id, offset, period ) {
            var target = $( id ),
                inst = this._getInst( target[ 0 ] );

            if ( this._isDisabledDatepicker( target[ 0 ] ) ) {
                return;
            }
            this._adjustInstDate( inst, offset +
                ( period === "M" ? this._get( inst, "showCurrentAtPos" ) : 0 ), // undo positioning
                period );
            this._updateDatepicker( inst );
        },

        /* Action for current link. */
        _gotoToday: function( id ) {
            var date,
                target = $( id ),
                inst = this._getInst( target[ 0 ] );

            if ( this._get( inst, "gotoCurrent" ) && inst.currentDay ) {
                inst.selectedDay = inst.currentDay;
                inst.drawMonth = inst.selectedMonth = inst.currentMonth;
                inst.drawYear = inst.selectedYear = inst.currentYear;
            } else {
                date = new Date();
                inst.selectedDay = date.getDate();
                inst.drawMonth = inst.selectedMonth = date.getMonth();
                inst.drawYear = inst.selectedYear = date.getFullYear();
            }
            this._notifyChange( inst );
            this._adjustDate( target );
        },

        /* Action for selecting a new month/year. */
        _selectMonthYear: function( id, select, period ) {
            var target = $( id ),
                inst = this._getInst( target[ 0 ] );

            inst[ "selected" + ( period === "M" ? "Month" : "Year" ) ] =
                inst[ "draw" + ( period === "M" ? "Month" : "Year" ) ] =
                    parseInt( select.options[ select.selectedIndex ].value, 10 );

            this._notifyChange( inst );
            this._adjustDate( target );
        },

        /* Action for selecting a day. */
        _selectDay: function( id, month, year, td ) {
            var inst,
                target = $( id );

            if ( $( td ).hasClass( this._unselectableClass ) || this._isDisabledDatepicker( target[ 0 ] ) ) {
                return;
            }

            inst = this._getInst( target[ 0 ] );
            inst.selectedDay = inst.currentDay = $( "a", td ).html();
            inst.selectedMonth = inst.currentMonth = month;
            inst.selectedYear = inst.currentYear = year;
            this._selectDate( id, this._formatDate( inst,
                inst.currentDay, inst.currentMonth, inst.currentYear ) );
        },

        /* Erase the input field and hide the date picker. */
        _clearDate: function( id ) {
            var target = $( id );
            this._selectDate( target, "" );
        },

        /* Update the input field with the selected date. */
        _selectDate: function( id, dateStr ) {
            var onSelect,
                target = $( id ),
                inst = this._getInst( target[ 0 ] );

            dateStr = ( dateStr != null ? dateStr : this._formatDate( inst ) );
            if ( inst.input ) {
                inst.input.val( dateStr );
            }
            this._updateAlternate( inst );

            onSelect = this._get( inst, "onSelect" );
            if ( onSelect ) {
                onSelect.apply( ( inst.input ? inst.input[ 0 ] : null ), [ dateStr, inst ] );  // trigger custom callback
            } else if ( inst.input ) {
                inst.input.trigger( "change" ); // fire the change event
            }

            if ( inst.inline ) {
                this._updateDatepicker( inst );
            } else {
                this._hideDatepicker();
                this._lastInput = inst.input[ 0 ];
                if ( typeof( inst.input[ 0 ] ) !== "object" ) {
                    inst.input.trigger( "focus" ); // restore focus
                }
                this._lastInput = null;
            }
        },

        /* Update any alternate field to synchronise with the main field. */
        _updateAlternate: function( inst ) {
            var altFormat, date, dateStr,
                altField = this._get( inst, "altField" );

            if ( altField ) { // update alternate field too
                altFormat = this._get( inst, "altFormat" ) || this._get( inst, "dateFormat" );
                date = this._getDate( inst );
                dateStr = this.formatDate( altFormat, date, this._getFormatConfig( inst ) );
                $( altField ).val( dateStr );
            }
        },

        /* Set as beforeShowDay function to prevent selection of weekends.
         * @param  date  Date - the date to customise
         * @return [boolean, string] - is this date selectable?, what is its CSS class?
         */
        noWeekends: function( date ) {
            var day = date.getDay();
            return [ ( day > 0 && day < 6 ), "" ];
        },

        /* Set as calculateWeek to determine the week of the year based on the ISO 8601 definition.
         * @param  date  Date - the date to get the week for
         * @return  number - the number of the week within the year that contains this date
         */
        iso8601Week: function( date ) {
            var time,
                checkDate = new Date( date.getTime() );

            // Find Thursday of this week starting on Monday
            checkDate.setDate( checkDate.getDate() + 4 - ( checkDate.getDay() || 7 ) );

            time = checkDate.getTime();
            checkDate.setMonth( 0 ); // Compare with Jan 1
            checkDate.setDate( 1 );
            return Math.floor( Math.round( ( time - checkDate ) / 86400000 ) / 7 ) + 1;
        },

        /* Parse a string value into a date object.
         * See formatDate below for the possible formats.
         *
         * @param  format string - the expected format of the date
         * @param  value string - the date in the above format
         * @param  settings Object - attributes include:
         *					shortYearCutoff  number - the cutoff year for determining the century (optional)
         *					dayNamesShort	string[7] - abbreviated names of the days from Sunday (optional)
         *					dayNames		string[7] - names of the days from Sunday (optional)
         *					monthNamesShort string[12] - abbreviated names of the months (optional)
         *					monthNames		string[12] - names of the months (optional)
         * @return  Date - the extracted date value or null if value is blank
         */
        parseDate: function( format, value, settings ) {
            if ( format == null || value == null ) {
                throw "Invalid arguments";
            }

            value = ( typeof value === "object" ? value.toString() : value + "" );
            if ( value === "" ) {
                return null;
            }

            var iFormat, dim, extra,
                iValue = 0,
                shortYearCutoffTemp = ( settings ? settings.shortYearCutoff : null ) || this._defaults.shortYearCutoff,
                shortYearCutoff = ( typeof shortYearCutoffTemp !== "string" ? shortYearCutoffTemp :
                    new Date().getFullYear() % 100 + parseInt( shortYearCutoffTemp, 10 ) ),
                dayNamesShort = ( settings ? settings.dayNamesShort : null ) || this._defaults.dayNamesShort,
                dayNames = ( settings ? settings.dayNames : null ) || this._defaults.dayNames,
                monthNamesShort = ( settings ? settings.monthNamesShort : null ) || this._defaults.monthNamesShort,
                monthNames = ( settings ? settings.monthNames : null ) || this._defaults.monthNames,
                year = -1,
                month = -1,
                day = -1,
                doy = -1,
                literal = false,
                date,

                // Check whether a format character is doubled
                lookAhead = function( match ) {
                    var matches = ( iFormat + 1 < format.length && format.charAt( iFormat + 1 ) === match );
                    if ( matches ) {
                        iFormat++;
                    }
                    return matches;
                },

                // Extract a number from the string value
                getNumber = function( match ) {
                    var isDoubled = lookAhead( match ),
                        size = ( match === "@" ? 14 : ( match === "!" ? 20 :
                            ( match === "y" && isDoubled ? 4 : ( match === "o" ? 3 : 2 ) ) ) ),
                        minSize = ( match === "y" ? size : 1 ),
                        digits = new RegExp( "^\\d{" + minSize + "," + size + "}" ),
                        num = value.substring( iValue ).match( digits );
                    if ( !num ) {
                        throw "Missing number at position " + iValue;
                    }
                    iValue += num[ 0 ].length;
                    return parseInt( num[ 0 ], 10 );
                },

                // Extract a name from the string value and convert to an index
                getName = function( match, shortNames, longNames ) {
                    var index = -1,
                        names = $.map( lookAhead( match ) ? longNames : shortNames, function( v, k ) {
                            return [ [ k, v ] ];
                        } ).sort( function( a, b ) {
                            return -( a[ 1 ].length - b[ 1 ].length );
                        } );

                    $.each( names, function( i, pair ) {
                        var name = pair[ 1 ];
                        if ( value.substr( iValue, name.length ).toLowerCase() === name.toLowerCase() ) {
                            index = pair[ 0 ];
                            iValue += name.length;
                            return false;
                        }
                    } );
                    if ( index !== -1 ) {
                        return index + 1;
                    } else {
                        throw "Unknown name at position " + iValue;
                    }
                },

                // Confirm that a literal character matches the string value
                checkLiteral = function() {
                    if ( value.charAt( iValue ) !== format.charAt( iFormat ) ) {
                        throw "Unexpected literal at position " + iValue;
                    }
                    iValue++;
                };

            for ( iFormat = 0; iFormat < format.length; iFormat++ ) {
                if ( literal ) {
                    if ( format.charAt( iFormat ) === "'" && !lookAhead( "'" ) ) {
                        literal = false;
                    } else {
                        checkLiteral();
                    }
                } else {
                    switch ( format.charAt( iFormat ) ) {
                        case "d":
                            day = getNumber( "d" );
                            break;
                        case "D":
                            getName( "D", dayNamesShort, dayNames );
                            break;
                        case "o":
                            doy = getNumber( "o" );
                            break;
                        case "m":
                            month = getNumber( "m" );
                            break;
                        case "M":
                            month = getName( "M", monthNamesShort, monthNames );
                            break;
                        case "y":
                            year = getNumber( "y" );
                            break;
                        case "@":
                            date = new Date( getNumber( "@" ) );
                            year = date.getFullYear();
                            month = date.getMonth() + 1;
                            day = date.getDate();
                            break;
                        case "!":
                            date = new Date( ( getNumber( "!" ) - this._ticksTo1970 ) / 10000 );
                            year = date.getFullYear();
                            month = date.getMonth() + 1;
                            day = date.getDate();
                            break;
                        case "'":
                            if ( lookAhead( "'" ) ) {
                                checkLiteral();
                            } else {
                                literal = true;
                            }
                            break;
                        default:
                            checkLiteral();
                    }
                }
            }

            if ( iValue < value.length ) {
                extra = value.substr( iValue );
                if ( !/^\s+/.test( extra ) ) {
                    throw "Extra/unparsed characters found in date: " + extra;
                }
            }

            if ( year === -1 ) {
                year = new Date().getFullYear();
            } else if ( year < 100 ) {
                year += new Date().getFullYear() - new Date().getFullYear() % 100 +
                    ( year <= shortYearCutoff ? 0 : -100 );
            }

            if ( doy > -1 ) {
                month = 1;
                day = doy;
                do {
                    dim = this._getDaysInMonth( year, month - 1 );
                    if ( day <= dim ) {
                        break;
                    }
                    month++;
                    day -= dim;
                } while ( true );
            }

            date = this._daylightSavingAdjust( new Date( year, month - 1, day ) );
            if ( date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day ) {
                throw "Invalid date"; // E.g. 31/02/00
            }
            return date;
        },

        /* Standard date formats. */
        ATOM: "yy-mm-dd", // RFC 3339 (ISO 8601)
        COOKIE: "D, dd M yy",
        ISO_8601: "yy-mm-dd",
        RFC_822: "D, d M y",
        RFC_850: "DD, dd-M-y",
        RFC_1036: "D, d M y",
        RFC_1123: "D, d M yy",
        RFC_2822: "D, d M yy",
        RSS: "D, d M y", // RFC 822
        TICKS: "!",
        TIMESTAMP: "@",
        W3C: "yy-mm-dd", // ISO 8601

        _ticksTo1970: ( ( ( 1970 - 1 ) * 365 + Math.floor( 1970 / 4 ) - Math.floor( 1970 / 100 ) +
            Math.floor( 1970 / 400 ) ) * 24 * 60 * 60 * 10000000 ),

        /* Format a date object into a string value.
         * The format can be combinations of the following:
         * d  - day of month (no leading zero)
         * dd - day of month (two digit)
         * o  - day of year (no leading zeros)
         * oo - day of year (three digit)
         * D  - day name short
         * DD - day name long
         * m  - month of year (no leading zero)
         * mm - month of year (two digit)
         * M  - month name short
         * MM - month name long
         * y  - year (two digit)
         * yy - year (four digit)
         * @ - Unix timestamp (ms since 01/01/1970)
         * ! - Windows ticks (100ns since 01/01/0001)
         * "..." - literal text
         * '' - single quote
         *
         * @param  format string - the desired format of the date
         * @param  date Date - the date value to format
         * @param  settings Object - attributes include:
         *					dayNamesShort	string[7] - abbreviated names of the days from Sunday (optional)
         *					dayNames		string[7] - names of the days from Sunday (optional)
         *					monthNamesShort string[12] - abbreviated names of the months (optional)
         *					monthNames		string[12] - names of the months (optional)
         * @return  string - the date in the above format
         */
        formatDate: function( format, date, settings ) {
            if ( !date ) {
                return "";
            }

            var iFormat,
                dayNamesShort = ( settings ? settings.dayNamesShort : null ) || this._defaults.dayNamesShort,
                dayNames = ( settings ? settings.dayNames : null ) || this._defaults.dayNames,
                monthNamesShort = ( settings ? settings.monthNamesShort : null ) || this._defaults.monthNamesShort,
                monthNames = ( settings ? settings.monthNames : null ) || this._defaults.monthNames,

                // Check whether a format character is doubled
                lookAhead = function( match ) {
                    var matches = ( iFormat + 1 < format.length && format.charAt( iFormat + 1 ) === match );
                    if ( matches ) {
                        iFormat++;
                    }
                    return matches;
                },

                // Format a number, with leading zero if necessary
                formatNumber = function( match, value, len ) {
                    var num = "" + value;
                    if ( lookAhead( match ) ) {
                        while ( num.length < len ) {
                            num = "0" + num;
                        }
                    }
                    return num;
                },

                // Format a name, short or long as requested
                formatName = function( match, value, shortNames, longNames ) {
                    return ( lookAhead( match ) ? longNames[ value ] : shortNames[ value ] );
                },
                output = "",
                literal = false;

            if ( date ) {
                for ( iFormat = 0; iFormat < format.length; iFormat++ ) {
                    if ( literal ) {
                        if ( format.charAt( iFormat ) === "'" && !lookAhead( "'" ) ) {
                            literal = false;
                        } else {
                            output += format.charAt( iFormat );
                        }
                    } else {
                        switch ( format.charAt( iFormat ) ) {
                            case "d":
                                output += formatNumber( "d", date.getDate(), 2 );
                                break;
                            case "D":
                                output += formatName( "D", date.getDay(), dayNamesShort, dayNames );
                                break;
                            case "o":
                                output += formatNumber( "o",
                                    Math.round( ( new Date( date.getFullYear(), date.getMonth(), date.getDate() ).getTime() - new Date( date.getFullYear(), 0, 0 ).getTime() ) / 86400000 ), 3 );
                                break;
                            case "m":
                                output += formatNumber( "m", date.getMonth() + 1, 2 );
                                break;
                            case "M":
                                output += formatName( "M", date.getMonth(), monthNamesShort, monthNames );
                                break;
                            case "y":
                                output += ( lookAhead( "y" ) ? date.getFullYear() :
                                    ( date.getFullYear() % 100 < 10 ? "0" : "" ) + date.getFullYear() % 100 );
                                break;
                            case "@":
                                output += date.getTime();
                                break;
                            case "!":
                                output += date.getTime() * 10000 + this._ticksTo1970;
                                break;
                            case "'":
                                if ( lookAhead( "'" ) ) {
                                    output += "'";
                                } else {
                                    literal = true;
                                }
                                break;
                            default:
                                output += format.charAt( iFormat );
                        }
                    }
                }
            }
            return output;
        },

        /* Extract all possible characters from the date format. */
        _possibleChars: function( format ) {
            var iFormat,
                chars = "",
                literal = false,

                // Check whether a format character is doubled
                lookAhead = function( match ) {
                    var matches = ( iFormat + 1 < format.length && format.charAt( iFormat + 1 ) === match );
                    if ( matches ) {
                        iFormat++;
                    }
                    return matches;
                };

            for ( iFormat = 0; iFormat < format.length; iFormat++ ) {
                if ( literal ) {
                    if ( format.charAt( iFormat ) === "'" && !lookAhead( "'" ) ) {
                        literal = false;
                    } else {
                        chars += format.charAt( iFormat );
                    }
                } else {
                    switch ( format.charAt( iFormat ) ) {
                        case "d": case "m": case "y": case "@":
                            chars += "0123456789";
                            break;
                        case "D": case "M":
                            return null; // Accept anything
                        case "'":
                            if ( lookAhead( "'" ) ) {
                                chars += "'";
                            } else {
                                literal = true;
                            }
                            break;
                        default:
                            chars += format.charAt( iFormat );
                    }
                }
            }
            return chars;
        },

        /* Get a setting value, defaulting if necessary. */
        _get: function( inst, name ) {
            return inst.settings[ name ] !== undefined ?
                inst.settings[ name ] : this._defaults[ name ];
        },

        /* Parse existing date and initialise date picker. */
        _setDateFromField: function( inst, noDefault ) {
            if ( inst.input.val() === inst.lastVal ) {
                return;
            }

            var dateFormat = this._get( inst, "dateFormat" ),
                dates = inst.lastVal = inst.input ? inst.input.val() : null,
                defaultDate = this._getDefaultDate( inst ),
                date = defaultDate,
                settings = this._getFormatConfig( inst );

            try {
                date = this.parseDate( dateFormat, dates, settings ) || defaultDate;
            } catch ( event ) {
                dates = ( noDefault ? "" : dates );
            }
            inst.selectedDay = date.getDate();
            inst.drawMonth = inst.selectedMonth = date.getMonth();
            inst.drawYear = inst.selectedYear = date.getFullYear();
            inst.currentDay = ( dates ? date.getDate() : 0 );
            inst.currentMonth = ( dates ? date.getMonth() : 0 );
            inst.currentYear = ( dates ? date.getFullYear() : 0 );
            this._adjustInstDate( inst );
        },

        /* Retrieve the default date shown on opening. */
        _getDefaultDate: function( inst ) {
            return this._restrictMinMax( inst,
                this._determineDate( inst, this._get( inst, "defaultDate" ), new Date() ) );
        },

        /* A date may be specified as an exact value or a relative one. */
        _determineDate: function( inst, date, defaultDate ) {
            var offsetNumeric = function( offset ) {
                    var date = new Date();
                    date.setDate( date.getDate() + offset );
                    return date;
                },
                offsetString = function( offset ) {
                    try {
                        return $.datepicker.parseDate( $.datepicker._get( inst, "dateFormat" ),
                            offset, $.datepicker._getFormatConfig( inst ) );
                    }
                    catch ( e ) {

                        // Ignore
                    }

                    var date = ( offset.toLowerCase().match( /^c/ ) ?
                        $.datepicker._getDate( inst ) : null ) || new Date(),
                        year = date.getFullYear(),
                        month = date.getMonth(),
                        day = date.getDate(),
                        pattern = /([+\-]?[0-9]+)\s*(d|D|w|W|m|M|y|Y)?/g,
                        matches = pattern.exec( offset );

                    while ( matches ) {
                        switch ( matches[ 2 ] || "d" ) {
                            case "d" : case "D" :
                                day += parseInt( matches[ 1 ], 10 ); break;
                            case "w" : case "W" :
                                day += parseInt( matches[ 1 ], 10 ) * 7; break;
                            case "m" : case "M" :
                                month += parseInt( matches[ 1 ], 10 );
                                day = Math.min( day, $.datepicker._getDaysInMonth( year, month ) );
                                break;
                            case "y": case "Y" :
                                year += parseInt( matches[ 1 ], 10 );
                                day = Math.min( day, $.datepicker._getDaysInMonth( year, month ) );
                                break;
                        }
                        matches = pattern.exec( offset );
                    }
                    return new Date( year, month, day );
                },
                newDate = ( date == null || date === "" ? defaultDate : ( typeof date === "string" ? offsetString( date ) :
                    ( typeof date === "number" ? ( isNaN( date ) ? defaultDate : offsetNumeric( date ) ) : new Date( date.getTime() ) ) ) );

            newDate = ( newDate && newDate.toString() === "Invalid Date" ? defaultDate : newDate );
            if ( newDate ) {
                newDate.setHours( 0 );
                newDate.setMinutes( 0 );
                newDate.setSeconds( 0 );
                newDate.setMilliseconds( 0 );
            }
            return this._daylightSavingAdjust( newDate );
        },

        /* Handle switch to/from daylight saving.
         * Hours may be non-zero on daylight saving cut-over:
         * > 12 when midnight changeover, but then cannot generate
         * midnight datetime, so jump to 1AM, otherwise reset.
         * @param  date  (Date) the date to check
         * @return  (Date) the corrected date
         */
        _daylightSavingAdjust: function( date ) {
            if ( !date ) {
                return null;
            }
            date.setHours( date.getHours() > 12 ? date.getHours() + 2 : 0 );
            return date;
        },

        /* Set the date(s) directly. */
        _setDate: function( inst, date, noChange ) {
            var clear = !date,
                origMonth = inst.selectedMonth,
                origYear = inst.selectedYear,
                newDate = this._restrictMinMax( inst, this._determineDate( inst, date, new Date() ) );

            inst.selectedDay = inst.currentDay = newDate.getDate();
            inst.drawMonth = inst.selectedMonth = inst.currentMonth = newDate.getMonth();
            inst.drawYear = inst.selectedYear = inst.currentYear = newDate.getFullYear();
            if ( ( origMonth !== inst.selectedMonth || origYear !== inst.selectedYear ) && !noChange ) {
                this._notifyChange( inst );
            }
            this._adjustInstDate( inst );
            if ( inst.input ) {
                inst.input.val( clear ? "" : this._formatDate( inst ) );
            }
        },

        /* Retrieve the date(s) directly. */
        _getDate: function( inst ) {
            var startDate = ( !inst.currentYear || ( inst.input && inst.input.val() === "" ) ? null :
                this._daylightSavingAdjust( new Date(
                    inst.currentYear, inst.currentMonth, inst.currentDay ) ) );
            return startDate;
        },

        /* Attach the onxxx handlers.  These are declared statically so
         * they work with static code transformers like Caja.
         */
        _attachHandlers: function( inst ) {
            var stepMonths = this._get( inst, "stepMonths" ),
                id = "#" + inst.id.replace( /\\\\/g, "\\" );
            inst.dpDiv.find( "[data-handler]" ).map( function() {
                var handler = {
                    prev: function() {
                        $.datepicker._adjustDate( id, -stepMonths, "M" );
                    },
                    next: function() {
                        $.datepicker._adjustDate( id, +stepMonths, "M" );
                    },
                    hide: function() {
                        $.datepicker._hideDatepicker();
                    },
                    today: function() {
                        $.datepicker._gotoToday( id );
                    },
                    selectDay: function() {
                        $.datepicker._selectDay( id, +this.getAttribute( "data-month" ), +this.getAttribute( "data-year" ), this );
                        return false;
                    },
                    selectMonth: function() {
                        $.datepicker._selectMonthYear( id, this, "M" );
                        return false;
                    },
                    selectYear: function() {
                        $.datepicker._selectMonthYear( id, this, "Y" );
                        return false;
                    }
                };
                $( this ).on( this.getAttribute( "data-event" ), handler[ this.getAttribute( "data-handler" ) ] );
            } );
        },

        /* Generate the HTML for the current state of the date picker. */
        _generateHTML: function( inst ) {
            var maxDraw, prevText, prev, nextText, next, currentText, gotoDate,
                controls, buttonPanel, firstDay, showWeek, dayNames, dayNamesMin,
                monthNames, monthNamesShort, beforeShowDay, showOtherMonths,
                selectOtherMonths, defaultDate, html, dow, row, group, col, selectedDate,
                cornerClass, calender, thead, day, daysInMonth, leadDays, curRows, numRows,
                printDate, dRow, tbody, daySettings, otherMonth, unselectable,
                tempDate = new Date(),
                today = this._daylightSavingAdjust(
                    new Date( tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate() ) ), // clear time
                isRTL = this._get( inst, "isRTL" ),
                showButtonPanel = this._get( inst, "showButtonPanel" ),
                hideIfNoPrevNext = this._get( inst, "hideIfNoPrevNext" ),
                navigationAsDateFormat = this._get( inst, "navigationAsDateFormat" ),
                numMonths = this._getNumberOfMonths( inst ),
                showCurrentAtPos = this._get( inst, "showCurrentAtPos" ),
                stepMonths = this._get( inst, "stepMonths" ),
                isMultiMonth = ( numMonths[ 0 ] !== 1 || numMonths[ 1 ] !== 1 ),
                currentDate = this._daylightSavingAdjust( ( !inst.currentDay ? new Date( 9999, 9, 9 ) :
                    new Date( inst.currentYear, inst.currentMonth, inst.currentDay ) ) ),
                minDate = this._getMinMaxDate( inst, "min" ),
                maxDate = this._getMinMaxDate( inst, "max" ),
                drawMonth = inst.drawMonth - showCurrentAtPos,
                drawYear = inst.drawYear;

            if ( drawMonth < 0 ) {
                drawMonth += 12;
                drawYear--;
            }
            if ( maxDate ) {
                maxDraw = this._daylightSavingAdjust( new Date( maxDate.getFullYear(),
                    maxDate.getMonth() - ( numMonths[ 0 ] * numMonths[ 1 ] ) + 1, maxDate.getDate() ) );
                maxDraw = ( minDate && maxDraw < minDate ? minDate : maxDraw );
                while ( this._daylightSavingAdjust( new Date( drawYear, drawMonth, 1 ) ) > maxDraw ) {
                    drawMonth--;
                    if ( drawMonth < 0 ) {
                        drawMonth = 11;
                        drawYear--;
                    }
                }
            }
            inst.drawMonth = drawMonth;
            inst.drawYear = drawYear;

            prevText = this._get( inst, "prevText" );
            prevText = ( !navigationAsDateFormat ? prevText : this.formatDate( prevText,
                this._daylightSavingAdjust( new Date( drawYear, drawMonth - stepMonths, 1 ) ),
                this._getFormatConfig( inst ) ) );

            prev = ( this._canAdjustMonth( inst, -1, drawYear, drawMonth ) ?
                "<a class='ui-datepicker-prev ui-corner-all' data-handler='prev' data-event='click'" +
                " title='" + prevText + "'><span class='ui-icon ui-icon-circle-triangle-" + ( isRTL ? "e" : "w" ) + "'>" + prevText + "</span></a>" :
                ( hideIfNoPrevNext ? "" : "<a class='ui-datepicker-prev ui-corner-all ui-state-disabled' title='" + prevText + "'><span class='ui-icon ui-icon-circle-triangle-" + ( isRTL ? "e" : "w" ) + "'>" + prevText + "</span></a>" ) );

            nextText = this._get( inst, "nextText" );
            nextText = ( !navigationAsDateFormat ? nextText : this.formatDate( nextText,
                this._daylightSavingAdjust( new Date( drawYear, drawMonth + stepMonths, 1 ) ),
                this._getFormatConfig( inst ) ) );

            next = ( this._canAdjustMonth( inst, +1, drawYear, drawMonth ) ?
                "<a class='ui-datepicker-next ui-corner-all' data-handler='next' data-event='click'" +
                " title='" + nextText + "'><span class='ui-icon ui-icon-circle-triangle-" + ( isRTL ? "w" : "e" ) + "'>" + nextText + "</span></a>" :
                ( hideIfNoPrevNext ? "" : "<a class='ui-datepicker-next ui-corner-all ui-state-disabled' title='" + nextText + "'><span class='ui-icon ui-icon-circle-triangle-" + ( isRTL ? "w" : "e" ) + "'>" + nextText + "</span></a>" ) );

            currentText = this._get( inst, "currentText" );
            gotoDate = ( this._get( inst, "gotoCurrent" ) && inst.currentDay ? currentDate : today );
            currentText = ( !navigationAsDateFormat ? currentText :
                this.formatDate( currentText, gotoDate, this._getFormatConfig( inst ) ) );

            controls = ( !inst.inline ? "<button type='button' class='ui-datepicker-close ui-state-default ui-priority-primary ui-corner-all' data-handler='hide' data-event='click'>" +
                this._get( inst, "closeText" ) + "</button>" : "" );

            buttonPanel = ( showButtonPanel ) ? "<div class='ui-datepicker-buttonpane ui-widget-content'>" + ( isRTL ? controls : "" ) +
                ( this._isInRange( inst, gotoDate ) ? "<button type='button' class='ui-datepicker-current ui-state-default ui-priority-secondary ui-corner-all' data-handler='today' data-event='click'" +
                    ">" + currentText + "</button>" : "" ) + ( isRTL ? "" : controls ) + "</div>" : "";

            firstDay = parseInt( this._get( inst, "firstDay" ), 10 );
            firstDay = ( isNaN( firstDay ) ? 0 : firstDay );

            showWeek = this._get( inst, "showWeek" );
            dayNames = this._get( inst, "dayNames" );
            dayNamesMin = this._get( inst, "dayNamesMin" );
            monthNames = this._get( inst, "monthNames" );
            monthNamesShort = this._get( inst, "monthNamesShort" );
            beforeShowDay = this._get( inst, "beforeShowDay" );
            showOtherMonths = this._get( inst, "showOtherMonths" );
            selectOtherMonths = this._get( inst, "selectOtherMonths" );
            defaultDate = this._getDefaultDate( inst );
            html = "";

            for ( row = 0; row < numMonths[ 0 ]; row++ ) {
                group = "";
                this.maxRows = 4;
                for ( col = 0; col < numMonths[ 1 ]; col++ ) {
                    selectedDate = this._daylightSavingAdjust( new Date( drawYear, drawMonth, inst.selectedDay ) );
                    cornerClass = " ui-corner-all";
                    calender = "";
                    if ( isMultiMonth ) {
                        calender += "<div class='ui-datepicker-group";
                        if ( numMonths[ 1 ] > 1 ) {
                            switch ( col ) {
                                case 0: calender += " ui-datepicker-group-first";
                                    cornerClass = " ui-corner-" + ( isRTL ? "right" : "left" ); break;
                                case numMonths[ 1 ] - 1: calender += " ui-datepicker-group-last";
                                    cornerClass = " ui-corner-" + ( isRTL ? "left" : "right" ); break;
                                default: calender += " ui-datepicker-group-middle"; cornerClass = ""; break;
                            }
                        }
                        calender += "'>";
                    }
                    calender += "<div class='ui-datepicker-header ui-widget-header ui-helper-clearfix" + cornerClass + "'>" +
                        ( /all|left/.test( cornerClass ) && row === 0 ? ( isRTL ? next : prev ) : "" ) +
                        ( /all|right/.test( cornerClass ) && row === 0 ? ( isRTL ? prev : next ) : "" ) +
                        this._generateMonthYearHeader( inst, drawMonth, drawYear, minDate, maxDate,
                            row > 0 || col > 0, monthNames, monthNamesShort ) + // draw month headers
                        "</div><table class='ui-datepicker-calendar'><thead>" +
                        "<tr>";
                    thead = ( showWeek ? "<th class='ui-datepicker-week-col'>" + this._get( inst, "weekHeader" ) + "</th>" : "" );
                    for ( dow = 0; dow < 7; dow++ ) { // days of the week
                        day = ( dow + firstDay ) % 7;
                        thead += "<th scope='col'" + ( ( dow + firstDay + 6 ) % 7 >= 5 ? " class='ui-datepicker-week-end'" : "" ) + ">" +
                            "<span title='" + dayNames[ day ] + "'>" + dayNamesMin[ day ] + "</span></th>";
                    }
                    calender += thead + "</tr></thead><tbody>";
                    daysInMonth = this._getDaysInMonth( drawYear, drawMonth );
                    if ( drawYear === inst.selectedYear && drawMonth === inst.selectedMonth ) {
                        inst.selectedDay = Math.min( inst.selectedDay, daysInMonth );
                    }
                    leadDays = ( this._getFirstDayOfMonth( drawYear, drawMonth ) - firstDay + 7 ) % 7;
                    curRows = Math.ceil( ( leadDays + daysInMonth ) / 7 ); // calculate the number of rows to generate
                    numRows = ( isMultiMonth ? this.maxRows > curRows ? this.maxRows : curRows : curRows ); //If multiple months, use the higher number of rows (see #7043)
                    this.maxRows = numRows;
                    printDate = this._daylightSavingAdjust( new Date( drawYear, drawMonth, 1 - leadDays ) );
                    for ( dRow = 0; dRow < numRows; dRow++ ) { // create date picker rows
                        calender += "<tr>";
                        tbody = ( !showWeek ? "" : "<td class='ui-datepicker-week-col'>" +
                            this._get( inst, "calculateWeek" )( printDate ) + "</td>" );
                        for ( dow = 0; dow < 7; dow++ ) { // create date picker days
                            daySettings = ( beforeShowDay ?
                                beforeShowDay.apply( ( inst.input ? inst.input[ 0 ] : null ), [ printDate ] ) : [ true, "" ] );
                            otherMonth = ( printDate.getMonth() !== drawMonth );
                            unselectable = ( otherMonth && !selectOtherMonths ) || !daySettings[ 0 ] ||
                                ( minDate && printDate < minDate ) || ( maxDate && printDate > maxDate );
                            tbody += "<td class='" +
                                ( ( dow + firstDay + 6 ) % 7 >= 5 ? " ui-datepicker-week-end" : "" ) + // highlight weekends
                                ( otherMonth ? " ui-datepicker-other-month" : "" ) + // highlight days from other months
                                ( ( printDate.getTime() === selectedDate.getTime() && drawMonth === inst.selectedMonth && inst._keyEvent ) || // user pressed key
                                ( defaultDate.getTime() === printDate.getTime() && defaultDate.getTime() === selectedDate.getTime() ) ?

                                    // or defaultDate is current printedDate and defaultDate is selectedDate
                                    " " + this._dayOverClass : "" ) + // highlight selected day
                                ( unselectable ? " " + this._unselectableClass + " ui-state-disabled" : "" ) +  // highlight unselectable days
                                ( otherMonth && !showOtherMonths ? "" : " " + daySettings[ 1 ] + // highlight custom dates
                                    ( printDate.getTime() === currentDate.getTime() ? " " + this._currentClass : "" ) + // highlight selected day
                                    ( printDate.getTime() === today.getTime() ? " ui-datepicker-today" : "" ) ) + "'" + // highlight today (if different)
                                ( ( !otherMonth || showOtherMonths ) && daySettings[ 2 ] ? " title='" + daySettings[ 2 ].replace( /'/g, "&#39;" ) + "'" : "" ) + // cell title
                                ( unselectable ? "" : " data-handler='selectDay' data-event='click' data-month='" + printDate.getMonth() + "' data-year='" + printDate.getFullYear() + "'" ) + ">" + // actions
                                ( otherMonth && !showOtherMonths ? "&#xa0;" : // display for other months
                                    ( unselectable ? "<span class='ui-state-default'>" + printDate.getDate() + "</span>" : "<a class='ui-state-default" +
                                        ( printDate.getTime() === today.getTime() ? " ui-state-highlight" : "" ) +
                                        ( printDate.getTime() === currentDate.getTime() ? " ui-state-active" : "" ) + // highlight selected day
                                        ( otherMonth ? " ui-priority-secondary" : "" ) + // distinguish dates from other months
                                        "' href='#'>" + printDate.getDate() + "</a>" ) ) + "</td>"; // display selectable date
                            printDate.setDate( printDate.getDate() + 1 );
                            printDate = this._daylightSavingAdjust( printDate );
                        }
                        calender += tbody + "</tr>";
                    }
                    drawMonth++;
                    if ( drawMonth > 11 ) {
                        drawMonth = 0;
                        drawYear++;
                    }
                    calender += "</tbody></table>" + ( isMultiMonth ? "</div>" +
                        ( ( numMonths[ 0 ] > 0 && col === numMonths[ 1 ] - 1 ) ? "<div class='ui-datepicker-row-break'></div>" : "" ) : "" );
                    group += calender;
                }
                html += group;
            }
            html += buttonPanel;
            inst._keyEvent = false;
            return html;
        },

        /* Generate the month and year header. */
        _generateMonthYearHeader: function( inst, drawMonth, drawYear, minDate, maxDate,
                                            secondary, monthNames, monthNamesShort ) {

            var inMinYear, inMaxYear, month, years, thisYear, determineYear, year, endYear,
                changeMonth = this._get( inst, "changeMonth" ),
                changeYear = this._get( inst, "changeYear" ),
                showMonthAfterYear = this._get( inst, "showMonthAfterYear" ),
                html = "<div class='ui-datepicker-title'>",
                monthHtml = "";

            // Month selection
            if ( secondary || !changeMonth ) {
                monthHtml += "<span class='ui-datepicker-month'>" + monthNames[ drawMonth ] + "</span>";
            } else {
                inMinYear = ( minDate && minDate.getFullYear() === drawYear );
                inMaxYear = ( maxDate && maxDate.getFullYear() === drawYear );
                monthHtml += "<select class='ui-datepicker-month' data-handler='selectMonth' data-event='change'>";
                for ( month = 0; month < 12; month++ ) {
                    if ( ( !inMinYear || month >= minDate.getMonth() ) && ( !inMaxYear || month <= maxDate.getMonth() ) ) {
                        monthHtml += "<option value='" + month + "'" +
                            ( month === drawMonth ? " selected='selected'" : "" ) +
                            ">" + monthNamesShort[ month ] + "</option>";
                    }
                }
                monthHtml += "</select>";
            }

            if ( !showMonthAfterYear ) {
                html += monthHtml + ( secondary || !( changeMonth && changeYear ) ? "&#xa0;" : "" );
            }

            // Year selection
            if ( !inst.yearshtml ) {
                inst.yearshtml = "";
                if ( secondary || !changeYear ) {
                    html += "<span class='ui-datepicker-year'>" + drawYear + "</span>";
                } else {

                    // determine range of years to display
                    years = this._get( inst, "yearRange" ).split( ":" );
                    thisYear = new Date().getFullYear();
                    determineYear = function( value ) {
                        var year = ( value.match( /c[+\-].*/ ) ? drawYear + parseInt( value.substring( 1 ), 10 ) :
                            ( value.match( /[+\-].*/ ) ? thisYear + parseInt( value, 10 ) :
                                parseInt( value, 10 ) ) );
                        return ( isNaN( year ) ? thisYear : year );
                    };
                    year = determineYear( years[ 0 ] );
                    endYear = Math.max( year, determineYear( years[ 1 ] || "" ) );
                    year = ( minDate ? Math.max( year, minDate.getFullYear() ) : year );
                    endYear = ( maxDate ? Math.min( endYear, maxDate.getFullYear() ) : endYear );
                    inst.yearshtml += "<select class='ui-datepicker-year' data-handler='selectYear' data-event='change'>";
                    for ( ; year <= endYear; year++ ) {
                        inst.yearshtml += "<option value='" + year + "'" +
                            ( year === drawYear ? " selected='selected'" : "" ) +
                            ">" + year + "</option>";
                    }
                    inst.yearshtml += "</select>";

                    html += inst.yearshtml;
                    inst.yearshtml = null;
                }
            }

            html += this._get( inst, "yearSuffix" );
            if ( showMonthAfterYear ) {
                html += ( secondary || !( changeMonth && changeYear ) ? "&#xa0;" : "" ) + monthHtml;
            }
            html += "</div>"; // Close datepicker_header
            return html;
        },

        /* Adjust one of the date sub-fields. */
        _adjustInstDate: function( inst, offset, period ) {
            var year = inst.selectedYear + ( period === "Y" ? offset : 0 ),
                month = inst.selectedMonth + ( period === "M" ? offset : 0 ),
                day = Math.min( inst.selectedDay, this._getDaysInMonth( year, month ) ) + ( period === "D" ? offset : 0 ),
                date = this._restrictMinMax( inst, this._daylightSavingAdjust( new Date( year, month, day ) ) );

            inst.selectedDay = date.getDate();
            inst.drawMonth = inst.selectedMonth = date.getMonth();
            inst.drawYear = inst.selectedYear = date.getFullYear();
            if ( period === "M" || period === "Y" ) {
                this._notifyChange( inst );
            }
        },

        /* Ensure a date is within any min/max bounds. */
        _restrictMinMax: function( inst, date ) {
            var minDate = this._getMinMaxDate( inst, "min" ),
                maxDate = this._getMinMaxDate( inst, "max" ),
                newDate = ( minDate && date < minDate ? minDate : date );
            return ( maxDate && newDate > maxDate ? maxDate : newDate );
        },

        /* Notify change of month/year. */
        _notifyChange: function( inst ) {
            var onChange = this._get( inst, "onChangeMonthYear" );
            if ( onChange ) {
                onChange.apply( ( inst.input ? inst.input[ 0 ] : null ),
                    [ inst.selectedYear, inst.selectedMonth + 1, inst ] );
            }
        },

        /* Determine the number of months to show. */
        _getNumberOfMonths: function( inst ) {
            var numMonths = this._get( inst, "numberOfMonths" );
            return ( numMonths == null ? [ 1, 1 ] : ( typeof numMonths === "number" ? [ 1, numMonths ] : numMonths ) );
        },

        /* Determine the current maximum date - ensure no time components are set. */
        _getMinMaxDate: function( inst, minMax ) {
            return this._determineDate( inst, this._get( inst, minMax + "Date" ), null );
        },

        /* Find the number of days in a given month. */
        _getDaysInMonth: function( year, month ) {
            return 32 - this._daylightSavingAdjust( new Date( year, month, 32 ) ).getDate();
        },

        /* Find the day of the week of the first of a month. */
        _getFirstDayOfMonth: function( year, month ) {
            return new Date( year, month, 1 ).getDay();
        },

        /* Determines if we should allow a "next/prev" month display change. */
        _canAdjustMonth: function( inst, offset, curYear, curMonth ) {
            var numMonths = this._getNumberOfMonths( inst ),
                date = this._daylightSavingAdjust( new Date( curYear,
                    curMonth + ( offset < 0 ? offset : numMonths[ 0 ] * numMonths[ 1 ] ), 1 ) );

            if ( offset < 0 ) {
                date.setDate( this._getDaysInMonth( date.getFullYear(), date.getMonth() ) );
            }
            return this._isInRange( inst, date );
        },

        /* Is the given date in the accepted range? */
        _isInRange: function( inst, date ) {
            var yearSplit, currentYear,
                minDate = this._getMinMaxDate( inst, "min" ),
                maxDate = this._getMinMaxDate( inst, "max" ),
                minYear = null,
                maxYear = null,
                years = this._get( inst, "yearRange" );
            if ( years ) {
                yearSplit = years.split( ":" );
                currentYear = new Date().getFullYear();
                minYear = parseInt( yearSplit[ 0 ], 10 );
                maxYear = parseInt( yearSplit[ 1 ], 10 );
                if ( yearSplit[ 0 ].match( /[+\-].*/ ) ) {
                    minYear += currentYear;
                }
                if ( yearSplit[ 1 ].match( /[+\-].*/ ) ) {
                    maxYear += currentYear;
                }
            }

            return ( ( !minDate || date.getTime() >= minDate.getTime() ) &&
                ( !maxDate || date.getTime() <= maxDate.getTime() ) &&
                ( !minYear || date.getFullYear() >= minYear ) &&
                ( !maxYear || date.getFullYear() <= maxYear ) );
        },

        /* Provide the configuration settings for formatting/parsing. */
        _getFormatConfig: function( inst ) {
            var shortYearCutoff = this._get( inst, "shortYearCutoff" );
            shortYearCutoff = ( typeof shortYearCutoff !== "string" ? shortYearCutoff :
                new Date().getFullYear() % 100 + parseInt( shortYearCutoff, 10 ) );
            return { shortYearCutoff: shortYearCutoff,
                dayNamesShort: this._get( inst, "dayNamesShort" ), dayNames: this._get( inst, "dayNames" ),
                monthNamesShort: this._get( inst, "monthNamesShort" ), monthNames: this._get( inst, "monthNames" ) };
        },

        /* Format the given date for display. */
        _formatDate: function( inst, day, month, year ) {
            if ( !day ) {
                inst.currentDay = inst.selectedDay;
                inst.currentMonth = inst.selectedMonth;
                inst.currentYear = inst.selectedYear;
            }
            var date = ( day ? ( typeof day === "object" ? day :
                this._daylightSavingAdjust( new Date( year, month, day ) ) ) :
                this._daylightSavingAdjust( new Date( inst.currentYear, inst.currentMonth, inst.currentDay ) ) );
            return this.formatDate( this._get( inst, "dateFormat" ), date, this._getFormatConfig( inst ) );
        }
    } );

    /*
     * Bind hover events for datepicker elements.
     * Done via delegate so the binding only occurs once in the lifetime of the parent div.
     * Global datepicker_instActive, set by _updateDatepicker allows the handlers to find their way back to the active picker.
     */
    function datepicker_bindHover( dpDiv ) {
        var selector = "button, .ui-datepicker-prev, .ui-datepicker-next, .ui-datepicker-calendar td a";
        return dpDiv.on( "mouseout", selector, function() {
            $( this ).removeClass( "ui-state-hover" );
            if ( this.className.indexOf( "ui-datepicker-prev" ) !== -1 ) {
                $( this ).removeClass( "ui-datepicker-prev-hover" );
            }
            if ( this.className.indexOf( "ui-datepicker-next" ) !== -1 ) {
                $( this ).removeClass( "ui-datepicker-next-hover" );
            }
        } )
            .on( "mouseover", selector, datepicker_handleMouseover );
    }

    function datepicker_handleMouseover() {
        if ( !$.datepicker._isDisabledDatepicker( datepicker_instActive.inline ? datepicker_instActive.dpDiv.parent()[ 0 ] : datepicker_instActive.input[ 0 ] ) ) {
            $( this ).parents( ".ui-datepicker-calendar" ).find( "a" ).removeClass( "ui-state-hover" );
            $( this ).addClass( "ui-state-hover" );
            if ( this.className.indexOf( "ui-datepicker-prev" ) !== -1 ) {
                $( this ).addClass( "ui-datepicker-prev-hover" );
            }
            if ( this.className.indexOf( "ui-datepicker-next" ) !== -1 ) {
                $( this ).addClass( "ui-datepicker-next-hover" );
            }
        }
    }

    /* jQuery extend now ignores nulls! */
    function datepicker_extendRemove( target, props ) {
        $.extend( target, props );
        for ( var name in props ) {
            if ( props[ name ] == null ) {
                target[ name ] = props[ name ];
            }
        }
        return target;
    }

    /* Invoke the datepicker functionality.
       @param  options  string - a command, optionally followed by additional parameters or
                        Object - settings for attaching new datepicker functionality
       @return  jQuery object */
    $.fn.datepicker = function( options ) {

        /* Verify an empty collection wasn't passed - Fixes #6976 */
        if ( !this.length ) {
            return this;
        }

        /* Initialise the date picker. */
        if ( !$.datepicker.initialized ) {
            $( document ).on( "mousedown", $.datepicker._checkExternalClick );
            $.datepicker.initialized = true;
        }

        /* Append datepicker main container to body if not exist. */
        if ( $( "#" + $.datepicker._mainDivId ).length === 0 ) {
            $( "body" ).append( $.datepicker.dpDiv );
        }

        var otherArgs = Array.prototype.slice.call( arguments, 1 );
        if ( typeof options === "string" && ( options === "isDisabled" || options === "getDate" || options === "widget" ) ) {
            return $.datepicker[ "_" + options + "Datepicker" ].
            apply( $.datepicker, [ this[ 0 ] ].concat( otherArgs ) );
        }
        if ( options === "option" && arguments.length === 2 && typeof arguments[ 1 ] === "string" ) {
            return $.datepicker[ "_" + options + "Datepicker" ].
            apply( $.datepicker, [ this[ 0 ] ].concat( otherArgs ) );
        }
        return this.each( function() {
            typeof options === "string" ?
                $.datepicker[ "_" + options + "Datepicker" ].
                apply( $.datepicker, [ this ].concat( otherArgs ) ) :
                $.datepicker._attachDatepicker( this, options );
        } );
    };

    $.datepicker = new Datepicker(); // singleton instance
    $.datepicker.initialized = false;
    $.datepicker.uuid = new Date().getTime();
    $.datepicker.version = "1.12.1";

    var widgetsDatepicker = $.datepicker;
}));