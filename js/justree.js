window.justree = window.justree || {};

(function ($, _, justree) {
	/* require */
	if (!window.supportsWebAudio) {
		alert('Sorry, HTML5 Web Audio API not supported on this browser.');
		throw 'HTML5 Web Audio API not supported on this browser';
	}
	if (!window.supportsCanvas) {
		alert('Sorry, HTML5 Canvas not supported on this browser.');
		throw 'HTML5 Canvas not supported on this browser';
	}

    /* imports */
    var dsp = justree.dsp;
    var tree = justree.tree;
    var saturate = justree.saturate;

	/* defines */
	var defines = justree.defines = {};
	defines.touch_id_mouse = 'mouse';
	defines.orientation = {
		portrait: 'portrait',
		landscape: 'landscape'
	};

	/* config */
	var config = justree.config = {}

    // tree params
	config.depthMin = 4;
	config.depthMax = 7;
	config.nDims = 2;
	config.pTerm = 0.5;
	config.pOn = 0.5;
    config.ratios = [1, 2, 3];
    config.ratiosTime = []; // TODO
    config.ratiosFreq = [];
    config.ratiosLen = config.ratios.length;

    // audio params
    config.blockSize = 1024;
    config.gainParam = {
        'min': 0.0,
        'max': 1.0,
        'step': 0.01,
        'valInit': 0.5
    };
    config.timeLenParam = {
        'min': 1.0,
        'max': 10.0,
        'step': 0.1,
        'valInit': 2.0
    };
    config.freqMinParam = {
        'min': 20.0,
        'max': 2020.0,
        'step': 10.0,
        'valInit': 220.0
    };
    config.freqMaxRatParam = {
        'min': 1.0,
        'max': 8.0,
        'step': 1.0,
        'valInit': 2.0
    };
    config.reverbOn = false;

    // synth params
    config.synthTabLen = 4096;
    config.synthVoicesNum = 8;
    config.synthAtk = 0.05;
    config.synthRel = 0.25;

    // fx params
    config.reverbLen = 1.5;
    config.reverbDcy = 10.0;
	
	/* shared */
	var shared = justree.shared = {};
    var PlayheadStateEnum = shared.PlayheadStateEnum = {
        'STOPPED': 0,
        'PLAYING': 1,
        'LOOPING': 2
    };
    shared.nodeToCells = shared.nodeToCells = function (node, x, y, width, height, cells) {
        if (node.isLeaf()) {
            var h = Math.random();
            //node.ratio / 7.0;
            var s = Math.random();
            var l = (Math.random() * 0.75) + 0.25;
            var hsl = Array(h, s, l);
            cells.push({
                'node': node,
                'x': x,
                'y': y,
                'width': width,
                'height': height,
                'rgbString': rgbToString(hslToRgb(hsl))
            });
        }
        else {
            var ratio = (node.left.ratio / (node.left.ratio + node.right.ratio));
            if (node.dim === 0) {
                var offsetX = width * ratio;
                shared.nodeToCells(node.left, x, y, offsetX, height, cells);
                shared.nodeToCells(node.right, x + offsetX, y, width - offsetX, height, cells);
            }
            else {
                var offsetY = height * ratio;
                shared.nodeToCells(node.left, x, y, width, offsetY, cells);
                shared.nodeToCells(node.right, x, y + offsetY, width, height - offsetY, cells);
            }
        }
    };
    shared.init = function () {
        shared.playheadState = PlayheadStateEnum.STOPPED;
        shared.playheadPosRel = 0.0;
        shared.root = null;
        shared.rootCells = null;
        shared.selected = null;
    };
    shared.rootSet = function(root) {
        $('#string').html(root.toString());
        shared.root = root;
        shared.rootCells = [];
        shared.nodeToCells(shared.root, 0, 0, 1.0, 1.0, shared.rootCells);
        // sort by x ascending then y descending
        shared.rootCells.sort(function (a, b) {
            var aX = a[2];
            var aY = a[3];
            var bX = b[2];
            var bY = b[3];
            if (aX != bX) {
                return aX - bX;
            }
            else {
                return bY - aY;
            }
        });
    };
    shared.selectedSet = function(selected) {
        shared.selected = selected;
    };

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
    ui.callbackReverbToggle = function () {
        var $checked = $('#effects input[name=reverb]:checked');
        if ($checked.val() === 'on') {
            audio.scriptNode.connect(audio.reverbNode);
            audio.reverbNode.connect(audio.audioCtx.destination);
        }
        else {
            audio.reverbNode.disconnect();
            audio.scriptNode.connect(audio.audioCtx.destination);
        }
    };
    ui.hookParamToSlider = function (param, sliderSelector) {
        var $slider = $(sliderSelector);
        $slider.attr('min', param['min']);
        $slider.attr('max', param['max']);
        $slider.attr('step', param['step']);
        $slider.attr('value', param['val']);
        $slider.on('input', function (event) {
            param['val'] = event.target.value;
        });
    };

	/* audio */
	var audio = justree.audio = {};
	audio.init = function () {
        audio.gainParam = config.gainParam;
        audio.timeLenParam = config.timeLenParam;
        audio.freqMinParam = config.freqMinParam;
        audio.freqMaxRatParam = config.freqMaxRatParam;
        audio.params = [audio.gainParam, audio.timeLenParam, audio.freqMinParam, audio.freqMaxRatParam];
        for (var i = 0; i < audio.params.length; ++i) {
            var param = audio.params[i];
            param.val = param.valInit;
            param.valLast = param.val;
        }

		var audioCtx = audio.audioCtx = new window.AudioContext();
		var sampleRate = audio.sampleRate = audioCtx.sampleRate;
		var sampleRateInverse = audio.sampleRateInverse = 1.0 / sampleRate;
		var blockSize = audio.blockSize = config.blockSize;
		var blockSizeInverse = audio.blockSizeInverse = 1.0 / blockSize;
		var scriptNode = audio.scriptNode = audioCtx.createScriptProcessor(blockSize, 0, 1);

        audio.synthBuffer = new dsp.AudioBuffer(3, blockSize);
        audio.synthVoices = [];
        audio.synthCellIdxToVoiceIdx = {};
        audio.synthVoicesIdxAvailable = [];
        audio.sineTab = dsp.allocateBufferFloat32(config.synthTabLen);
        dsp.tabGenerate(audio.sineTab, 'sine');
        for (var voiceIdx = 0; voiceIdx < config.synthVoicesNum; ++voiceIdx) {
            var voice = new dsp.CycTabRead4();
            voice.tabSet(audio.sineTab);
            audio.synthVoices.push(voice);
            audio.synthVoicesIdxAvailable.push(voiceIdx);
        }

        var segments = Array()
        segments.push(Array(config.synthAtk, 1.0));
        segments.push(Array(1.0 - config.synthAtk - config.synthRel, 1.0));
        segments.push(Array(config.synthRel, 0.0));
        audio.envTab = dsp.allocateBufferFloat32(config.synthTabLen);
        dsp.envGenerate(audio.envTab, 0, config.synthTabLen - 1, 0.0, segments);
        audio.envTab[config.synthTabLen - 1] = 0.0;
        audio.envRangeMap = new dsp.RangeMapLinear(0.0, 1.0, false, 1.0, config.synthTabLen - 2, true);
        audio.envTabRead = new dsp.TabRead2();
        audio.envTabRead.tabSet(audio.envTab);

        audio.saturateRangeMap = new dsp.RangeMapLinear(-10.0, 10.0, true, 1.0, config.synthTabLen - 3, false);
        audio.saturateTabRead = new dsp.TabRead4();
        audio.saturateTab = dsp.allocateBufferFloat32(config.synthTabLen);
        saturate.tablify(saturate.arctan(1.0, 2.0 / Math.PI), audio.saturateTab, -10.0, 10.0, 1, 2, -1.0, 1.0);
        audio.saturateTabRead.tabSet(audio.saturateTab);

        // https://github.com/web-audio-components/simple-reverb/blob/master/index.js
        var reverbLen = Math.floor(sampleRate * config.reverbLen);
        var reverbDcy = config.reverbDcy;
        var impulse = audioCtx.createBuffer(2, reverbLen, sampleRate);
        var impulseL = impulse.getChannelData(0);
        var impulseR = impulse.getChannelData(1);
        for (var i = 0; i < reverbLen; ++i) {
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, reverbDcy);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, reverbDcy);
        }
        var reverbNode = audio.reverbNode = audioCtx.createConvolver();
        reverbNode.buffer = impulse;

		scriptNode.onaudioprocess = audio.callback;
        //scriptNode.connect(audioCtx.destination);
		scriptNode.connect(reverbNode);
        reverbNode.connect(audioCtx.destination);
	};
	audio.callback = function (event) {
        var sampleRate = audio.sampleRate;
        var sampleRateInverse = audio.sampleRateInverse;
        var blockOut = event.outputBuffer;
        var blockLen = blockOut.length;

        // convenience pointers to our internal buffer
        var block = audio.synthBuffer;
        var block0 = block.channelGet(0);
        var block1 = block.channelGet(1);
        var block2 = block.channelGet(2);

        // clear buffer
        audio.synthBuffer.clear();

        if (shared.playheadState !== PlayheadStateEnum.STOPPED &&
            shared.rootCells !== null &&
            shared.rootCells.length > 0) {
            // calculate/dezipper (TODO) UI parameters
            var gain = audio.gainParam.val;
            gain = gain * gain * gain * gain;

            // relative time
            var playheadPosStart = shared.playheadPosRel;
            var playheadPosStep = 1.0 / (sampleRate * audio.timeLenParam.val);
            var playheadPosStepBlock = playheadPosStep * blockLen;
            var playheadPosEnd = playheadPosStart + playheadPosStepBlock;
            //console.log(String(playheadPosStart) + '->' + String(playheadPosEnd));

            // TODO edge case: no voices available but one will be at some point in this block

            // check if any voices starting or ending this block
            // TODO: deal with cell starts on loop
            var cells = shared.rootCells;
            var cellsIdxStarting = [];
            var cellsIdxEnding = [];
            var cellCurrIdx = 0;
            while (cellCurrIdx < cells.length) {
                var cellCurr = cells[cellCurrIdx];
                var cellCurrStart = cellCurr.x;
                var cellCurrEnd = cellCurr.x + cellCurr.width;
                if (cellCurrStart >= playheadPosStart && cellCurrStart < playheadPosEnd) {
                    cellsIdxStarting.push(cellCurrIdx);
                }
                if (cellCurrEnd >= playheadPosStart && cellCurrEnd < playheadPosEnd) {
                    cellsIdxEnding.push(cellCurrIdx);
                }
                ++cellCurrIdx;
            }

            if (cellsIdxStarting.length > 0 || cellsIdxEnding.length > 0) {
                //console.log(String(cellsIdxStarting.length) + ', ' + String(cellsIdxEnding.length));
            }

            // assign cell starts to voices
            var cellIdxToVoiceIdx = audio.synthCellIdxToVoiceIdx;
            var voicesIdxAvailable = audio.synthVoicesIdxAvailable;
            while (cellsIdxStarting.length > 0 && voicesIdxAvailable.length > 0) {
                cellIdxToVoiceIdx[cellsIdxStarting.pop()] = voicesIdxAvailable.pop();
            }

            // render voices
            var synthVoices = audio.synthVoices;
            var freqMin = audio.freqMinParam.val;
            var freqMaxRat = audio.freqMaxRatParam.val;
            var envRangeMap = audio.envRangeMap;
            var envTabRead = audio.envTabRead;
            _.each(cellIdxToVoiceIdx, function (value, key) {
                // calculate sine waves for each active voice
                var cell = cells[key];
                var voice = synthVoices[value];
                var freqHz = freqMin * Math.pow(freqMaxRat, 1.0 - (cell.y + cell.height));
                var freqRel = freqHz * sampleRateInverse;

                for (var sample = 0; sample < blockLen; ++sample) {
                    block0[sample] = freqRel;
                }
                voice.perform(block, 0, 0, blockLen);

                // calculate envelope phasor
                var cellWidthInv = 1.0 / cell.width;
                var cellFrac = (playheadPosStart - cell.x) * cellWidthInv;
                var cellFracStep = playheadPosStep * cellWidthInv;
                for (var sample = 0; sample < blockLen; ++sample) {
                    block1[sample] = cellFrac;
                    cellFrac += cellFracStep
;                }

                // map to table range
                envRangeMap.perform(block, 1, 0, blockLen);

                // generate envelope
                envTabRead.perform(block, 1, 0, blockLen);

                // add enveloped sinusoid to sum
                for (var sample = 0; sample < blockLen; ++sample) {
                    block2[sample] += block0[sample] * block1[sample];
                }
            });

            // release cell ends from voices
            while (cellsIdxEnding.length > 0) {
                var cellIdx = cellsIdxEnding.pop();
                if (cellIdx in cellIdxToVoiceIdx) {
                    var voiceIdx = cellIdxToVoiceIdx[cellIdx];
                    delete cellIdxToVoiceIdx[cellIdx];
                    voicesIdxAvailable.push(voiceIdx);
                    synthVoices[voiceIdx].phaseReset();
                }
            }

            // increment playhead
            shared.playheadPosRel = playheadPosEnd;

            // apply gain
            for (var sample = 0; sample < blockLen; ++sample) {
                block2[sample] *= gain;
            }

            // saturate (soft clip)
            audio.saturateRangeMap.perform(block, 2, 0, blockLen);
            audio.saturateTabRead.perform(block, 2, 0, blockLen);
        }

        // copy our mono synth to other channels
        for (var channel = 0; channel < blockOut.numberOfChannels; ++channel) {
            var blockOutCh = blockOut.getChannelData(channel);
            for (var sample = 0; sample < blockLen; ++sample) {
                blockOutCh[sample] = block2[sample];
            }
        }

        // stop or loop
        if (shared.playheadState === PlayheadStateEnum.PLAYING) {
            if (shared.playheadPosRel >= 1.0) {
                shared.playheadState = PlayheadStateEnum.STOPPED;
                shared.playheadPosRel = 0.0;
            }
        }
        else if (shared.playheadState === PlayheadStateEnum.LOOPING) {
            while (shared.playheadPosRel >= 1.0) {
                shared.playheadPosRel -= 1.0;
            }
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
    video.posAbsToNode = function (x, y) {
        var width = video.canvasWidth;
        var height = video.canvasHeight;
        for (var i = 0; i < shared.rootCells.length; ++i) {
            var cell = shared.rootCells[i];
            var cellX = cell.x * width;
            var cellY = cell.y * height;
            var cellWidth = cell.width * width;
            var cellHeight = cell.height * height;
            if (cellX <= x && x <= cellX + cellWidth &&
                cellY <= y && y <= cellY + cellHeight) {
                return cell.node;
            }
        }
        return null;
    };
    video.callbackSelectLeaf = function () {
    };
    var callbackTouchStart = function (event) {
    };
    var callbackTouchMove = function (event) {
    };
    var callbackTouchEnd = function (event) {
        var touch = event.changedTouches[0];
        shared.selectedSet(video.posAbsToNode(touch.clientX, touch.clientY));
        video.repaint();
    };
    var callbackTouchLeave = function (event) {

    };
    var callbackTouchCancel = function(event) {

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
		for (var i = 0; i < shared.rootCells.length; ++i) {
			var cell = shared.rootCells[i];
            var cellX = cell.x * width;
            var cellY = cell.y * height;
            var cellWidth = cell.width * width;
            var cellHeight = cell.height * height;
            if (cell.node === shared.selected) {
                ctx.fillStyle = 'rgb(0, 255, 0)';
                ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
            }
            else {
                ctx.strokeStyle = 'rgb(0, 0, 0)';
                ctx.rect(cellX, cellY, cellWidth, cellHeight);
                ctx.stroke();
            }
		}

        // draw playback line
        ctx.strokeStyle = 'rgb(255, 0, 0)';
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
		var root = tree.treeGrow(0, config.depthMin, config.depthMax, config.pTerm, config.nDims, config.ratios, config.pOn);
		shared.rootSet(root);

        // canvas mouse/touch events
        if (window.supportsTouchEvents) {
            $('#justree-ui').on('touchstart', callbackTouchStart);
            $('#justree-ui').on('touchmove', callbackTouchMove);
            $('#justree-ui').on('touchend', callbackTouchEnd);
            $('#justree-ui').on('touchleave', callbackTouchLeave);
            $('#justree-ui').on('touchcancel', callbackTouchCancel);
        }
        else {
            var mouseToTouchEvent = window.mouseToTouchEvent;
            $('#justree-ui').on('mousedown', mouseToTouchEvent(callbackTouchStart));
            $('#justree-ui').on('mousemove', mouseToTouchEvent(callbackTouchMove));
            $('#justree-ui').on('mouseup', mouseToTouchEvent(callbackTouchEnd));
            $('#justree-ui').on('mouseleave', mouseToTouchEvent(callbackTouchLeave));
        }

        // tabs
        $('#tabs').tabs({active: 1});
        $('button').button();

        // DOM callbacks
		//$('body').css({'overflow': 'hidden'});
        $('#playback #play').on('click', ui.callbackPlayClick);
        $('#playback #loop').on('click', ui.callbackLoopClick);
        $('#playback #stop').on('click', ui.callbackStopClick);
        ui.hookParamToSlider(audio.gainParam, '#playback #gain');
        ui.hookParamToSlider(audio.timeLenParam, '#synthesis #time-len');
        ui.hookParamToSlider(audio.freqMinParam, '#synthesis #freq-min');
        ui.hookParamToSlider(audio.freqMaxRatParam, '#synthesis #freq-max-rat');
        $('#effects input[name=reverb]').on('change', ui.callbackReverbToggle);
        ui.callbackReverbToggle();

		$(window).resize(video.callbackWindowResize);
		window.requestAnimationFrame(video.animate);
		video.callbackWindowResize();
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window._, window.justree);