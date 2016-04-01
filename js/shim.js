(function () {
	// Shim by Paul Irish
	// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
	window.animation_frame_request = (function () {
	  return  window.requestAnimationFrame ||
			  window.webkitRequestAnimationFrame ||
			  window.mozRequestAnimationFrame ||
			  window.oRequestAnimationFrame ||
			  window.msRequestAnimationFrame ||
			  function (callback) {
				  window.setTimeout(callback, 1000 / 60);
			  };
	})();
	
	window.supportsCanvas = (function() {
		var elem = document.createElement('canvas');
		return !!(elem.getContext && elem.getContext('2d'));
	})();
	window.supportsTouchEvents = 'ontouchstart' in window || 'onmsgesturechange' in window;
	window.supportsWebAudio = 'AudioContext' in window || 'MozAudioContext' in window;
	window.supportsWebSocket = 'WebSocket' in window || 'MozWebSocket' in window;

	if (window.supports_canvas) {
		CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
		  if (w < 2 * r) r = w / 2;
		  if (h < 2 * r) r = h / 2;
		  this.beginPath();
		  this.moveTo(x+r, y);
		  this.arcTo(x+w, y,   x+w, y+h, r);
		  this.arcTo(x+w, y+h, x,   y+h, r);
		  this.arcTo(x,   y+h, x,   y,   r);
		  this.arcTo(x,   y,   x+w, y,   r);
		  this.closePath();
		  return this;
		}
	}

	var ObjectBase = window.ObjectBase = function () {};

	window.abstract = function (abstractBaseClass, method) {return method;};

	// stolen from backbone.js who stole it from goog.inherits
	var extend = ObjectBase.extend = function(protoProps, staticProps) {
		var parent = this;
		var child;

		// The constructor function for the new subclass is either defined by you
		// (the "constructor" property in your `extend` definition), or defaulted
		// by us to simply call the parent's constructor.
		if (protoProps && _.has(protoProps, 'constructor')) {
			child = protoProps.constructor;
		} else {
			child = function(){ return parent.apply(this, arguments); };
		}

		// Add static properties to the constructor function, if supplied.
		_.extend(child, parent, staticProps);

		// Set the prototype chain to inherit from `parent`, without calling
		// `parent`'s constructor function.
		var Surrogate = function(){ this.constructor = child; };
		Surrogate.prototype = parent.prototype;
		child.prototype = new Surrogate;

		// Add prototype properties (instance properties) to the subclass,
		// if supplied.
		if (protoProps) _.extend(child.prototype, protoProps);

		// Set a convenience property in case the parent's prototype is needed
		// later.
		child.__super__ = parent.prototype;

		return child;
	};

	window.mouseToTouchEvent = function (callback) {
		return function(event) {
			event.consumed = false;
			event.changedTouches = [];
			event.changedTouches.push({
				clientX: event.offsetX || -1,
				clientY: event.offsetY || -1,
				identifier: 'mouse'
			});
			callback(event);
		};
	}

})();
