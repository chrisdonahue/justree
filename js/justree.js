window.justree = window.justree || {};

(function ($, ObjectBase, justree) {
	/* require */
	if (!window.supportsWebAudio) {
		alert('Sorry, HTML5 Web Audio API not supported on this browser.');
		throw 'HTML5 Web Audio API not supported on this browser';
	}
	if (!window.supportsCanvas) {
		alert('Sorry, HTML5 Canvas not supported on this browser.');
		throw 'HTML5 Canvas not supported on this browser';
	}

	/* defines */
	var defines = justree.defines = {};
	defines.touch_id_mouse = 'mouse';
	defines.orientation = {
		portrait: 'portrait',
		landscape: 'landscape'
	};

	/* config */
	var config = justree.config = {}
	config.freqMin = 220.0;
	config.freqMax = 440.0;
	config.timeLenAbs = 10.0;
	config.depthMin = 3;
	config.depthMax = 8;
	config.nDims = 2;
	config.pTerm = 0.5;
	config.pOn = 0.5;
	config.ratios = [1, 2];
	config.ratiosLen = config.ratios.length;
	
	/* shared */
	var shared = justree.shared = {};
	shared.timePlaybackRel = 0.0;

	/* tree */
	var tree = justree.tree = {};
	var RatioNode = tree.RatioNode = ObjectBase.extend({
		constructor: function (dim, ratio, on) {
			this.left = null;
			this.right = null;
			this.dim = dim;
			this.ratio = ratio;
			this.on = on;
		},
		isLeaf: function () {
			return this.left === null && this.right === null;
		},
		toString: function () {
			var string = '(' + String(this.ratio);
			if (this.left !== null) {
				string += ' ' + this.left.toString();
			}
			if (this.right !== null) {
				string += ' ' + this.right.toString();
			}
			string += ')';
			return string;
		}
	});
	var treeGrow = tree.treeGrow = function (depthCurr, depthMin, depthMax, pTerm, nDims, ratios, pOn) {
		//var dim = Math.floor(Math.random() * nDims);
		var dim = depthCurr % 2;
		var ratio = config.ratios[Math.floor(Math.random() * config.ratiosLen)];
		var on = Math.random() < pOn;
		var node = new RatioNode(dim, ratio, on);

		var p = pTerm;
		if (depthCurr < depthMin) {
			p = 0.0;
		}
		else if (depthCurr >= depthMax) {
			p = 1.0;
		}

		if (Math.random() >= p) {
			node.left = treeGrow(depthCurr + 1, depthMin, depthMax, pTerm, nDims, ratios, pOn);
			node.right = treeGrow(depthCurr + 1, depthMin, depthMax, pTerm, nDims, ratios, pOn);
		}

		return node;
	};
	var treeFull = tree.treeFull = function (depth, depthCurr) {
		var on = Math.random() < pOn;
		var weight = config.ratios[Math.floor(Math.random() * config.ratiosLen)];
		var node = new Node(weight, on);

		if (depthCurr < depth) {
			node.left = treeFull(depth, depthCurr + 1);
			node.right = treeFull(depth, depthCurr + 1);
		}
		else {
			node.left = null;
			node.right = null;
		}

		return node;
	};

	/* ui */
	var ui = justree.ui = {};
	ui.init = function () {};
	ui.callbackPlayClick = function () {
		console.log('lol');
	};

	/* audio */
	var audio = justree.audio = {};
	audio.init = function () {
		var audioCtx = audio.audioCtx = new window.AudioContext();
		var sampleRate = audio.sampleRate = audioCtx.sampleRate;
		audio.sampleRateInverse = 1.0 / sampleRate;
		var blockSize = audio.blockSize = 1024;
		audio.blockSizeInverse = 1.0 / blockSize;
		var scriptNode = audioCtx.createScriptProcessor(blockSize, 0, 1);
		scriptNode.onaudioprocess = audio.callback;
		scriptNode.connect(audioCtx.destination);
	};
	audio.callback = function (event) {
		var blockOut = event.outputBuffer;
		var blockLen = blockOut.length;
		
		for (var channel = 0; channel < blockOut.numberOfChannels; ++channel) {
			var bufferCh = blockOut.getChannelData(channel);

			for (var sample = 0; sample < blockLen; ++sample) {
				bufferCh[sample] = 0.0;
			}
			//bufferCh[0] = 0.25;
		}
	};

	/* video */
	var video = justree.video = {};
	video.orientationGet = function (width, height) {
		return width > height ? justree.defines.orientation.landscape : justree.defines.orientation.portrait;
	};
	var rgbToString = video.rgbToString = function (rgb) {
		return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
	};
	var hueToRgb = video.hueToRgb = function (p, q, t) {
        if(t < 0) t += 1;
        if(t > 1) t -= 1;
        if(t < 1/6) return p + (q - p) * 6 * t;
        if(t < 1/2) return q;
        if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
	};
	var hslToRgb = video.hslToRgb = function (hsl) {
		var h = hsl[0];
		var s = hsl[1];
		var l = hsl[2];
	    var r, g, b;

	    if (s == 0) {
	        r = g = b = l; // achromatic
	    } else {
	        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	        var p = 2 * l - q;
	        r = hueToRgb(p, q, h + 1/3);
	        g = hueToRgb(p, q, h);
	        b = hueToRgb(p, q, h - 1/3);
	    }

	    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	};
	video.init = function (canvasId) {
		video.canvas = $('#justree-ui').get(0);
		video.canvasCtx = video.canvas.getContext('2d');
		video.viewportWidth = -1;
		video.viewportHeight = -1;
		video.canvasWidth = -1;
		video.canvasHeight = -1;
		video.root = null;
		video.grid = [];
	};
	video.treeToGrid = function (node, x, y, width, height, grid) {
		if (node.isLeaf()) {
			var h = Math.random();
			//node.ratio / 7.0;
			var s = Math.random();
			var l = (Math.random() * 0.75) + 0.25;
			var hsl = Array(h, s, l);
			grid.push(Array(rgbToString(hslToRgb(hsl)), x, y, width, height));
		}
		else {
			var ratio = (node.left.ratio / (node.left.ratio + node.right.ratio));
			if (node.dim === 0) {
				var offsetX = width * ratio;
				video.treeToGrid(node.left, x, y, offsetX, height, grid);
				video.treeToGrid(node.right, x + offsetX, y, width - offsetX, height, grid);
			}
			else {
				var offsetY = height * ratio;
				video.treeToGrid(node.left, x, y, width, offsetY, grid);
				video.treeToGrid(node.right, x, y + offsetY, width, height - offsetY, grid);
			}
		}
	};
	video.callbackWindowResize = function () {
		var viewportWidth = $(window).width();
		var viewportHeight = $(window).height();
		if (viewportWidth !== video.viewportWidth || viewportHeight !== video.viewportHeight) {
			video.viewportHeight = viewportWidth;
			video.viewportWidth = viewportHeight;
			video.canvasWidth = video.canvas.width;
			video.canvasHeight = video.canvas.height;
			video.repaint(video.canvasCtx, video.root, 0, 0, video.canvasWidth, video.canvasHeight);
		}
	};
	video.animate = function () {
		video.repaint();
		window.requestAnimationFrame(video.animate);
	};
	video.repaint = function () {
		var ctx = video.canvasCtx;
		var width = video.canvasWidth;
		var height = video.canvasHeight;
		for (var i = 0; i < video.grid.length; ++i) {
			var region = video.grid[i];
			ctx.fillStyle = region[0];
			ctx.fillRect(region[1] * width, region[2] * height, region[3] * width, region[4] * height);
		}
	};
	video.rootSet = function(root) {
		$('#debug #msg').html(root.toString());
		video.root = root;
		video.grid = [];
		video.treeToGrid(video.root, 0, 0, 1.0, 1.0, video.grid);
		console.log(video.grid);
	};

	/* init */
	var callbackDomReady = function () {
		ui.init();
		audio.init();
		video.init('justree-ui');
		
		// generate tree
		var root = treeGrow(0, config.depthMin, config.depthMax, config.pTerm, config.nDims, config.ratios, config.pOn);
		
		// draw tree as rectangle
		video.rootSet(root);

		// remove scrollbars
		//$('body').css({'overflow': 'hidden'});

		// register resize callback
		$(window).resize(video.callbackWindowResize);

		// register play callback
		$('#ui #play').on('click', ui.callbackPlayClick);

		// animiate
		// window.requestAnimationFrame(video.animate);
		
		// draw views
		video.callbackWindowResize();
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window.ObjectBase, window.justree);