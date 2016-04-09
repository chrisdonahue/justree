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
    var server = justree.server;

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
    config.breadthMax = 3;
	config.depthMin = 1;
	config.depthMax = 2;
	config.nDims = 2;
	config.pTerm = 0.5;
	config.pOn = 0.0;
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
	
    // debug
    config.debug = true;
    var debugAssert = function(assertion, msg) {
        if (config.debug && !assertion) {
            alert(msg);
            throw msg;
        }
    };

	/* shared */
	var shared = justree.shared = {};
    var PlayheadStateEnum = shared.PlayheadStateEnum = {
        'STOPPED': 0,
        'PLAYING': 1,
        'LOOPING': 2
    };
    var ModalEnum = shared.ModalEnum = {
        'HEAR': 0,
        'EDIT': 1,
        'SERVER': 3,
        'SHARE': 2
    };
    shared.init = function () {
        shared.playheadState = PlayheadStateEnum.STOPPED;
        shared.playheadPosRel = 0.0;
        shared.nodeClipboard = null;
        shared.nodeRoot = null;
        shared.nodeSelected = null;
        shared.leafCellsSorted = [];
        shared.modalState = ModalEnum.EDIT;
    };
    shared.clearNodeClipboard = function () {
        shared.nodeClipboard = null;
    };
    shared.pushNodeClipboard = function (node) {
        shared.nodeClipboard = node;
    };
    shared.peekNodeClipboard = function () {
        return shared.nodeClipboard;
    };
    shared.getNodeSelected = function () {
        return shared.nodeSelected;
    };
    shared.setNodeSelected = function(nodeSelected) {
        shared.nodeSelected = nodeSelected;
    };
    shared.clearNodeSelected = function () {
        shared.nodeSelected = null;
    };
    shared.getNodeRoot = function () {
        return shared.nodeRoot;
    };
    shared.setNodeRoot = function(nodeRoot) {
        shared.nodeRoot = nodeRoot;
        shared.leafCellsSorted = [];
    };
    shared.parseNodeRoot = function (node, depth, x, y, width, height) {
        if (node === undefined) {
            node = shared.nodeRoot;
            x = 0.0;
            y = 0.0;
            width = 1.0;
            height = 1.0;
        }

        var h = Math.random();
        var s = Math.random();
        var l = (Math.random() * 0.75) + 0.25;
        var hsl = Array(h, s, l);
        var cell = {
            'node': node,
            'x': x,
            'y': y,
            'width': width,
            'height': height,
            'rgbString': rgbToString(hslToRgb(hsl))
        };
        node.cell = cell;

        if (node.isLeaf()) {
            shared.leafCellsSorted.push(cell);
        }
        else {
            var children = node.getChildren();
            var ratioSum = 0.0;
            for (var i = 0; i < children.length; ++i) {
                ratioSum += children[i].ratio;
            }
            var ratioSumInverse = 1.0 / ratioSum;
            if (node.dim === 0) {
                var offsetX = x;
                for (var i = 0; i < children.length; ++i) {
                    var child = children[i];
                    var childWidth = child.ratio * ratioSumInverse * width;
                    shared.parseNodeRoot(children[i], depth + 1, offsetX, y, childWidth, height);
                    offsetX += childWidth;
                }
            }
            else {
                var offsetY = y;
                for (var i = 0; i < children.length; ++i) {
                    var child = children[i];
                    var childHeight = child.ratio * ratioSumInverse * height;
                    shared.parseNodeRoot(children[i], depth + 1, x, offsetY, width, childHeight);
                    offsetY += childHeight;
                }
            }
        }
    };
    shared.rescanNodeRootSubtree = function (subtree) {
        subtree = subtree !== undefined ? subtree : shared.getNodeRoot();

        shared.leafCellsSorted = [];
        if (subtree !== null) {
            shared.parseNodeRoot();
            // sort by x ascending then y descending
            shared.leafCellsSorted.sort(function (a, b) {
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
            $('#string').html(shared.nodeRoot.toString());
        }
        else {
            $('#string').html('null');
        }
    };
    shared.getLeafCellsSorted = function () {
        return shared.leafCellsSorted;
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
    var navChildStack = [];
    var callbackTouchStart = function (event) {};
    var callbackTouchMove = function (event) {};
    var callbackTouchEnd = function (event) {
        var touch = event.changedTouches[0];
        switch (shared.modalState) {
            case ModalEnum.HEAR:
                var nodeSelected = video.posAbsToLeafNode(touch.clientX, touch.clientY);
                nodeSelected.on = !nodeSelected.on;
                video.repaint();
                break;
            case ModalEnum.EDIT:
                var touch = event.changedTouches[0];
                var nodeSelectedPrev = shared.getNodeSelected();
                var nodeSelected = video.posAbsToLeafNode(touch.clientX, touch.clientY);
                var disable = nodeSelectedPrev === nodeSelected;
                if (disable) {
                    shared.setNodeSelected(null);
                }
                else {
                    shared.setNodeSelected(nodeSelected);                    
                }
                navChildStack = [];
                video.repaint();
                break;
            default:
                break;
        }
    };
    var callbackTouchLeave = function (event) {};
    var callbackTouchCancel = function(event) {};
    var callbackRootClick = function (event) {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected === null) {
            callbackLeafClick();
        }
        while (!shared.getNodeSelected().isRoot()) {
            callbackParentClick();
        }
    };
    var callbackParentClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isRoot()) {
            navChildStack.push(nodeSelected);
            shared.setNodeSelected(nodeSelected.getParent());
        }
    };
    var callbackSiblingClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isRoot()) {
            var parent = nodeSelected.getParent();
            var childIdx = parent.getChildIdxForChild(nodeSelected);
            shared.setNodeSelected(parent.getChild((childIdx + 1) % parent.getNumChildren()));
            navChildStack = [];
        }
    };
    var callbackChildClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null && !nodeSelected.isLeaf()) {
            if (navChildStack.length > 0) {
                var navChild = navChildStack.pop();
                var navChildIdx = nodeSelected.getChildIdxForChild(navChild);
                if (navChildIdx >= 0) {
                    shared.setNodeSelected(navChild);
                }
                else {
                    // we have edited this subtree so fallback to random
                    navChildStack = [];
                    shared.setNodeSelected(nodeSelected.getRandomChild());
                }
            }
            else {
                // cant exactly remember how this would happen but we're covered
                shared.setNodeSelected(nodeSelected.getRandomChild());
            }
        }
    };
    var callbackLeafClick = function () { 
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected === null) {
            var leafCellsSorted = shared.getLeafCellsSorted();
            var leafCellRandom = leafCellsSorted[Math.floor(Math.random() * leafCellsSorted.length)];
            shared.setNodeSelected(leafCellRandom.node);
            navChildStack = [];
        }
        else {
            while (!shared.getNodeSelected().isLeaf()) {
                callbackChildClick();
            }
        }
    };
    var callbackZoomClick = function () {
        var nodeSelected = shared.getNodeSelected();
        if (nodeSelected !== null) {
            video.setZoomCell(nodeSelected.cell);
            video.repaint();
        }
    };
    var callbackEditSelectionDecorator = function (callback) {
        return function () {
            var nodeSelected = shared.getNodeSelected();
            if (nodeSelected !== null) {
                var subtreeModified = callback(nodeSelected);
                if (subtreeModified !== null) {
                    if (subtreeModified.isRoot()) {
                        shared.setNodeRoot(subtreeModified);
                    }
                    console.log('rescanning');
                    debugAssert(shared.getNodeRoot().isSane(), 'Root node insane after edit.');
                    shared.rescanNodeRootSubtree(subtreeModified);
                    video.repaint();
                }
            }
        }
    };
    var callbackCutClick = callbackEditSelectionDecorator(function (selected) {
        shared.pushNodeClipboard(selected.getCopy());
        selected.deleteChildren();
        shared.clearNodeSelected();
        return selected;
    });
    var callbackCopyClick = callbackEditSelectionDecorator(function (selected) {
        shared.pushNodeClipboard(selected.getCopy())
        shared.clearNodeSelected();
        return null;
    });
    var callbackPasteClick = callbackEditSelectionDecorator(function (selected) {
        var nodeClipboard = shared.peekNodeClipboard();
        if (nodeClipboard !== null) {
            var copy = shared.nodeClipboard.getCopy();
            if (selected.isRoot()) {
                shared.setNodeRoot(copy);
                return shared.getNodeRoot();
            }
            else {
                var parent = selected.getParent();
                var childIdx = parent.getChildIdxForChild(selected);
                if (childIdx >= 0) {
                    copy.setRatio(selected.getRatio());
                    parent.setChild(childIdx, copy);
                    return parent;
                }
            }
        }
        return null;
    });
    var callbackClearClick = callbackEditSelectionDecorator(function (selected) {
        if (!selected.isLeaf()) {
            selected.deleteChildren();
            return selected;
        }
        return null;
    });
    var callbackDeleteClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            callbackClearClick(selected);
            shared.clearNodeSelected();
            return selected;
        }
        else {
            var parent = selected.getParent();
            var childIdx = parent.getChildIdxForChild(selected);
            if (childIdx >= 0) {
                parent.deleteChild(childIdx);
                shared.clearNodeSelected();
                if (parent.getNumChildren() === 1) {
                    parent.deleteChild(0);
                }
                return parent;
            }
        }
        return null;
    });
    var callbackRatioDecrementClick = callbackEditSelectionDecorator(function (selected) {
        var ratio = selected.getRatio();
        if (ratio > 1.0) {
            selected.setRatio(ratio - 1.0);
            return selected;
        }
        return null;
    });
    var callbackRatioIncrementClick = callbackEditSelectionDecorator(function (selected) {
        var ratio = selected.getRatio();
        selected.setRatio(ratio + 1.0);
        return selected;
    });
    var callbackMoveLClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            return null;
        }
        else {
            var parent = selected.getParent();
            var childIdx = parent.getChildIdxForChild(selected);
            if (childIdx >= 0) {
                parent.moveChildLeft(childIdx);
                return parent;
            }
        }
        return null;
    });
    var callbackMoveRClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            return null;
        }
        else {
            var parent = selected.getParent();
            var childIdx = parent.getChildIdxForChild(selected);
            if (childIdx >= 0) {
                parent.moveChildRight(childIdx);
                return parent;
            }
        }
        return null;
    });
    var callbackFlipClick = callbackEditSelectionDecorator(function flipRecursive(subtree) {
        var dim = subtree.getDim();
        dim = modPls(dim + 1, 2);
        subtree.setDim(dim);
        subtree.forEachChild(flipRecursive);
        return subtree;
    });
    var callbackSplitTClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isLeaf()) {
            selected.setDim(0);
            selected.addChild(new tree.RatioNode(0, 1, false));
            selected.addChild(new tree.RatioNode(0, 1, false));
            return selected;
        }
        else {
            return null;
        }
    });
    var callbackSplitFClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isLeaf()) {
            selected.setDim(1);
            selected.addChild(new tree.RatioNode(1, 1, false));
            selected.addChild(new tree.RatioNode(1, 1, false));
            return selected;
        }
        else {
            return null;
        }
    });
    var callbackAddTSiblingClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            var rootNew = new tree.RatioNode((selected.getDim() + 1) % 2, 1, false);
            rootNew.addChild(selected);
            rootNew.addChild(new tree.RatioNode(0, selected.getRatio(), false))
            return rootNew;
        }
        else {
            var parent = selected.getParent();
            parent.addChild(new tree.RatioNode(0, selected.getRatio(), false));
            return parent;
        }
    });
    var callbackAddFSiblingClick = callbackEditSelectionDecorator(function (selected) {
        if (selected.isRoot()) {
            var rootNew = new tree.RatioNode((selected.getDim() + 1) % 2, 1, false);
            rootNew.addChild(selected);
            rootNew.addChild(new tree.RatioNode(1, selected.getRatio(), false))
            return rootNew;
        }
        else {
            var parent = selected.getParent();
            parent.addChild(new tree.RatioNode(1, selected.getRatio(), false));
            return parent;
        }
    });
    var callbackAddTChildClick = callbackEditSelectionDecorator(function (selected) {
        selected.addChild(new tree.RatioNode(0, 1, false));
        if (selected.getNumChildren() === 1) {
            selected.addChild(new tree.RatioNode(0, 1, false));
        }
        return selected;
    });
    var callbackAddFChildClick = callbackEditSelectionDecorator(function (selected) {
        selected.addChild(new tree.RatioNode(1, 1, false));
        if (selected.getNumChildren() === 1) {
            selected.addChild(new tree.RatioNode(1, 1, false));
        }
        return selected;
    });

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
            shared.leafCellsSorted !== null &&
            shared.leafCellsSorted.length > 0) {
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
            var cells = shared.leafCellsSorted;
            var cellsIdxStarting = [];
            var cellsIdxEnding = [];
            var cellCurrIdx = 0;
            while (cellCurrIdx < cells.length) {
                var cellCurr = cells[cellCurrIdx];
                var cellCurrStart = cellCurr.x;
                var cellCurrEnd = cellCurr.x + cellCurr.width;
                if (cellCurrStart >= playheadPosStart && cellCurrStart < playheadPosEnd && cellCurr.node.on) {
                    cellsIdxStarting.push(cellCurrIdx);
                }
                if (cellCurrEnd >= playheadPosStart && cellCurrEnd < playheadPosEnd && cellCurr.node.on) {
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
                    cellFrac += cellFracStep;
                }

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
        video.zoomCell = null;
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
    video.posAbsToLeafNode = function (x, y) {
        var width = video.canvasWidth;
        var height = video.canvasHeight;
        for (var i = 0; i < shared.leafCellsSorted.length; ++i) {
            var cell = shared.leafCellsSorted[i];
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

    video.setZoomCell = function (cell) {
        video.zoomCell = cell;
    };
	video.animate = function () {
		video.repaint();
		window.requestAnimationFrame(video.animate);
	};
	video.repaint = function () {
		var ctx = video.canvasCtx;
		var canvasWidth = video.canvasWidth;
		var canvasHeight = video.canvasHeight;
        var zoomCell = video.zoomCell;
        var zoomBb;
        if (zoomCell === null) {
            zoomBb = {
                'x': 0.0,
                'y': 0.0,
                'width': 1.0,
                'height': 1.0
            };
        }
        else {
            zoomBb = zoomCell;
            console.log(zoomCell);
        }

        var relBbToAbsBb = function (relBb) {
            var x0 = (relBb.x - zoomBb.x) * canvasWidth;
            var y0 = (relBb.y - zoomBb.y) * canvasHeight;
            var x1 = ((relBb.x + relBb.width) - zoomBb.x) * canvasWidth;
            var y1 = ((relBb.y + relBb.height) - zoomBb.y) * canvasHeight;
            return {
                'x': x0,
                'y': y0,
                'width': x1 - x0,
                'height': y1 - y0
            }
        };

        // clear
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // draw treemap
		for (var i = 0; i < shared.leafCellsSorted.length; ++i) {
			var cell = shared.leafCellsSorted[i];
            var absBb = relBbToAbsBb(cell);
            if (cell.node.on) {
                ctx.fillStyle = 'rgb(200, 200, 200)';
            }
            else {
                ctx.fillStyle = 'rgb(25, 25, 25)';
            }
            ctx.fillRect(absBb.x, absBb.y, absBb.width, absBb.height);
            ctx.strokeStyle = 'rgb(0, 255, 255)';
            ctx.rect(absBb.x, absBb.y, absBb.width, absBb.height);
            ctx.stroke();
		}

        // draw selected
        if (shared.nodeSelected !== null) {
            var cellSelected = shared.nodeSelected.cell;
            ctx.fillStyle = 'rgba(255, 0, 100, 0.5)';
            var absBb = relBbToAbsBb(cellSelected);
            ctx.fillRect(absBb.x, absBb.y, absBb.width, absBb.height);
        }

        // draw playback line
        ctx.strokeStyle = 'rgb(255, 0, 0)';
        ctx.beginPath();
        var playheadX = relBbToAbsBb({'x': shared.playheadPosRel}).x;
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, canvasHeight);
        ctx.stroke();
	};

	/* init */
	var callbackDomReady = function () {
        // init
        shared.init();
		ui.init();
		audio.init();
		video.init('justree-ui');
        server.init();
		
		// generate tree
		var root = tree.treeGrow(0, config.depthMin, config.depthMax, config.breadthMax, config.pTerm, config.nDims, config.ratios, config.pOn);
		shared.setNodeRoot(root);
        shared.rescanNodeRootSubtree();

        // modal callbacks
        $('button#server').on('click', function () {
            shared.modalState = ModalEnum.SERVER;
            $('div#server').show();
            $('div#hear').hide();
            $('div#edit').hide();
        });
        $('button#hear').on('click', function () {
            shared.modalState = ModalEnum.HEAR;
            $('div#server').hide();
            $('div#edit').hide();
            $('div#hear').show();
            shared.clearNodeSelected();
            navChildStack = [];
            video.repaint();
        });
        $('button#edit').on('click', function () {
            shared.modalState = ModalEnum.EDIT;
            $('div#server').hide();
            $('div#hear').hide();
            $('div#edit').show();
        });

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

        // server callbacks
        $('button#connect').on('click', function () {
            server.connect($('#server #ip').val(), $('#server #port').val());
        });
        $('button#disconnect').on('click', server.disconnect)

        // selection callbacks
        $('button#parent').on('click', callbackParentClick);
        $('button#sibling').on('click', callbackSiblingClick);
        $('button#child').on('click', callbackChildClick);
        $('button#root').on('click', callbackRootClick);
        $('button#leaf').on('click', callbackLeafClick);
        $('button#zoom').on('click', callbackZoomClick);

        // edit selection callbacks
        $('button#clear').on('click', callbackClearClick);
        $('button#delete').on('click', callbackDeleteClick);
        $('button#ratio-dec').on('click', callbackRatioDecrementClick);
        $('button#ratio-inc').on('click', callbackRatioIncrementClick);
        $('button#move-l').on('click', callbackMoveLClick);
        $('button#move-r').on('click', callbackMoveRClick);
        $('button#flip').on('click', callbackFlipClick);
        $('button#split-t').on('click', callbackSplitTClick);
        $('button#split-f').on('click', callbackSplitFClick);
        $('button#add-t-sibling').on('click', callbackAddTSiblingClick);
        $('button#add-f-sibling').on('click', callbackAddFSiblingClick);
        $('button#add-t-child').on('click', callbackAddTChildClick);
        $('button#add-f-child').on('click', callbackAddFChildClick);

        // clipboard callbacks
        $('button#cut').on('click', callbackCutClick);
        $('button#copy').on('click', callbackCopyClick);
        $('button#paste').on('click', callbackPasteClick);

        // tabs
        //$('#tabs').tabs({active: 1});
        //$('button').button();

        // audio callbacks
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

        // viewport resize callback
		$(window).resize(video.callbackWindowResize);
        video.callbackWindowResize();

        // start animation
		window.requestAnimationFrame(video.animate);
	};
	$(document).ready(callbackDomReady);

})(window.jQuery, window._, window.justree);