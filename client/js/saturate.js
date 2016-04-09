window.justree = window.justree || {};

(function (justree) {
	var saturate = justree.saturate = {};

	// constants
	var pi = Math.PI;
	var piInv = 1.0 / pi;
	var piHalf = pi * 0.5;
	var piSqrt = Math.sqrt(pi);
	var piSqrtHalf = piSqrt * 0.5;

	// http://picomath.org/javascript/erf.js.html
	saturate.erf = function (x) {
		x *= piSqrtHalf;

	    // constants
	    var a1 =  0.254829592;
	    var a2 = -0.284496736;
	    var a3 =  1.421413741;
	    var a4 = -1.453152027;
	    var a5 =  1.061405429;
	    var p  =  0.3275911;

	    // Save the sign of x
	    var sign = 1;
	    if (x < 0) {
	        sign = -1;
	    }
	    x = Math.abs(x);

	    // A&S formula 7.1.26
	    var t = 1.0/(1.0 + p*x);
	    var y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);

	    return sign*y;
	};

	// good values are a=1.0, b=2.0/pi
	saturate.arctan = function (a, b) {
		return function (x) {
			return b * Math.atan(a * x);
		};
	};

	saturate.tablify = function (fn, tab, domainMin, domainMax, padLeft, padRight, rangeMin, rangeMax) {
		var tabLen = tab.length;
		var rangeClip = rangeMin !== undefined && rangeMax !== undefined;
		var tabValidLen = tabLen - padLeft - padRight;
		var dx = (domainMax - domainMin) / (tabValidLen - 1);
		var x = domainMin - (padLeft * dx);

		for (var i = 0; i < tabLen; ++i) {
			var y = fn(x);
			if (rangeClip) {
				y = y >= rangeMin ? y : rangeMin;
				y = y <= rangeMax ? y : rangeMax;
			}
			tab[i] = y;
			x += dx;
		}
	};

})(window.justree);    