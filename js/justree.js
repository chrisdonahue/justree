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
    config.blockSize = 1024;
	config.freqMin = 220.0;
	config.freqMax = 440.0;
	config.timeLenAbs = 2.0;
	config.depthMin = 3;
	config.depthMax = 8;
	config.nDims = 2;
	config.pTerm = 0.5;
	config.pOn = 0.5;
	config.ratios = [1, 2];
    config.ratiosTime = []; // TODO
    config.ratiosFreq = [];
	config.ratiosLen = config.ratios.length;
    config.synthTabLen = 4096;
    config.synthVoicesNum = 8;
    config.synthAtk = 0.05;
    config.synthRel = 0.25;
	
	/* shared */
	var shared = justree.shared = {};
    var PlayheadStateEnum = shared.PlayheadStateEnum = {
        'STOPPED': 0,
        'PLAYING': 1,
        'LOOPING': 2
    };
    shared.nodeToGrid = shared.nodeToGrid = function (node, x, y, width, height, grid) {
        if (node.isLeaf()) {
            var h = Math.random();
            //node.ratio / 7.0;
            var s = Math.random();
            var l = (Math.random() * 0.75) + 0.25;
            var hsl = Array(h, s, l);
            grid.push(Array(node, x, y, width, height, rgbToString(hslToRgb(hsl))));
        }
        else {
            var ratio = (node.left.ratio / (node.left.ratio + node.right.ratio));
            if (node.dim === 0) {
                var offsetX = width * ratio;
                shared.nodeToGrid(node.left, x, y, offsetX, height, grid);
                shared.nodeToGrid(node.right, x + offsetX, y, width - offsetX, height, grid);
            }
            else {
                var offsetY = height * ratio;
                shared.nodeToGrid(node.left, x, y, width, offsetY, grid);
                shared.nodeToGrid(node.right, x, y + offsetY, width, height - offsetY, grid);
            }
        }
    };
    shared.init = function () {
        shared.playheadState = PlayheadStateEnum.STOPPED;
        shared.playheadPosRel = 0.0;
        shared.root = null;
        shared.rootGrid = [];
    };
    shared.rootSet = function(root) {
        $('#debug #msg').html(root.toString());
        shared.root = root;
        shared.rootGrid = [];
        shared.nodeToGrid(shared.root, 0, 0, 1.0, 1.0, shared.rootGrid);
        // sort by x ascending then y ascending
        shared.rootGrid.sort(function (a, b) {
            var aX = a[2];
            var aY = a[3];
            var bX = b[2];
            var bY = b[3];
            if (aX != bX) {
                return aX - bX;
            }
            else {
                return aY - bY;
            }
        });
    };

	/* tree */
	var tree = justree.tree = {};
	var RatioNode = tree.RatioNode = ObjectBase.extend({
		constructor: function (dim, ratio, on) {
            this.parent = null;
			this.left = null;
			this.right = null;
			this.dim = dim;
			this.ratio = ratio;
			this.on = on;
		},
        isRoot: function () {
            return this.parent === null;
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
    var swapSubTrees = function (subtree0, subtree1) {
        subtree0Parent = subtree0.parent;
        subtree1Parent = subtree1.parent;

        // move 1 to place of 0
        if (subtree0Parent !== null) {
            if (subtree0Parent.left === subtree0) {
                subtree0Parent.left = subtree1;
                subtree1.parent = subtree0Parent;   
            }
            else {
                subtree0Parent.right = subtree1;
                subtree1.parent = subtree1Parent;
            }
        }
        else {
            subtree1.parent = null;
        }

        // TODO: finish lol
    };
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
            node.left.parent = node;
            node.right.parent = node;
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

    /* wavetable */
    var dsp = justree.dsp = {};
    dsp.isPositivePowerOfTwo = function (x) {
        return (typeof x === 'number') && (x > 0) && ((x & (x - 1)) === 0);
    };
    dsp.allocateBufferFloat32 = function (bufferLen) {
        return new Float32Array(bufferLen);
    };
    dsp.tabGenerate = function (type, len) {
        var tab = dsp.allocateBufferFloat32(len);
        switch(type) {
            case 'sine':
                for (var i = 0; i < length; i++) {
                    tab[i] = Math.sin(2.0 * Math.PI * (i / length));
                }
                break;
            default:
                throw 'dsp.tabgenerate: Invalid table type (' + String(type) + ') specified.';
        }
        return tab;
    };
    var AudioBuffer = dsp.AudioBuffer = ObjectBase.extend({
        constructor: function (channelsNum, samplesNum) {
            this.channelsNum = channelsNum;
            this.samplesNum = samplesNum;
            this.buffer = {};
            for (var i = 0; i < channelsNum; ++i) {
                this.buffer[i] = dsp.allocateBufferFloat32(samplesNum);
            }
        },
        channelGet: function (channelNum) {
            if (channelNum < 0 || channelNum >= this.channelsNum) {
                throw 'AudioBuffer.channelGet: Requested invalid channel number (' + channelNum + ').';
            }

            return this.buffer[channelNum];
        },
        clear: function () {
            for (var channel = 0; channel < channelsNum; ++channel) {
                var channelBuffer = this.channelGet(channelNum);
                for (var sample = 0; sample < samplesNum; ++sample) {
                    channelBuffer[sample] = 0.0;
                }
            }
        }
    });
    var ObjectDsp = ObjectBase.extend({
        constructor: function () {},
        prepare: function (sampleRate, blockSize) {
            this.sampleRate = sampleRate;
            this.blockSize = blockSize;
            this.sampleRateInverse = sampleRateInverse;
            this.blockSizeInverse = blockSizeInverse;
        },
        perform: function (block) {
            console.log(this);
            console.log(typeof(this));
            throw 'ObjectDsp.perform: Must be overriden.'
        },
        release: function () {}
    });
    var LineEnvGen = dsp.AdsrEnvGen = ObjectDsp.extend({
        constructor: function (start, segments) {
            this.valStart = start;
            this.val = start;
            this.segments = segments;
            this.segmentCurr = 0;
        },
        prepare: function (sampleRate, blockSize) {
            ObjectDsp.prototype.prepare.call(this, sampleRate, blockSize);
            this.val = this.valStart;
        },
        perform: function () {
        },
    });
    var CycTabRead4 = dsp.CycTabRead4 = ObjectDsp.extend({
        constructor: function (tab) {
            ObjectDsp.prototype.constructor.call(this);
            this.tab = tab !== undefined ? tab : null;
            this.tabLen = this.tab === null ? -1 : tab.length;
            this.tabMask = this.tabLen - 1;
            this.tabPhase = 0.0;
        },
        tabSet: function (tab) {
            this.tab = tab;
            this.tabLen = this.tab.len;
            this.tabMask = this.tabLen - 1;
            this.tabPhase = 0.0;
        },
        phaseReset: function () {
            this.tabPhase = 0.0;
        },
        prepare: function (sampleRate, blockSize) {
            ObjectDsp.prototype.prepare.call(this, sampleRate, blockSize);
            if (this.tab === null) {
                throw 'CycTabRead4.prepare: tabSet must be called first.'
            }
        },
        perform: function (block) {
            ObjectDsp.prototype.perform.call(this, block);
            var freq = buffer.channelGet(0);
            var out = buffer.channelGet(0);

            var tabLen = this.tabLen;
            var tabMask = this.tabMask;
            var tab = this.tab;
            var phase = this.tabPhase;

            var freqCurr, phaseInc, phaseTrunc, phaseFrac, inm1, in0, inp1, inp2;

            for (var i = 0; i < block.samplesNum; ++i) {
                freqCurr = frequency[i];
                phaseInc = freqCurr * tabLen;
                phaseTrunc = Math.floor(phase);
                phaseFrac = phase - phaseTrunc;

                inm1 = tab[(phaseTrunc - 1) & tabMask];
                in0 = tab[phaseTrunc & tabMask];
                inp1 = tab[(phaseTrunc + 1) & tabMask];
                inp2 = tab[(phaseTrunc + 2) & tabMask];

                output[i] = in0 + 0.5 * phaseFrac * (inp1 - inm1 + 
                    phaseFrac * (4.0 * inp1 + 2.0 * inm1 - 5.0 * in0 - inp2 +
                    phaseFrac * (3.0 * (in0 - inp1) - inm1 + inp2)));

                phase += phaseInc;
            }

            while (phase > tabLen) {
                phase -= tabLen;
            }
            while (phase < 0.0) {
                phase += tabLen;
            }

            this.phase = phase;
        }
    });

	/* ui */
	var ui = justree.ui = {};
	ui.init = function () {};
	ui.callbackPlayClick = function () {
        shared.playheadState = PlayheadStateEnum.PLAYING;
        shared.playheadPosRel = 0.0;
	};
    ui.callbackLoopClick = function () {
        shared.playheadState = PlayheadStateEnum.LOOPING;
    };
    ui.callbackStopClick = function () {
        shared.playheadState = PlayheadStateEnum.STOPPED;
        shared.playheadPosRel = 0.0;
    };

	/* audio */
	var audio = justree.audio = {};
	audio.init = function () {
		var audioCtx = audio.audioCtx = new window.AudioContext();
		var sampleRate = audio.sampleRate = audioCtx.sampleRate;
		var sampleRateInverse = audio.sampleRateInverse = 1.0 / sampleRate;
		var blockSize = audio.blockSize = config.blockSize;
		var blockSizeInverse = audio.blockSizeInverse = 1.0 / blockSize;
		var scriptNode = audioCtx.createScriptProcessor(blockSize, 0, 1);
        audio.playheadPosRelStep = (blockSize * sampleRateInverse) / config.timeLenAbs;

        audio.synthVoices = [];
        audio.sineTab = dsp.tabGenerate('sine', config.synthTabLen);
        for (var voice = 0; voice < config.synthVoicesNum; ++voice) {
            audio.synthVoices.push(new CycTabRead4(audio.sineTab));
        }

		scriptNode.onaudioprocess = audio.callback;
		scriptNode.connect(audioCtx.destination);
	};
	audio.callback = function (event) {
        var blockOut = event.outputBuffer;
        var blockLen = blockOut.length;

        // clear buffer
        for (var channel = 0; channel < blockOut.numberOfChannels; ++channel) {
            var bufferCh = blockOut.getChannelData(channel);

            for (var sample = 0; sample < blockLen; ++sample) {
                bufferCh[sample] = 0.0;
            }
        }

        // return if stopped
        if (shared.playheadState === PlayheadStateEnum.STOPPED) {
            return;
        }

        switch (shared.playheadState) {
            case PlayheadStateEnum.STOPPED:
                break;
            case PlayheadStateEnum.PLAYING:
                shared.playheadPosRel += audio.playheadPosRelStep;
                if (shared.playheadPosRel >= 1.0) {
                    shared.playheadState = PlayheadStateEnum.STOPPED;
                }
                break;
            case PlayheadStateEnum.LOOPING:
                shared.playheadPosRel += audio.playheadPosRelStep;
                while (shared.playheadPosRel >= 1.0) {
                    shared.playheadPosRel -= 1.0;
                }
                break;
            default:
                break;
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

        // clear
        ctx.clearRect(0, 0, width, height);

        // draw treemap
		for (var i = 0; i < shared.rootGrid.length; ++i) {
			var region = shared.rootGrid[i];
			ctx.fillStyle = region[5];
			ctx.fillRect(region[1] * width, region[2] * height, region[3] * width, region[4] * height);
		}

        // draw playback line
        ctx.strokeStyle = 'rgb(0, 0, 0)';
        ctx.beginPath();
        var playheadX = shared.playheadPosRel * width;
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
	};

	/* init */
	var callbackDomReady = function () {
        // init
        shared.init();
		ui.init();
		audio.init();
		video.init('justree-ui');
		
		// generate tree
		var root = treeGrow(0, config.depthMin, config.depthMax, config.pTerm, config.nDims, config.ratios, config.pOn);
		shared.rootSet(root);

        // DOM callbacks
		//$('body').css({'overflow': 'hidden'});
        $('#ui #play').on('click', ui.callbackPlayClick);
        $('#ui #loop').on('click', ui.callbackLoopClick);
        $('#ui #stop').on('click', ui.callbackStopClick);
		$(window).resize(video.callbackWindowResize);
		window.requestAnimationFrame(video.animate);
		video.callbackWindowResize();
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window.ObjectBase, window.justree);